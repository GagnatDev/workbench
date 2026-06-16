import { db } from './db'
import { createItem } from './items'
import { createProject } from './projects'
import { deleteLocal, writeLocal } from './sync'
import type { Attachment, Idea, Section } from './types'
import { generateThumbnail } from '@/lib/thumbnail'
import { compressImageForUpload } from '@/lib/image'
import { isDraftEmpty, type ComposerDraft } from '@/components/Composer'

/**
 * Idea lifecycle operations, all built on the Phase 2 local-first primitives
 * (`writeLocal`/`deleteLocal` stamp the envelope, mark the row dirty, and trigger
 * a sync). The UI calls these; Dexie is the source of truth and sync carries the
 * change to the server when there's a network.
 */

/**
 * Persist a captured idea from a composer draft (ui-ux-design.md §2). A photo is
 * stored as a local blob now and an `attachments` row pointing at it (the actual
 * S3 upload happens in the sync engine on reconnect). Returns the new idea id, or
 * null when the draft is empty (empty capture is discarded, §11.1).
 */
export async function captureIdea(
  draft: ComposerDraft,
  projectId: string | null = null,
): Promise<string | null> {
  if (isDraftEmpty(draft)) return null
  const ideaId = crypto.randomUUID()

  if (draft.photo) {
    const blob = await compressImageForUpload(draft.photo.blob)
    await db.blobs.put({ id: draft.photo.id, blob })
    await writeLocal('attachments', {
      id: draft.photo.id,
      owner_type: 'idea',
      owner_id: ideaId,
      storage_key: null,
      content_type: blob.type || 'image/jpeg',
      uploaded: false,
      thumb: await generateThumbnail(blob),
    })
  }

  await writeLocal('ideas', {
    id: ideaId,
    content: draft.text.trim(),
    link: draft.link.trim() || null,
    project_id: projectId,
    state: 'captured',
    tags: [],
  })
  return ideaId
}

/** Apply a partial edit to an idea (content, link, tags) from the detail sheet. */
export async function updateIdea(
  idea: Idea,
  patch: Partial<Pick<Idea, 'content' | 'link' | 'tags' | 'state'>>,
): Promise<void> {
  await writeLocal('ideas', { ...idea, ...patch })
}

export async function setIdeaState(idea: Idea, state: Idea['state']): Promise<void> {
  await writeLocal('ideas', { ...idea, state })
}

/** Hard-intent delete → soft tombstone (sync propagates it; the UI hides it). */
export async function deleteIdea(id: string): Promise<void> {
  await deleteLocal('ideas', id)
}

/**
 * Promote a global idea into a new project (ui-ux-design.md §3.3, domain model
 * "promote"): create the Project from the chosen stage template (shared with
 * direct creation, see `createProject`), then reparent the idea into the
 * project's inbox and mark it `promoted`. Returns the new project id so the
 * caller can navigate into it.
 */
export async function promoteIdea(
  idea: Idea,
  title: string,
  templateId: string,
): Promise<string> {
  const projectId = await createProject(title, templateId)
  await writeLocal('ideas', { ...idea, project_id: projectId, state: 'promoted' })
  return projectId
}

/**
 * File a project idea into one of the project's Sections (ui-ux-design.md §4,
 * domain model "file"): create the Section Item carrying the idea's content,
 * tags, and attachments, then mark the idea `filed`. The text maps to the field
 * each kind reads as its main content (journal entry body, task/material/pin
 * title); a filed journal entry **pre-fills `entry_at` from the idea's capture
 * time** so logging it days later doesn't falsify the timeline. The idea's photos
 * are re-pointed to the new item so the jot's photo travels with it. Returns the
 * new item id so the caller can jump to the section.
 */
export async function fileIdea(idea: Idea, section: Section): Promise<string> {
  const content = idea.content
  const link = idea.link
  let title: string | null = null
  let body: string | null = null
  let payload: Record<string, unknown>
  switch (section.kind) {
    case 'journal':
      // Item has no link field; fold a captured link into the kind's Linkified
      // text so it survives filing and renders tappable (the journal body is
      // whitespace-pre-wrap + Linkify, so the URL lands on its own line).
      body = [content, link].filter(Boolean).join('\n\n')
      payload = { entry_at: idea.created_at ?? new Date().toISOString() }
      break
    case 'checklist':
      // Single-line task title; the checklist renderer Linkifies it.
      title = [content, link].filter(Boolean).join(' ')
      payload = { done: false }
      break
    case 'moodboard':
      title = content
      // A captured link becomes a link pin; otherwise an image pin (it carries
      // the idea's photo below, or renders as a caption-only card if there's none).
      payload = link ? { subtype: 'link', url: link } : { subtype: 'image' }
      break
    case 'materials':
      // Name stays the text; the link rides in the notes line (Linkified there).
      title = content
      body = link
      payload = { quantity: '', unit: '' }
      break
  }

  const itemId = await createItem(section, { title, body, payload, tags: idea.tags ?? [] })

  // Carry the idea's attachments into the new item (domain model: file carries
  // attachments). Re-point the polymorphic owner from the idea to the item.
  const atts = await db.attachments.where('owner_id').equals(idea.id).toArray()
  for (const att of atts) {
    if (att.deleted || att.owner_type !== 'idea') continue
    await writeLocal('attachments', { ...att, owner_type: 'item', owner_id: itemId })
  }

  await writeLocal('ideas', { ...idea, state: 'filed' })
  return itemId
}

/**
 * Photos from the idea(s) promoted into this project — the founding image(s)
 * surfaced as the overview hero (see ProjectOverview). Scoped to `promoted`
 * ideas so the hero is the founding image, not every un-triaged photo sitting in
 * the project's inbox (those surface via the §6.1 inbox banner). Oldest first so
 * the viewer pages in capture order.
 */
export async function projectIdeaPhotos(projectId: string): Promise<Attachment[]> {
  const ideas = (await db.ideas.where('project_id').equals(projectId).toArray()).filter(
    (i) => !i.deleted && i.state === 'promoted',
  )
  const ids = new Set(ideas.map((i) => i.id))
  const atts = await db.attachments.toArray()
  return atts
    .filter((a) => !a.deleted && a.owner_type === 'idea' && ids.has(a.owner_id))
    .sort((a, b) => (a.created_at ?? '').localeCompare(b.created_at ?? ''))
}

/**
 * The founding idea(s) promoted into this project — surfaced on the overview
 * (text + link) beside the founding photo (see ProjectOverview). Scoped to
 * `promoted` ideas like `projectIdeaPhotos`; oldest first to match the hero.
 */
export async function projectFoundingIdeas(projectId: string): Promise<Idea[]> {
  const ideas = (await db.ideas.where('project_id').equals(projectId).toArray()).filter(
    (i) => !i.deleted && i.state === 'promoted',
  )
  return ideas.sort((a, b) => (a.created_at ?? '').localeCompare(b.created_at ?? ''))
}

/** Distinct tags across the user's ideas, for the detail-sheet tag autocomplete. */
export async function allIdeaTags(): Promise<string[]> {
  const ideas = await db.ideas.toArray()
  const set = new Set<string>()
  for (const idea of ideas) {
    if (idea.deleted) continue
    for (const tag of idea.tags ?? []) set.add(tag)
  }
  return [...set].sort()
}
