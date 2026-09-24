/**
 * The playbook: three suggested measures per factor, with the research they rest on.
 *
 * The design (bundle `PLAYBOOK`, 2026-09-24) attaches to every factor an evidence line and
 * three measures a leader can adopt with one press — on Resultat, under the open factor
 * row, and on Tiltak as "Forslag fra resultatene". This is content, not behaviour, so it
 * lives as data: the shape here, the words in `messages/*.json` under `playbook.*`.
 *
 * Two things are deliberately NOT stored here.
 *
 * The sentence each measure is followed up on ("Følg med på: «…»") is, in every one of the
 * 33 cases, one of the instrument's own statements — the design wrote them from the same
 * QPS Nordic wording the respondent answers. So `watch` is a statement ordinal, and the
 * text comes from `factor.<key>.s<n>`, the one place that wording exists. A second copy
 * would drift from the first the day someone corrects a statement.
 *
 * Whether a measure has been adopted is not state either. `app.measures.playbook_key`
 * (migration 0031) records which suggestion a measure came from, so "Lagt til i Tiltak ✓"
 * is read from the organisation's own measures, survives a reload, and is the same for
 * every member who opens the screen.
 *
 * Adding or changing a suggestion is a row here plus its message keys — never a component.
 */

export const PLAYBOOK_KINDS = ['workshop', 'rutine', 'lederpraksis'] as const
export type PlaybookKind = (typeof PLAYBOOK_KINDS)[number]

export interface PlaybookEntry {
  /** `<factor>.<n>` — what `app.measures.playbook_key` holds */
  key: string
  factorKey: string
  /** 1..3, the message key suffix (`playbook.<factor>.m<n>.*`) */
  n: 1 | 2 | 3
  kind: PlaybookKind
  /** the statement whose movement shows whether the measure worked: `factor.<key>.s<watch>` */
  watch: number
}

/** The type pill's fill per kind (bundle `TYPE_BG`). */
export const PLAYBOOK_KIND_BG: Record<PlaybookKind, string> = {
  workshop: '#FBEBBE',
  rutine: '#CFE7E4',
  lederpraksis: '#EFE6D2',
}

// [factor, n, kind, watch] — transcribed from the bundle's PLAYBOOK in its own order
const ROWS: Array<[string, 1 | 2 | 3, PlaybookKind, number]> = [
  ['ytring', 1, 'rutine', 2],
  ['ytring', 2, 'workshop', 1],
  ['ytring', 3, 'lederpraksis', 3],
  ['mengde', 1, 'rutine', 2],
  ['mengde', 2, 'workshop', 1],
  ['mengde', 3, 'rutine', 3],
  ['motstrid', 1, 'rutine', 3],
  ['motstrid', 2, 'workshop', 2],
  ['motstrid', 3, 'lederpraksis', 1],
  ['kontakt', 1, 'rutine', 2],
  ['kontakt', 2, 'rutine', 3],
  ['kontakt', 3, 'lederpraksis', 1],
  ['emosjon', 1, 'rutine', 2],
  ['emosjon', 2, 'workshop', 3],
  ['emosjon', 3, 'rutine', 1],
  ['leder', 1, 'lederpraksis', 3],
  ['leder', 2, 'lederpraksis', 2],
  ['leder', 3, 'rutine', 1],
  ['medvirk', 1, 'workshop', 1],
  ['medvirk', 2, 'rutine', 2],
  ['medvirk', 3, 'lederpraksis', 3],
  ['integritet', 1, 'rutine', 1],
  ['integritet', 2, 'workshop', 3],
  ['integritet', 3, 'lederpraksis', 1],
  ['rolle', 1, 'lederpraksis', 1],
  ['rolle', 2, 'workshop', 2],
  ['rolle', 3, 'rutine', 3],
  ['kollega', 1, 'rutine', 2],
  ['kollega', 2, 'lederpraksis', 1],
  ['kollega', 3, 'workshop', 3],
  ['mening', 1, 'rutine', 1],
  ['mening', 2, 'lederpraksis', 2],
  ['mening', 3, 'workshop', 3],
]

export const PLAYBOOK: readonly PlaybookEntry[] = ROWS.map(([factorKey, n, kind, watch]) => ({
  key: `${factorKey}.${n}`,
  factorKey,
  n,
  kind,
  watch,
}))

/** The suggestions for one factor, in the design's order. */
export const playbookFor = (factorKey: string): PlaybookEntry[] =>
  PLAYBOOK.filter((e) => e.factorKey === factorKey)

/** The entry a key names, or null — the server action's guard against a made-up key. */
export const playbookEntry = (key: string): PlaybookEntry | null =>
  PLAYBOOK.find((e) => e.key === key) ?? null
