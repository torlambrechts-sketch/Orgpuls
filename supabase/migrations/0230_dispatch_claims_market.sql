-- 0230_dispatch_claims_market.sql — the last two mail claims name the organisation's market (UK-G, D-275).
--
-- Since Empvibe's site opened, a notice to an organisation in the United Kingdom links to
-- www.empvibe.com, goes out under Empvibe's name and from its SMS sender, and states the UK's words
-- (supabase/functions/_shared/mail.ts appUrlOf, senderFor, smsSenderOf, marketCatalogue). The
-- dispatcher reads the market from each claim. dispatch_claim and lifecycle_mail_claim carry it since
-- 0219; two did not:
--
--   * dispatch_test_claim (0127), «Send test til meg»: the invitation as it will read, to the managing
--     director's own address. Without the market a UK leader's test read as Norway's, under Orgpuls's
--     name, linking to www.orgpuls.com.
--   * reply_notice_claim (0204, X-103): the notice to a person who asked to be told when management
--     answers. It already hands over the organisation's name; the market adds nothing that could
--     identify anyone (three values, the organisation's own column). The seal, the recipients table
--     and who reads it are unchanged.
--
-- Patched in place, as 0228 patched its functions, so a definition that has moved on hosted stops
-- the migration rather than being overwritten.

do $$
declare
  r record;
  v_def text;
begin
  for r in select * from (values
    ('public.dispatch_test_claim(integer)',
     $a$'round_id', c.round_id,$a$,
     $a$'round_id', c.round_id,
           'market', (select o.market from app.rounds rr join app.organizations o on o.id = rr.org_id where rr.id = c.round_id),$a$),
    ('public.reply_notice_claim(integer)',
     $a$'org', v_o.name,$a$,
     $a$'org', v_o.name,
      'market', v_o.market,$a$)
  ) as t(fn, old_text, new_text) loop
    v_def := pg_get_functiondef(r.fn::regprocedure);
    if position(r.old_text in v_def) = 0 then
      raise exception '0230: % does not hold «%»; read its definition and write this by hand', r.fn, r.old_text;
    end if;
    execute replace(v_def, r.old_text, r.new_text);
  end loop;
end $$;
