import { db } from './db'
import { deleteLocal, writeLocal } from './sync'
import type { Section } from './types'
import type { SectionKind } from './payload'
import { compareRank, rankAfter } from '@/lib/rank'

/**
 * Section lifecycle (Phase 5). A Section is the generic named container inside a
 * Project, discriminated by `kind`; a project may hold any number of sections of
 * any kind (ui-ux-design.md §6.1). All operations are local-first writes built on
 * the Phase 2 primitives, so they sync like any other row — there is no
 * server-side section logic.
 */

/** The four kinds, with the labels the add-section / file-as sheets show. */
export const SECTION_KINDS: { kind: SectionKind; label: string }[] = [
  { kind: 'journal', label: 'Journal' },
  { kind: 'moodboard', label: 'Moodboard' },
  { kind: 'checklist', label: 'Checklist' },
  { kind: 'materials', label: 'Materials' },
]

/** A sensible default name when the user adds a section without typing one. */
export function defaultSectionName(kind: SectionKind): string {
  return SECTION_KINDS.find((k) => k.kind === kind)?.label ?? 'Section'
}

/** All live sections of a project, in rank order (overview cards, pickers). */
export async function sectionsOfProject(projectId: string): Promise<Section[]> {
  const all = await db.sections.where('project_id').equals(projectId).toArray()
  return all.filter((s) => !s.deleted).sort((a, b) => compareRank(a.rank, b.rank))
}

/**
 * Create a section, appended after the project's current last section. An empty
 * name falls back to the kind's label so a section is never untitled. Returns the
 * new section id.
 */
export async function createSection(
  projectId: string,
  kind: SectionKind,
  name: string,
): Promise<string> {
  const existing = await sectionsOfProject(projectId)
  const maxRank = existing.length ? existing[existing.length - 1]!.rank : null
  return writeLocal('sections', {
    project_id: projectId,
    kind,
    name: name.trim() || defaultSectionName(kind),
    rank: rankAfter(maxRank),
  })
}

export async function renameSection(section: Section, name: string): Promise<void> {
  await writeLocal('sections', { ...section, name: name.trim() || defaultSectionName(section.kind) })
}

/** Reposition a section (drag reorder, §8) — the caller computes the new rank. */
export async function setSectionRank(section: Section, rank: string): Promise<void> {
  await writeLocal('sections', { ...section, rank })
}

/**
 * Soft-delete a section and cascade to its items and their attachments, so a
 * removed journal/checklist leaves nothing orphaned (mirrors `deleteProject`).
 */
export async function deleteSection(id: string): Promise<void> {
  const items = await db.items.where('section_id').equals(id).toArray()
  for (const item of items) {
    if (item.deleted) continue
    const atts = await db.attachments.where('owner_id').equals(item.id).toArray()
    for (const att of atts) {
      if (!att.deleted && att.owner_type === 'item') await deleteLocal('attachments', att.id)
    }
    await deleteLocal('items', item.id)
  }
  await deleteLocal('sections', id)
}
