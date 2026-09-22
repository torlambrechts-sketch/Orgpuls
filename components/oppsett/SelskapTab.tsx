import { getLocale, getTranslations } from 'next-intl/server'
import type { OppsettView } from '@/components/oppsett/OppsettScreen'
import { formatOrgNumber } from '@/lib/org/read'
import { RegistryForm } from '@/components/oppsett/RegistryForm'
import { LocationForm } from '@/components/oppsett/LocationForm'
import { CompanyForm } from '@/components/oppsett/CompanyForm'
import { LawModeForm } from '@/components/oppsett/LawModeForm'
import { BhtField } from '@/components/oppsett/BhtField'

/**
 * Selskap. Bundle lines 1987-2108.
 *
 * The fact table is the stored Enhetsregisteret snapshot printed with the date it was
 * fetched, never a live call on render — `lib/brreg/lookup.ts` says why. Rows the register
 * did not return are absent rather than dashed: "Næringskode —" looks like a company
 * without one.
 *
 * The duties card is computed from the headcount exactly as the design computes it, because
 * those are the act's own numbers: verneombud from five (§ 6-1), AMU from thirty with a
 * "kan kreves" band from ten (§ 7-1). The verneombud line names a person only when the
 * register holds one — the `duty_role` of 0021 — and otherwise says nobody is recorded,
 * which is a finding rather than an empty space.
 *
 * **There is no control for the stated headcount here, because the design has none.** It
 * is a prototype prop in the bundle. The number matters — it is the denominator of every
 * response rate — so the screen prints the register's own count beside it and leaves the
 * reconciliation visible rather than inventing an input the design never drew. D-33.
 */

/** The design's "no duty" chip: ink at 6% on the panel, faint text. */
const OFF = { background: 'rgba(25,21,16,.06)', color: '#5F5849' }

/**
 * Industries the BHT duty follows from the industry alone.
 *
 * Forskrift om organisering, ledelse og medvirkning § 13-1 lists the trades where an
 * undertaking must be affiliated to an occupational health service whatever its size.
 * Only the NACE sections this transcribes are asserted; anything else prints "avhenger av
 * bransjen" rather than a verdict, because getting this wrong in either direction is a
 * statement about somebody's legal obligations. The design hard-codes "Påbudt" for a
 * construction company and never has to decide. D-33.
 */
const BHT_NACE = ['41', '42', '43', '05', '06', '07', '08', '09', '35', '37', '38', '39', '86', '87', '88']

export async function SelskapTab({ view }: { view: OppsettView }) {
  const t = await getTranslations()
  const locale = await getLocale()
  const c = view.company

  const longDate = (iso: string | null) =>
    iso === null
      ? null
      : new Intl.DateTimeFormat(locale, {
          day: 'numeric',
          month: 'long',
          timeZone: 'Europe/Oslo',
        }).format(new Date(iso))

  const shortDate = (iso: string | null) =>
    iso === null
      ? null
      : new Intl.DateTimeFormat(locale, { dateStyle: 'short', timeZone: 'Europe/Oslo' }).format(
          new Date(iso),
        )

  const facts = [
    ['name', c.name],
    ['orgNumber', formatOrgNumber(c.org_number) ?? ''],
    ['form', [c.registry_form_code, c.registry_form_label].filter(Boolean).join(' — ')],
    ['nace', [c.registry_nace_code, c.registry_nace_label].filter(Boolean).join(' ')],
    ['registered', shortDate(c.registry_registered_on) ?? ''],
    ['address', c.registry_address ?? ''],
    [
      'municipality',
      c.registry_municipality
        ? `${c.registry_municipality}${
            c.registry_municipality_no ? ` (${c.registry_municipality_no})` : ''
          }`
        : '',
    ],
    ['registryEmployees', c.registry_employees === null ? '' : String(c.registry_employees)],
    [
      'vat',
      c.registry_vat === null
        ? ''
        : c.registry_vat
          ? t('oppsett.selskap.vatYes')
          : t('oppsett.selskap.vatNo'),
    ],
  ].filter(([, v]) => v !== '') as [string, string][]

  const locationSum = view.locations.reduce((a, l) => a + l.headcount, 0)
  const matches = locationSum === c.employee_count

  const vo = c.employee_count >= 5
  const amu = c.employee_count >= 30
  const amuMay = c.employee_count >= 10 && c.employee_count < 30

  const nace = (c.registry_nace_code ?? '').slice(0, 2)
  const bht = c.registry_nace_code === null ? 'unknown' : BHT_NACE.includes(nace) ? 'required' : 'depends'

  const duties = [
    {
      key: 'verneombud',
      status: vo ? t('oppsett.duty.required') : t('oppsett.duty.notRequired'),
      tone: vo ? { background: '#CFE7E4', color: '#20431C' } : OFF,
      note: vo
        ? view.verneombud.length > 0
          ? t('oppsett.duty.verneombudNamed', { name: view.verneombud.join(', ') })
          : t('oppsett.duty.verneombudNone')
        : t('oppsett.duty.verneombudSmall'),
    },
    {
      key: 'amu',
      status: amu
        ? t('oppsett.duty.required')
        : amuMay
          ? t('oppsett.duty.mayBeRequired')
          : t('oppsett.duty.notRequired'),
      tone: amu
        ? { background: '#CFE7E4', color: '#20431C' }
        : amuMay
          ? { background: '#FBEBBE', color: '#5C4600' }
          : OFF,
      note: amu
        ? t('oppsett.duty.amuRequired')
        : amuMay
          ? t('oppsett.duty.amuMay')
          : t('oppsett.duty.amuSmall'),
    },
    {
      key: 'bht',
      status:
        bht === 'required' ? t('oppsett.duty.required') : t('oppsett.duty.dependsOnIndustry'),
      tone: bht === 'required' ? { background: '#CFE7E4', color: '#20431C' } : OFF,
      note:
        bht === 'required'
          ? t('oppsett.duty.bhtRequired', { industry: c.registry_nace_label ?? '' })
          : bht === 'unknown'
            ? t('oppsett.duty.bhtUnknown')
            : t('oppsett.duty.bhtDepends'),
    },
  ]

  return (
    <div className="mt-[20px] grid items-start gap-[16px] [grid-template-columns:minmax(0,1.3fr)_minmax(300px,0.8fr)]">
      <div className="flex min-w-0 flex-col gap-[16px]">
        <section className="rounded-panel border border-line bg-sf px-[26px] py-[24px]">
          <h2 className="m-0 font-display text-[21px] font-semibold">
            {t('oppsett.selskap.title')}
          </h2>
          <p className="mt-[6px] max-w-[600px] text-[13.5px] leading-[1.6] text-mut [text-wrap:pretty]">
            {t('oppsett.selskap.lead')}
          </p>

          <RegistryForm
            // grouped for reading, as the design prints it; the action strips the spaces
            orgNumber={formatOrgNumber(c.org_number) ?? ''}
            canWrite={view.canWrite}
            fetched={c.registry_fetched_at !== null}
            note={
              longDate(c.registry_fetched_at) === null
                ? t('oppsett.selskap.noteUnfetched')
                : t('oppsett.selskap.noteFetched', { date: longDate(c.registry_fetched_at)! })
            }
            labels={{
              field: t('oppsett.selskap.orgNumberLabel'),
              placeholder: t('oppsett.selskap.orgNumberPlaceholder'),
              fetch: t('oppsett.selskap.fetch'),
              refetch: t('oppsett.selskap.refetch'),
              busy: t('oppsett.selskap.fetching'),
              problems: Object.fromEntries(
                ['invalid_org_number', 'not_found', 'deleted', 'unreachable', 'denied'].map(
                  (k) => [k, t(`oppsett.selskap.problem.${k}`)],
                ),
              ),
            }}
          />

          {facts.length > 0 ? (
            <div className="mt-[18px] overflow-hidden rounded-tile border border-line">
              {facts.map(([key, value]) => (
                <div
                  key={key}
                  className="grid gap-[14px] border-b border-line bg-bg px-[16px] py-[11px] last:border-b-0 [grid-template-columns:minmax(0,1fr)_minmax(0,1.5fr)]"
                >
                  <span className="text-[12.5px] text-mut">{t(`oppsett.selskap.fact.${key}`)}</span>
                  <span className="text-[13.5px] font-semibold [text-wrap:pretty]">{value}</span>
                </div>
              ))}
            </div>
          ) : null}
        </section>

        <section className="rounded-panel border border-line bg-sf px-[26px] py-[24px]">
          <h2 className="m-0 font-display text-[21px] font-semibold">
            {t('oppsett.lokasjoner.title')}
          </h2>
          <p className="mt-[6px] max-w-[600px] text-[13.5px] leading-[1.6] text-mut [text-wrap:pretty]">
            {t('oppsett.lokasjoner.lead')}
          </p>

          <LocationForm
            locations={view.locations.map((l) => ({
              ...l,
              headcountLabel: t('oppsett.lokasjoner.headcount', { count: l.headcount }),
            }))}
            canWrite={view.canWrite}
            summary={
              matches
                ? t('oppsett.lokasjoner.sumMatches', { count: locationSum })
                : t('oppsett.lokasjoner.sumDiffers', {
                    sum: locationSum,
                    stated: c.employee_count,
                  })
            }
            summaryTone={matches ? '#2F5D2A' : '#A33A16'}
            labels={{
              remove: t('oppsett.lokasjoner.remove'),
              name: t('oppsett.lokasjoner.name'),
              namePlaceholder: t('oppsett.lokasjoner.namePlaceholder'),
              address: t('oppsett.lokasjoner.address'),
              addressPlaceholder: t('oppsett.lokasjoner.addressPlaceholder'),
              add: t('oppsett.lokasjoner.add'),
              problems: Object.fromEntries(
                ['invalid', 'duplicate', 'denied'].map((k) => [
                  k,
                  t(`oppsett.lokasjoner.problem.${k}`),
                ]),
              ),
            }}
          />
        </section>

        <section className="rounded-panel border border-line bg-sf px-[26px] py-[24px]">
          <h2 className="m-0 font-display text-[21px] font-semibold">
            {t('oppsett.companySettings.title')}
          </h2>
          <CompanyForm
            canWrite={view.canWrite}
            lang={c.default_lang === 'en' ? 'en' : 'no'}
            baselineMonth={view.baselineMonth}
            // Intl gives "januar"; the design's chips are capitalised, and a month name
            // at the head of a chip is a label rather than prose
            months={Array.from({ length: 12 }, (_, i) => {
              const name = new Intl.DateTimeFormat(locale, { month: 'long' }).format(
                new Date(Date.UTC(2026, i, 1)),
              )
              return { value: i + 1, label: name.charAt(0).toLocaleUpperCase(locale) + name.slice(1) }
            })}
            labels={{
              language: t('oppsett.companySettings.language'),
              languageNote: t('oppsett.companySettings.languageNote'),
              langNo: t('oppsett.companySettings.langNo'),
              langEn: t('oppsett.companySettings.langEn'),
              yearStart: t('oppsett.companySettings.yearStart'),
              yearStartNote: t('oppsett.companySettings.yearStartNote'),
              noWheel: t('oppsett.companySettings.noWheel'),
              benchmark: t('oppsett.companySettings.benchmark'),
              benchmarkNote:
                c.registry_nace_code === null
                  ? t('oppsett.companySettings.benchmarkUnknown')
                  : t('oppsett.companySettings.benchmarkNace', {
                      code: c.registry_nace_code,
                      label: c.registry_nace_label ?? '',
                    }),
              saved: t('oppsett.saved'),
              problems: Object.fromEntries(
                ['invalid', 'denied', 'no_wheel'].map((k) => [k, t(`oppsett.problem.${k}`)]),
              ),
            }}
          />
        </section>
      </div>

      <div className="flex min-w-0 flex-col gap-[14px]">
        <section className="rounded-panel border border-line bg-sbg px-[24px] py-[22px]">
          <div className="text-[11px] uppercase tracking-[0.11em] text-mut">
            {t('oppsett.lovmodus.title')}
          </div>
          <p className="mt-[7px] max-w-[600px] text-[13px] leading-[1.6] text-body [text-wrap:pretty]">
            {t('oppsett.lovmodus.lead')}
          </p>
          <LawModeForm
            value={c.law_mode}
            canWrite={view.canWrite}
            options={[
              { on: true, label: t('oppsett.lovmodus.on'), note: t('oppsett.lovmodus.onNote') },
              { on: false, label: t('oppsett.lovmodus.off'), note: t('oppsett.lovmodus.offNote') },
            ]}
            note={t('oppsett.lovmodus.note')}
            problems={Object.fromEntries(
              ['invalid', 'denied'].map((k) => [k, t(`oppsett.problem.${k}`)]),
            )}
          />
        </section>

        <section className="rounded-panel border border-line bg-sf px-[24px] py-[22px]">
          <div className="text-[11px] uppercase tracking-[0.11em] text-mut">
            {t('oppsett.duty.head', { count: c.employee_count })}
          </div>
          <div className="mt-[13px] flex flex-col gap-[10px]">
            {duties.map((d) => (
              <div key={d.key} className="rounded-tile border border-line bg-bg px-[15px] py-[14px]">
                <div className="flex flex-wrap items-center justify-between gap-[10px]">
                  <span className="text-[14px] font-bold">{t(`oppsett.duty.${d.key}Title`)}</span>
                  <span
                    className="rounded-pill px-[11px] py-[4px] text-[11.5px] font-bold"
                    style={d.tone}
                  >
                    {d.status}
                  </span>
                </div>
                <div className="mt-[5px] text-[11.5px] text-mut">
                  {t(`oppsett.duty.${d.key}Law`)}
                </div>
                <div className="mt-[6px] text-[12.5px] leading-[1.5] text-body [text-wrap:pretty]">
                  {d.note}
                </div>
              </div>
            ))}
          </div>

          <BhtField
            value={c.bht_name ?? ''}
            canWrite={view.canWrite}
            label={t('oppsett.duty.bhtLabel')}
            placeholder={t('oppsett.duty.bhtPlaceholder')}
            saved={t('oppsett.saved')}
            denied={t('oppsett.problem.denied')}
          />
        </section>
      </div>
    </div>
  )
}
