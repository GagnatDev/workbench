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
  lastSyncedAt: string | null
}

type Listener = (state: SyncState) => void

function isOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false
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
  private state: SyncState = { status: 'synced', pending: 0, lastSyncedAt: null }
  private readonly listeners = new Set<Listener>()
  private running = false
  private queued = false
  private timer: ReturnType<typeof setTimeout> | undefined

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
      this.setState({ status: 'offline', pending: await countPending() })
      return
    }
    if (this.running) {
      this.queued = true
      return
    }
    this.running = true
    this.setState({ status: 'syncing' })
    try {
      await this.push()
      await this.pull()
      this.setState({
        status: 'synced',
        pending: await countPending(),
        lastSyncedAt: new Date().toISOString(),
      })
    } catch (err) {
      console.error('[sync] run failed', err)
      this.setState({
        status: isOffline() ? 'offline' : 'error',
        pending: await countPending(),
      })
    } finally {
      this.running = false
      if (this.queued) {
        this.queued = false
        void this.syncNow()
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
    const onOnline = (): void => void this.syncNow()
    const onFocus = (): void => void this.syncNow()
    const onOffline = (): void => this.setState({ status: 'offline' })
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    window.addEventListener('focus', onFocus)

    void countPending().then((pending) => this.setState({ pending }))
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
