import { authClient } from '@/auth/authClient'
import { db } from './db'
import { SYNC_TABLES, type SyncEnvelope, type SyncTableName } from './types'

const API_BASE = import.meta.env.VITE_API_URL ?? ''
const CURSOR_KEY = 'syncCursor'

export type SyncStatus = 'synced' | 'syncing' | 'offline' | 'error'

export interface SyncState {
  status: SyncStatus
  /** Rows with local edits not yet pushed. */
  pending: number
  /** Photo blobs captured locally but not yet uploaded to object storage. */
  photosQueued: number
  lastSyncedAt: string | null
}

type Listener = (state: SyncState) => void

function isOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false
}

/**
 * A `fetch` that never got a response — server down, connection refused, DNS,
 * CORS — rejects with a TypeError ("Failed to fetch"). That's offline-like, not a
 * real error: the app stays usable and should sync once the server is back.
 * Distinct from an HTTP error response (a thrown `Error` with a status), which is
 * a genuine failure worth the red dot.
 */
function isNetworkError(err: unknown): boolean {
  return err instanceof TypeError
}

async function authedJson(path: string, init?: RequestInit): Promise<unknown> {
  const res = await authClient.authedFetch(`${API_BASE}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  })
  if (!res.ok) throw new Error(`sync ${path} failed: ${res.status}`)
  return res.json()
}

async function countPending(): Promise<number> {
  let total = 0
  for (const table of SYNC_TABLES) {
    total += await db.table(table).where('_dirty').equals(1).count()
  }
  return total
}

/** Attachments with a local blob still waiting to be uploaded to object storage. */
async function countPhotosQueued(): Promise<number> {
  const atts = await db.attachments.toArray()
  return atts.filter((a) => !a.deleted && !a.uploaded).length
}

/**
 * The last-write-wins sync engine — the client half of the Phase 2 foundation.
 *
 * Dexie is the source of truth offline. Each run does push-then-pull:
 *  1. push every `_dirty` row; on success replace it with the server's
 *     authoritative copy and clear the flag.
 *  2. pull everything changed since the cursor; merge into Dexie, skipping any
 *     row that still has a pending local edit (the next push resolves it), and
 *     keeping tombstones (`deleted: true`) so deletions stick.
 *
 * Runs are serialized (a request mid-run is coalesced into one trailing run) and
 * a no-op when offline. Subscribers (the sync dot) see status transitions.
 */
class SyncEngine {
  private state: SyncState = {
    status: 'synced',
    pending: 0,
    photosQueued: 0,
    lastSyncedAt: null,
  }
  private readonly listeners = new Set<Listener>()
  private running = false
  private queued = false
  private timer: ReturnType<typeof setTimeout> | undefined
  // Set when the server reports object storage isn't configured (503), so we stop
  // re-attempting presign every run. Reset on reconnect in case config changed.
  private uploadsDisabled = false

  getState(): SyncState {
    return this.state
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener)
    listener(this.state)
    return () => this.listeners.delete(listener)
  }

  private setState(patch: Partial<SyncState>): void {
    this.state = { ...this.state, ...patch }
    for (const listener of this.listeners) listener(this.state)
  }

  private async getCursor(): Promise<string> {
    const row = await db._meta.get(CURSOR_KEY)
    return row?.value ?? '0'
  }

  private async setCursor(value: string): Promise<void> {
    await db._meta.put({ key: CURSOR_KEY, value })
  }

  /** Debounced trigger — call after a local mutation. */
  schedule(delayMs = 600): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(() => {
      this.timer = undefined
      void this.syncNow()
    }, delayMs)
  }

  async syncNow(): Promise<void> {
    if (isOffline()) {
      this.setState({
        status: 'offline',
        pending: await countPending(),
        photosQueued: await countPhotosQueued(),
      })
      return
    }
    if (this.running) {
      this.queued = true
      return
    }
    this.running = true
    this.setState({ status: 'syncing' })
    try {
      // 1. upload pending photos, 2. push dirty rows, 3. pull since cursor.
      // Photo upload is resilient (per-attachment): a failed or unconfigured
      // upload never blocks data sync — the photo stays queued and retries.
      await this.uploadPending()
      await this.push()
      await this.pull()
      this.setState({
        status: 'synced',
        pending: await countPending(),
        photosQueued: await countPhotosQueued(),
        lastSyncedAt: new Date().toISOString(),
      })
    } catch (err) {
      // Server unreachable (a TypeError from fetch) is offline-like — stay calm
      // (grey dot), no console noise. Reserve 'error' (red) + a logged error for
      // an actual server/HTTP failure.
      const offlineLike = isOffline() || isNetworkError(err)
      if (!offlineLike) console.error('[sync] run failed', err)
      this.setState({
        status: offlineLike ? 'offline' : 'error',
        pending: await countPending(),
        photosQueued: await countPhotosQueued(),
      })
    } finally {
      this.running = false
      if (this.queued) {
        this.queued = false
        void this.syncNow()
      }
    }
  }

  /**
   * Upload every captured-but-unsynced photo blob to object storage via a
   * presigned PUT, then mark its attachment `uploaded` with the server's
   * `storage_key` (a dirty edit the following push carries). The blob is kept
   * locally so the workshop phone keeps rendering it offline.
   *
   * Photo upload is best-effort and isolated from data sync: a failing photo
   * never aborts the run, so the following push/pull always gets to run — and
   * those (they hit *our* API) are the authority on whether we're really offline.
   * Failure handling, by kind:
   *  - **storage not configured** (503) — expected when running without S3 (local
   *    dev, or before Phase 0 provisioning). Stop trying for the session and log
   *    once; photos stay queued and the sync dot shows the count. Reset on
   *    reconnect in case configuration changed.
   *  - **network error** (a fetch TypeError: our API or object storage
   *    unreachable, or a CORS-blocked direct PUT) — stop uploading this round and
   *    return *without* marking offline. Letting this propagate is what stranded a
   *    user behind a false "offline" in prod: a CORS-blocked PUT threw here, the
   *    whole run aborted, and pending *data* edits never pushed. Photos stay
   *    queued and retry; the data push/pull below decides our real status.
   *  - **one bad photo** (non-2xx response, or any other thrown error) — skip just
   *    that photo; the remaining photos and the data sync still proceed.
   */
  private async uploadPending(): Promise<void> {
    if (this.uploadsDisabled) return
    const atts = await db.attachments.toArray()
    const pending = atts.filter((a) => !a.deleted && !a.uploaded)

    for (const att of pending) {
      const blobRow = await db.blobs.get(att.id)
      if (!blobRow?.blob) continue // nothing local to upload
      const contentType = att.content_type ?? blobRow.blob.type ?? 'application/octet-stream'

      try {
        const presign = await authClient.authedFetch(`${API_BASE}/api/uploads/presign`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ attachmentId: att.id, contentType }),
        })
        if (presign.status === 503) {
          this.uploadsDisabled = true
          console.info('[sync] object storage not configured — photos stay queued')
          return
        }
        if (!presign.ok) {
          console.warn(`[sync] presign failed for ${att.id}: ${presign.status}`)
          continue // skip this photo; don't block the rest or the data sync
        }
        const { url, storageKey } = (await presign.json()) as { url: string; storageKey: string }

        // Direct browser→S3 PUT — the presigned URL carries its own auth, so this
        // is a plain fetch (no app bearer, and it never transits our backend).
        const put = await fetch(url, {
          method: 'PUT',
          body: blobRow.blob,
          headers: { 'Content-Type': contentType },
        })
        if (!put.ok) {
          console.warn(`[sync] upload failed for ${att.id}: ${put.status}`)
          continue
        }

        await writeLocal('attachments', { ...att, storage_key: storageKey, uploaded: true })
      } catch (err) {
        // A fetch that never got a response (server/storage unreachable, or a
        // CORS-blocked PUT) throws a TypeError: stop uploading this round but do
        // NOT rethrow — the data push/pull is the authority on connectivity.
        // Anything else is an unexpected per-photo failure: skip just this one.
        if (isNetworkError(err)) return
        console.warn(`[sync] upload error for ${att.id}`, err)
        continue
      }
    }
  }

  private async push(): Promise<void> {
    const changes: Record<string, unknown[]> = {}
    // Remember the timestamp we pushed per id, so reconcile won't clobber an edit
    // the user made after we snapshotted the batch.
    const pushedStamp = new Map<string, string>()

    for (const table of SYNC_TABLES) {
      const dirty = (await db.table(table).where('_dirty').equals(1).toArray()) as Array<
        SyncEnvelope & Record<string, unknown>
      >
      if (!dirty.length) continue
      changes[table] = dirty.map(({ _dirty, ...wire }) => {
        pushedStamp.set(wire.id, wire.updated_at)
        return wire
      })
    }
    if (Object.keys(changes).length === 0) return

    const res = (await authedJson('/api/sync/push', {
      method: 'POST',
      body: JSON.stringify({ changes }),
    })) as { applied: Record<string, Array<SyncEnvelope & Record<string, unknown>>> }

    await db.transaction(
      'rw',
      SYNC_TABLES.map((t) => db.table(t)),
      async () => {
        for (const table of SYNC_TABLES) {
          for (const row of res.applied[table] ?? []) {
            const local = (await db.table(table).get(row.id)) as SyncEnvelope | undefined
            if (local?._dirty === 1 && local.updated_at !== pushedStamp.get(row.id)) {
              continue // edited again mid-sync; leave dirty for the next push
            }
            await db.table(table).put({ ...row, _dirty: 0 })
          }
        }
      },
    )
  }

  private async pull(): Promise<void> {
    const since = await this.getCursor()
    const res = (await authedJson(
      `/api/sync/pull?since=${encodeURIComponent(since)}`,
    )) as { serverTime: string; changes: Record<string, Array<SyncEnvelope & Record<string, unknown>>> }

    await db.transaction(
      'rw',
      SYNC_TABLES.map((t) => db.table(t)),
      async () => {
        for (const table of SYNC_TABLES) {
          for (const row of res.changes[table] ?? []) {
            const local = (await db.table(table).get(row.id)) as SyncEnvelope | undefined
            // A pending local edit wins for now; the next push reconciles it.
            if (local?._dirty === 1) continue
            await db.table(table).put({ ...row, _dirty: 0 })
          }
        }
      },
    )
    await this.setCursor(res.serverTime)
  }

  /** Wire up automatic syncing (focus / reconnect) and kick off the first run. */
  start(): () => void {
    const onOnline = (): void => {
      this.uploadsDisabled = false // retry uploads — config may have changed
      void this.syncNow()
    }
    const onFocus = (): void => void this.syncNow()
    const onOffline = (): void => this.setState({ status: 'offline' })
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    window.addEventListener('focus', onFocus)

    void Promise.all([countPending(), countPhotosQueued()]).then(([pending, photosQueued]) =>
      this.setState({ pending, photosQueued }),
    )
    void this.syncNow()

    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
      window.removeEventListener('focus', onFocus)
    }
  }
}

export const syncEngine = new SyncEngine()

/**
 * Create or update a local row: stamps the sync envelope (`id`, `updated_at`,
 * `_dirty = 1`), preserves `created_at`, and schedules a sync. The caller passes
 * the *whole* row (the client always holds it in Dexie) — sync upserts full rows,
 * not patches.
 */
export async function writeLocal(
  table: SyncTableName,
  record: Partial<SyncEnvelope> & Record<string, unknown>,
): Promise<string> {
  const id = (record.id as string | undefined) ?? crypto.randomUUID()
  const now = new Date().toISOString()
  const existing = (await db.table(table).get(id)) as SyncEnvelope | undefined
  await db.table(table).put({
    ...record,
    id,
    created_at: record.created_at ?? existing?.created_at ?? now,
    updated_at: now,
    deleted: record.deleted ?? false,
    _dirty: 1,
  })
  syncEngine.schedule()
  return id
}

/** Soft-delete a local row (writes a tombstone) and schedule a sync. */
export async function deleteLocal(table: SyncTableName, id: string): Promise<void> {
  const existing = (await db.table(table).get(id)) as
    | (SyncEnvelope & Record<string, unknown>)
    | undefined
  if (!existing) return
  await db.table(table).put({
    ...existing,
    deleted: true,
    updated_at: new Date().toISOString(),
    _dirty: 1,
  })
  syncEngine.schedule()
}
