/**
 * Where a legal reference can be read: its paragraph on Lovdata. A reference names either
 * the Working Environment Act (arbeidsmiljøloven, "AML § 4-3", or a bare "§ 4-3") or the
 * regulation on the performance of work, whose chapter 1A holds the psychosocial duties
 * ("Forskriften § 1A-2"). Only the paragraph is linked; a subsection or letter
 * ("(2) c") is read on that paragraph's page.
 */
const AML = 'https://lovdata.no/lov/2005-06-17-62/'
const FORSKRIFT = 'https://lovdata.no/forskrift/2011-12-06-1357/'

export function lovdataHref(ref: string): string | null {
  const m = ref.match(/§\s*(\d+A?-\d+)/)
  if (!m) return null
  return `${/forskrift/i.test(ref) ? FORSKRIFT : AML}%C2%A7${m[1]}`
}
