import type { Metadata } from 'next'
import { getLocale, getTranslations } from 'next-intl/server'
import { z } from 'zod'
import { PageTemplate } from '@/components/marketing/PageTemplate'
import { ContactBlock } from '@/components/site/ContactBlock'
import { pageMeta } from '@/lib/marketing/meta'
import { CONTACT_MAIL } from '@/lib/marketing/site'

/**
 * A page of the public site (seo.pages.kontakt, D-83); the words are messages, the shape is
 * PageTemplate. Since Om oss was removed (D-95), the contact form that files a ticket lives
 * here, under the page's cards.
 */

const Strs = z.array(z.string())

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations()
  return pageMeta({ title: t('seo.pages.kontakt.title'), description: t('seo.pages.kontakt.description'), path: '/kontakt' })
}

export default async function Page() {
  const t = await getTranslations('site.contact')
  const n = await getTranslations('newsletter')
  const lang = (await getLocale()) === 'en' ? 'en' : 'no'
  return (
    <PageTemplate k="seo.pages.kontakt" path="/kontakt" schemaType="ContactPage">
      <section id="skriv" className="mx-auto max-w-[1120px] scroll-mt-[118px] px-[26px] pt-[40px]">
        <ContactBlock
          to={CONTACT_MAIL}
          lang={lang}
          words={{
            k: t('k'),
            t: t('t'),
            d: t('d'),
            topics: Strs.parse(t.raw('topics')),
            topicsLabel: t('topicsLabel'),
            name: t('name'),
            mail: t('mail'),
            org: t('org'),
            orgPlaceholder: t('orgPlaceholder'),
            msg: t('msg'),
            send: t('send'),
            invalid: t('invalid'),
            sent: t('sent'),
            limited: t('limited'),
            failed: t.raw('failed') as string,
            optIn: n('contactOptIn'),
          }}
        />
      </section>
    </PageTemplate>
  )
}
