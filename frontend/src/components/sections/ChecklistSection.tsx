import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Check, Plus, Trash2 } from 'lucide-react'
import { BottomSheet } from '../BottomSheet'
import { EmptyState } from '../EmptyState'
import { ReorderableList } from '../ReorderableList'
import { TagInput } from '../TagInput'
import { useSectionItems } from '@/db/useSectionItems'
import { allItemTags, createItem, deleteItem, setItemRank, toggleTask, updateItem } from '@/db/items'
import { matchesTags } from '@/lib/tags'
import type { TaskPayload } from '@/db/payload'
import type { Item, Section } from '@/db/types'

/**
 * Checklist section (ui-ux-design.md §7.3): a conventional task list. Tap the box
 * to toggle `done`; tap the row to edit; a bottom "Add a task…" field matches the
 * composer grammar (type → Enter saves). Done items stay in place, struck through
 * — order is user-controlled (long-press drag, §8), not auto-sinking.
 */
export function ChecklistSection({
  section,
  tagFilter = [],
}: {
  section: Section
  tagFilter?: string[]
}) {
  const data = useSectionItems(section.id)
  const items = (data?.items ?? []).filter((i) => matchesTags(i.tags, tagFilter))
  const [text, setText] = useState('')
  const [editing, setEditing] = useState<Item | null>(null)

  const add = async () => {
    const title = text.trim()
    if (!title) return
    await createItem(section, { title, payload: { done: false } })
    setText('')
  }

  return (
    <div>
      {items.length === 0 ? (
        <EmptyState title="No tasks yet." hint="Add the first thing to do below." />
      ) : (
        <ReorderableList
          items={items}
          onReorder={(item, rank) => void setItemRank(item, rank)}
          className="flex flex-col"
          rowClassName="list-none"
          renderItem={(item) => {
            const done = (item.payload as TaskPayload).done
            return (
              <div className="flex items-center gap-3 border-b border-divider py-2.5">
                <button
                  type="button"
                  aria-label={done ? 'Mark not done' : 'Mark done'}
                  aria-pressed={done}
                  onClick={() => void toggleTask(item)}
                  className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded border ${
                    done ? 'border-olive bg-olive text-oatmeal' : 'border-charcoal-muted'
                  }`}
                >
                  {done && <Check size={14} />}
                </button>
                <button
                  type="button"
                  onClick={() => setEditing(item)}
                  className={`min-w-0 flex-1 break-words text-left ${
                    done ? 'text-charcoal-muted line-through' : 'text-charcoal'
                  }`}
                >
                  {item.title || 'Untitled task'}
                </button>
              </div>
            )
          }}
        />
      )}

      <div className="mt-4 flex items-center gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              void add()
            }
          }}
          placeholder="Add a task…"
          className="min-w-0 flex-1 rounded-lg bg-oatmeal p-3 text-charcoal placeholder:text-charcoal-muted focus:outline-none focus:ring-2 focus:ring-terracotta/40"
        />
        <button
          type="button"
          aria-label="Add task"
          onClick={() => void add()}
          disabled={!text.trim()}
          className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-terracotta text-oatmeal disabled:opacity-40"
        >
          <Plus size={20} />
        </button>
      </div>

      {editing && <TaskEditSheet item={editing} onClose={() => setEditing(null)} />}
    </div>
  )
}

/** Rename, tag, or delete a task (the slower actions behind a row tap). */
function TaskEditSheet({ item, onClose }: { item: Item; onClose: () => void }) {
  const [title, setTitle] = useState(item.title ?? '')
  const [tags, setTags] = useState<string[]>(item.tags ?? [])
  const suggestions = useLiveQuery(() => allItemTags(), []) ?? []

  const save = () => {
    const titleChanged = title.trim() !== (item.title ?? '')
    const tagsChanged = JSON.stringify(tags) !== JSON.stringify(item.tags ?? [])
    if (titleChanged || tagsChanged) {
      void updateItem(item, { title: title.trim() || null, tags })
    }
  }

  return (
    <BottomSheet
      onClose={() => {
        save()
        onClose()
      }}
      labelledBy="task-edit"
    >
      <h2 id="task-edit" className="sr-only">
        Edit task
      </h2>
      <textarea
        rows={2}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className="w-full resize-none rounded-lg bg-oatmeal p-3 text-charcoal focus:outline-none focus:ring-2 focus:ring-terracotta/40"
      />
      <div className="mt-3">
        <TagInput tags={tags} onChange={setTags} suggestions={suggestions} />
      </div>
      <button
        type="button"
        onClick={() => {
          void deleteItem(item.id)
          onClose()
        }}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg py-2.5 text-brick"
      >
        <Trash2 size={16} /> Delete task
      </button>
    </BottomSheet>
  )
}
