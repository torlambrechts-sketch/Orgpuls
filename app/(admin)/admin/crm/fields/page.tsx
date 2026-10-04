import type { Route } from 'next'
import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { ArchiveForm, FieldForm, GroupForm } from '@/components/admin/CrmFields'
import type { FieldMessages } from '@/components/admin/CustomFields'
import { Badge, Card, PageHead, Problem } from '@/components/admin/ui'
import { isError } from '@/lib/admin/api'
import { crmStages } from '@/lib/admin/crm'
import { FIELD_ENTITIES, type FieldDef, type FieldEntity } from '@/lib/admin/crmFieldTypes'
import { crmFields } from '@/lib/admin/crmFields'
import { crmRuleState } from '@/lib/admin/crmRules'

/**
 * CRM › Custom fields (0197, D-222; CUS-01 to CUS-04, SF-38): the fields admins add to companies and contacts, in
 * their groups, with their type, rule, formula and who may not see or change them. Every CRM reader sees the list;
 * the CRM settings' holders change it. A change reaches the forms, the record pages, the filters and the import
 * at once; every save is kept as a version.
 */
export default async function CrmFieldsPage({ searchParams }: { searchParams: Promise<{ entity?: string }> }) {
  const t = await getTranslations({ locale: 'en', namespace: 'admin' })
  const m = t.raw('crmFields') as FieldMessages
  const { entity: raw } = await searchParams
  const entity: FieldEntity = (FIELD_ENTITIES as readonly string[]).includes(raw ?? '') ? (raw as FieldEntity) : 'company'
  // both record types' fields, so each chip counts its own
  const [data, stageData, rules] = await Promise.all([crmFields(null), crmStages(), crmRuleState()])
  if (isError(data)) return <Problem text={data.error === 'not_allowed' ? t('common.notAllowed') : t('common.failed')} />
  const stages = isError(stageData) ? [] : stageData.rows.filter((s) => !s.archived && (s.kind === 'open' || s.kind === 'won'))
  const common = { reason: t('common.reason'), reasonHint: t('common.reasonHint'), saving: t('common.saving'), done: t('common.done') }
  const groups = data.groups.filter((g) => g.entity === entity)
  const live = data.fields.filter((f) => f.entity === entity && !f.archived)
  const archived = data.fields.filter((f) => f.entity === entity && f.archived)
  const summary = 'cursor-pointer list-none text-[13px] font-semibold text-link [&::-webkit-details-marker]:hidden'
  const form = { entity, groups, stages, sets: data.sets, m, common, reasonRequired: rules.reasonRequired }
  // the fields under each live group in its order, then those in no group
  const sections = [
    ...groups.filter((g) => !g.archived).map((g) => ({ key: g.id, title: g.name, fields: live.filter((f) => f.group_id === g.id) })),
    { key: 'none', title: m.groups.none, fields: live.filter((f) => !f.group_id || !groups.some((g) => g.id === f.group_id && !g.archived)) },
  ].filter((s) => s.fields.length)

  const row = (f: FieldDef) => (
    <li key={f.id} className="border-b border-line py-[12px] last:border-b-0">
      <details>
        <summary className={summary}>
          <span className="flex flex-wrap items-center gap-[8px]">
            {f.label}
            <span className="font-mono text-[11.5px] font-normal text-mut">{f.key}</span>
            <Badge>{m.types[f.type]}</Badge>
            {f.importance !== 'none' ? <Badge tone={f.importance === 'required' ? 'yellow' : 'grey'}>{m.importance[f.importance]}</Badge> : null}
            {f.computed ? <Badge tone="green">{m.fields.computed}</Badge> : null}
            {f.access === 'read' ? <span className="text-[12px] font-normal text-mut">{m.fields.accessRead}</span> : null}
            {f.version !== undefined ? <span className="text-[12px] font-normal text-mut">{m.fields.version.replace('{n}', String(f.version))}</span> : null}
          </span>
        </summary>
        <div className="mt-[12px] flex flex-col gap-[12px]">
          {data.manage ? (
            <>
              <FieldForm field={f} {...form} />
              <div className="border-t border-line pt-[10px]">
                <ArchiveForm kind="field" id={f.id} archived={false} m={m} common={common} reasonRequired={rules.reasonRequired} />
              </div>
            </>
          ) : (
            <p className="m-0 text-[12.5px] leading-[1.5] text-mut">{f.description ?? '—'}</p>
          )}
        </div>
      </details>
    </li>
  )

  return (
    <>
      <PageHead title={m.title} lead={m.lead} />
      <nav aria-label={m.title} className="mb-[12px] flex flex-wrap gap-[6px]">
        {FIELD_ENTITIES.map((e) => (
          <Link
            key={e}
            href={`/admin/crm/fields?entity=${e}` as Route}
            aria-current={entity === e ? 'page' : undefined}
            className={`rounded-pill border px-[12px] py-[5px] text-[12.5px] font-semibold ${entity === e ? 'border-ink bg-ink text-bg hover:text-bg' : 'border-line bg-sf text-ink hover:text-ink'}`}
          >
            {m.entity[e]} · {data.fields.filter((f) => f.entity === e && !f.archived).length}
          </Link>
        ))}
      </nav>
      {data.manage ? null : <p className="mb-[12px] mt-0 text-[13px] text-mut">{m.fields.readOnlyNote}</p>}

      <div className="grid items-start gap-[14px] [grid-template-columns:minmax(0,1fr)] lg:[grid-template-columns:minmax(0,1.6fr)_minmax(280px,1fr)]">
        <Card title={m.fields.title}>
          {sections.length ? (
            sections.map((s) => (
              <section key={s.key} className="mb-[10px] last:mb-0">
                <h3 className="m-0 mb-[2px] text-[11px] font-semibold uppercase tracking-[0.09em] text-mut">{s.title}</h3>
                <ul className="m-0 flex list-none flex-col p-0">{s.fields.map(row)}</ul>
              </section>
            ))
          ) : (
            <p className="m-0 text-[13px] text-mut">{m.fields.empty}</p>
          )}
          {data.manage ? (
            <details className="mt-[12px] border-t border-line pt-[12px]">
              <summary className={summary}>{m.fields.addTitle}</summary>
              <div className="mt-[12px]">
                <FieldForm {...form} />
              </div>
            </details>
          ) : null}
          {archived.length ? (
            <details className="mt-[12px] border-t border-line pt-[12px]">
              <summary className={summary}>
                {m.fields.archivedTitle} · {archived.length}
              </summary>
              <ul className="m-0 mt-[8px] flex list-none flex-col p-0">
                {archived.map((f) => (
                  <li key={f.id} className="flex flex-wrap items-center gap-[10px] border-b border-line py-[10px] last:border-b-0">
                    <span className="text-[13px] font-semibold">{f.label}</span>
                    <span className="font-mono text-[11.5px] text-mut">{f.key}</span>
                    <Badge>{m.types[f.type]}</Badge>
                    {data.manage ? <ArchiveForm kind="field" id={f.id} archived m={m} common={common} reasonRequired={rules.reasonRequired} /> : null}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </Card>

        <Card title={m.groups.title}>
          <p className="mb-[12px] mt-0 text-[12.5px] leading-[1.5] text-mut">{m.groups.lead}</p>
          {groups.length ? (
            <ul className="m-0 flex list-none flex-col p-0">
              {groups.map((g) => (
                <li key={g.id} className={`border-b border-line py-[10px] last:border-b-0 ${g.archived ? 'opacity-60' : ''}`}>
                  {data.manage ? (
                    <details>
                      <summary className={summary}>
                        {g.name}
                        {g.archived ? <span className="ml-[8px] text-[12px] font-normal text-mut">{m.groups.archived}</span> : null}
                      </summary>
                      <div className="mt-[10px] flex flex-col gap-[10px]">
                        <GroupForm group={g} entity={entity} m={m} common={common} reasonRequired={rules.reasonRequired} />
                        <ArchiveForm kind="group" id={g.id} archived={g.archived} m={m} common={common} reasonRequired={rules.reasonRequired} />
                      </div>
                    </details>
                  ) : (
                    <span className="text-[13px] font-semibold">{g.name}</span>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="m-0 text-[13px] text-mut">{m.groups.empty}</p>
          )}
          {data.manage ? (
            <details className="mt-[12px] border-t border-line pt-[12px]">
              <summary className={summary}>{m.groups.addTitle}</summary>
              <div className="mt-[10px]">
                <GroupForm entity={entity} m={m} common={common} reasonRequired={rules.reasonRequired} />
              </div>
            </details>
          ) : null}
        </Card>
      </div>
    </>
  )
}
