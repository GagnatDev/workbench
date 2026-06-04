import { db } from './db'
import { createProject } from './projects'
import { deleteLocal, writeLocal } from './sync'
import type { Idea } from './types'
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
    await db.blobs.put({ id: draft.photo.id, blob: draft.photo.blob })
    await writeLocal('attachments', {
      id: draft.photo.id,
      owner_type: 'idea',
      owner_id: ideaId,
      storage_key: null,
      content_type: draft.photo.blob.type || 'image/jpeg',
      uploaded: false,
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
