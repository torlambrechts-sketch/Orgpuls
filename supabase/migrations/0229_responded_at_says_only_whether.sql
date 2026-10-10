-- 0229_responded_at_says_only_whether.sql — an invitation records that the employee answered, not when
-- (D-274).
--
-- app.responses carries a group and the hour, never a person (CLAUDE.md, invariant 2). The invitation
-- carries the person, and submit_response stamped it with the exact moment of the answer
-- (`responded_at = now()`, 0003 onwards). No client reads invitations (0042), so no customer could
-- join the two. But anyone with access to the database itself could: a response in group G at hour H
-- belongs to whoever in G has an invitation answered in hour H, and in a small group that is often one
-- person. Found by the review of the UK data processing agreement, which says the time of an answer is
-- kept only to the hour.
--
-- Nothing reads the time. Every reader asks whether the column is null (wheel_tick, participation,
-- dispatch_claim, org_unlocked, respond_locales, respond_form, round_page, queue_final_reminders,
-- send_round_reminder, reminder_status, submit_response itself). So the stamp becomes the round's
-- opening, the same for everyone the round invited: it still says «answered», and nothing about when.
-- Rows already stamped are set the same way.
--
-- What is left, and coarser: a reminder the dispatcher skipped because the person had answered says
-- the answer came before that reminder was due (days, not hours).
--
-- submit_response is patched in place, as 0202 patched admin_org_detail, so a definition that has moved
-- on is not overwritten: the patch checks the line it replaces.

do $$
declare
  v_def text := pg_get_functiondef('public.submit_response(text,jsonb,jsonb,jsonb,jsonb,boolean)'::regprocedure);
  v_old constant text := 'update app.invitations set responded_at = now() where id = v_inv.id;';
  v_new constant text := 'update app.invitations i set responded_at = coalesce((select r.opens_at from app.rounds r where r.id = i.round_id), i.sent_at, date_trunc(''day'', now())) where i.id = v_inv.id;';
begin
  if position(v_old in v_def) = 0 then
    raise exception '0229: submit_response does not hold «%»; read its definition and write this by hand', v_old;
  end if;
  execute replace(v_def, v_old, v_new);
end $$;

update app.invitations i
   set responded_at = coalesce(r.opens_at, i.sent_at, date_trunc('day', i.responded_at))
  from app.rounds r
 where r.id = i.round_id
   and i.responded_at is not null
   and i.responded_at is distinct from coalesce(r.opens_at, i.sent_at, date_trunc('day', i.responded_at));

comment on column app.invitations.responded_at is
  'That the employee answered (0229): set to the round''s opening, the same for everyone it invited, so it says whether and never when. Readers test it for null only.';
