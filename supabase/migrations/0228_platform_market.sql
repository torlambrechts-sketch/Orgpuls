-- 0228_platform_market.sql — the platform learns each organisation's market (UK-F3, D-274).
--
-- The invoice is made on the platform, from what Orgpuls tells it (0205, 0207) and its organisation
-- view (app.op_org_get, 0206). None of it named the market. A UK organisation on Small/month would
-- have read as Norway's NOK 265 with Norwegian VAT; it is £25 with the reverse charge (X-113,
-- lib/site/pricing.ts). The billing row's VAT number already reaches the platform (to_jsonb(b) in
-- op_org_get); the market did not. Now:
--
--   * org.created and billing.changed carry `market`, registered in app.platform_event_kinds first,
--     since app.platform_emit refuses a field the kind does not list;
--   * the triggers and orgs.resync send it;
--   * app.op_org_get and app.op_orgs_list return it.
--
-- The market is the organisation's own column, never personal data. The functions are patched in
-- place, as 0202 patched admin_org_detail, so a definition that has moved on hosted is not overwritten:
-- each patch checks the text it replaces and stops if it is not there.

update app.platform_event_kinds set fields = fields || array['market']
where kind in ('org.created', 'billing.changed') and not ('market' = any (fields));

do $$
declare
  r record;
  v_def text;
begin
  for r in select * from (values
    -- a new organisation, as the trigger tells it
    ('app.platform_on_org()',
     $a$'industry', new.industry_key, 'created_at', new.created_at))$a$,
     $a$'industry', new.industry_key, 'created_at', new.created_at, 'market', new.market))$a$),
    -- the subscription, as the trigger tells it
    ('app.platform_on_billing()',
     $a$'cancel_effective_at', new.cancel_effective_at, 'deletion_due_at', new.deletion_due_at));$a$,
     $a$'cancel_effective_at', new.cancel_effective_at, 'deletion_due_at', new.deletion_due_at,
    'market', (select o.market from app.organizations o where o.id = new.org_id)));$a$),
    -- orgs.resync tells both again
    ('app.op_platform_resync(uuid)',
     $a$'industry', r.industry_key, 'created_at', r.created_at));$a$,
     $a$'industry', r.industry_key, 'created_at', r.created_at, 'market', r.market));$a$),
    ('app.op_platform_resync(uuid)',
     $a$'cancelled_at', b.cancelled_at, 'cancel_effective_at', b.cancel_effective_at, 'deletion_due_at', b.deletion_due_at))$a$,
     $a$'cancelled_at', b.cancelled_at, 'cancel_effective_at', b.cancel_effective_at, 'deletion_due_at', b.deletion_due_at,
      'market', r.market))$a$),
    -- the platform's two reads
    ('app.op_org_get(uuid)',
     $a$'id', o.id, 'name', o.name, 'org_number', o.org_number,$a$,
     $a$'id', o.id, 'name', o.name, 'market', o.market, 'org_number', o.org_number,$a$),
    ('app.op_orgs_list(text,integer)',
     $a$select o.id, o.name, o.org_number,$a$,
     $a$select o.id, o.name, o.market, o.org_number,$a$)
  ) as t(fn, old_text, new_text) loop
    v_def := pg_get_functiondef(r.fn::regprocedure);
    if position(r.old_text in v_def) = 0 then
      raise exception '0228: % does not hold «%»; read its definition and write this by hand', r.fn, r.old_text;
    end if;
    execute replace(v_def, r.old_text, r.new_text);
  end loop;
end $$;
