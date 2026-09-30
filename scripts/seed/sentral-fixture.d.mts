/** Types for sentral-fixture.mjs, so the unit tests can import its guard (D-181). */
export const DEFAULT_DB: string
export const LOCAL_HOSTS: readonly string[]
export const ALLOWED_PARAMS: readonly string[]
export const QA_GUARD: string
export const LOCAL_ADMIN: { id: string; email: string; password: string }
export function assertLocalDb(url: unknown): URL
export function psqlConnection(url: unknown, env?: Record<string, string | undefined>): { args: string[]; env: Record<string, string | undefined> }
export function psqlEnv(env?: Record<string, string | undefined>): Record<string, string | undefined>
export const COMPANIES: readonly (readonly [string, string, string | null, string, number, string, string])[]
export const CONTACTS: readonly { key: string; name: string; email: string; company?: string; basis: string; status: string; source: string }[]
export const TASKS: readonly (readonly [string, string, string, string, string | null, number])[]
export const SUPPRESSIONS: readonly (readonly [string, string, string])[]
export function fixtureSql(): string
export function resetAdminMfa(url: string): void
