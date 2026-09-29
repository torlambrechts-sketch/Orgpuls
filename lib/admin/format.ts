/** Whole kroner as the Sentral design writes them: «120 000 kr» (a deal's value, never an invoice) */
export const kr = (n: number) => `${Math.round(n).toLocaleString('nb-NO')} kr`
