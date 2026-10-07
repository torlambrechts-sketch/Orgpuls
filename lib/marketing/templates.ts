/**
 * The free templates behind an e-mail address (D-241): one page each under /maler, the files they
 * give, and the cookie that says which a browser has asked for.
 *
 * The files are built by scripts/maler/build.py from what the site already says (the law table, the
 * risk assessment article, the playbook, QPSNordic 34+ verbatim – X-107) and kept in private/maler,
 * outside public/: they are served only by app/(marketing)/maler/fil/[fil], to a browser whose cookie
 * names a template that holds the file. That is a soft gate, as such gates are: the point is the
 * address the person chose to give, not secrecy. The words are messages under `seo.maler.<key>`.
 */
export type TemplateFormat = 'xlsx' | 'docx' | 'zip'
export type TemplateFile = { name: string; format: TemplateFormat }

export type Template = {
  slug: string
  /** messages: `seo.maler.<key>` */
  key: string
  files: TemplateFile[]
}

const xlsx = (name: string): TemplateFile => ({ name, format: 'xlsx' })
const docx = (name: string): TemplateFile => ({ name, format: 'docx' })

export const TEMPLATES: Template[] = [
  { slug: 'kartleggingspakken', key: 'pakke', files: [{ name: 'orgpuls-kartleggingspakken.zip', format: 'zip' }] },
  {
    slug: 'risikovurdering-psykososialt-arbeidsmiljo',
    key: 'risikovurdering',
    files: [xlsx('orgpuls-risikovurdering-psykososialt-arbeidsmiljo.xlsx')],
  },
  { slug: 'tiltaksbank', key: 'tiltaksbank', files: [xlsx('orgpuls-tiltaksbank.xlsx')] },
  { slug: 'arshjul-arbeidsmiljo', key: 'arshjul', files: [xlsx('orgpuls-arshjul-arbeidsmiljo.xlsx')] },
  { slug: 'qpsnordic-sporreskjema', key: 'qps', files: [docx('qpsnordic-34-sporreskjema.docx'), xlsx('qpsnordic-34-svarregistrering.xlsx')] },
  { slug: 'informasjonsskriv-og-sjekkliste', key: 'informasjon', files: [docx('orgpuls-informasjonsskriv-og-sjekkliste.docx')] },
]

export const templateBySlug = (slug: string) => TEMPLATES.find((t) => t.slug === slug) ?? null

/** the cookie that lists the templates a browser has asked for, comma-separated slugs */
export const TEMPLATE_COOKIE = 'orgpuls_maler'

export const MIME: Record<TemplateFormat, string> = {
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  zip: 'application/zip',
}

/** the slugs a cookie value grants, unknown ones left out */
export const granted = (cookie: string | undefined) =>
  (cookie ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => templateBySlug(s))

/** the template that gives this file to a browser holding these slugs, if any */
export function grantFor(file: string, slugs: string[]) {
  return TEMPLATES.find((t) => slugs.includes(t.slug) && t.files.some((f) => f.name === file)) ?? null
}
