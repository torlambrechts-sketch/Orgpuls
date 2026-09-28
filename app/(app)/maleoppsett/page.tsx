import { notFound } from 'next/navigation'
import { getLocale, getMessages } from 'next-intl/server'
import {
  MaleoppsettScreen,
  type GroupChoice,
  type MaleoppsettView,
} from '@/components/maleoppsett/MaleoppsettScreen'
import { getExtraQuestions, getFactors } from '@/lib/instrument/read'
import { SCREENING, getSurveyDefaults } from '@/lib/settings/survey'
import { getGroups, getOrganization, getViewerRole } from '@/lib/org/read'
import { getRounds } from '@/lib/rounds/read'
import { getLatestSetupOfKind, getRoundQuestions, getRoundSetup } from '@/lib/setup/read'
import { getGroupStats, getSmsSettings } from '@/lib/settings/read'
import { getWheel, wheelMonths } from '@/lib/wheel/read'
import { INDUSTRY_META } from '@/content/industries/meta'
import { getIndustry, pageIn } from '@/content/industries'
import { flag } from '@/lib/flags'
import { getSendPreview } from '@/lib/rounds/send'
import { getViewer } from '@/lib/shell/read'
import { MAIN_URL } from '@/lib/hosts'
import type { MailMessages } from '@/supabase/functions/_shared/mail'
import { getOrgIndustry, getPublishedModules, getRoundModules, getModulesById } from '@/lib/modules/read'

/**
 * Måleoppsett — the data half. Bundle lines 1425-1710; the rendering is in
 * components/maleoppsett/MaleoppsettScreen.tsx.
 *
 * The screen configures one round. Which one comes from the query string — the Målinger
 * list links here per row — and falls back to the most recent round of the kind asked
 * for, which is what the design shows when you open it to plan something new: a form
 * already filled in with what the last one was set up as, rather than with defaults
 * written in a component.
 *
 * The department list is the interesting read. Each group carries its headcount and how
 * many of them answered the PREVIOUS round of the same kind, which is the design's
 * "8 ansatte · 8 svarte sist" and also what decides whether the k warning appears. Both
 * numbers come from `participation`, the same RPC the Deltakelse card reads, rather than
 * from a count this page does itself — `thin` in particular is the server's, because it
 * is computed against the threshold the database enforces and a second opinion here would
 * eventually disagree with it.
 */
export const dynamic = 'force-dynamic'

const KINDS = ['grunnlinje', 'puls', 'oppfolging']

export default async function MaleoppsettPage({
  searchParams,
}: {
  searchParams: Promise<{ runde?: string; type?: string }>
}) {
  const params = await searchParams
  const locale = await getLocale()
  const kind = KINDS.includes(params.type ?? '') ? (params.type as string) : 'grunnlinje'

  const [org, role, rounds, instrument, groupRows, wheel, roster] = await Promise.all([
    getOrganization(),
    getViewerRole(),
    getRounds(),
    getFactors(),
    getGroups(),
    getWheel(),
    // roster headcount per group, for a kind no round of which has closed yet (D-60)
    getGroupStats(null),
  ])

  const setup = params.runde
    ? await getRoundSetup(params.runde)
    : await getLatestSetupOfKind(kind)

  // nothing to configure: no round of this kind has ever existed
  if (!setup || !org) notFound()

  /*
   * Industry modules (D-112). A grunnlinje may add the newest published version of a module;
   * a round that already asks one shows that version, whatever has been published since. The
   * organisation's industry code decides which is suggested, never which is allowed.
   */
  // the round's own questions (0095, D-145): a question belongs to the round that asks it
  const orgQuestions = await getRoundQuestions(setup.id)

  const [published, chosen, orgIndustry, standard, extraRegistry, sms] = await Promise.all([
    getPublishedModules(org.id),
    getRoundModules([setup.id]),
    getOrgIndustry(),
    getSurveyDefaults(org.id),
    getExtraQuestions(),
    getSmsSettings(),
  ])
  const chosenModules = await getModulesById(chosen.map((c) => c.moduleId))
  // the organisation's industry, chosen or from its NACE code (0091)
  const industry = orgIndustry.chosen
  const offered = [
    ...chosenModules,
    ...published.filter((m) => !chosenModules.some((c) => c.key === m.key)),
  ].sort((a, b) => Number(b.key === industry?.moduleKey) - Number(a.key === industry?.moduleKey))

  /*
   * "8 svarte sist" is the previous round of the same kind, not this one. Configuring a
   * round that is still open and showing its own response counts would tell you how it is
   * going, which is Deltakelse's job; what this screen needs is what happened last time,
   * because that is what a decision about who to invite rests on.
   */
  const previous =
    rounds.find((r) => r.kind === setup.kind && r.id !== setup.id && r.status === 'lukket') ?? null
  const participation = previous?.participation ?? null

  /*
   * participation() returns group names, not ids — it is a k-applying RPC and an id is
   * not what it is for. The ids the checkboxes need come from app.groups, joined by name
   * inside this organisation, where (org_id, name) is unique by constraint.
   */
  const lastOf = new Map((participation?.groups ?? []).map((g) => [g.group_name, g]))

  /*
   * The headcount is the previous round's when there was one, so "8 ansatte · 8 svarte
   * sist" describes the same people; when no round of this kind has closed — the first
   * puls, say — it is the roster's, and "svarte sist" is left unsaid. It used to fall to
   * 0, which printed "0 av 34 ansatte" over a real roster (D-60).
   */
  const rosterHeads = new Map(roster.map((g) => [g.id, g.headcount]))
  const groups: GroupChoice[] = groupRows.map((g) => {
    const p = lastOf.get(g.name)
    return {
      id: g.id,
      name: g.name,
      headcount: p?.headcount ?? rosterHeads.get(g.id) ?? 0,
      answeredLast: p?.answered ?? null,
      thin: p?.thin ?? false,
    }
  })

  const selected = new Set(setup.factorKeys)

  /*
   * When the next round of this kind opens (D-60). A round being configured before it
   * opens is its own answer; otherwise it is the next one the year wheel has planned, or
   * nothing — and nothing is printed as nothing, never as the design's "september 2027".
   */
  const isBaseline = setup.kind === 'grunnlinje'
  const planned = rounds
    .filter((r) => r.status === 'planlagt' && r.opensAt && (r.kind === 'grunnlinje') === isBaseline)
    .sort((a, b) => (a.opensAt ?? '').localeCompare(b.opensAt ?? ''))
  const nextOpensAt =
    (setup.status === 'planlagt' ? setup.opensAt : null) ?? planned[0]?.opensAt ?? null

  /*
   * The send preview (engagement phase 2, P2.1): the daglig leder's, until the round closes. The
   * invitation is rendered in the organisation's language with the texts the dispatcher uses,
   * admin overrides included; links point at the address mails carry (lib/hosts.ts).
   */
  let send: MaleoppsettView['send'] = null
  if (role === 'daglig_leder' && setup.status !== 'lukket') {
    const [preview, viewer] = await Promise.all([getSendPreview(setup.id), getViewer()])
    if (preview) {
      const lang = preview.lang === 'en' ? 'en' : 'no'
      const messages = (await getMessages({ locale: lang })) as { mail?: MailMessages }
      send = {
        preview,
        mail: messages.mail ?? {},
        lang,
        appUrl: MAIN_URL,
        showSince: flag('engagement_since_last'),
        viewerName: viewer.name,
      }
    }
  }

  const view: MaleoppsettView = {
    roundId: setup.id,
    kind: setup.kind,
    year: setup.year,
    status: setup.status,
    factors: instrument.map((f) => ({ key: f.key, selected: selected.has(f.key) })),
    // counted, not multiplied by an assumed three — the same reasoning lib/rounds/read.ts
    // gives for the rounds list's "37 spørsmål"
    questionCount:
      instrument
        .filter((f) => selected.has(f.key))
        .reduce((n, f) => n + f.ordinals.length, 0) + setup.extraKeys.length,
    extraCount: setup.extraKeys.length,
    commentPolicy: setup.commentPolicy,
    allowDialogue: setup.allowDialogue,
    reminderDay: setup.reminderDay,
    closeAfterDays: setup.closeAfterDays,
    evaluationCadence: setup.evaluationCadence,
    groups,
    invitedGroupIds: setup.groupIds,
    orgQuestions,
    consultations: setup.consultations,
    employeeCount: org.employee_count,
    threshold: participation?.threshold ?? org.threshold,
    // styling only; `round_group_write` and its siblings are what actually decide
    // and a round that has opened is fixed (0076, round_settings_fixed): nothing to write
    canWrite: (role === 'daglig_leder' || role === 'avdelingsleder') && setup.status === 'planlagt',
    nextOpensAt,
    // the rhythm is the year wheel's, and `wheel_write` admits daglig leder only
    wheel: wheel
      ? {
          cadence: wheel.cadence,
          active: wheel.active,
          roundsPerYear: wheelMonths(wheel.cadence, wheel.baselineMonth, wheel.skipFellesferie).length,
          notifyLeadDays: wheel.notifyLeadDays,
          extendIfLow: wheel.extendIfLow,
          skipFellesferie: wheel.skipFellesferie,
          notifyVoOnOverdue: wheel.notifyVoOnOverdue,
        }
      : null,
    canWriteWheel: role === 'daglig_leder',
    modules:
      setup.kind === 'grunnlinje'
        ? offered.map((m) => {
            const row = chosen.find((c) => c.moduleId === m.id)
            const asked = new Set(row?.itemIds ?? [])
            const slug = INDUSTRY_META.find((i) => i.moduleKey === m.key)?.slug
            // a module in variants (0089): its statements once each, and the factors of the round's
            // variant, simplified until one is chosen; the database derives what it asks
            const variantKey = m.variants.length ? (row?.variantKey ?? 'forenklet') : null
            const all = new Set(m.factors.flatMap((f) => f.items.map((i) => i.id))).size
            const own = variantKey ? m.factors.filter((f) => f.variant === variantKey) : m.factors
            const simple = m.variants.find((v) => v.key === 'forenklet')
            return {
              id: m.id,
              name: m.name,
              version: m.version,
              statements: all,
              // what this round asks of it: the organisation may have left statements out (0088)
              statementsAsked: row ? asked.size : variantKey ? (simple?.lockedItems.length ?? all) : all,
              countItems: variantKey
                ? (m.variants.find((v) => v.key === variantKey)?.countItems.length ?? m.countItems.length)
                : m.countItems.length,
              minutes: variantKey && row ? Math.max(1, Math.round((asked.size * 8) / 60)) : (simple?.estimatedMinutes ?? m.estimatedMinutes),
              // before the page is launched its question page is a preview (D-118)
              href: slug ? `/${slug}/sporsmal${pageIn(getIndustry(slug), locale === 'en' ? 'en' : 'no')?.launched ? '' : '?forhandsvis=1'}` : null,
              factors: own.map((f) => ({ key: f.key, name: f.name })),
              enabled: Boolean(row),
              includeCountItems: row ? row.includeCountItems : true,
              factorKeys: row
                ? own.filter((f) => f.items.some((i) => asked.has(i.id)) && (!variantKey || f.items.every((i) => asked.has(i.id)))).map((f) => f.key)
                : own.map((f) => f.key),
              // chosen under Målinger › Spørsmålssett, not factor by factor here
              variant: variantKey ? (m.variants.find((v) => v.key === variantKey)?.name ?? null) : null,
              suggested: !row && m.key === industry?.moduleKey,
              industry: m.key === industry?.moduleKey ? industry : null,
            }
          })
        : [],
    moduleFactorToggles: flag('module_factor_toggles'),
    send,
    locked: setup.status !== 'planlagt',
    /*
     * The round against the organisation's standard (0076, D-126), section by section. Only
     * once a standard is saved: before that nothing differs from anything, and the screen is
     * the design's. The extras are a grunnlinje's; a puls asks none by its kind.
     */
    perRound: {
      extraKeys: setup.extraKeys,
      extraQuestions:
        setup.kind === 'grunnlinje'
          ? extraRegistry.map((e) => ({ key: e.key, screening: (SCREENING as readonly string[]).includes(e.key) }))
          : [],
      extrasOffReason: setup.extrasOffReason,
      finalReminder: setup.finalReminder,
      smsWhen: setup.smsWhen,
      smsEnabled: Boolean(sms?.enabled),
      standard: standard
        ? {
            rytme:
              setup.reminderDay !== standard.reminderDay ||
              setup.finalReminder !== standard.finalReminder ||
              setup.closeAfterDays !== (setup.kind === 'grunnlinje' ? standard.closeDaysGrunnlinje : standard.closeDaysPuls),
            kommentarer: setup.commentPolicy !== standard.commentPolicy || setup.allowDialogue !== standard.allowDialogue,
            tillegg:
              setup.kind === 'grunnlinje' &&
              [...setup.extraKeys].sort().join() !== [...standard.extras].sort().join(),
            utsending: setup.smsWhen !== null,
          }
        : null,
    },
  }

  return <MaleoppsettScreen view={view} />
}
