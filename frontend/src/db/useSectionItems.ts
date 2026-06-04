import { useLiveQuery } from 'dexie-react-hooks'
import { db } from './db'
import { itemsOfSection } from './items'
import type { Attachment, Item } from './types'

export interface SectionItems {
  items: Item[]
  /** Live item attachments, grouped by item id (photos for entries/pins/materials). */
  byOwner: Map<string, Attachment[]>
}

/**
 * Live items of a section plus their photo attachments, grouped by item id — the
 * one query every kind renderer needs. Attachment scale is small (a personal
 * app), so a single full scan grouped in memory keeps the renderers simple.
 */
export function useSectionItems(sectionId: string | undefined): SectionItems | undefined {
  return useLiveQuery(async () => {
    if (!sectionId) return { items: [], byOwner: new Map() }
    const items = await itemsOfSection(sectionId)
    const ids = new Set(items.map((i) => i.id))
    const byOwner = new Map<string, Attachment[]>()
    for (const att of await db.attachments.toArray()) {
      if (att.deleted || att.owner_type !== 'item' || !ids.has(att.owner_id)) continue
      const list = byOwner.get(att.owner_id) ?? []
      list.push(att)
      byOwner.set(att.owner_id, list)
    }
    return { items, byOwner }
  }, [sectionId])
}
