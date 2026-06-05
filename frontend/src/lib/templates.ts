import { activeLocale } from '@/i18n'
import type { AppLocale } from '@/i18n/resources'

/**
 * Stage templates used when promoting an idea / creating a project (ui-ux-design.md
 * §3.3, §6.3). A template seeds the project's ordered `stages` list and a set of
 * *suggested* empty `details` keys — gentle structure, not a form. Empty seeded
 * keys vanish if left blank (the project screen, Phase 4, owns that behaviour);
 * here we just provide the starting shape. Flexibility lives in `details`, so
 * there is no per-craft schema.
 *
 * Norwegian-first: the label and the seeded stage/detail strings are localized so
 * new projects start in the user's active language. The seeds are written into
 * project data at creation (and become freely editable), so switching language
 * later does not rewrite existing projects — by design.
 */
export interface StageTemplate {
  id: string
  label: string
  stages: string[]
  /** Suggested detail keys this craft tends to want (free-text values). */
  detailKeys: string[]
}

/** The stable template ids, in display order. Content is resolved per locale. */
export const TEMPLATE_IDS = ['ceramics', 'textiles', 'kanban', 'appdev'] as const
export const DEFAULT_TEMPLATE_ID = 'ceramics'

const TEMPLATES: Record<AppLocale, Record<string, StageTemplate>> = {
  en: {
    ceramics: {
      id: 'ceramics',
      label: 'Ceramics',
      stages: ['Planning', 'Forming', 'Trimming', 'Bisque', 'Glazing', 'Glaze firing', 'Complete'],
      detailKeys: ['Clay body', 'Firing temp', 'Shrinkage'],
    },
    textiles: {
      id: 'textiles',
      label: 'Textiles',
      stages: ['Planning', 'Dyeing', 'Warping', 'Weaving', 'Finishing', 'Complete'],
      detailKeys: ['Fiber', 'Yarn weight', 'Sett'],
    },
    kanban: {
      id: 'kanban',
      label: 'Generic',
      stages: ['To do', 'In progress', 'Done'],
      detailKeys: [],
    },
    appdev: {
      id: 'appdev',
      label: 'App dev',
      stages: ['Backlog', 'In progress', 'Review', 'Shipped'],
      detailKeys: ['Repo', 'Stack'],
    },
  },
  nb: {
    ceramics: {
      id: 'ceramics',
      label: 'Keramikk',
      stages: ['Planlegging', 'Forming', 'Trimming', 'Bisque', 'Glasering', 'Glasurbrenning', 'Ferdig'],
      detailKeys: ['Leirtype', 'Brenntemperatur', 'Krymping'],
    },
    textiles: {
      id: 'textiles',
      label: 'Tekstil',
      stages: ['Planlegging', 'Farging', 'Renning', 'Veving', 'Etterbehandling', 'Ferdig'],
      detailKeys: ['Fiber', 'Garntykkelse', 'Tetthet'],
    },
    kanban: {
      id: 'kanban',
      label: 'Generell',
      stages: ['Å gjøre', 'Pågår', 'Ferdig'],
      detailKeys: [],
    },
    appdev: {
      id: 'appdev',
      label: 'Apputvikling',
      stages: ['Backlog', 'Pågår', 'Gjennomgang', 'Lansert'],
      detailKeys: ['Repo', 'Stack'],
    },
  },
}

/** The templates in display order, resolved for the active locale. */
export function localizedTemplates(): StageTemplate[] {
  const set = TEMPLATES[activeLocale()]
  return TEMPLATE_IDS.map((id) => set[id]!)
}

/** A single template by id, resolved for the active locale (falls back to first). */
export function templateById(id: string): StageTemplate {
  const set = TEMPLATES[activeLocale()]
  return set[id] ?? set[DEFAULT_TEMPLATE_ID]!
}

/** Seed an empty `details` object from a template's suggested keys (all blank). */
export function seedDetails(template: StageTemplate): Record<string, string> {
  return Object.fromEntries(template.detailKeys.map((k) => [k, '']))
}
