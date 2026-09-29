import { getTranslations } from 'next-intl/server'
import { Blocks as BlocksSchema, FaqItems } from '@/lib/marketing/blocks'
import { PageView } from './PageView'

/**
 * A public page whose words are messages under one key (`seo.lp.*`, `seo.pages.*`): the landing
 * pages, Priser, Sikkerhet, Kontakt and the rest. It reads them and draws PageView, the same view
 * the CMS's pages are drawn with (X-094). Optional parts are read only when the messages carry
 * them: a second action (`tip`), `faq`, `signupLabel`, the closing words.
 */
export async function PageTemplate({ k, ...rest }: { k: string } & Omit<Parameters<typeof PageView>[0], 'content'>) {
  const t = await getTranslations()
  return (
    <PageView
      {...rest}
      content={{
        title: t(`${k}.title`),
        description: t(`${k}.description`),
        crumb: t(`${k}.crumb`),
        kicker: t(`${k}.kicker`),
        h1: t(`${k}.h1`),
        lead: t(`${k}.lead`),
        blocks: BlocksSchema.parse(t.raw(`${k}.blocks`)),
        faq: t.has(`${k}.faq`) ? FaqItems.parse(t.raw(`${k}.faq`)) : [],
        signupLabel: t.has(`${k}.signupLabel`) ? t(`${k}.signupLabel`) : undefined,
        tip: t.has(`${k}.tip.label`)
          ? {
              label: t(`${k}.tip.label`),
              href: `mailto:?subject=${encodeURIComponent(t(`${k}.tip.subject`))}&body=${encodeURIComponent(t(`${k}.tip.body`))}`,
            }
          : undefined,
        finalTitle: t.has(`${k}.finalTitle`) ? t(`${k}.finalTitle`) : undefined,
        finalBody: t.has(`${k}.finalBody`) ? t(`${k}.finalBody`) : undefined,
      }}
    />
  )
}
