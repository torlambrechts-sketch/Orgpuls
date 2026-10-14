import { getTranslations } from 'next-intl/server'
import { QPS, qpsGroups } from '@/lib/marketing/qpsnordic'
import { DataTable } from './DataTable'

/**
 * The QPSNordic 34+ items on the template's page (D-283): the seven background questions, then
 * the 37 items in the manual's order, cut where the answer scale changes, each group under its
 * five answer options as they score 1–5. The words are the file's (lib/marketing/qpsnordic,
 * X-107) and are Norwegian on both language versions, as the files are; the column heads and
 * labels are messages under `seo.maler.qps.table`.
 */
export async function QpsItems() {
  const t = await getTranslations('seo.maler.qps.table')
  return (
    <div className="flex flex-col gap-[18px]">
      <div className="rounded-note border border-line bg-sf px-[20px] py-[16px]">
        <span className="block text-[11px] font-bold uppercase tracking-[0.06em] text-mut">{t('background')}</span>
        <ol className="m-0 mt-[8px] flex list-none flex-col gap-[4px] p-0 text-[14px] leading-[1.5] text-body">
          {QPS.background.map((b) => (
            <li key={b.id}>
              <span className="font-semibold text-ink">{b.id}.</span> {b.text}
              {b.options.length ? <span className="text-mut"> ({b.options.join(' / ')})</span> : null}
            </li>
          ))}
        </ol>
      </div>
      {qpsGroups().map((g) => (
        <div key={g.key} className="flex flex-col gap-[8px]">
          <p className="m-0 text-[13px] leading-[1.6] text-mut">
            <span className="font-bold uppercase tracking-[0.06em]">{t('answers')}</span>{' '}
            {g.scale.map((s, i) => `${i + 1} = ${s}`).join(' · ')}
          </p>
          <DataTable
            head={[t('n'), t('text'), t('qps')]}
            // an item's lead is the question its row answers («Hvordan er klimaet …?») or the definition before it
            rows={g.items.map((it) => [String(it.n), it.lead ? `${it.lead} ${it.text}` : it.text, it.qps || t('none')])}
          />
        </div>
      ))}
    </div>
  )
}
