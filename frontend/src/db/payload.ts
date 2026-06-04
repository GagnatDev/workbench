import { z } from 'zod'
import type { Section } from './types'

/**
 * Per-`kind` Item payload validation (domain-model.md — "per-kind integrity is
 * enforced in app code via a Zod discriminated union on `payload`, not by the
 * DB"). The DB stores `items.payload` as opaque jsonb and the sync layer passes
 * it through untouched; *this* file is where a journal entry, a checklist task, a
 * moodboard pin, and a materials line are kept honest. Validation runs on every
 * local write (see `createItem`/`updateItem`), so a bad payload never reaches
 * Dexie or the server.
 *
 * A Section's `kind` selects the schema for its Items — there is one payload
 * shape per kind, so adding a kind is: a schema here + its renderer + this map.
 */

export type SectionKind = Section['kind']

/** Journal entry — carries when the entry happened (backdatable, ui-ux §7.1). */
const entryPayload = z.object({
  entry_at: z.string().datetime({ offset: true }),
})

/** Checklist task — just a done flag; the task text lives in the Item's title. */
const taskPayload = z.object({
  done: z.boolean(),
})

/**
 * Moodboard pin — an `image` pin (photo via an attachment) or a `link` pin (a URL
 * rendered as a compact text card, ui-ux §7.2). `url` is required for links and
 * absent for images.
 */
const pinPayload = z.discriminatedUnion('subtype', [
  z.object({ subtype: z.literal('image') }),
  z.object({ subtype: z.literal('link'), url: z.string().min(1) }),
])

/** Materials line — free-text quantity + unit ("2", "kg"); the name is the title. */
const materialPayload = z.object({
  quantity: z.string(),
  unit: z.string(),
})

const PAYLOAD_SCHEMAS = {
  journal: entryPayload,
  checklist: taskPayload,
  moodboard: pinPayload,
  materials: materialPayload,
} satisfies Record<SectionKind, z.ZodTypeAny>

export type EntryPayload = z.infer<typeof entryPayload>
export type TaskPayload = z.infer<typeof taskPayload>
export type PinPayload = z.infer<typeof pinPayload>
export type MaterialPayload = z.infer<typeof materialPayload>

/**
 * Validate (and normalize) a payload for a Section's kind, throwing on a bad
 * shape. Returns a plain object safe to store in `items.payload`.
 */
export function validatePayload(
  kind: SectionKind,
  payload: unknown,
): Record<string, unknown> {
  return PAYLOAD_SCHEMAS[kind].parse(payload) as Record<string, unknown>
}

/**
 * A blank, valid payload for a freshly created Item of the given kind. `entry_at`
 * defaults to now (the journal composer overrides it when backdating); the caller
 * supplies pin `subtype`/`url` and material quantity/unit, which start empty here.
 */
export function emptyPayload(kind: SectionKind): Record<string, unknown> {
  switch (kind) {
    case 'journal':
      return { entry_at: new Date().toISOString() }
    case 'checklist':
      return { done: false }
    case 'moodboard':
      return { subtype: 'image' }
    case 'materials':
      return { quantity: '', unit: '' }
  }
}
