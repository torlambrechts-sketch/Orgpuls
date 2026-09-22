-- 0009_extra_options.sql — the answer options for the questions outside the index.
--
-- Corrects 0007, which typed `krenkende` and `vold` as `yes_no_decline`,
-- on the strength of the Spørsmålssettet card's note ("Ja / nei / vil ikke svare"). The
-- respondent flow shows that is not what they ask (bundle lines 4118-4121):
--
--   krenkende  Nei · Ja, opplevd selv · Ja, sett andre bli utsatt · Vil ikke svare
--   vold       Nei · Ja, én gang · Ja, flere ganger · Vil ikke svare
--
-- Four options each, and not the same four. One enum value cannot express two different
-- option sets, so the options become rows: a question's choices are data, exactly like
-- the question. The note on the card is the design's own summary of the rule and is
-- transcribed verbatim; it is not a specification of the options.
--
-- `kind` becomes text with a check rather than gaining enum values, because an enum
-- cannot have a value removed and 'yes_no_decline' describes nothing that exists:
--   scale      an ordered agreement or likelihood scale, reported as a number
--   choice     unordered categories, reported only as counts
--   free_text  no options
--
-- The distinction is not cosmetic. A scale may be averaged; a choice may not, and
-- 'Vil ikke svare' is not a low score on anything. Aggregation keys off this.
--
-- Labels live in i18n under extra.<key>.o<ordinal>, as everywhere else.

alter table app.extra_questions alter column kind type text using kind::text;
drop type app.extra_kind;

update app.extra_questions set kind = 'scale'  where kind = 'scale_1_5';
update app.extra_questions set kind = 'choice' where kind = 'yes_no_decline';

alter table app.extra_questions
  add constraint extra_kind_known check (kind in ('scale', 'choice', 'free_text'));

create table app.extra_options (
  extra_key text not null references app.extra_questions (key) on delete cascade,
  ordinal   int  not null check (ordinal between 1 and 9),
  primary key (extra_key, ordinal)
);

alter table app.extra_options enable row level security;

-- reference data, like app.factors: a respondent answering through a token must be
-- able to read the options they are choosing between
create policy extra_option_read on app.extra_options
  for select to authenticated, anon using (true);

grant select on app.extra_options to authenticated, anon;

-- a free_text question has no options, and a question with options is not free_text
create or replace function app.check_extra_options() returns trigger
  language plpgsql security definer set search_path = ''
as $$
begin
  if exists (
    select 1 from app.extra_questions q
    where q.key = new.extra_key and q.kind = 'free_text'
  ) then
    raise exception 'free_text question % cannot have options', new.extra_key;
  end if;
  return new;
end $$;

create trigger extra_options_kind_guard
  before insert or update on app.extra_options
  for each row execute function app.check_extra_options();

insert into app.extra_options (extra_key, ordinal)
select q.key, o.ordinal
from (values ('anbefaling', 5), ('krenkende', 4), ('vold', 4)) as q(key, n)
cross join lateral generate_series(1, q.n) as o(ordinal);
