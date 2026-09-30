-- 0132_ticket_holidays.sql — Norwegian public holidays in the business-hours calendar (D-92, D-174).
--
-- 0051 counts a ticket's first-response and resolution deadlines in business hours, Monday to
-- Friday 08:00–16:00 Oslo time, and said public holidays were not subtracted. A request filed on
-- the Wednesday before Easter was therefore "due" on Skjærtorsdag, when nobody is at work, and
-- showed as overdue on the Tuesday after. This makes the public holidays days off like a weekend.
--
--   * app.no_public_holiday(date) is true on the Norwegian public holidays (helligdager, lov om
--     helligdager og helligdagsfred § 1, and 1 and 17 May, lov om 1. og 17. mai som høgtidsdager):
--       - fixed: 1 January, 1 May, 17 May, 25 and 26 December;
--       - movable, from Easter Sunday: Skjærtorsdag (−3), Langfredag (−2), 1. påskedag (0),
--         2. påskedag (+1), Kristi himmelfartsdag (+39), 1. pinsedag (+49), 2. pinsedag (+50).
--     Easter Sunday is the Gregorian computus (the anonymous algorithm, Meeus, Astronomical
--     Algorithms ch. 8). Christmas Eve and New Year's Eve are not public holidays and stay
--     working days. The function is pure arithmetic on the date: immutable, no table.
--   * app.add_business_hours keeps its signature and semantics and skips a holiday the way it
--     skips a Saturday: the clock resumes at 08:00 on the next working day.
--
-- Deadlines already stored are left as they were set: the trigger recomputes them only when the
-- priority changes, and this migration rewrites no ticket.

create function app.no_public_holiday(p_day date) returns boolean
  language plpgsql immutable strict set search_path = ''
as $fn$
declare
  y int := extract(year from p_day)::int;
  a int; b int; c int; d int; e int; f int; g int; h int; i int; k int; l int; m int;
  easter date;
begin
  if (extract(month from p_day), extract(day from p_day)) in ((1, 1), (5, 1), (5, 17), (12, 25), (12, 26)) then
    return true;
  end if;
  a := y % 19;
  b := y / 100;
  c := y % 100;
  d := b / 4;
  e := b % 4;
  f := (b + 8) / 25;
  g := (b - f + 1) / 3;
  h := (19 * a + b - d - g + 15) % 30;
  i := c / 4;
  k := c % 4;
  l := (32 + 2 * e + 2 * i - h - k) % 7;
  m := (a + 11 * h + 22 * l) / 451;
  easter := make_date(y, (h + l - 7 * m + 114) / 31, (h + l - 7 * m + 114) % 31 + 1);
  return p_day - easter in (-3, -2, 0, 1, 39, 49, 50);
end $fn$;

comment on function app.no_public_holiday(date) is
  'True on a Norwegian public holiday: 1 Jan, 1 May, 17 May, 25–26 Dec, and Skjærtorsdag, Langfredag, 1. and 2. påskedag, Kristi himmelfartsdag, 1. and 2. pinsedag (Gregorian computus). Read by app.add_business_hours.';

revoke all on function app.no_public_holiday(date) from public, anon, authenticated;

-- p_hours of working time after p_from: Monday–Friday, 08:00–16:00 in Oslo, public holidays off.
create or replace function app.add_business_hours(p_from timestamptz, p_hours numeric) returns timestamptz
  language plpgsql stable set search_path = ''
as $fn$
declare
  t timestamp := p_from at time zone 'Europe/Oslo';
  left_min numeric := greatest(p_hours, 0) * 60;
  avail numeric;
begin
  loop
    -- a weekend or a public holiday: the clock resumes at 08:00 the next day, checked again
    if extract(isodow from t) >= 6 or app.no_public_holiday(t::date) then
      t := date_trunc('day', t) + interval '1 day 8 hours';
      continue;
    end if;
    if t::time < time '08:00' then
      t := date_trunc('day', t) + interval '8 hours';
    elsif t::time >= time '16:00' then
      t := date_trunc('day', t) + interval '1 day 8 hours';
      continue;
    end if;
    avail := extract(epoch from (date_trunc('day', t) + interval '16 hours') - t) / 60;
    if left_min <= avail then
      return (t + make_interval(secs => left_min * 60)) at time zone 'Europe/Oslo';
    end if;
    left_min := left_min - avail;
    t := date_trunc('day', t) + interval '1 day 8 hours';
  end loop;
end $fn$;
