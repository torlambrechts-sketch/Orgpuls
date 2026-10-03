/** A record's name as the restore list and the delete preview show it (0195): its name and detail, joined */
export const labelText = (l: { name: string | null; detail: string | null } | null) => (l ? [l.name, l.detail].filter(Boolean).join(' · ') : '—')
