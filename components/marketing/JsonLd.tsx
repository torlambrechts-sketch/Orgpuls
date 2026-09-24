/**
 * Structured data for search engines. The object is serialised with `<` escaped, so no
 * string in it can close the script element; it holds only our own copy and URLs.
 */
export function JsonLd({ data }: { data: Record<string, unknown> }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, '\\u003c') }} />
}
