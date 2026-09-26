import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { RespondFlow } from '@/components/respond/RespondFlow'
import { getExtraOptionCounts, getExtraQuestions, getFactors } from '@/lib/instrument/read'
import { getOrganization } from '@/lib/org/read'
import { respondCopy, respondQuestions } from '@/lib/respond/questions'
import { getRounds, type RoundListItem } from '@/lib/rounds/read'
import { roundTitle } from '@/lib/rounds/title'
import { getRoundSetup } from '@/lib/setup/read'
import { getModulesById, getRoundModules } from '@/lib/modules/read'

/**
 * "Forhåndsvis som ansatt": the respondent screens for a round, as a signed-in leader sees
 * them. D-58.
 *
 * The real respondent page (/s/[token]) builds its form from `respond_form`, which needs an
 * invitation's token, and there is no such thing as a preview token: a token either belongs
 * to a person who has not answered, or it does not work (D-34). So the preview builds the
 * same form from what a leader can already read — the round's factors and extra questions,
 * the same tables `respond_form` reads — and renders it with the same flow and the same
 * strings. It writes nothing: the flow's last step ends the preview instead of submitting.
 *
 * The one difference employees would see is order: `respond_form` shuffles the statements
 * per token, and a preview has no token to shuffle by, so they come in the instrument's
 * order and the end screen says so.
 */
export const dynamic = 'force-dynamic'

// the three kinds respond_form reports, from the extra question's own row
const kindOf = (k: string): 'scale' | 'choice' | 'free_text' =>
  k === 'free_text' ? 'free_text' : k === 'scale' ? 'scale' : 'choice'

export default async function PreviewPage({ searchParams }: { searchParams: Promise<{ runde?: string }> }) {
  const params = await searchParams
  const t = await getTranslations()
  const rounds = await getRounds()

  // the round asked for, or the one employees would meet next: open now, then the next
  // planned, then the latest that closed
  const byOpening = (a: RoundListItem, b: RoundListItem) => (a.opensAt ?? '').localeCompare(b.opensAt ?? '')
  const round =
    rounds.find((r) => r.id === params.runde) ??
    rounds.find((r) => r.state === 'apen') ??
    [...rounds].filter((r) => r.status === 'planlagt').sort(byOpening)[0] ??
    rounds.find((r) => r.state === 'lukket') ??
    null

  const [setup, factors, extras, optionCounts, org] = round
    ? await Promise.all([
        getRoundSetup(round.id),
        getFactors(),
        getExtraQuestions(),
        getExtraOptionCounts(),
        getOrganization(),
      ])
    : [null, [], [], new Map<string, number>(), null]

  if (!round || !setup || !org) {
    return (
      <main className="animate-entry mx-auto max-w-[480px] px-[16px] pb-[60px] pt-[30px]">
        <Link href="/malinger" className="text-[12.5px] font-semibold text-ink no-underline hover:no-underline">
          {t('preview.back')}
        </Link>
        <p className="mt-[16px] text-[14px] text-mut">{t('preview.none')}</p>
      </main>
    )
  }

  // the round's statements in the instrument's order, and its extra questions in theirs
  const chosen = new Set(setup.factorKeys)
  const questions = factors
    .filter((f) => chosen.has(f.key))
    .flatMap((f) => f.ordinals.map((ordinal) => ({ factor: f.key, ordinal })))
  const extra = extras
    .filter((x) => setup.extraKeys.includes(x.key))
    .map((x) => ({
      key: x.key,
      kind: kindOf(x.kind),
      options: optionCounts.get(x.key) ?? 0,
    }))

  // the round's industry module, as respond_form would send it, in the registry's order (D-113)
  const roundModules = await getRoundModules([round.id])
  const moduleRows = await getModulesById(roundModules.map((r) => r.moduleId))
  const modules = roundModules.flatMap((rm) => {
    const m = moduleRows.find((x) => x.id === rm.moduleId)
    if (!m) return []
    const asked = new Set(rm.itemIds)
    return [
      {
        name: m.name,
        minutes: m.estimatedMinutes,
        statements: m.factors.flatMap((f) =>
          f.items.filter((i) => asked.has(i.id)).map((i) => ({ item: i.id, factor: f.name, text: i.text })),
        ),
        count: rm.includeCountItems ? m.countItems.map((i) => ({ item: i.id, text: i.text, options: i.options })) : [],
        segments: rm.includeSegments ? m.segments.map((i) => ({ item: i.id, text: i.text, options: i.options })) : [],
      },
    ]
  })

  return (
    <main className="animate-entry mx-auto max-w-[480px] px-[16px] pb-[60px] pt-[30px]">
      <Link href="/malinger" className="text-[12.5px] font-semibold text-ink no-underline hover:no-underline">
        {t('preview.back')}
      </Link>
      <h1 className="mt-[12px] font-display text-[24px] font-semibold leading-[1.2]">
        {t('preview.title', { round: roundTitle(t, round) })}
      </h1>
      <div className="mt-[16px] overflow-hidden rounded-card border border-line bg-bg">
        <RespondFlow
          token=""
          org={org.name}
          questions={respondQuestions(t, { questions, extra, modules, threshold: org.threshold })}
          copy={{
            ...respondCopy(t, org.threshold),
            doneTitle: t('preview.doneTitle'),
            doneLead: t('preview.doneLead'),
          }}
          preview={t('preview.banner')}
        />
      </div>
    </main>
  )
}
