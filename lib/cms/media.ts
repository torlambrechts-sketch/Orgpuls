/**
 * Content › Media (0124, D-169): an image's address. Pure: the public blocks, the admin library
 * and the editor import it.
 *
 * The file is served by the site itself at /media/<key> (app/media/[key]/route.ts), so the pages'
 * CSP keeps img-src 'self'. On the admin's own host every address is under /admin, so the same
 * file is at /admin/media/<key> there — the middleware's rewrite makes /media/<key> reach it too.
 */
export const MEDIA_KEY = /^[0-9a-f]{32}$/

export const mediaSrc = (key: string) => `/media/${key}`

/** What the browser makes before it sends an image: at most this wide, as WebP */
export const WEB_MAX_WIDTH = 2000
/** and at most this large, as 0124 stores it */
export const MEDIA_MAX_BYTES = 2 * 1024 * 1024
export const MEDIA_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const
