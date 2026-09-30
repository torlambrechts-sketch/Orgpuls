/** Types for sentral-routes.mjs, so the unit tests can import the route map (D-181). */
export const REPO: string
export function slug(area: string, page: string): string
export const VIEW_ROUTES: readonly { area: string; page: string; route: string; name: string }[]
export function pageFile(route: string): string
export function routeExists(route: string, root?: string): boolean
export function baselineFile(name: string, width?: number, root?: string): string
