import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import type { Block } from '@/lib/marketing/blocks'
import { plain } from '@/lib/marketing/blocks'
import { Blocks, headingIds } from './Blocks'

/**
 * A page's blocks beside a sidebar (D-233): on a wide screen the reading column takes the room the
 * text needs and the rest goes to what a reader uses while reading – where they are in the page,
 * and the offer – instead of standing empty. The sidebar follows the reader down; under 1024px it
 * is not drawn, since the page's own closing offer is there and a contents list above the text
 * would push the answer down.
 */
export async function WithAside({
  blocks,
  cta,
  children,
}: {
  blocks: Block[]
  /** the offer under the contents; a document page (terms, privacy) has none */
  cta?: { title: string; body: string }
  children?: React.ReactNode
}) {
  const t = await getTranslations()
  const ids = headingIds(blocks)
  const toc = blocks.flatMap((b, i) => (b.t === 'h2' ? [{ id: ids[i]!, text: plain(b.text) }] : []))
  return (
    <div className="grid gap-[56px] lg:[grid-template-columns:minmax(0,1fr)_292px]">
      <div className="min-w-0">
        <Blocks blocks={blocks} />
        {children}
      </div>
      <aside className="hidden lg:block" aria-label={t('seo.common.aside')}>
        <div className="sticky top-[118px] flex flex-col gap-[16px]">
          {toc.length >= 3 ? (
            <nav aria-labelledby="pa-denne-siden" className="rounded-note border border-line bg-sf px-[20px] py-[18px]">
              <span id="pa-denne-siden" className="block text-[11px] font-bold uppercase tracking-[0.12em] text-mut">
                {t('seo.common.onThisPage')}
              </span>
              <ol className="m-0 mt-[10px] flex list-none flex-col gap-[2px] p-0">
                {toc.map((h) => (
                  <li key={h.id}>
                    <a
                      href={`#${h.id}`}
                      className="block rounded-ctl px-[8px] py-[6px] text-[13.5px] font-semibold leading-[1.4] text-ink no-underline [text-wrap:pretty] hover:bg-sbg hover:text-ink hover:no-underline"
                    >
                      {h.text}
                    </a>
                  </li>
                ))}
              </ol>
            </nav>
          ) : null}
          {cta ? (
            <div className="rounded-note bg-ink px-[22px] py-[22px] text-bg">
              <span className="block font-display text-[21px] font-semibold leading-[1.2] [text-wrap:balance]">{cta.title}</span>
              <span className="mt-[9px] block text-[13.5px] leading-[1.6] opacity-[0.78] [text-wrap:pretty]">{cta.body}</span>
              <Link
                href="/registrer"
                className="mt-[16px] flex h-[46px] items-center justify-center rounded-tile border border-ac bg-ac text-[15px] font-bold text-ink no-underline hover:text-ink hover:no-underline"
              >
                {t('start.ctaFree')}
              </Link>
              <span className="mt-[9px] block text-center text-[12px] leading-[1.5] opacity-[0.78]">{t('seo.common.priceLine')}</span>
            </div>
          ) : null}
        </div>
      </aside>
    </div>
  )
}
