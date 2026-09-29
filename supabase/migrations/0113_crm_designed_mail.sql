-- 0113 — designed campaign mail: new blocks, a template library, and no placeholder left behind (X-092)
--
-- The branded layout is redrawn for how mail programs render (supabase/functions/_shared/mail.ts):
-- tables, live text, a dark palette and columns that stack on a phone. Five blocks join the ten:
--
--   hero       the opening panel: a headline, a lead and one button (optionally a picture above)
--   features   two to four «title | text» lines, drawn in two columns
--   steps      numbered «title | text» lines
--   stats      up to three «figure | what it measures» tiles
--   cta        a dark band with a headline, a line and one button
--
-- and a hero or an article may carry a picture (`image`, https). The templates are the designed
-- starting points, grouped by what they are for (`category`). Where a template needs a fact only
-- the author has — a date, a customer's own words, a figure — it says so in square brackets, and
-- a campaign cannot be scheduled while any [placeholder] is left in its subject, preheader or
-- blocks: an invented date or quote must never reach an inbox. A test to oneself still goes.

-- ---------------------------------------------------------------- blocks
create or replace function app.crm_blocks_ok(b jsonb) returns boolean
  language sql immutable set search_path = ''
as $fn$
  select jsonb_typeof(b) = 'array' and jsonb_array_length(b) between 1 and 30
    and not exists (
      select 1 from jsonb_array_elements(b) x
      where jsonb_typeof(x) <> 'object'
         or (select count(*) from jsonb_object_keys(x) k where k not in ('type', 'text', 'url', 'title', 'label', 'alt', 'href', 'image')) > 0
         or coalesce(x->>'type', '') not in ('heading', 'text', 'button', 'article', 'bullets', 'image', 'divider', 'quote', 'event', 'ps',
                                             'hero', 'features', 'steps', 'stats', 'cta')
         or char_length(coalesce(x->>'text', '')) > 3000
         or char_length(coalesce(x->>'title', '')) > 150
         or char_length(coalesce(x->>'label', '')) > 60
         or char_length(coalesce(x->>'alt', '')) > 150
         or (x ? 'url' and (char_length(x->>'url') > 500 or (x->>'url') !~ '^https://[^\s<>"]{3,}$'))
         or (x ? 'href' and (char_length(x->>'href') > 500 or (x->>'href') !~ '^https://[^\s<>"]{3,}$'))
         or (x ? 'image' and (char_length(x->>'image') > 500 or (x->>'image') !~ '^https://[^\s<>"]{3,}$'))
         -- a picture always says what it shows
         or (x ? 'image' and char_length(btrim(coalesce(x->>'alt', ''))) = 0)
         or (x ? 'image' and (x->>'type') not in ('hero', 'article'))
         -- what each kind needs
         or ((x->>'type') in ('heading', 'text', 'bullets', 'quote', 'ps', 'features', 'steps', 'stats') and char_length(btrim(coalesce(x->>'text', ''))) = 0)
         or ((x->>'type') = 'heading' and char_length(x->>'text') > 150)
         or ((x->>'type') = 'button' and (char_length(btrim(coalesce(x->>'text', ''))) not between 1 and 60 or not x ? 'url'))
         or ((x->>'type') = 'article' and (char_length(btrim(coalesce(x->>'title', ''))) = 0 or not x ? 'url'))
         or ((x->>'type') in ('event', 'hero', 'cta') and char_length(btrim(coalesce(x->>'title', ''))) = 0)
         or ((x->>'type') = 'cta' and not x ? 'url')
         or ((x->>'type') = 'image' and (not x ? 'url' or char_length(btrim(coalesce(x->>'alt', ''))) = 0))
         -- stats: at most three tiles; features at most four; steps at most five
         or ((x->>'type') = 'stats' and (select count(*) from regexp_split_to_table(btrim(x->>'text'), '\n') l where btrim(l) <> '') > 3)
         or ((x->>'type') = 'features' and (select count(*) from regexp_split_to_table(btrim(x->>'text'), '\n') l where btrim(l) <> '') > 4)
         or ((x->>'type') = 'steps' and (select count(*) from regexp_split_to_table(btrim(x->>'text'), '\n') l where btrim(l) <> '') > 5))
$fn$;

-- ---------------------------------------------------------------- a [placeholder] still in the text
create or replace function app.crm_placeholder_left(c app.crm_campaigns) returns boolean
  language sql immutable set search_path = ''
as $fn$
  select concat_ws(E'\n', c.subject, c.subject_b, c.preheader,
           (select string_agg(concat_ws(E'\n', x->>'text', x->>'title', x->>'label', x->>'alt'), E'\n') from jsonb_array_elements(c.blocks) x))
         ~ '\[[^][\n]{1,80}\]'
$fn$;

create or replace function app.crm_campaign_ready(c app.crm_campaigns) returns text
  language sql stable set search_path = ''
as $fn$
  select case
    when char_length(btrim(c.subject)) = 0 then 'no_subject'
    when not app.crm_blocks_ok(c.blocks) then 'invalid_blocks'
    when app.crm_placeholder_left(c) then 'placeholder_left'
    when c.segment_id is null and c.list_id is null and c.stage_target is null and c.follows_id is null then 'no_segment'
    when c.publish_web and c.slug is null then 'no_slug'
    when c.follows_id is not null and not exists (select 1 from app.crm_campaigns p where p.id = c.follows_id
           and (p.status in ('sending', 'sent') or (c.follow_auto and p.status = 'scheduled'))) then 'follows_unsent'
    when c.follow_auto and btrim(c.subject_b) <> '' then 'auto_no_ab'
  end
$fn$;

-- ---------------------------------------------------------------- the template library
alter table app.crm_templates
  add column category text not null default 'newsletter'
    check (category in ('newsletter', 'product', 'event', 'sales', 'customer'));
comment on column app.crm_templates.category is 'What the template is for (0113): the template gallery groups by it.';
alter table app.crm_templates add constraint crm_templates_blocks_ok check (app.crm_blocks_ok(blocks));

-- the six from 0056, redrawn with the new blocks; the invented quote and date become placeholders
update app.crm_templates t set category = v.category, name = v.name, description = v.description, subject = v.subject,
  preheader = v.preheader, blocks = v.blocks::jsonb, sort = v.sort
from (values
('nyhetsbrev', 'newsletter', 'Månedlig nyhetsbrev',
 'Én hovedsak øverst med én knapp, to korte saker som kort, og en mørk avslutning. For nyhetsbrevlisten.',
 'Tre ting om arbeidsmiljøet denne måneden', 'Høy svarprosent, hva Arbeidstilsynet ser etter, og verneombudets rolle',
 '[{"type":"hero","title":"Kartleggingen: slik får dere høy svarprosent","text":"Svarprosenten avgjør hva resultatet kan brukes til. Her er de tre grepene som gjør mest – og det ene de fleste glemmer.","url":"https://www.orgpuls.com/artikler","label":"Les de tre grepene"},
   {"type":"heading","text":"Også denne måneden"},
   {"type":"article","title":"Hva Arbeidstilsynet ser etter","text":"Kort om hva dokumentasjonen av det psykososiale arbeidsmiljøet må inneholde.","url":"https://www.orgpuls.com/lovkrav","label":"Les mer"},
   {"type":"article","title":"Verneombudets rolle","text":"Hvordan verneombudet kan følge kartleggingen uten å se enkeltsvar.","url":"https://www.orgpuls.com/verneombud","label":"Les mer"},
   {"type":"cta","title":"Klar for årets kartlegging?","text":"Prøv Orgpuls gratis i 15 dager – med hele spørsmålssettet og rapporten.","url":"https://www.orgpuls.com/registrer","label":"Kom i gang"},
   {"type":"ps","text":"Svar gjerne på denne e-posten hvis det er noe du vil vi skal skrive om."}]', 1),
('produktnytt', 'product', 'Produktnyhet',
 'Nyheten med nytten først, fire punkter i to kolonner og én knapp inn i produktet. For produktnyhetslisten og kunder.',
 'Nytt i Orgpuls: tiltaksplanen følger opp seg selv', 'Påminnelser til eierne og effektmåling uten ekstra arbeid',
 '[{"type":"hero","title":"Tiltaksplanen følger nå opp seg selv","text":"Tiltak som mangler oppfølging er det Arbeidstilsynet oftest peker på. Nå får eieren av hvert tiltak en påminnelse før fristen.","url":"https://www.orgpuls.com/plattform","label":"Se tiltaksplanen"},
   {"type":"features","title":"Dette er nytt","text":"Påminnelse før fristen | Eieren av tiltaket får beskjed en uke før.\nStatus i årshjulet | Se hva som er gjort og hva som gjenstår.\nEffekten måles | Neste puls viser om tiltaket virket.\nKlart for AMU | Oversikten er klar før møtet."},
   {"type":"quote","text":"[Sitat fra en kunde, med deres tillatelse]","title":"[Navn, rolle, virksomhet]"},
   {"type":"button","text":"Åpne Orgpuls","url":"https://www.orgpuls.com/plattform"}]', 2),
('arrangement', 'event', 'Invitasjon til webinar',
 'Tittel, tid og sted øverst, hva man lærer i tre punkter, og én påmeldingsknapp. For arrangementslisten.',
 'Webinar: risikovurdering på 30 minutter', '[Dag og dato] kl. [tid] – gratis, med opptak',
 '[{"type":"event","title":"Risikovurdering av det psykososiale arbeidsmiljøet","text":"[Dag og dato] kl. [tid]\nPå Teams – opptak sendes alle påmeldte","url":"https://www.orgpuls.com/kontakt","label":"Meld meg på"},
   {"type":"text","text":"På 30 minutter går vi gjennom hvordan dere går fra kartlegging til risikovurdering og tiltak – og hva som må dokumenteres."},
   {"type":"steps","title":"Dette lærer du","text":"Hva lovkravet faktisk krever | Arbeidsmiljøloven § 4-3, forklart uten jus.\nHvordan dere prioriterer tiltak | Fra resultat til en plan dere rekker.\nMaler dere kan bruke samme dag | Risikovurdering og tiltaksplan."},
   {"type":"button","text":"Meld meg på","url":"https://www.orgpuls.com/kontakt"}]', 3),
('tilbud', 'sales', 'Tilbud',
 'Tilbudet i overskriften, hva det gir i to kolonner, en tydelig frist og én knapp. For tilbudslisten.',
 'Kom i gang før [frist] – første måned gratis', 'Tilbudet gjelder til [frist]',
 '[{"type":"hero","title":"Første måned gratis når dere starter før [frist]","text":"Få årets kartlegging og risikovurdering på plass, uten å betale for den første måneden.","url":"https://www.orgpuls.com/registrer","label":"Kom i gang"},
   {"type":"features","text":"Hele spørsmålssettet | Og rapporten fra dag én.\nIngen binding | Og ingen kortopplysninger.\nHjelp til første utsending | Vi setter det opp sammen med dere.\nFull anonymitet | Ingen resultater vises for grupper under fem."},
   {"type":"ps","text":"Tilbudet gjelder nye kunder som registrerer seg innen [frist]."}]', 4),
('onboarding', 'customer', 'Kom i gang (prøveperiode)',
 'Tre nummererte steg for nye brukere i prøveperioden, med én knapp til første steg.',
 'Tre steg til første kartlegging', 'Det tar under en time',
 '[{"type":"hero","title":"Tre steg til første kartlegging","text":"Det tar under en time, og resten går av seg selv.","url":"https://www.orgpuls.com/oppsett?fane=ansatte","label":"Legg inn de ansatte"},
   {"type":"steps","text":"Legg inn de ansatte | Én og én, eller last opp en liste.\nVelg når kartleggingen går ut | Vi foreslår en uke som passer.\nGodkjenn utsendingen | Påminnelser og rapport kommer av seg selv."},
   {"type":"text","text":"Står du fast, svar på denne e-posten, så hjelper vi deg."}]', 5),
('forste-kontakt', 'sales', 'Første kontakt (bedrift)',
 'En kort, personlig e-post uten bilder og med én lenke: slik første kontakt med en ny bedrift bør se ut. Til bedriftens egen adresse.',
 'Kartleggingen av arbeidsmiljøet i {firma}', '',
 '[{"type":"text","text":"Hei,\n\nAlle virksomheter med ansatte skal kartlegge det psykososiale arbeidsmiljøet og dokumentere risikovurdering og tiltak. For mange tar det mye tid.\n\nOrgpuls gjør kartleggingen, rapporten og oppfølgingen for dere, med et forskningsbasert spørreskjema og full anonymitet for de ansatte."},
   {"type":"button","text":"Se hvordan det fungerer","url":"https://www.orgpuls.com/plattform"},
   {"type":"text","text":"Passer det med en prat på 15 minutter neste uke? Svar på denne e-posten, så finner vi et tidspunkt."},
   {"type":"ps","text":"Er ikke dette aktuelt, kan dere melde dere av med lenken under, så hører dere ikke mer fra oss."}]', 20)
) v(key, category, name, description, subject, preheader, blocks, sort)
where t.key = v.key;

insert into app.crm_templates (key, category, name, description, kind, style, subject, preheader, blocks, sort) values
('oppfolging', 'sales', 'Oppfølging etter en uke',
 'Tre setninger og ett spørsmål, som svar i samme tråd som første e-post. Brukes som automatisk oppfølging etter 7 dager.',
 'campaign', 'letter', 'Kartleggingen av arbeidsmiljøet i {firma}', '',
 '[{"type":"text","text":"Hei igjen,\n\nJeg skrev til dere forrige uke om kartleggingen av det psykososiale arbeidsmiljøet. Mange skyver den foran seg fordi den tar tid – det er akkurat den tiden Orgpuls sparer dere for."},
   {"type":"text","text":"Er det riktig person jeg skriver til, eller er det noen andre hos dere som har ansvaret?"},
   {"type":"ps","text":"Hører jeg ikke fra dere, skriver jeg ikke igjen."}]', 21),
('lovkrav', 'sales', 'Lovkravet (daglig leder)',
 'For daglige ledere i små og mellomstore bedrifter: hva loven krever, hva Orgpuls gjør, tre fakta og én knapp.',
 'campaign', 'branded', 'Har {firma} kartlagt arbeidsmiljøet i år?', 'Hva arbeidsmiljøloven § 4-3 krever – og hvordan dere får det gjort på en time',
 '[{"type":"hero","title":"Har dere kartlagt arbeidsmiljøet i år?","text":"Arbeidsmiljøloven krever at alle virksomheter med ansatte kartlegger det psykososiale arbeidsmiljøet, vurderer risikoen og følger opp med tiltak. Arbeidstilsynet ber om dokumentasjonen.","url":"https://www.orgpuls.com/lovkrav","label":"Se hva loven krever"},
   {"type":"steps","title":"Slik gjør Orgpuls det for dere","text":"De ansatte svarer anonymt | Et forskningsbasert spørreskjema, på mobilen.\nRapporten lager seg selv | Resultater, risikovurdering og forslag til tiltak.\nOppfølgingen går av seg selv | Påminnelser, årshjul og neste måling."},
   {"type":"stats","text":"5 | svar før noe resultat vises for en gruppe\n15 | dagers gratis prøveperiode"},
   {"type":"cta","title":"Prøv det på deres egen virksomhet","text":"Kom i gang på tre minutter med organisasjonsnummeret.","url":"https://www.orgpuls.com/registrer","label":"Start gratis prøveperiode"}]', 22),
('kundehistorie', 'customer', 'Kundehistorie',
 'Én kundes erfaring: utfordringen, hva de gjorde, tre tall og kundens egne ord. Tall og sitat fylles inn med kundens tillatelse.',
 'campaign', 'branded', 'Slik fikk [virksomhet] [resultat]', '[Én setning om hva som endret seg]',
 '[{"type":"hero","title":"Slik fikk [virksomhet] [resultat]","text":"[To setninger om utgangspunktet: hvem de er, og hva som var vanskelig.]","url":"https://www.orgpuls.com/","label":"Les hele historien"},
   {"type":"stats","title":"Etter første år","text":"[tall] | [hva tallet måler]\n[tall] | [hva tallet måler]\n[tall] | [hva tallet måler]"},
   {"type":"quote","text":"[Kundens egne ord, med tillatelse]","title":"[Navn, rolle, virksomhet]"},
   {"type":"cta","title":"Vil dere få det samme til?","text":"Prøv Orgpuls gratis i 15 dager.","url":"https://www.orgpuls.com/registrer","label":"Kom i gang"}]', 30),
('gjenaktivering', 'newsletter', 'Vil du fortsatt høre fra oss?',
 'Til abonnenter som ikke har åpnet eller klikket på lenge: ett klikk holder dem på listen, og de som ikke klikker får ikke flere e-poster etter tolv måneder uten engasjement.',
 'newsletter', 'branded', 'Vil du fortsatt ha nyhetsbrevet fra Orgpuls?', 'Ett klikk, så fortsetter vi – ellers slutter vi å sende',
 '[{"type":"hero","title":"Vil du fortsatt høre fra oss?","text":"Det er en stund siden du åpnet et nyhetsbrev fra oss. Vi sender bare til dem som vil ha det, så vi spør heller enn å fortsette.","url":"https://www.orgpuls.com/artikler","label":"Ja, fortsett å sende"},
   {"type":"text","text":"Klikker du på knappen, fortsetter nyhetsbrevet som før. Vil du ikke ha det, trenger du ikke gjøre noe – eller du kan melde deg av med lenken nederst."}]', 40);
