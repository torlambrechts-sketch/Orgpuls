import { getFormatter, getTranslations } from 'next-intl/server'
import { PrintButton } from '@/components/rapport/PrintButton'
import { DPA_VERSION, DpaText } from '@/lib/legal/dpa'
import type { DpaSignature } from '@/lib/legal/read'
import { CONTACT_MAIL } from '@/lib/marketing/site'
import { DpaSignForm } from './DpaSignForm'

/**
 * Oppsett › Databehandleravtale (D-87): the agreement between the organisation, as controller,
 * and Orgpuls AS, as processor, and the organisation's signature of it.
 *
 * The status comes first, because it is what a leader opens the tab to check: signed (by
 * whom, as what, when, which version, with the text's checksum) or not. The daglig leder
 * signs here; every other role reads the agreement and sees who is to sign. The whole tab
 * prints as the document, signature block included (the print stylesheet drops the shell
 * and the tab row).
 *
 * The text is messages (`dpa.*`) and is the version pinned in lib/legal/dpa.ts; a signature
 * of an earlier version is listed, not shown as current.
 */
export async function DpaTab({
  org,
  signatures,
  canSign,
  viewerName,
}: {
  org: { name: string; orgNumber: string | null }
  signatures: DpaSignature[]
  canSign: boolean
  viewerName: string
}) {
  const t = await getTranslations()
  const format = await getFormatter()
  const text = DpaText.parse(t.raw('dpa'))
  const current = signatures.find((s) => s.version === DPA_VERSION) ?? null
  const earlier = signatures.filter((s) => s.version !== DPA_VERSION)
  const when = (iso: string) => format.dateTime(new Date(iso), { dateStyle: 'long', timeStyle: 'short', timeZone: 'Europe/Oslo' })
  const version = format.dateTime(new Date(`${DPA_VERSION}T12:00:00Z`), { dateStyle: 'long' })

  return (
    <div className="mt-[20px] flex flex-col gap-[16px]">
      {/* ------------------------------------------------------------ status */}
      <section
        aria-labelledby="dpa-status"
        className={`rounded-panel border px-[22px] py-[20px] print:hidden ${current ? 'border-line bg-sf' : 'border-ink bg-sbg'}`}
      >
        <div className="flex flex-wrap items-center justify-between gap-[12px]">
          <h2 id="dpa-status" className="m-0 text-[16px] font-bold">
            {current ? t('oppsett.dpa.signedHead') : t('oppsett.dpa.unsignedHead')}
          </h2>
          <span
            className={`rounded-pill px-[10px] py-[4px] text-[11.5px] font-bold ${
              current ? 'bg-mint text-greendeep' : 'bg-peach text-dangerdeep'
            }`}
          >
            {current ? t('oppsett.dpa.signedPill') : t('oppsett.dpa.unsignedPill')}
          </span>
        </div>
        {current ? (
          <>
            <p className="mb-0 mt-[8px] text-[13.5px] leading-[1.6] [text-wrap:pretty]">
              {t('oppsett.dpa.signedBy', {
                name: current.signer_name,
                title: current.signer_title,
                when: when(current.signed_at),
                version,
              })}
            </p>
            <p className="mb-0 mt-[4px] break-all text-[12px] text-mut">
              {t('oppsett.dpa.checksum', { sha: current.text_sha256 })}
            </p>
            <div className="mt-[14px]">
              <PrintButton label={t('oppsett.dpa.print')} />
            </div>
          </>
        ) : (
          <>
            <p className="mb-0 mt-[8px] text-[13.5px] leading-[1.6] [text-wrap:pretty]">
              {t('oppsett.dpa.unsignedBody', { version })}
            </p>
            {canSign ? (
              <DpaSignForm
                defaultName={viewerName}
                labels={{
                  name: t('oppsett.dpa.form.name'),
                  title: t('oppsett.dpa.form.title'),
                  titleDefault: t('oppsett.dpa.form.titleDefault'),
                  confirm: t('oppsett.dpa.form.confirm', { org: org.name }),
                  submit: t('oppsett.dpa.form.submit'),
                  signing: t('oppsett.dpa.form.signing'),
                  problems: {
                    not_confirmed: t('oppsett.dpa.problem.not_confirmed'),
                    invalid_signer: t('oppsett.dpa.problem.invalid_signer'),
                    not_allowed: t('oppsett.dpa.problem.not_allowed'),
                    not_current: t('oppsett.dpa.problem.not_current'),
                    already_signed: t('oppsett.dpa.problem.already_signed'),
                    failed: t('oppsett.dpa.problem.failed'),
                  },
                }}
              />
            ) : (
              <p className="mb-0 mt-[8px] text-[13px] font-semibold text-mut">{t('oppsett.dpa.onlyLeader')}</p>
            )}
          </>
        )}
        {earlier.length ? (
          <ul className="mb-0 mt-[12px] list-none p-0 text-[12.5px] text-mut">
            {earlier.map((s) => (
              <li key={s.version}>
                {t('oppsett.dpa.earlier', { version: s.version, name: s.signer_name, when: when(s.signed_at) })}
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      {/* --------------------------------------------------------- the agreement */}
      <article className="rounded-panel border border-line bg-sf px-[clamp(20px,4vw,40px)] py-[clamp(22px,4vw,36px)] print:border-0 print:p-0">
        <p className="m-0 text-[11px] uppercase tracking-[0.11em] text-mut">{t('oppsett.dpa.versionLabel', { version })}</p>
        <h2 className="m-0 mt-[8px] font-display text-[28px] font-semibold leading-[1.15]">{text.title}</h2>
        <p className="mb-0 mt-[10px] max-w-[72ch] text-[14px] leading-[1.65] text-body [text-wrap:pretty]">{text.lead}</p>

        <dl className="m-0 mt-[18px] grid gap-[10px] sm:grid-cols-2">
          <div className="rounded-cta border border-line bg-bg px-[16px] py-[12px]">
            <dt className="text-[11.5px] font-bold text-mut">{t('oppsett.dpa.controller')}</dt>
            <dd className="m-0 mt-[4px] text-[13.5px] font-semibold">
              {org.orgNumber ? t('oppsett.dpa.orgWithNumber', { name: org.name, number: org.orgNumber }) : org.name}
            </dd>
          </div>
          <div className="rounded-cta border border-line bg-bg px-[16px] py-[12px]">
            <dt className="text-[11.5px] font-bold text-mut">{t('oppsett.dpa.processor')}</dt>
            <dd className="m-0 mt-[4px] text-[13.5px] font-semibold">
              Orgpuls AS · <a href={`mailto:${CONTACT_MAIL}`}>{CONTACT_MAIL}</a>
            </dd>
          </div>
        </dl>

        <div className="mt-[8px] flex flex-col">
          {text.sections.map((s) => (
            <section key={s.h} className="mt-[18px] break-inside-avoid-page">
              <h3 className="m-0 text-[15px] font-bold">{s.h}</h3>
              {(s.p ?? []).map((p) => (
                <p key={p} className="mb-0 mt-[6px] max-w-[72ch] text-[13.5px] leading-[1.65] text-body [text-wrap:pretty]">
                  {p}
                </p>
              ))}
              {s.ul?.length ? (
                <ul className="mb-0 mt-[6px] flex max-w-[72ch] list-disc flex-col gap-[4px] pl-[20px] text-[13.5px] leading-[1.6] text-body">
                  {s.ul.map((li) => (
                    <li key={li}>{li}</li>
                  ))}
                </ul>
              ) : null}
            </section>
          ))}
        </div>

        {/* signature block: what the printed copy carries */}
        <div className="mt-[26px] grid gap-[12px] border-t border-line pt-[18px] sm:grid-cols-2">
          <div>
            <p className="m-0 text-[11.5px] font-bold text-mut">{t('oppsett.dpa.forController')}</p>
            <p className="m-0 mt-[4px] text-[13.5px]">
              {current
                ? t('oppsett.dpa.signatureLine', {
                    name: current.signer_name,
                    title: current.signer_title,
                    when: when(current.signed_at),
                  })
                : t('oppsett.dpa.notYetSigned')}
            </p>
          </div>
          <div>
            <p className="m-0 text-[11.5px] font-bold text-mut">{t('oppsett.dpa.forProcessor')}</p>
            <p className="m-0 mt-[4px] text-[13.5px]">{t('oppsett.dpa.processorLine')}</p>
          </div>
        </div>
        {current ? (
          <p className="mb-0 mt-[12px] break-all text-[11.5px] text-mut">
            {t('oppsett.dpa.checksum', { sha: current.text_sha256 })}
          </p>
        ) : null}
      </article>
    </div>
  )
}
