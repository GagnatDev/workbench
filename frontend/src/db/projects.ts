import { db } from './db'
import { deleteSection } from './sections'
import { deleteLocal, writeLocal } from './sync'
import type { Attachment, Project } from './types'
import { compareRank, rankBefore } from '@/lib/rank'
import { seedDetails, templateById } from '@/lib/templates'

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
    rank: rankBefore(minRank ?? null),
  })

  // Remember the template so the next promote/new-project defaults to it (§3.3).
  await db._meta.put({ key: 'lastTemplate', value: templateId })
  return projectId
}

/** Patch a project's editable fields (title/description) from the edit sheet. */
export async function updateProject(
  project: Project,
  patch: Partial<Pick<Project, 'title' | 'description'>>,
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
  await deleteLocal('projects', id)
}

/** Favourites pinned on top, then rank order (ui-ux-design.md §5). */
export function projectOrder(a: Project, b: Project): number {
  if (a.favourite !== b.favourite) return a.favourite ? -1 : 1
  return compareRank(a.rank, b.rank)
}

/**
 * A project enriched for the §5 list card: its latest photo (for the thumbnail)
 * and the time of its last activity (for "2d ago", surfacing neglected work).
 * Photos and activity are drawn from the project's ideas and its sections' items
 * (the latter empty until Phase 5) — so the card stays correct as content grows.
 */
export interface ProjectCard {
  project: Project
  photoAttachmentId: string | null
  photoUploaded: boolean
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
    return projectOfItem.get(att.owner_id) ?? null
  }

  const newest = (a?: string, b?: string) =>
    (a ?? '').localeCompare(b ?? '') >= 0 ? (a ?? '') : (b ?? '')

  return live(projects)
    .sort(projectOrder)
    .map((project) => {
      // Latest photo: newest attachment anywhere under this project.
      let photo: Attachment | null = null
      for (const att of liveAtts) {
        if (projectOfAttachment(att) !== project.id) continue
        if (!photo || (att.created_at ?? '') > (photo.created_at ?? '')) photo = att
      }

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

      return {
        project,
        photoAttachmentId: photo?.id ?? null,
        photoUploaded: photo?.uploaded ?? false,
        lastActivity,
      }
    })
}
