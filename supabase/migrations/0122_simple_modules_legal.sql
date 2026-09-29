-- 0122 — Modules and legal texts, the pragmatic way (X-096)
--
-- Before this, changing one statement in an industry module took a new file version, an archived
-- copy, a hand-kept map, a pinned-hash test, psql against the hosted database, a registry seed, an
-- English approval, a publish form with a reason, a page edit and a deploy. The legal review asked
-- for a checkbox per sentence, a few hundred of them. Both are cut to what protects someone:
--
--   Modules   the file is the module. Its body — everything but the version and the validation
--             status — is hashed; app.module_sync compares it with the database and, when it
--             differs, writes the next version itself (1.0.3 after 1.0.2), publishes it if the
--             module was live, moves planned rounds nobody has answered onto it (statements matched
--             by code; a new statement is asked, one taken away is not), carries the survey
--             translations of every statement whose wording did not change, and retires the old
--             version. What made versions worth having is kept: a version that has been published
--             never changes (0067's triggers), a round that has opened keeps the version it opened
--             with (round_module_ok), and its translations are pinned (0084). A «validated» status
--             does not survive a change to what respondents read: it falls back to provisional.
--   Legal     a text is reviewed as a document — an industry page, a module, the privacy statement —
--             not line by line. app.legal_reviews keeps the text as it was reviewed, so a document
--             changed since shows exactly what changed. 0082's legal_approvals stays as history and
--             still counts: a document whose every line was approved there reads as reviewed.

-- ---------------------------------------------------------------- modules: the body hash
alter table app.question_modules add column body_hash text check (body_hash ~ '^[0-9a-f]{64}$');

-- the versions in the database today, from their files (lib/modules/schema.ts bodyHash)
update app.question_modules set body_hash = '2f949f179f49936909807d56cc4e35f0f119dd06d58c42bf9002bd5a6ed1c862' where content_hash = 'fd6d9da1aa3bc80418529b7ea99d839a47939e8a647b6a4c877e435534059a74'; -- bygg-og-anlegg@1.0.0
update app.question_modules set body_hash = '6249fbf6b079bcda168eba5961fc17cf19374d6321451d1f378594719d4ede73' where content_hash = '0ca1bfee9c8bcc6856a274cb1f22401c3da474d11e594e8a7abee2c00f75a4b7'; -- helse-og-omsorg@1.0.1
update app.question_modules set body_hash = '4d66a56c0acc1d8a1fc94b041d6bbcc6e9dbd53c7f760b71195b466286065bef' where content_hash = '65bd7f1be7464ab233b9b3c81c775deb90d62248f210773d7fb0dcfab8af99b6'; -- helse-og-omsorg@1.0.0
update app.question_modules set body_hash = '6d7f6d5f0448c7e9f85e583e5e3bf4489bfabc8e312526c81e20279444c5075b' where content_hash = '7c3bfaf54c38ba8b14a035015b6963997388ed4c67fbc368d290161eafbfa815'; -- barnehage-og-skole@1.0.0
update app.question_modules set body_hash = '46a7c4b34c1fdcd270f10ac94b3fcc08ab5516dce3588ab474d6a8020b7c4c93' where content_hash = 'd21d2bd0db83cc18ea3c072f8aa9497828d2fe5623efd92ceb1efca622f5812e'; -- kunnskap-og-kontor@1.0.0
update app.question_modules set body_hash = '5498dbfeddc36b2597dd9726d9a8793073ac7fe1143b0f11ce7deec3bd805105' where content_hash = 'ec6d824f8cdf338a765dcc069707de68810b32af484f5d1f9e7e13e0b2bf853d'; -- handel@1.0.0

create index question_modules_body on app.question_modules (key, body_hash);

-- ---------------------------------------------------------------- modules: one sync
create function app.module_sync(p jsonb, p_body text) returns jsonb
  language plpgsql set search_path = ''
as $fn$
declare
  v_key     text := p->>'module_id';
  v_last    app.question_modules;
  v_same    app.question_modules;
  v_ver     text;
  v_new     uuid;
  v_parts   int[];
  v_changed boolean;
  v_valid   text;
  v_moved   int := 0;
  v_copied  int := 0;
  v_n       int;
begin
  if coalesce(p_body, '') !~ '^[0-9a-f]{64}$' or coalesce(v_key, '') !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then
    raise exception 'module_sync: a module id and a body hash are needed' using errcode = 'check_violation';
  end if;

  -- the same body is already a version: nothing to do
  select * into v_same from app.question_modules m where m.key = v_key and m.body_hash = p_body
  order by string_to_array(m.version, '.')::int[] desc limit 1;
  if found then
    return jsonb_build_object('result', 'unchanged', 'version', v_same.version, 'status', v_same.status);
  end if;

  select * into v_last from app.question_modules m where m.key = v_key
  order by string_to_array(m.version, '.')::int[] desc limit 1;

  -- a module the database has never seen: its first version, as a draft
  if not found then
    v_ver := coalesce(nullif(p->>'version', ''), '1.0.0');
    perform app.module_seed(p || jsonb_build_object('version', v_ver), p_body);
    update app.question_modules set body_hash = p_body where key = v_key and version = v_ver;
    return jsonb_build_object('result', 'new', 'version', v_ver, 'status', 'draft');
  end if;

  -- a draft nobody has been asked yet is simply replaced
  if v_last.status = 'draft' then
    perform app.module_seed(p || jsonb_build_object('version', v_last.version, 'validation_status', v_last.validation_status), p_body);
    update app.question_modules set body_hash = p_body where key = v_key and version = v_last.version;
    return jsonb_build_object('result', 'draft', 'version', v_last.version, 'status', 'draft');
  end if;

  -- otherwise the next version
  v_parts := string_to_array(v_last.version, '.')::int[];
  v_ver := v_parts[1] || '.' || v_parts[2] || '.' || (v_parts[3] + 1);
  perform app.module_seed(p || jsonb_build_object('version', v_ver, 'validation_status', v_last.validation_status), p_body);
  select m.id into v_new from app.question_modules m where m.key = v_key and m.version = v_ver;

  -- what a respondent reads: the statements, their options and their order
  v_changed := (select coalesce(jsonb_agg(jsonb_build_array(i.code, i.kind, i.text, i.options) order by i.code), '[]')
                from app.module_items i where i.module_id = v_new)
               is distinct from
               (select coalesce(jsonb_agg(jsonb_build_array(i.code, i.kind, i.text, i.options) order by i.code), '[]')
                from app.module_items i where i.module_id = v_last.id);
  v_valid := case when v_changed and v_last.validation_status = 'validated' then 'provisional' else v_last.validation_status end;
  update app.question_modules set body_hash = p_body, validation_status = v_valid where id = v_new;

  -- the survey translations of every statement and factor name that did not change
  insert into app.item_translations (item_id, locale, text, source, status, approved_by, approved_at, notes, trapd, source_hash, approved_auto)
  select regexp_replace(t.item_id, '^(module|mfactor):' || pr.old_id::text, '\1:' || pr.new_id::text),
         t.locale, t.text, t.source, t.status, t.approved_by, t.approved_at, t.notes, t.trapd, t.source_hash, t.approved_auto
  from (
    select o.id as old_id, n.id as new_id, 'module' as kind
    from app.module_items o join app.module_items n on n.code = o.code and n.module_id = v_new
    where o.module_id = v_last.id and o.kind = n.kind and o.text = n.text and o.options is not distinct from n.options
    union all
    select o.id, n.id, 'mfactor'
    from app.module_factors o join app.module_factors n on n.key = o.key and n.module_id = v_new
    where o.module_id = v_last.id and o.name = n.name and o.i18n = n.i18n
  ) pr
  join app.item_translations t on split_part(t.item_id, ':', 1) = pr.kind and split_part(t.item_id, ':', 2) = pr.old_id::text
  where t.status <> 'retired'
  on conflict do nothing;
  get diagnostics v_copied = row_count;

  if v_last.status = 'published' then
    perform app.module_set_status(v_key, v_ver, 'published');
    -- planned rounds nobody has answered ask the new version: the statements they asked, by code,
    -- and any statement the new version adds
    update app.round_modules rm
    set module_id = v_new,
        item_ids = coalesce((
          select array_agg(n.id order by n.sort) from app.module_items n
          where n.module_id = v_new and n.kind = 'likert5'
            and (n.code in (select o.code from app.module_items o where o.id = any (rm.item_ids))
                 or n.code not in (select o.code from app.module_items o where o.module_id = v_last.id))), '{}')
    from app.rounds r
    where r.id = rm.round_id and rm.module_id = v_last.id and r.status = 'planlagt' and not app.round_answered(r.id);
    get diagnostics v_moved = row_count;
    perform app.module_set_status(v_key, v_last.version, 'retired');
  end if;

  return jsonb_build_object('result', case when v_last.status = 'published' then 'published' else 'draft' end,
                            'version', v_ver, 'previous', v_last.version,
                            'status', case when v_last.status = 'published' then 'published' else 'draft' end,
                            'changed_statements', v_changed, 'validation', v_valid,
                            'rounds_moved', v_moved, 'translations_carried', v_copied);
end $fn$;
revoke all on function app.module_sync(jsonb, text) from public, anon, authenticated;

-- the admin's «Make live»: super-admin, audited with what happened
create function public.admin_module_sync(p jsonb, p_body text) returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
declare v jsonb;
begin
  if not app.is_platform_admin(array['super_admin']::app.platform_role[]) then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  v := app.module_sync(p, p_body);
  if v->>'result' <> 'unchanged' then
    perform app.admin_log('module.sync', null, 'module', (p->>'module_id') || '@' || (v->>'version'), null, v);
  end if;
  return jsonb_build_object('ok', true) || v;
end $fn$;
revoke all on function public.admin_module_sync(jsonb, text) from public, anon;
grant execute on function public.admin_module_sync(jsonb, text) to authenticated;

-- 0092's list, with each version's body hash, so the admin can say whether the file is live
create or replace function public.admin_modules() returns jsonb
  language plpgsql stable security definer set search_path = ''
as $fn$
begin
  if not app.is_platform_admin(array['super_admin', 'support', 'finance', 'analyst', 'marketing']::app.platform_role[]) then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  return jsonb_build_object('ok', true,
    'modules', coalesce((
      select jsonb_agg(jsonb_build_object(
               'key', m.key, 'version', m.version, 'name', m.name, 'status', m.status,
               'published_at', m.published_at, 'retired_at', m.retired_at, 'content_hash', m.content_hash, 'body_hash', m.body_hash,
               'validation_status', m.validation_status,
               'decision', (select jsonb_build_object('status', d.status, 'report_url', d.report_url, 'reason', d.reason,
                                                      'at', d.decided_at)
                            from app.module_validation_log d
                            where d.module_key = m.key and d.module_version = m.version
                            order by d.decided_at desc, d.id desc limit 1),
               'factors', (select count(*) from app.module_factors f where f.module_id = m.id),
               'items', (select count(*) from app.module_items i where i.module_id = m.id and i.kind = 'likert5'),
               'rounds', (select count(*) from app.round_modules rm where rm.module_id = m.id),
               'variants', coalesce((
                 select jsonb_agg(jsonb_build_object(
                          'key', v.key, 'code', v.code, 'version', v.version, 'min_factors', v.min_factors,
                          'default_off', to_jsonb(v.default_off),
                          'factors', (select count(*) from app.module_factors f where f.module_id = m.id and f.variant_key = v.key),
                          'items', (select count(distinct mi.item_id) from app.module_factor_items mi
                                    join app.module_factors f on f.id = mi.factor_id
                                    where f.module_id = m.id and f.variant_key = v.key),
                          'rounds', (select count(*) from app.round_modules rm where rm.module_id = m.id and rm.variant_key = v.key))
                        order by v.sort)
                 from app.module_variants v where v.module_id = m.id), '[]'::jsonb),
               'pilots', coalesce((select jsonb_agg(jsonb_build_object('org_id', o.id, 'name', o.name) order by o.name)
                                   from app.module_pilots p join app.organizations o on o.id = p.org_id
                                   where p.module_id = m.id), '[]'::jsonb))
             order by m.key, string_to_array(m.version, '.')::int[] desc)
      from app.question_modules m), '[]'::jsonb),
    'adoption', coalesce((
      select jsonb_agg(jsonb_build_object('nace', x.nace, 'rounds', x.rounds, 'with_module', x.with_module) order by x.nace)
      from (
        select coalesce(left(o.registry_nace_code, 2), '–') as nace, count(*) as rounds,
               count(*) filter (where exists (select 1 from app.round_modules rm where rm.round_id = r.id)) as with_module
        from app.rounds r
        join app.measurements me on me.id = r.measurement_id and me.kind = 'grunnlinje'
        join app.organizations o on o.id = r.org_id
        where r.opens_at > now() - interval '1 year'
        group by 1
      ) x), '[]'::jsonb));
end $fn$;


-- ---------------------------------------------------------------- legal: documents, with the text reviewed
create table app.legal_reviews (
  key         text primary key check (char_length(key) between 3 and 200),
  text        text not null,
  text_hash   text not null check (text_hash ~ '^[0-9a-f]{64}$'),
  reviewed_by uuid references auth.users (id) on delete set null,
  reviewed_at timestamptz not null default now()
);
alter table app.legal_reviews enable row level security;
revoke all on app.legal_reviews from public, anon, authenticated;

create function public.admin_legal_reviews() returns jsonb
  language plpgsql stable security definer set search_path = ''
as $fn$
begin
  if not app.is_platform_admin(array['super_admin']::app.platform_role[]) then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  return jsonb_build_object('ok', true, 'rows', (
    select coalesce(jsonb_agg(jsonb_build_object('key', r.key, 'hash', r.text_hash, 'text', r.text, 'at', r.reviewed_at,
                                                 'by', (select u.email from auth.users u where u.id = r.reviewed_by))
                              order by r.key), '[]')
    from app.legal_reviews r));
end $fn$;
revoke all on function public.admin_legal_reviews() from public, anon;
grant execute on function public.admin_legal_reviews() to authenticated;

-- one click per document: the text is stored as read, and must be the text its hash names
create function public.admin_legal_review(p_key text, p_hash text, p_text text) returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
begin
  if not app.is_platform_admin(array['super_admin']::app.platform_role[]) then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  if coalesce(p_key, '') !~ '^[a-z]+:[A-Za-z0-9:@._-]{1,190}$' or coalesce(p_text, '') = ''
     or encode(sha256(convert_to(p_text, 'UTF8')), 'hex') <> coalesce(p_hash, '') then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  insert into app.legal_reviews (key, text, text_hash, reviewed_by, reviewed_at)
  values (p_key, p_text, p_hash, auth.uid(), now())
  on conflict (key) do update set text = excluded.text, text_hash = excluded.text_hash,
                                  reviewed_by = excluded.reviewed_by, reviewed_at = excluded.reviewed_at;
  perform app.admin_log('legal.review', null, 'legal', p_key, null, jsonb_build_object('hash', p_hash));
  return jsonb_build_object('ok', true);
end $fn$;
revoke all on function public.admin_legal_review(text, text, text) from public, anon;
grant execute on function public.admin_legal_review(text, text, text) to authenticated;
