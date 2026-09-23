/** The roles a membership can hold — `app.org_role`. Shared by server reads and client forms. */
export const MEMBER_ROLES = ['daglig_leder', 'avdelingsleder', 'verneombud'] as const
export type MemberRole = (typeof MEMBER_ROLES)[number]
