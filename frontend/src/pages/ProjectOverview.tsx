import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  FolderInput,
  Inbox as InboxIcon,
  MoreHorizontal,
  Plus,
  Star,
  Trash2,
} from 'lucide-react'
import { AddSectionSheet } from '@/components/AddSectionSheet'
import { BottomSheet } from '@/components/BottomSheet'
import { CollectionPicker } from '@/components/CollectionPicker'
import { DetailsBlock } from '@/components/DetailsBlock'
import { EditProjectSheet } from '@/components/EditProjectSheet'
import { ReorderableList } from '@/components/ReorderableList'
import { SectionPreviewCard } from '@/components/SectionPreviewCard'
import { StatusSheet } from '@/components/StatusSheet'
import { db } from '@/db/db'
import { deleteProject, toggleFavourite } from '@/db/projects'
import { deleteSection, renameSection, sectionsOfProject, setSectionRank } from '@/db/sections'
import type { Section } from '@/db/types'

type Sheet = 'status' | 'collection' | 'edit' | 'addSection' | null

/**
 * Project overview (ui-ux-design.md §6.1): the header (title, status chip,
 * favourite, overflow), the collection chip, and the flexible details block. The
 * status chip opens the stage sheet (§6.2); ✎ edits details inline (§6.3); the
 * overflow holds Edit and Delete. Per-section preview cards and the project Inbox
 * banner land in Phase 5 (Sections & Items).
 */
export function ProjectOverview() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const project = useLiveQuery(() => (id ? db.projects.get(id) : undefined), [id])
  const collection = useLiveQuery(
    () => (project?.collection_id ? db.collections.get(project.collection_id) : undefined),
    [project?.collection_id],
  )
  const sections = useLiveQuery(() => (id ? sectionsOfProject(id) : []), [id]) ?? []
  // Untriaged ideas sitting in this project's inbox (drives the §6.1 banner).
  const inboxCount =
    useLiveQuery(async () => {
      if (!id) return 0
      const ideas = await db.ideas.where('project_id').equals(id).toArray()
      return ideas.filter((i) => !i.deleted && i.state === 'captured').length
    }, [id]) ?? 0

  const [sheet, setSheet] = useState<Sheet>(null)
  const [manageSection, setManageSection] = useState<Section | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  if (project === undefined) {
    return <p className="text-charcoal-muted">Loading…</p>
  }
  if (!project || project.deleted) {
    return (
      <div>
        <p className="text-charcoal">Project not found.</p>
        <Link to="/projects" className="mt-2 inline-block text-terracotta">
          Back to projects
        </Link>
      </div>
    )
  }

  const remove = async () => {
    await deleteProject(project.id)
    navigate('/projects')
  }

  return (
    <section>
      <div className="mb-4 flex items-center justify-between">
        <Link
          to="/projects"
          className="inline-flex items-center gap-1 text-sm text-charcoal-muted hover:text-charcoal"
        >
          <ChevronLeft size={16} /> Projects
        </Link>
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label={project.favourite ? 'Unfavourite' : 'Favourite'}
            aria-pressed={project.favourite}
            onClick={() => void toggleFavourite(project)}
            className={project.favourite ? 'p-1.5 text-flax' : 'p-1.5 text-charcoal-muted hover:text-charcoal'}
          >
            <Star size={20} fill={project.favourite ? 'currentColor' : 'none'} />
          </button>
          <div className="relative">
            <button
              type="button"
              aria-label="More"
              onClick={() => {
                setMenuOpen((v) => !v)
                setConfirmDelete(false)
              }}
              className="p-1.5 text-charcoal-muted hover:text-charcoal"
            >
              <MoreHorizontal size={20} />
            </button>
            {menuOpen && (
              <div className="absolute right-0 z-10 mt-1 w-44 rounded-card bg-stoneware py-1 shadow-md">
                <button
                  type="button"
                  onClick={() => {
                    setSheet('edit')
                    setMenuOpen(false)
                  }}
                  className="block w-full px-4 py-2 text-left text-sm text-charcoal hover:bg-oatmeal"
                >
                  Edit project
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (confirmDelete) void remove()
                    else setConfirmDelete(true)
                  }}
                  className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-brick hover:bg-oatmeal"
                >
                  <Trash2 size={15} />
                  {confirmDelete ? 'Tap again to confirm' : 'Delete project'}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-start justify-between gap-3">
        <h2 className="min-w-0 font-serif text-2xl text-charcoal">{project.title}</h2>
        <button
          type="button"
          onClick={() => setSheet('status')}
          className="flex flex-shrink-0 items-center gap-1 rounded-full bg-stoneware px-3 py-1 text-sm text-charcoal"
        >
          {project.status ?? 'No status'}
          <ChevronDown size={15} className="text-charcoal-muted" />
        </button>
      </div>

      {project.description && (
        <p className="mt-2 whitespace-pre-wrap text-charcoal-muted">{project.description}</p>
      )}

      <button
        type="button"
        onClick={() => setSheet('collection')}
        className="mt-3 inline-flex items-center gap-1.5 text-sm text-charcoal-muted hover:text-charcoal"
      >
        <FolderInput size={15} />
        {collection ? collection.name : 'Add to collection'}
      </button>

      {project.tags && project.tags.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {project.tags.map((tag) => (
            <span
              key={tag}
              className="rounded-full bg-oatmeal px-2.5 py-1 text-sm text-charcoal"
            >
              #{tag}
            </span>
          ))}
        </div>
      )}

      {inboxCount > 0 && (
        <Link
          to={`/projects/${project.id}/inbox`}
          className="mt-4 flex items-center gap-2 rounded-card bg-flax/20 px-3 py-2.5 text-sm text-charcoal"
        >
          <InboxIcon size={16} className="text-charcoal-muted" />
          <span className="flex-1">
            {inboxCount} {inboxCount === 1 ? 'idea' : 'ideas'} to file
          </span>
          <ChevronRight size={16} className="text-charcoal-muted" />
        </Link>
      )}

      <div className="mt-6">
        <DetailsBlock project={project} />
      </div>

      <div className="mt-8">
        {sections.length === 0 ? (
          <p className="text-sm text-charcoal-muted">Add a journal to start logging.</p>
        ) : (
          <ReorderableList
            items={sections}
            onReorder={(section, rank) => void setSectionRank(section, rank)}
            className="flex flex-col gap-2"
            rowClassName="list-none"
            renderItem={(section) => (
              <SectionPreviewCard
                section={section}
                projectId={project.id}
                onManage={() => setManageSection(section)}
              />
            )}
          />
        )}
        <button
          type="button"
          onClick={() => setSheet('addSection')}
          className="mt-3 inline-flex items-center gap-1.5 text-sm text-terracotta hover:text-charcoal"
        >
          <Plus size={16} /> Add section
        </button>
      </div>

      {sheet === 'status' && <StatusSheet project={project} onClose={() => setSheet(null)} />}
      {sheet === 'collection' && (
        <CollectionPicker project={project} onClose={() => setSheet(null)} />
      )}
      {sheet === 'edit' && <EditProjectSheet project={project} onClose={() => setSheet(null)} />}
      {sheet === 'addSection' && (
        <AddSectionSheet projectId={project.id} onClose={() => setSheet(null)} />
      )}
      {manageSection && (
        <SectionManageSheet section={manageSection} onClose={() => setManageSection(null)} />
      )}
    </section>
  )
}

/** Rename or delete a section (the §6.1 overview management, behind the ⋯). */
function SectionManageSheet({ section, onClose }: { section: Section; onClose: () => void }) {
  const [name, setName] = useState(section.name)
  const [confirm, setConfirm] = useState(false)

  const save = () => {
    if (name.trim() && name.trim() !== section.name) void renameSection(section, name)
  }

  return (
    <BottomSheet
      onClose={() => {
        save()
        onClose()
      }}
      labelledBy="section-manage"
    >
      <h2 id="section-manage" className="mb-3 font-serif text-lg text-charcoal">
        Section
      </h2>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="w-full rounded-lg bg-oatmeal p-3 text-charcoal focus:outline-none focus:ring-2 focus:ring-terracotta/40"
      />
      <button
        type="button"
        onClick={() => {
          if (confirm) {
            void deleteSection(section.id)
            onClose()
          } else setConfirm(true)
        }}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg py-2.5 text-brick"
      >
        <Trash2 size={16} /> {confirm ? 'Tap again to confirm' : 'Delete section'}
      </button>
    </BottomSheet>
  )
}
