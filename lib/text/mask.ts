/**
 * A text the database masked before it left (0095, D-145): ⟦n⟧ where a person's name was, ⟦a⟧
 * a department's, ⟦s⟧ a location's. Resolved here to the word for what was there, in brackets
 * — «[navn]», «[avdeling]», «[sted]» — so a reader sees that something was removed and what
 * kind of thing, never what. Every reader of employees' text passes it through this.
 */
export type MaskLabels = { n: string; a: string; s: string }

export function unmask(text: string, labels: MaskLabels): string {
  return text.replace(/⟦([nas])⟧/g, (_, k: keyof MaskLabels) => `[${labels[k]}]`)
}
