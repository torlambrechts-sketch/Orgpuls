/** Types for admin-session.mjs, so the Playwright admin projects can share the local admin's session (WP-0.7). */
export function totp(secret: string, at?: number): string
export function acquireAdminLock(opts?: { owner?: number; maxMs?: number }): Promise<void>
export function releaseAdminLock(owner?: number): void
