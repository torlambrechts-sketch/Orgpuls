-- crm_designed_mail_invariants.sql — designed campaign mail (0113, X-092), proved against the live schema.
--
--   * the five designed blocks are accepted, and each one's limits hold: at most three figures, four
--     features, five steps; a picture only on a hero or an article, on https, with alt text; a hero
--     and a closing band need a headline, a band a link (1)
--   * every template passes the block rules, the table refuses one that does not, and the gallery
--     has all five categories (2)
--   * a campaign started from a template with [placeholders] cannot be scheduled — a test to oneself
--     still goes — and can be once they are filled in; a [placeholder] in the preheader or a
--     button's text stops it too (3)
--   * nothing written here survives (4)
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/crm_designed_mail_invariants.sql

create unlogged table if not exists public._cdm(seq int, name text, expected text, actual text, pass bool);
truncate public._cdm;

do $$
declare
  v_mkt  uuid := '00000000-0000-4000-8000-0000000c7301';
  v_list uuid := (select id from app.crm_lists where key = 'nyhetsbrev');
  v_id   uuid;
  v_json jsonb;
  v_txt  text;
  v_rows jsonb := '[]';
  ok     constant jsonb := '[{"type":"hero","title":"H","text":"L","url":"https://www.orgpuls.com/","label":"Go","image":"https://www.orgpuls.com/og.png","alt":"A picture"},
                             {"type":"features","title":"F","text":"A | a\nB | b\nC | c\nD | d"},
                             {"type":"steps","text":"1 | a\n2 | b\n3 | c\n4 | d\n5 | e"},
                             {"type":"stats","text":"5 | x\n15 | y\n1 | z"},
                             {"type":"cta","title":"C","url":"https://www.orgpuls.com/registrer","label":"Start"},
                             {"type":"article","title":"T","url":"https://www.orgpuls.com/","image":"https://www.orgpuls.com/og.png","alt":"Alt"}]';
  filled constant jsonb := '[{"type":"hero","title":"Slik fikk Probe AS høyere svarprosent","text":"Et lite byggfirma med tretti ansatte.","url":"https://www.orgpuls.com/","label":"Les historien"},
                             {"type":"stats","text":"82 % | svarte i første runde"},
                             {"type":"cta","title":"Vil dere få det samme til?","url":"https://www.orgpuls.com/registrer","label":"Kom i gang"}]';
  claims constant text := '{"sub":"%s","role":"authenticated","aal":"aal2"}';
begin
  -- 1 ---------------------------------------------------------------- the designed blocks and their limits
  v_txt := concat_ws(',',
    app.crm_blocks_ok(ok)::text,
    app.crm_blocks_ok('[{"type":"stats","text":"1 | a\n2 | b\n3 | c\n4 | d"}]')::text,
    app.crm_blocks_ok('[{"type":"features","text":"a\nb\nc\nd\ne"}]')::text,
    app.crm_blocks_ok('[{"type":"steps","text":"a\nb\nc\nd\ne\nf"}]')::text,
    app.crm_blocks_ok('[{"type":"hero","title":"H","image":"https://www.orgpuls.com/og.png"}]')::text,
    app.crm_blocks_ok('[{"type":"heading","text":"H","image":"https://www.orgpuls.com/og.png","alt":"A"}]')::text,
    app.crm_blocks_ok('[{"type":"hero","title":"H","image":"http://www.orgpuls.com/og.png","alt":"A"}]')::text,
    app.crm_blocks_ok('[{"type":"hero","text":"no headline"}]')::text,
    app.crm_blocks_ok('[{"type":"cta","title":"No link"}]')::text);
  v_rows := v_rows || jsonb_build_object('seq', 1, 'name', 'the designed blocks pass; too many tiles, a bare or misplaced picture, a missing headline or link do not',
    'expected', 'true,false,false,false,false,false,false,false,false', 'actual', v_txt,
    'pass', v_txt = 'true,false,false,false,false,false,false,false,false');

  -- 2 ---------------------------------------------------------------- the templates
  v_txt := concat_ws('|',
    (select count(*) from app.crm_templates)::text,
    (select count(*) filter (where not app.crm_blocks_ok(blocks)) from app.crm_templates)::text,
    (select string_agg(distinct category, ',' order by category) from app.crm_templates));
  begin
    update app.crm_templates set blocks = '[{"type":"stats","text":"a\nb\nc\nd"}]' where key = 'nyhetsbrev';
    v_txt := v_txt || '|accepted';
  exception when check_violation then
    v_txt := v_txt || '|refused';
  end;
  v_rows := v_rows || jsonb_build_object('seq', 2, 'name', 'ten templates, all valid, five categories; the table refuses invalid blocks',
    'expected', '10|0|customer,event,newsletter,product,sales|refused', 'actual', v_txt,
    'pass', v_txt = '10|0|customer,event,newsletter,product,sales|refused');

  begin
    insert into auth.users (id, email) values (v_mkt, 'marketing@cdm-test.example');
    insert into app.platform_admins (user_id, role) values (v_mkt, 'marketing');
    perform set_config('request.jwt.claims', format(claims, v_mkt), true);

    -- 3 -------------------------------------------------------------- no placeholder reaches an inbox
    v_json := public.admin_crm_campaign_save(null, jsonb_build_object('name', 'Probe kundehistorie', 'template_key', 'kundehistorie', 'lang', 'no',
                                                                    'list_id', v_list));
    v_id := (v_json->>'id')::uuid;
    v_txt := concat_ws(',',
      public.admin_crm_campaign_schedule(v_id, now() + interval '1 hour')->>'error',
      public.admin_crm_campaign_test(v_id)->>'ok');
    -- filled in: the subject, the preheader and the blocks
    perform public.admin_crm_campaign_save(v_id, jsonb_build_object('name', 'Probe kundehistorie', 'subject', 'Slik fikk Probe AS høyere svarprosent',
                                                                    'preheader', 'Tretti ansatte, én runde, 82 prosent svar', 'blocks', filled));
    v_txt := concat_ws(',', v_txt, public.admin_crm_campaign_schedule(v_id, now() + interval '1 hour')->>'ok');
    update app.crm_campaigns set status = 'draft', scheduled_at = null where id = v_id;
    -- a placeholder in the preheader alone, then in a button's text alone
    perform public.admin_crm_campaign_save(v_id, jsonb_build_object('name', 'Probe kundehistorie', 'preheader', 'Gjelder til [frist]'));
    v_txt := concat_ws(',', v_txt, public.admin_crm_campaign_schedule(v_id, now() + interval '1 hour')->>'error');
    perform public.admin_crm_campaign_save(v_id, jsonb_build_object('name', 'Probe kundehistorie', 'preheader', 'Tretti ansatte',
      'blocks', filled || '[{"type":"button","text":"[knappetekst]","url":"https://www.orgpuls.com/"}]'::jsonb));
    v_txt := concat_ws(',', v_txt, public.admin_crm_campaign_schedule(v_id, now() + interval '1 hour')->>'error');
    perform set_config('request.jwt.claims', '', true);
    v_rows := v_rows || jsonb_build_object('seq', 3,
      'name', 'placeholders stop scheduling (not a test); filled in, it schedules; one in the preheader or a button stops it again',
      'expected', 'placeholder_left,true,true,placeholder_left,placeholder_left', 'actual', v_txt,
      'pass', v_txt = 'placeholder_left,true,true,placeholder_left,placeholder_left');

    raise exception 'rollback' using errcode = 'P0001';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'rollback' then raise; end if;
  end;

  -- 4 ---------------------------------------------------------------- nothing left
  select count(*)::text into v_txt from (
    select id::text from app.crm_campaigns where name like 'Probe %'
    union all select id::text from auth.users where id = v_mkt) x;
  v_txt := v_txt || '|' || (select app.crm_blocks_ok(blocks)::text from app.crm_templates where key = 'nyhetsbrev');
  v_rows := v_rows || jsonb_build_object('seq', 4, 'name', 'every probe row was rolled back, the templates as they were',
    'expected', '0|true', 'actual', v_txt, 'pass', v_txt = '0|true');

  insert into public._cdm
  select (r->>'seq')::int, r->>'name', r->>'expected', r->>'actual', (r->>'pass')::boolean from jsonb_array_elements(v_rows) r;
end $$;

select seq, name, expected, actual, pass from public._cdm order by seq;

do $$
declare v_failed text; v_count int;
begin
  select string_agg(seq || ' ' || name, '; ' order by seq) filter (where pass is not true), count(*) into v_failed, v_count from public._cdm;
  if v_failed is not null then raise exception 'crm designed mail invariants failed: %', v_failed; end if;
  if v_count <> 4 then raise exception 'crm designed mail invariants: expected 4 rows, got %', v_count; end if;
end $$;

drop table public._cdm;
