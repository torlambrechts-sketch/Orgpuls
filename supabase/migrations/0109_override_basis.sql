-- 0109 — an override replaces one text of the files, and only while the files still say it (X-090)
--
-- A bokmål or English override (0101) was laid over messages/ for as long as it existed. Once the
-- weekly fold-back (scripts/i18n/fold-overrides.mjs) writes an approved override into the files, or
-- a developer rewrites that string, the override went on shadowing the file: a later code change to
-- the text was silently undone on the live site.
--
-- Each override now records the SHA-256 of the file text it replaced (`file_hash`, set by the
-- application on every write, which is where messages/ is). Every reader applies an override only
-- while the file's text at that path still hashes to it: the app (lib/i18n/override-tree.ts), the
-- dispatcher and the Auth mail hook (supabase/functions/_shared/mail.ts). When the files change,
-- by a fold or by hand, the files win; nothing is deleted, and the admin shows the override as
-- folded or superseded. A row written before this migration has no basis and applies as before.
--
-- public.message_overrides therefore returns {key: {text, file}} rather than {key: text}. The
-- readers shipped before this migration accept both shapes; a deployed reader older than that
-- ignores the new shape and sends the deployed texts, never a key.

alter table app.message_overrides
  add column file_hash text check (file_hash is null or file_hash ~ '^[0-9a-f]{64}$');
comment on column app.message_overrides.file_hash is
  'SHA-256 of the messages/ text this override replaced (0109). Applied only while the file still says that; null: before 0109, always applied.';

create or replace function public.message_overrides(p_locale text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_object_agg(o.key, jsonb_build_object('text', o.text, 'file', o.file_hash)), '{}'::jsonb)
  from app.message_overrides o
  where o.locale = p_locale and o.status = 'approved'
$$;
revoke all on function public.message_overrides(text) from public;
grant execute on function public.message_overrides(text) to anon, authenticated, service_role;

create or replace function public.admin_message_overrides(p_locale text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not app.is_platform_admin(array['super_admin']::app.platform_role[]) then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  if coalesce(p_locale, '') not in ('no', 'en') then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  return jsonb_build_object('ok', true, 'items', coalesce((
    select jsonb_agg(jsonb_build_object('key', o.key, 'text', o.text, 'status', o.status, 'source', o.source,
             'notes', o.notes, 'source_hash', o.source_hash, 'file_hash', o.file_hash, 'approved_at', o.approved_at,
             'auto', o.approved_auto, 'by', (select u.email::text from auth.users u where u.id = o.approved_by),
             'updated_at', o.updated_at)
           order by o.key collate "C")
    from app.message_overrides o where o.locale = p_locale), '[]'::jsonb));
end $$;
revoke all on function public.admin_message_overrides(text) from public, anon;
grant execute on function public.admin_message_overrides(text) to authenticated;

-- rows: [{key, text, source, status, notes, source_hash, file_hash}] to write, or [{key, remove: true}]
-- to go back to the file's own text. As 0101, and a new wording records the file text it replaces.
create or replace function public.admin_message_overrides_import(p_locale text, p_rows jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  r         jsonb;
  v_key     text;
  v_text    text;
  v_status  text;
  v_source  text;
  v_file    text;
  v_old     app.message_overrides%rowtype;
  v_new     int := 0;
  v_changed int := 0;
  v_removed int := 0;
  v_same    int := 0;
  v_refused jsonb := '[]'::jsonb;
begin
  if not app.is_platform_admin(array['super_admin']::app.platform_role[]) then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  if coalesce(p_locale, '') not in ('no', 'en') or jsonb_typeof(p_rows) <> 'array'
     or jsonb_array_length(p_rows) = 0 or jsonb_array_length(p_rows) > 10000 then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  for r in select * from jsonb_array_elements(p_rows) loop
    v_key := r ->> 'key';
    begin
      if coalesce((r ->> 'remove')::boolean, false) then
        delete from app.message_overrides o where o.locale = p_locale and o.key = v_key;
        if found then v_removed := v_removed + 1; else v_same := v_same + 1; end if;
        continue;
      end if;
      v_text := btrim(coalesce(r ->> 'text', ''));
      v_status := coalesce(r ->> 'status', 'draft');
      v_source := coalesce(r ->> 'source', 'professional');
      v_file := nullif(lower(coalesce(r ->> 'file_hash', '')), '');
      if v_status not in ('draft', 'in_review', 'adjudicated', 'pretested') then
        raise exception 'status' using errcode = 'check_violation';
      end if;
      select * into v_old from app.message_overrides o where o.locale = p_locale and o.key = v_key;
      if not found then
        insert into app.message_overrides (locale, key, text, status, source, notes, source_hash, file_hash)
        values (p_locale, v_key, v_text, v_status, v_source, nullif(btrim(coalesce(r ->> 'notes', '')), ''),
                nullif(lower(coalesce(r ->> 'source_hash', '')), ''), v_file);
        v_new := v_new + 1;
      elsif v_old.text is distinct from v_text or v_old.source is distinct from v_source then
        update app.message_overrides o
           set text = v_text, source = v_source, status = v_status,
               notes = coalesce(nullif(btrim(coalesce(r ->> 'notes', '')), ''), o.notes),
               source_hash = coalesce(nullif(lower(coalesce(r ->> 'source_hash', '')), ''), o.source_hash),
               file_hash = coalesce(v_file, o.file_hash)
         where o.locale = p_locale and o.key = v_key;
        v_changed := v_changed + 1;
      else
        v_same := v_same + 1;
      end if;
    exception when check_violation or not_null_violation or string_data_right_truncation or invalid_text_representation then
      if jsonb_array_length(v_refused) < 50 then
        v_refused := v_refused || jsonb_build_object('key', v_key, 'error', sqlerrm);
      end if;
    end;
  end loop;
  perform app.admin_log('translations.override_import', null, 'locale', p_locale, null,
    jsonb_build_object('new', v_new, 'changed', v_changed, 'removed', v_removed, 'same', v_same,
                       'refused', jsonb_array_length(v_refused), 'auto', app.auto_approve_on()));
  return jsonb_build_object('ok', true, 'new', v_new, 'changed', v_changed, 'removed', v_removed,
                            'same', v_same, 'refused', v_refused);
end $$;
revoke all on function public.admin_message_overrides_import(text, jsonb) from public, anon;
grant execute on function public.admin_message_overrides_import(text, jsonb) to authenticated;
