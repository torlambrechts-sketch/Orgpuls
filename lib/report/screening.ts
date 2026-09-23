/**
 * How a screening question's counts are read. One rule for every place that prints them —
 * section 7 of the report and Resultat's strip — so the two cannot disagree about a "ja".
 *
 * Option 1 is "Nei" and the last is "Vil ikke svare"; every option between is a yes (the
 * options are data, 0009). "Vil ikke svare" stays in the denominator: "tre av 28" is a
 * different claim from "tre av 27" (D-36).
 */
export function screeningTally(options: { ordinal: number; n: number }[]): { yes: number; declined: number } {
  const last = options.length
  return {
    yes: options.filter((o) => o.ordinal > 1 && o.ordinal < last).reduce((a, o) => a + o.n, 0),
    declined: options.find((o) => o.ordinal === last)?.n ?? 0,
  }
}
