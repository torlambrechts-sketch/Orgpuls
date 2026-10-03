/** A record's name as the restore list and the delete preview show it (0195): its name and detail, joined */
export const labelText = (l: { name: string | null; detail: string | null } | null) => (l ? [l.name, l.detail].filter(Boolean).join(' · ') : '—')

/** 0196 (SEC-08): who sees a company — everyone, the owner's group and its sub-groups, the owner's group, the owner only */
export const VISIBILITIES = ['everyone', 'group_tree', 'group', 'owner'] as const
export type Visibility = (typeof VISIBILITIES)[number]
