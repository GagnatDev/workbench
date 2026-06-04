import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { BookOpen, ChevronRight, Image, ListChecks, Package, StickyNote } from 'lucide-react'
import { BottomSheet } from './BottomSheet'
import { AttachmentThumb } from './AttachmentThumb'
import { db } from '@/db/db'
import { fileIdea, setIdeaState } from '@/db/ideas'
import { createSection, defaultSectionName, sectionsOfProject } from '@/db/sections'
import type { SectionKind } from '@/db/payload'
import type { Idea, Section } from '@/db/types'

const TARGETS: { kind: SectionKind; label: string; icon: typeof BookOpen }[] = [
  { kind: 'journal', label: 'Entry', icon: BookOpen },
  { kind: 'checklist', label: 'Task', icon: ListChecks },
  { kind: 'moodboard', label: 'Pin', icon: Image },
  { kind: 'materials', label: 'Material', icon: Package },
]

/**
 * File-as sheet (ui-ux-design.md §4): four big targets — Entry / Task / Pin /
 * Material — plus *Keep as note*. Picking a kind files the idea into that kind's
 * section (carrying its text + photos, see `fileIdea`); when the project has more
 * than one section of that kind a picker row appears so you choose which, and
 * when it has none we create one on the spot. *Keep as note* drops the idea into
 * the project inbox's Kept segment instead.
 */
export function FileAsSheet({
  idea,
  projectId,
  onClose,
}: {
  idea: Idea
  projectId: string
  onClose: () => void
}) {
  const sections = useLiveQuery(() => sectionsOfProject(projectId), [projectId]) ?? []
  const photo = useLiveQuery(async () => {
    const atts = await db.attachments.where('owner_id').equals(idea.id).toArray()
    return atts.find((a) => !a.deleted && a.owner_type === 'idea')
  }, [idea.id])
  const [pickKind, setPickKind] = useState<SectionKind | null>(null)

  const fileInto = async (section: Section) => {
    await fileIdea(idea, section)
    onClose()
  }

  const chooseKind = async (kind: SectionKind) => {
    const ofKind = sections.filter((s) => s.kind === kind)
    if (ofKind.length === 0) {
      const id = await createSection(projectId, kind, defaultSectionName(kind))
      const section = await db.sections.get(id)
      if (section) await fileInto(section)
    } else if (ofKind.length === 1) {
      await fileInto(ofKind[0]!)
    } else {
      setPickKind(kind) // more than one — let the user choose (§4)
    }
  }

  const ofPicked = pickKind ? sections.filter((s) => s.kind === pickKind) : []

  return (
    <BottomSheet onClose={onClose} labelledBy="file-as-title">
      <div className="mb-3 flex items-start gap-3">
        {photo && (
          <AttachmentThumb
            attachmentId={photo.id}
            uploaded={photo.uploaded}
            className="h-12 w-12 flex-shrink-0 rounded-lg object-cover"
            alt=""
          />
        )}
        <p id="file-as-title" className="min-w-0 flex-1 break-words text-charcoal">
          {idea.content || (idea.link ?? 'Photo')}
        </p>
      </div>

      {pickKind ? (
        <div>
          <p className="mb-2 text-sm text-charcoal-muted">Which {pickKind}?</p>
          <ul className="flex flex-col">
            {ofPicked.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => void fileInto(s)}
                  className="flex w-full items-center justify-between rounded-lg px-2 py-2.5 text-left text-charcoal hover:bg-oatmeal"
                >
                  {s.name}
                  <ChevronRight size={16} className="text-charcoal-muted" />
                </button>
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => setPickKind(null)}
            className="mt-2 text-sm text-charcoal-muted hover:text-charcoal"
          >
            ← Back
          </button>
        </div>
      ) : (
        <>
          <p className="mb-2 text-xs uppercase tracking-wide text-charcoal-muted">File as</p>
          <div className="grid grid-cols-2 gap-2">
            {TARGETS.map(({ kind, label, icon: Icon }) => (
              <button
                key={kind}
                type="button"
                onClick={() => void chooseKind(kind)}
                className="flex items-center gap-2 rounded-lg bg-oatmeal px-3 py-3 text-left text-charcoal hover:bg-stoneware"
              >
                <Icon size={18} className="text-charcoal-muted" /> {label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => {
              void setIdeaState(idea, 'kept')
              onClose()
            }}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-divider py-2.5 text-sm text-charcoal"
          >
            <StickyNote size={16} /> Keep as note
          </button>
        </>
      )}
    </BottomSheet>
  )
}
