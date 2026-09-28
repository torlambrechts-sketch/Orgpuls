#!/usr/bin/env python3
# Generates the audit probe: one transaction, rolled back. Every call is additionally undone
# on the spot (the DO block raises and catches), so each cell starts from the same state.
P = 'aa000000-0000-4000-8000-0000000000a1'
X = 'aa000000-0000-4000-8000-0000000000a2'
U = {
    'dl': 'aa000000-0000-4000-8000-00000000d001',
    'alA': 'aa000000-0000-4000-8000-00000000d002',
    'alB': 'aa000000-0000-4000-8000-00000000d003',
    'vo': 'aa000000-0000-4000-8000-00000000d004',
    'dlX': 'aa000000-0000-4000-8000-00000000d005',
}
GA = 'aa000000-0000-4000-8000-00000000ga01'.replace('ga', 'aa')
GB = 'aa000000-0000-4000-8000-00000000bb01'
GA = 'aa000000-0000-4000-8000-00000000aa01'
R_prev = 'aa000000-0000-4000-8000-00000000f001'
R_c = 'aa000000-0000-4000-8000-00000000f002'
R_o = 'aa000000-0000-4000-8000-00000000f003'
R_p = 'aa000000-0000-4000-8000-00000000f004'
R_x = 'aa000000-0000-4000-8000-00000000f005'
TOK = 'audit-probe-token-0123456789abcdef'
LOGO_P = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1'
PNG_B64 = "encode('\\x89504e470d0a1a0a00000000'::bytea,'base64')"

out = []
w = out.append
w(r"""\set ON_ERROR_ROLLBACK on
\set ON_ERROR_STOP off
set client_min_messages = notice;
begin;
insert into app.organizations (id, name, org_number, employee_count, mail_enabled) values
 ('%(P)s','Audit P AS','999100001',20,true), ('%(X)s','Audit X AS','999100002',20,true);
insert into auth.users (id, email) values
 ('%(dl)s','dl@audit-p.example'),('%(alA)s','ala@audit-p.example'),('%(alB)s','alb@audit-p.example'),
 ('%(vo)s','vo@audit-p.example'),('%(dlX)s','dl@audit-x.example');
insert into app.profiles (id, full_name) values ('%(dl)s','Dina Audit'),('%(alA)s','Anne A'),('%(alB)s','Bjorn B'),('%(vo)s','Vera V'),('%(dlX)s','Xander X');
insert into app.groups (id, org_id, name) values ('%(GA)s','%(P)s','Gruppe A'),('%(GB)s','%(P)s','Gruppe B');
insert into app.memberships (org_id, user_id, role) values ('%(P)s','%(dl)s','daglig_leder'),('%(P)s','%(vo)s','verneombud'),('%(X)s','%(dlX)s','daglig_leder');
insert into app.memberships (org_id, user_id, role, group_id) values ('%(P)s','%(alA)s','avdelingsleder','%(GA)s'),('%(P)s','%(alB)s','avdelingsleder','%(GB)s');
insert into app.employees (org_id, group_id, full_name, email)
 select '%(P)s', case when i <= 4 then '%(GA)s'::uuid else '%(GB)s'::uuid end, 'Ansatt '||i, 'e'||i||'@audit-p.example' from generate_series(1,10) i;
insert into app.measurements (id, org_id, kind, year, label) values
 ('aa000000-0000-4000-8000-00000000e001','%(P)s','grunnlinje',2025,'G25'),
 ('aa000000-0000-4000-8000-00000000e002','%(P)s','grunnlinje',2026,'G26'),
 ('aa000000-0000-4000-8000-00000000e003','%(P)s','puls',2026,'P26'),
 ('aa000000-0000-4000-8000-00000000e004','%(X)s','puls',2026,'X26');
insert into app.rounds (id, org_id, measurement_id, status, opens_at, closes_at, frozen_at) values
 ('%(R_prev)s','%(P)s','aa000000-0000-4000-8000-00000000e001','lukket', now()-interval '130 days', now()-interval '120 days', now()-interval '120 days'),
 ('%(R_c)s','%(P)s','aa000000-0000-4000-8000-00000000e002','lukket', now()-interval '30 days', now()-interval '20 days', now()-interval '20 days');
insert into app.rounds (id, org_id, measurement_id, status, opens_at, closes_at) values
 ('%(R_o)s','%(P)s','aa000000-0000-4000-8000-00000000e003','apen', now()-interval '1 day', now()+interval '6 days'),
 ('%(R_p)s','%(P)s','aa000000-0000-4000-8000-00000000e003','planlagt', now()+interval '10 days', now()+interval '17 days'),
 ('%(R_x)s','%(X)s','aa000000-0000-4000-8000-00000000e004','planlagt', now()+interval '10 days', now()+interval '17 days');
insert into app.round_factors (org_id, round_id, factor_key) select '%(P)s', '%(R_c)s', key from app.factors on conflict do nothing;
insert into app.round_factors (org_id, round_id, factor_key) values ('%(P)s','%(R_o)s','ytring') on conflict do nothing;
-- round R_c: group A 4 respondents answer 1 everywhere, group B 5 respondents answer 5; each comments on ytring #1
do $$ declare i int; v uuid; g uuid; val int; begin
  for i in 1..9 loop
    g := case when i <= 4 then '%(GA)s'::uuid else '%(GB)s'::uuid end;
    val := case when i <= 4 then 1 else 5 end;
    insert into app.responses (org_id, round_id, group_id, submitted_hour)
      values ('%(P)s','%(R_c)s', g, date_trunc('hour', now()-interval '25 days')) returning id into v;
    insert into app.answers (response_id, factor_key, ordinal, value)
      select v, s.factor_key, s.ordinal, val from app.statements s;
    insert into app.response_comments (response_id, factor_key, ordinal, body)
      values (v, 'ytring', 1, case when i <= 4 then 'A-SECRET-COMMENT ' else 'B-comment ' end || i);
    insert into app.comment_threads (org_id, response_id, factor_key, ordinal, key_hash, opened_hour)
      values ('%(P)s', v, 'ytring', 1, extensions.digest('k'||i||gen_random_uuid(), 'sha256'), date_trunc('hour', now()-interval '25 days'));
  end loop;
end $$;
insert into app.invitations (org_id, round_id, employee_id, token_hash, expires_at, responded_at)
 select '%(P)s','%(R_c)s', e.id, extensions.digest('inv'||e.id, 'sha256'), now()-interval '20 days', now()-interval '25 days'
 from app.employees e where e.org_id='%(P)s' and e.full_name <> 'Ansatt 10';
insert into app.invitations (org_id, round_id, employee_id, token_hash, expires_at)
 select '%(P)s','%(R_o)s', e.id, extensions.digest('%(TOK)s', 'sha256'), now()+interval '6 days'
 from app.employees e where e.org_id='%(P)s' and e.full_name = 'Ansatt 10';
insert into app.measures (org_id, factor_key, title, step) values ('%(P)s','ytring','Audit tiltak hele huset','pagar');
insert into app.measures (org_id, round_id, factor_key, title, step) values ('%(P)s','%(R_c)s','ytring','Audit tiltak runde','pagar');
insert into app.year_wheels (id, org_id) values ('aa000000-0000-4000-8000-00000000cc01','%(P)s');
insert into app.wheel_notifications (wheel_id, audience, lead_days, sort_order) values ('aa000000-0000-4000-8000-00000000cc01','alle_ansatte',1,5);
insert into app.evaluations (org_id, held_on, note) values ('%(P)s', current_date - 10, 'P eval'), ('%(X)s', current_date - 10, 'X eval');
insert into app.org_logos (org_id, key, mime, content) values
 ('%(P)s','%(LOGO_P)s','image/png','\x89504e470d0a1a0a00'::bytea),
 ('%(X)s','aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa2','image/png','\x89504e470d0a1a0a01'::bytea);
select 'setup done', set_config('audit.slug', (select share_slug from app.rounds where id='%(R_c)s'), true), (select results_publish_on from app.rounds where id='%(R_c)s') as pub;
""" % dict(P=P, X=X, GA=GA, GB=GB, R_prev=R_prev, R_c=R_c, R_o=R_o, R_p=R_p, R_x=R_x, TOK=TOK, LOGO_P=LOGO_P, **U))


def as_(ident):
    if ident in ('anon', 'token'):
        return "reset role; select set_config('request.jwt.claims', '{\"role\":\"anon\"}', true) \\g /dev/null\nset local role anon;"
    if ident == 'pg':
        return "reset role;"
    return ("reset role; select set_config('request.jwt.claims', json_build_object('sub','%s','role','authenticated')::text, true) \\g /dev/null\nset local role authenticated;" % U[ident])


def cell(label, stmt, kind='expr', n=400):
    """kind expr: stmt is an expression; kind dml: stmt is a statement whose row count is reported."""
    if kind == 'expr':
        body = "msg := 'OK ' || coalesce(left((%s)::text, %d), 'null');" % (stmt, n)
    else:
        body = "%s; get diagnostics n = row_count; msg := 'OK rows=' || n;" % stmt
    return ("do $d$ declare n int; msg text; begin begin %s raise exception 'undo' using errcode = 'P0001'; "
            "exception when others then if sqlstate <> 'P0001' or sqlerrm <> 'undo' then msg := 'ERR ' || sqlstate || ' ' || left(sqlerrm, 80); end if; end; "
            "raise notice 'CELL|%%|%%', %s, msg; end $d$;" % (body, "'" + label.replace("'", "''") + "'"))


IDS = ['anon', 'token', 'alB', 'vo', 'dl', 'dlX']
calls = [
    ('set_round_send', "public.set_round_send('%s', 'Hei alle', null)" % R_p, 'expr'),
    ('set_round_send(publish)', "public.set_round_send('%s', null, (current_date + 20))" % R_p, 'expr'),
    ('round_send_preview', "public.round_send_preview('%s')" % R_p, 'expr'),
    ('evaluation_status', "public.evaluation_status('%s')" % P, 'expr'),
    ('set_org_logo', "public.set_org_logo('%s', %s)" % (P, PNG_B64), 'expr'),
    ('remove_org_logo', "public.remove_org_logo('%s')" % P, 'expr'),
    ('set_logo_in_header', "public.set_logo_in_header('%s', false)" % P, 'expr'),
    ('org_logo(key)', "public.org_logo('%s')" % LOGO_P, 'expr'),
    ('respond_form(token)', "public.respond_form('%s')" % TOK, 'expr'),
    ('round_page(slug)', "public.round_page(current_setting('audit.slug'))", 'expr'),
    ('dispatch_claim', "public.dispatch_claim(1)", 'expr'),
    ('evaluations select', "(select count(*) from app.evaluations where org_id='%s')" % P, 'expr'),
    ('evaluations insert', "insert into app.evaluations (org_id, held_on) values ('%s', current_date)" % P, 'dml'),
    ('evaluations delete', "delete from app.evaluations where org_id='%s'" % P, 'dml'),
    ('evaluations update', "update app.evaluations set note='x' where org_id='%s'" % P, 'dml'),
    ('org_logos select', "(select count(*) from app.org_logos where org_id='%s')" % P, 'expr'),
    ('org_logos update', "update app.org_logos set in_header=false where org_id='%s'" % P, 'dml'),
    ('org_logos insert', "insert into app.org_logos (org_id,key,mime,content) values ('%s','bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb','image/png','\\x89'::bytea) on conflict do nothing" % P, 'dml'),
    ('org_logos delete', "delete from app.org_logos where org_id='%s'" % P, 'dml'),
    ('measure_steps select', "(select count(*) from app.measure_steps)", 'expr'),
    ('rounds.intro_message update', "update app.rounds set intro_message='direct' where id='%s'" % R_p, 'dml'),
    ('rounds.intro_by update', "update app.rounds set intro_by=null where id='%s'" % R_p, 'dml'),
    ('rounds.results_publish_on update', "update app.rounds set results_publish_on=current_date+400 where id='%s'" % R_p, 'dml'),
    ('rounds.closes_at update', "update app.rounds set closes_at=now()+interval '30 days' where id='%s'" % R_p, 'dml'),
]
for ident in IDS:
    w('\\echo === as %s' % ident)
    w(as_(ident))
    for label, stmt, kind in calls:
        if ident == 'dlX' and label.startswith('set_round_send'):
            pass
        w(cell('%s|%s' % (ident, label), stmt, kind))
    if ident == 'dlX':
        # cross-org control: dlX on its own org works
        w(cell('dlX|evaluation_status(own X)', "public.evaluation_status('%s')" % X))
        w(cell('dlX|round_send_preview(own X)', "public.round_send_preview('%s')" % R_x))

# C: answer tables
for ident in ['anon', 'alB', 'vo', 'dl']:
    w(as_(ident))
    for t in ['responses', 'answers', 'extra_answers', 'response_comments', 'org_question_answers', 'measure_steps']:
        w(cell('C|%s|%s' % (ident, t), "(select count(*) from app.%s)" % t))

open('/tmp/claude-0/-home-user-Orgpuls/157f00ab-feea-59e0-b1d5-9fdf46208675/scratchpad/matrix.sql', 'w').write(
    '\n'.join(out) + '\nreset role;\nrollback;\n')
