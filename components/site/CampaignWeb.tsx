import type { WebBlock } from '@/lib/crm/read'

/**
 * A newsletter issue on the web (D-103): the blocks the mail was written in, drawn in the
 * site's own type. {firma} and {navn} have no reader here, so they read neutrally. Links to
 * orgpuls.com carry utm_medium=archive, so a visit from the archive is not counted as mail.
 */
const OWN = /(^|\.)orgpuls\.(com|no)$/

function tagged(url: string, campaign: string, content: string): string {
  try {
    const u = new URL(url)
    if (u.protocol !== 'https:' || !OWN.test(u.hostname)) return url
    for (const [k, v] of [
      ['utm_source', 'orgpuls'],
      ['utm_medium', 'archive'],
      ['utm_campaign', campaign],
      ['utm_content', content],
    ] as const)
      if (!u.searchParams.has(k)) u.searchParams.set(k, v)
    return u.toString()
  } catch {
    return url
  }
}

export function CampaignWeb({
  blocks,
  campaign,
  signature,
  company,
  readMore,
}: {
  blocks: WebBlock[]
  campaign: string
  signature: string
  company: string
  readMore: string
}) {
  const fill = (s: string | undefined) => (s ?? '').replace(/\{firma\}/g, company).replace(/\{navn\}/g, '').replace(/ ,/g, ',')
  return (
    <div className="flex flex-col">
      {blocks.map((b, i) => {
        const key = `b${i + 1}-${b.type}`
        switch (b.type) {
          case 'heading':
            return (
              <h2 key={key} className="mb-[12px] mt-[18px] font-display text-[clamp(22px,2.6vw,27px)] font-semibold leading-[1.2] first:mt-0">
                {fill(b.text)}
              </h2>
            )
          case 'text':
            return fill(b.text)
              .split(/\n\s*\n/)
              .map((p) => p.trim())
              .filter(Boolean)
              .map((p, j) => (
                <p key={`${key}-${j}`} className="mb-[14px] mt-0 whitespace-pre-line text-[16px] leading-[1.7] text-body">
                  {p}
                </p>
              ))
          case 'button':
            return b.url ? (
              <p key={key} className="my-[18px]">
                <a
                  href={tagged(b.url, campaign, key)}
                  className="inline-flex h-[48px] items-center rounded-cta border border-ink bg-ac px-[22px] text-[15.5px] font-bold text-ink no-underline hover:text-ink hover:no-underline"
                >
                  {fill(b.text)}
                </a>
              </p>
            ) : null
          case 'article':
            return b.url ? (
              <section key={key} className="mb-[18px] border-t border-line pt-[14px]">
                <h3 className="m-0 text-[18px] font-bold leading-[1.35]">
                  <a href={tagged(b.url, campaign, key)} className="text-ink no-underline hover:underline">
                    {fill(b.title)}
                  </a>
                </h3>
                {b.text ? <p className="mb-[6px] mt-[6px] text-[15px] leading-[1.65] text-body">{fill(b.text)}</p> : null}
                <a href={tagged(b.url, campaign, key)} className="text-[15px] font-bold text-link">
                  {b.label?.trim() || readMore} →
                </a>
              </section>
            ) : null
          case 'bullets':
            return (
              <ul key={key} className="mb-[16px] mt-0 flex list-none flex-col gap-[8px] p-0">
                {fill(b.text)
                  .split('\n')
                  .map((s) => s.trim())
                  .filter(Boolean)
                  .map((s, j) => (
                    <li key={j} className="flex gap-[10px] text-[16px] leading-[1.55] text-body">
                      <span aria-hidden="true" className="font-bold text-link">
                        ✓
                      </span>
                      {s}
                    </li>
                  ))}
              </ul>
            )
          case 'image': {
            if (!b.url) return null
            // an image the author linked from the mail: plain <img>, since its host is not ours to configure
            // eslint-disable-next-line @next/next/no-img-element
            const img = <img src={b.url} alt={b.alt ?? ''} loading="lazy" className="block h-auto w-full rounded-card border border-line" />
            return (
              <figure key={key} className="mx-0 mb-[16px] mt-0">
                {b.href ? <a href={tagged(b.href, campaign, key)}>{img}</a> : img}
              </figure>
            )
          }
          case 'divider':
            return <hr key={key} className="my-[20px] border-0 border-t border-line" />
          case 'quote':
            return (
              <blockquote key={key} className="mx-0 mb-[16px] mt-0 border-l-[3px] border-ac py-[4px] pl-[16px]">
                <p className="m-0 text-[17px] italic leading-[1.55]">«{fill(b.text)}»</p>
                {b.title ? <footer className="mt-[6px] text-[13.5px] text-mut">{fill(b.title)}</footer> : null}
              </blockquote>
            )
          case 'event':
            return (
              <section key={key} className="mb-[18px] rounded-card border border-line bg-bg px-[20px] py-[18px]">
                <h3 className="m-0 text-[18px] font-bold">{fill(b.title)}</h3>
                {fill(b.text)
                  .split('\n')
                  .filter((s) => s.trim())
                  .map((s, j) => (
                    <p key={j} className="mb-0 mt-[4px] text-[15px] text-body">
                      {s}
                    </p>
                  ))}
                {b.url ? (
                  <a
                    href={tagged(b.url, campaign, key)}
                    className="mt-[12px] inline-flex h-[44px] items-center rounded-cta border border-ink bg-ac px-[18px] text-[15px] font-bold text-ink no-underline hover:text-ink hover:no-underline"
                  >
                    {b.label?.trim() || readMore}
                  </a>
                ) : null}
              </section>
            )
          case 'ps':
            return (
              <p key={key} className="mb-0 mt-[18px] text-[15px] leading-[1.6] text-mut">
                <strong>P.S.</strong> {fill(b.text)}
              </p>
            )
        }
      })}
      {signature.trim() ? <p className="mb-0 mt-[18px] whitespace-pre-line text-[15px] leading-[1.6] text-body">{signature}</p> : null}
    </div>
  )
}
