import { Link } from 'react-router-dom'
import { BookOpen, Check, Image, ListChecks, MoreHorizontal, Package } from 'lucide-react'
import { AttachmentThumb } from './AttachmentThumb'
import { useSectionItems } from '@/db/useSectionItems'
import type { EntryPayload, PinPayload, SectionKind, TaskPayload } from '@/db/payload'
import type { Section } from '@/db/types'

const KIND_ICON: Record<SectionKind, typeof BookOpen> = {
  journal: BookOpen,
  moodboard: Image,
  checklist: ListChecks,
  materials: Package,
}

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

/**
 * One preview card per Section on the project overview (ui-ux-design.md §6.1): a
 * header (kind icon, name, a count/summary) over a 2–3 item peek built for the
 * kind — journal shows the latest entries, checklist a done-count, moodboard a
 * thumbnail strip, materials the first few names. Tapping the card opens the
 * section full-screen; the ⋯ opens rename/delete (handled by the parent).
 */
export function SectionPreviewCard({
  section,
  projectId,
  onManage,
}: {
  section: Section
  projectId: string
  onManage: () => void
}) {
  const data = useSectionItems(section.id)
  const items = data?.items ?? []
  const Icon = KIND_ICON[section.kind]

  let summary = ''
  if (section.kind === 'checklist') {
    const done = items.filter((i) => (i.payload as TaskPayload).done).length
    summary = `${done}/${items.length}`
  } else if (items.length) {
    summary = String(items.length)
  }

  const to = `/projects/${projectId}/sections/${section.id}`
  return (
    <div className="rounded-card bg-stoneware p-3">
      <div className="flex items-center gap-2 text-charcoal">
        <Icon size={16} className="flex-shrink-0 text-charcoal-muted" />
        <Link to={to} className="min-w-0 flex-1 truncate font-medium">
          {section.name}
        </Link>
        {summary && <span className="tabular text-sm text-charcoal-muted">{summary}</span>}
        <button
          type="button"
          aria-label="Manage section"
          onClick={onManage}
          className="-mr-1 p-1 text-charcoal-muted hover:text-charcoal"
        >
          <MoreHorizontal size={16} />
        </button>
      </div>
      <Link to={to} className="mt-2 block">
        <Preview section={section} data={data} />
      </Link>
    </div>
  )
}

function Preview({ section, data }: { section: Section; data: ReturnType<typeof useSectionItems> }) {
  const items = data?.items ?? []
  if (items.length === 0) {
    return <p className="text-sm text-charcoal-muted">Empty — tap to add.</p>
  }

  if (section.kind === 'journal') {
    const entries = items
      .slice()
      .sort((a, b) =>
        ((b.payload as EntryPayload).entry_at ?? '').localeCompare(
          (a.payload as EntryPayload).entry_at ?? '',
        ),
      )
      .slice(0, 2)
    return (
      <ul className="flex flex-col gap-1 text-sm text-charcoal-muted">
        {entries.map((e) => (
          <li key={e.id} className="truncate">
            <span className="text-charcoal-muted">{shortDate((e.payload as EntryPayload).entry_at)}</span>
            {e.body ? ` — ${e.body.split('\n')[0]}` : ''}
          </li>
        ))}
      </ul>
    )
  }

  if (section.kind === 'checklist') {
    return (
      <ul className="flex flex-col gap-1 text-sm">
        {items.slice(0, 3).map((t) => {
          const done = (t.payload as TaskPayload).done
          return (
            <li
              key={t.id}
              className={`flex items-center gap-1.5 truncate ${
                done ? 'text-charcoal-muted line-through' : 'text-charcoal-muted'
              }`}
            >
              <span className="flex h-3.5 w-3.5 flex-shrink-0 items-center justify-center rounded-sm border border-charcoal-muted">
                {done && <Check size={10} />}
              </span>
              <span className="truncate">{t.title || 'Untitled'}</span>
            </li>
          )
        })}
      </ul>
    )
  }

  if (section.kind === 'moodboard') {
    const thumbs: string[] = []
    for (const item of items) {
      if ((item.payload as PinPayload).subtype !== 'image') continue
      const att = data?.byOwner.get(item.id)?.[0]
      if (att) thumbs.push(att.id)
      if (thumbs.length === 3) break
    }
    if (thumbs.length === 0) {
      return <p className="text-sm text-charcoal-muted">{items.length} link pins</p>
    }
    return (
      <div className="flex gap-1.5">
        {thumbs.map((id) => (
          <AttachmentThumb
            key={id}
            attachmentId={id}
            className="h-14 w-14 rounded-lg object-cover"
            alt=""
          />
        ))}
      </div>
    )
  }

  // materials
  return (
    <ul className="flex flex-col gap-1 text-sm text-charcoal-muted">
      {items.slice(0, 3).map((m) => (
        <li key={m.id} className="truncate">
          {m.title || 'Untitled'}
        </li>
      ))}
    </ul>
  )
}
