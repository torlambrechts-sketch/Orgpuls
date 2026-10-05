import { readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/** the route folders of a group, without the group's own files and private folders */
const dirs = (dir: string) =>
  readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith('_') && !d.name.startsWith('('))
    .map((d) => d.name)

/**
 * The middleware decides what needs a session from APP_ROOTS: any other address of the site's own
 * shape is public, a page or a 404 (lib/supabase/middleware.ts). A screen of the product missing from
 * the list would be served to a signed-out visitor, so the list is held equal to app/(app)'s routes.
 */
describe('the sign-in boundary', () => {
  it('keeps every screen of the product behind the sign-in', () => {
    const src = readFileSync('lib/supabase/middleware.ts', 'utf8')
    const roots = [...(src.match(/export const APP_ROOTS = \[([^\]]*)\]/)?.[1] ?? '').matchAll(/'([a-z0-9-]+)'/g)].map((m) => m[1]!)
    expect(roots.sort()).toEqual([...dirs('app/(app)'), 'api'].sort())
  })
})
