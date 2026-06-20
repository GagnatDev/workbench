import { db } from './db'
import { deleteSection } from './sections'
import { deleteLocal, writeLocal } from './sync'
import type { Attachment, Project } from './types'
import { defaultCoverForProject, isDefaultCover } from '@/lib/covers'
import { compressImageForUpload } from '@/lib/image'
import { compareRank, rankBefore } from '@/lib/rank'
import { seedDetails, templateById } from '@/lib/templates'
import { generateThumbnail } from '@/lib/thumbnail'

/**
 * Project lifecycle operations (Phase 4), all on the Phase 2 local-first
 * primitives (`writeLocal`/`deleteLocal` stamp the envelope, mark the row dirty,
 * and trigger a sync). Stages, status, the flexible `details` blob, collection
 * membership, and the favourite flag all live on the `projects` row — there is no
 * server-side logic, so these are plain Dexie writes that sync like any other.
 */

/**
 * Create a project from a stage template (ui-ux-design.md §3.3, §5 header ➕). The
 * template seeds the ordered `stages` list, sets the status to the first stage,
 * and pre-fills the suggested (empty) `details` keys. New projects land at the top
 * of the list (favourites still pin above them, §5). Returns the new project id.
 * Shared by direct creation and idea promotion (see `promoteIdea`).
 */
export async function createProject(title: string, templateId: string): Promise<string> {
  const template = templateById(templateId)
  const projectId = crypto.randomUUID()

  const projects = await db.projects.toArray()
  const minRank = projects
    .filter((p) => !p.deleted)
    .map((p) => p.rank)
    .sort()[0]

  await writeLocal('projects', {
    id: projectId,
    title: title.trim() || 'Untitled project',
    description: null,
    collection_id: null,
    status: template.stages[0] ?? null,
    stages: template.stages,
    details: seedDetails(template),
    favourite: false,
    tags: [],
    rank: rankBefore(minRank ?? null),
    cover: null,
  })

  // Remember the template so the next promote/new-project defaults to it (§3.3).
  await db._meta.put({ key: 'lastTemplate', value: templateId })
  return projectId
}

/** Patch a project's editable fields (title/description/tags) from the edit sheet. */
export async function updateProject(
  project: Project,
  patch: Partial<Pick<Project, 'title' | 'description' | 'tags'>>,
): Promise<void> {
  await writeLocal('projects', { ...project, ...patch })
}

/** Jump the project to any stage (ui-ux-design.md §6.2 — no forced progression). */
export async function setProjectStatus(project: Project, status: string): Promise<void> {
  await writeLocal('projects', { ...project, status })
}

/**
 * Replace the project's customizable stage list (stage editor, §6.2). If the
 * current status label no longer exists in the new list (it was renamed or
 * deleted), fall back to the first stage so the status chip never dangles.
 */
export async function setProjectStages(project: Project, stages: string[]): Promise<void> {
  const status =
    project.status && stages.includes(project.status) ? project.status : (stages[0] ?? null)
  await writeLocal('projects', { ...project, stages, status })
}

/** Replace the flexible `details` key/value blob (§6.3). */
export async function setProjectDetails(
  project: Project,
  details: Record<string, string>,
): Promise<void> {
  await writeLocal('projects', { ...project, details })
}

/** Toggle the favourite flag (favourites pin to the top of the list, §5). */
export async function toggleFavourite(project: Project): Promise<void> {
  await writeLocal('projects', { ...project, favourite: !project.favourite })
}

/** Assign the project to a collection, or `null` to remove it from any (§5). */
export async function setProjectCollection(
  project: Project,
  collectionId: string | null,
): Promise<void> {
  await writeLocal('projects', { ...project, collection_id: collectionId })
}

/**
 * Set the project's chosen cover: `null` (automatic), `default:<key>` (a built-in
 * motif), or `att:<id>` (an existing photo). Only re-points the `cover` pointer, so
 * any previously chosen image stays attached and can be picked again. See `Project.cover`.
 */
export async function setProjectCover(project: Project, cover: string | null): Promise<void> {
  await writeLocal('projects', { ...project, cover })
}

/**
 * Upload a brand-new photo straight onto the project and make it the cover. Mirrors
 * the capture photo path (`captureIdea`): compress, stash the blob for the deferred
 * presigned upload, write a `project`-owned attachment row (synced + uploaded like
 * any other), then point `cover` at it. The prior cover attachment is untouched.
 */
export async function addProjectCoverPhoto(project: Project, blob: Blob): Promise<string> {
  const attachmentId = crypto.randomUUID()
  const compressed = await compressImageForUpload(blob)
  await db.blobs.put({ id: attachmentId, blob: compressed })
  await writeLocal('attachments', {
    id: attachmentId,
    owner_type: 'project',
    owner_id: project.id,
    storage_key: null,
    content_type: compressed.type || 'image/jpeg',
    uploaded: false,
    thumb: await generateThumbnail(compressed),
  })
  await setProjectCover(project, `att:${attachmentId}`)
  return attachmentId
}

/**
 * Soft-delete a project and cascade to everything under it: its sections (each in
 * turn cascading to its items and their attachments) and its project-scoped ideas
 * (and their attachments), so nothing is left orphaned once the project is gone.
 */
export async function deleteProject(id: string): Promise<void> {
  const sections = await db.sections.where('project_id').equals(id).toArray()
  for (const section of sections) {
    if (!section.deleted) await deleteSection(section.id)
  }

  const ideas = await db.ideas.where('project_id').equals(id).toArray()
  for (const idea of ideas) {
    if (idea.deleted) continue
    const atts = await db.attachments.where('owner_id').equals(idea.id).toArray()
    for (const att of atts) {
      if (!att.deleted && att.owner_type === 'idea') await deleteLocal('attachments', att.id)
    }
    await deleteLocal('ideas', idea.id)
  }

  // Cover photos uploaded straight onto the project (owner_type 'project').
  const coverAtts = await db.attachments.where('owner_id').equals(id).toArray()
  for (const att of coverAtts) {
    if (!att.deleted && att.owner_type === 'project') await deleteLocal('attachments', att.id)
  }

  await deleteLocal('projects', id)
}

/** Distinct tags across the user's projects, for the edit-sheet tag autocomplete. */
export async function allProjectTags(): Promise<string[]> {
  const projects = await db.projects.toArray()
  const set = new Set<string>()
  for (const project of projects) {
    if (project.deleted) continue
    for (const tag of project.tags ?? []) set.add(tag)
  }
  return [...set].sort()
}

/** Favourites pinned on top, then rank order (ui-ux-design.md §5). */
export function projectOrder(a: Project, b: Project): number {
  if (a.favourite !== b.favourite) return a.favourite ? -1 : 1
  return compareRank(a.rank, b.rank)
}

/** How a project's cover resolves for rendering — a specific photo, or a built-in motif. */
export type CoverDescriptor =
  | { kind: 'attachment'; id: string; uploaded: boolean }
  | { kind: 'default'; key: string }

/**
 * Resolve a project's cover for display from its explicit `cover` choice and the
 * live attachments under it. Precedence: an explicit `att:`/`default:` choice → the
 * automatic founding photo (oldest photo from a promoted idea, else the newest photo
 * anywhere under the project) → a deterministic default motif. A stale pointer (a
 * deleted attachment, or an unknown motif key) falls through to the automatic photo,
 * so a project never renders a broken cover. The single source of truth shared by
 * the list card and the overview hero, so the two always agree.
 */
export function resolveCover(
  project: Project,
  atts: Attachment[],
  promotedIdeaIds: Set<string>,
): CoverDescriptor {
  const cover = project.cover
  if (cover?.startsWith('att:')) {
    const id = cover.slice('att:'.length)
    const att = atts.find((a) => a.id === id)
    if (att) return { kind: 'attachment', id: att.id, uploaded: att.uploaded }
  } else if (cover?.startsWith('default:')) {
    const key = cover.slice('default:'.length)
    if (isDefaultCover(key)) return { kind: 'default', key }
  }

  let hero: Attachment | null = null
  let latest: Attachment | null = null
  for (const att of atts) {
    if (!latest || (att.created_at ?? '') > (latest.created_at ?? '')) latest = att
    if (att.owner_type === 'idea' && promotedIdeaIds.has(att.owner_id)) {
      if (!hero || (att.created_at ?? '') < (hero.created_at ?? '')) hero = att
    }
  }
  const photo = hero ?? latest
  if (photo) return { kind: 'attachment', id: photo.id, uploaded: photo.uploaded }

  return { kind: 'default', key: defaultCoverForProject(project) }
}

/**
 * Live attachments under a project: its ideas' photos, its sections' items' photos,
 * and any photo uploaded straight onto the project (owner_type 'project'). Backs the
 * cover picker grid, the overview photo-viewer set, and `projectCover`.
 */
async function attachmentsOfProject(projectId: string): Promise<Attachment[]> {
  const [ideas, sections, items, attachments] = await Promise.all([
    db.ideas.where('project_id').equals(projectId).toArray(),
    db.sections.where('project_id').equals(projectId).toArray(),
    db.items.toArray(),
    db.attachments.toArray(),
  ])
  const ideaIds = new Set(ideas.filter((i) => !i.deleted).map((i) => i.id))
  const sectionIds = new Set(sections.filter((s) => !s.deleted).map((s) => s.id))
  const itemIds = new Set(
    items.filter((it) => !it.deleted && sectionIds.has(it.section_id)).map((it) => it.id),
  )
  return attachments.filter((a) => {
    if (a.deleted) return false
    if (a.owner_type === 'idea') return ideaIds.has(a.owner_id)
    if (a.owner_type === 'item') return itemIds.has(a.owner_id)
    return a.owner_type === 'project' && a.owner_id === projectId
  })
}

/** All photos under a project, oldest first — the cover picker grid and viewer set. */
export async function projectPhotos(projectId: string): Promise<Attachment[]> {
  const atts = await attachmentsOfProject(projectId)
  return atts.sort((a, b) => (a.created_at ?? '').localeCompare(b.created_at ?? ''))
}

/** Resolve the cover descriptor for one project (the overview hero). Null if missing. */
export async function projectCover(projectId: string): Promise<CoverDescriptor | null> {
  const project = await db.projects.get(projectId)
  if (!project || project.deleted) return null
  const [atts, ideas] = await Promise.all([
    attachmentsOfProject(projectId),
    db.ideas.where('project_id').equals(projectId).toArray(),
  ])
  const promotedIdeaIds = new Set(
    ideas.filter((i) => !i.deleted && i.state === 'promoted').map((i) => i.id),
  )
  return resolveCover(project, atts, promotedIdeaIds)
}

/**
 * A project enriched for the §5 list card: its resolved cover (photo or default
 * motif, via `resolveCover`) and the time of its last activity (for "2d ago",
 * surfacing neglected work). Drawn from the project's ideas and its sections' items
 * so the card stays correct as content grows.
 */
export interface ProjectCard {
  project: Project
  cover: CoverDescriptor
  lastActivity: string
}

/** Build the enriched cards for the Projects tab in one pass over the local store. */
export async function loadProjectCards(): Promise<ProjectCard[]> {
  const [projects, ideas, sections, items, attachments] = await Promise.all([
    db.projects.toArray(),
    db.ideas.toArray(),
    db.sections.toArray(),
    db.items.toArray(),
    db.attachments.toArray(),
  ])

  const live = <T extends { deleted?: boolean }>(rows: T[]) => rows.filter((r) => !r.deleted)
  const liveIdeas = live(ideas)
  const liveItems = live(items)
  const liveAtts = live(attachments)

  // Map every item to the project it ultimately belongs to (via its section).
  const projectOfSection = new Map(live(sections).map((s) => [s.id, s.project_id]))
  const projectOfItem = new Map(
    liveItems.map((it) => [it.id, projectOfSection.get(it.section_id) ?? null]),
  )

  // The project each attachment belongs to, by walking its polymorphic owner.
  const projectOfAttachment = (att: Attachment): string | null => {
    if (att.owner_type === 'idea') {
      return liveIdeas.find((i) => i.id === att.owner_id)?.project_id ?? null
    }
    if (att.owner_type === 'project') return att.owner_id
    return projectOfItem.get(att.owner_id) ?? null
  }

  const newest = (a?: string, b?: string) =>
    (a ?? '').localeCompare(b ?? '') >= 0 ? (a ?? '') : (b ?? '')

  // Ideas promoted into a project supply its founding "hero" photo when no cover is
  // explicitly chosen (see resolveCover), preferred over the latest photo.
  const promotedIdeaIds = new Set(liveIdeas.filter((i) => i.state === 'promoted').map((i) => i.id))

  // Bucket every attachment under the project it ultimately belongs to, in one pass.
  const attsByProject = new Map<string, Attachment[]>()
  for (const att of liveAtts) {
    const projectId = projectOfAttachment(att)
    if (!projectId) continue
    const bucket = attsByProject.get(projectId)
    if (bucket) bucket.push(att)
    else attsByProject.set(projectId, [att])
  }

  return live(projects)
    .sort(projectOrder)
    .map((project) => {
      // Card cover: the project's chosen cover, else the founding/latest photo, else
      // a default motif — the same resolution the overview hero uses.
      const cover = resolveCover(project, attsByProject.get(project.id) ?? [], promotedIdeaIds)

      // Last activity: most recent of the project row, its ideas, and its items.
      let lastActivity = project.updated_at
      for (const idea of liveIdeas) {
        if (idea.project_id === project.id) lastActivity = newest(lastActivity, idea.created_at)
      }
      for (const it of liveItems) {
        if (projectOfItem.get(it.id) === project.id) {
          lastActivity = newest(lastActivity, it.updated_at)
        }
      }

      return { project, cover, lastActivity }
    })
}
