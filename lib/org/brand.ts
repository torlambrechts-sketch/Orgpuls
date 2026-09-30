/**
 * Where the organisation's logo stands (0104, D-154): in the header and the side rail when the
 * daglig leder chose «logo» (`in_header`), else the Orgpuls mark. One rule for both places, and
 * the one the audit asked a test of (AUD-25). Pure: the address is the key's, never a request's.
 */
export const logoPath = (key: string) => `/logo/${key}`

export function brandSrc(logo: { key: string; inHeader: boolean } | null): string | null {
  return logo?.inHeader ? logoPath(logo.key) : null
}
