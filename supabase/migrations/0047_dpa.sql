-- 0047_dpa.sql — the data processing agreement (databehandleravtale) and its signatures. D-87.
--
-- The agreement's words live in the app (messages `dpa.*`); what the database holds is which
-- version exists, the SHA-256 of its Norwegian text (lib/legal/dpa.ts pins the same pair, and a
-- unit test fails if the words change without a new version), and who signed which version for
-- which organisation, when.
--
--   * app.dpa_versions: published versions. Readable by any signed-in user; written only here,
--     in migrations. A version's hash cannot change once published.
--   * app.dpa_signatures: one per organisation and version. Readable by the organisation's
--     members; written only by public.sign_dpa. Nobody may change a signature: an UPDATE is
--     allowed only as the foreign key's own maintenance (the signer's profile deleted, so
--     signed_by set null), and a DELETE only when the organisation is already gone.
--   * public.sign_dpa: a daglig leder signs the current version for their organisation. The
--     hash is copied from app.dpa_versions, never taken from the caller.
--
-- Nothing here concerns respondents: a signature names a leader who chose to sign, in their
-- own name and title.

-- ---------------------------------------------------------------- versions
create table app.dpa_versions (
  version text primary key check (version ~ '^\d{4}-\d{2}-\d{2}$'),
  text_sha256 text not null check (text_sha256 ~ '^[0-9a-f]{64}$'),
  published_on date not null
);

alter table app.dpa_versions enable row level security;
create policy dpa_versions_read on app.dpa_versions for select to authenticated using (true);
grant select on app.dpa_versions to authenticated;

create function app.dpa_versions_fixed() returns trigger
  language plpgsql set search_path = ''
as $fn$
begin
  if tg_op = 'UPDATE' and (new.version, new.text_sha256, new.published_on)
       is distinct from (old.version, old.text_sha256, old.published_on) then
    raise exception 'a published agreement version cannot be changed; publish a new one';
  end if;
  return new;
end $fn$;

create trigger dpa_versions_fixed before update on app.dpa_versions
  for each row execute function app.dpa_versions_fixed();

insert into app.dpa_versions (version, text_sha256, published_on)
values ('2026-09-25', '92a39e5765e43fab1ddf9c7c80b196bc65e6d0a6951c40b223212a1c929a5771', date '2026-09-25');

-- ---------------------------------------------------------------- signatures
create table app.dpa_signatures (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references app.organizations(id) on delete cascade,
  version text not null references app.dpa_versions(version) on delete restrict,
  text_sha256 text not null check (text_sha256 ~ '^[0-9a-f]{64}$'),
  signed_by uuid references app.profiles(id) on delete set null,
  signer_name text not null check (char_length(btrim(signer_name)) between 2 and 120),
  signer_title text not null check (char_length(btrim(signer_title)) between 2 and 120),
  signed_at timestamptz not null default now(),
  unique (org_id, version)
);

create index dpa_signatures_signed_by on app.dpa_signatures (signed_by);
create index dpa_signatures_version on app.dpa_signatures (version);

alter table app.dpa_signatures enable row level security;
-- every member of the organisation may see that, and by whom, the agreement is signed
create policy dpa_signatures_read on app.dpa_signatures for select to authenticated
  using (app.is_org_member(org_id));
grant select on app.dpa_signatures to authenticated;
-- no insert, update or delete policy and no such grant: the one write path is sign_dpa

-- "Nobody may change this content", written so the database's own FK maintenance still works
-- (CLAUDE.md, "Immutability triggers must permit referential maintenance").
create function app.dpa_signatures_fixed() returns trigger
  language plpgsql set search_path = ''
as $fn$
begin
  if tg_op = 'DELETE' then
    -- only as the organisation's own deletion cascades: by then its row is gone
    if exists (select 1 from app.organizations o where o.id = old.org_id) then
      raise exception 'a signed agreement cannot be deleted';
    end if;
    return old;
  end if;

  -- UPDATE: only signed_by may change, and only to null (the signer's profile deleted)
  if (new.id, new.org_id, new.version, new.text_sha256, new.signer_name, new.signer_title, new.signed_at)
       is distinct from (old.id, old.org_id, old.version, old.text_sha256, old.signer_name, old.signer_title, old.signed_at)
     or (new.signed_by is not null and new.signed_by is distinct from old.signed_by) then
    raise exception 'a signed agreement cannot be changed';
  end if;
  return new;
end $fn$;

create trigger dpa_signatures_fixed before update or delete on app.dpa_signatures
  for each row execute function app.dpa_signatures_fixed();

-- ---------------------------------------------------------------- sign_dpa
-- A daglig leder signs the current version for their organisation, in their own name and title.
create function public.sign_dpa(p_org uuid, p_version text, p_name text, p_title text) returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
declare
  v_current text;
  v_sha text;
  v_at timestamptz;
begin
  if p_org is null or not app.has_role(p_org, array['daglig_leder']::app.org_role[]) then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;

  select v.version, v.text_sha256 into v_current, v_sha
  from app.dpa_versions v order by v.published_on desc, v.version desc limit 1;
  if p_version is distinct from v_current then
    return jsonb_build_object('ok', false, 'error', 'not_current');
  end if;

  if char_length(btrim(coalesce(p_name, ''))) not between 2 and 120
     or char_length(btrim(coalesce(p_title, ''))) not between 2 and 120 then
    return jsonb_build_object('ok', false, 'error', 'invalid_signer');
  end if;

  insert into app.dpa_signatures (org_id, version, text_sha256, signed_by, signer_name, signer_title)
  values (p_org, v_current, v_sha, auth.uid(), btrim(p_name), btrim(p_title))
  on conflict (org_id, version) do nothing
  returning signed_at into v_at;

  if v_at is null then
    return jsonb_build_object('ok', false, 'error', 'already_signed');
  end if;
  return jsonb_build_object('ok', true, 'signed_at', v_at);
end $fn$;

revoke all on function public.sign_dpa(uuid, text, text, text) from public, anon;
grant execute on function public.sign_dpa(uuid, text, text, text) to authenticated;
revoke all on function app.dpa_signatures_fixed() from public, anon, authenticated;
revoke all on function app.dpa_versions_fixed() from public, anon, authenticated;
