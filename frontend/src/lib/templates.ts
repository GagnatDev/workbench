/**
 * Stage templates used when promoting an idea / creating a project (ui-ux-design.md
 * §3.3, §6.3). A template seeds the project's ordered `stages` list and a set of
 * *suggested* empty `details` keys — gentle structure, not a form. Empty seeded
 * keys vanish if left blank (the project screen, Phase 4, owns that behaviour);
 * here we just provide the starting shape. Flexibility lives in `details`, so
 * there is no per-craft schema.
 */
export interface StageTemplate {
  id: string
  label: string
  stages: string[]
  /** Suggested detail keys this craft tends to want (free-text values). */
  detailKeys: string[]
}

export const STAGE_TEMPLATES: StageTemplate[] = [
  {
    id: 'ceramics',
    label: 'Ceramics',
    stages: ['Planning', 'Forming', 'Trimming', 'Bisque', 'Glazing', 'Glaze firing', 'Complete'],
    detailKeys: ['Clay body', 'Firing temp', 'Shrinkage'],
  },
  {
    id: 'textiles',
    label: 'Textiles',
    stages: ['Planning', 'Dyeing', 'Warping', 'Weaving', 'Finishing', 'Complete'],
    detailKeys: ['Fiber', 'Yarn weight', 'Sett'],
  },
  {
    id: 'kanban',
    label: 'Generic',
    stages: ['To do', 'In progress', 'Done'],
    detailKeys: [],
  },
  {
    id: 'appdev',
    label: 'App dev',
    stages: ['Backlog', 'In progress', 'Review', 'Shipped'],
    detailKeys: ['Repo', 'Stack'],
  },
]

export const DEFAULT_TEMPLATE_ID = 'ceramics'

export function templateById(id: string): StageTemplate {
  return STAGE_TEMPLATES.find((t) => t.id === id) ?? STAGE_TEMPLATES[0]!
}

/** Seed an empty `details` object from a template's suggested keys (all blank). */
export function seedDetails(template: StageTemplate): Record<string, string> {
  return Object.fromEntries(template.detailKeys.map((k) => [k, '']))
}
