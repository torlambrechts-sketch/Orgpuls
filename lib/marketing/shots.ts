import type { StaticImageData } from 'next/image'
import arshjul from '@/assets/produkt/arshjul.webp'
import empvibeArshjul from '@/assets/produkt/empvibe/arshjul.webp'
import empvibeKommentarer from '@/assets/produkt/empvibe/kommentarer.webp'
import empvibeOversikt from '@/assets/produkt/empvibe/oversikt.webp'
import empvibeRapport from '@/assets/produkt/empvibe/rapport.webp'
import empvibeResultater from '@/assets/produkt/empvibe/resultater.webp'
import empvibeSamtaler from '@/assets/produkt/empvibe/samtaler.webp'
import empvibeSporsmal from '@/assets/produkt/empvibe/sporsmal.webp'
import empvibeTiltak from '@/assets/produkt/empvibe/tiltak.webp'
import empvibeVarmekart from '@/assets/produkt/empvibe/varmekart.webp'
import kommentarer from '@/assets/produkt/kommentarer.webp'
import oversikt from '@/assets/produkt/oversikt.webp'
import rapport from '@/assets/produkt/rapport.webp'
import resultater from '@/assets/produkt/resultater.webp'
import samtaler from '@/assets/produkt/samtaler.webp'
import seArshjul from '@/assets/produkt/se/arshjul.webp'
import seKommentarer from '@/assets/produkt/se/kommentarer.webp'
import seOversikt from '@/assets/produkt/se/oversikt.webp'
import seRapport from '@/assets/produkt/se/rapport.webp'
import seResultater from '@/assets/produkt/se/resultater.webp'
import seSamtaler from '@/assets/produkt/se/samtaler.webp'
import seSporsmal from '@/assets/produkt/se/sporsmal.webp'
import seTiltak from '@/assets/produkt/se/tiltak.webp'
import seVarmekart from '@/assets/produkt/se/varmekart.webp'
import sporsmal from '@/assets/produkt/sporsmal.webp'
import tiltak from '@/assets/produkt/tiltak.webp'
import varmekart from '@/assets/produkt/varmekart.webp'
import type { ShotId } from './shot-ids'

type Shots = Record<ShotId, { img: StaticImageData; frame: 'window' | 'phone' }>

/**
 * Each picture and how it is framed: a screen from the desktop app sits in a browser
 * window, and the questionnaire, captured at phone width, in a phone. The pictures are
 * captured at twice the pixel density, so half their width is the widest they are shown.
 */
export const SHOTS: Shots = {
  oversikt: { img: oversikt, frame: 'window' },
  varmekart: { img: varmekart, frame: 'window' },
  resultater: { img: resultater, frame: 'window' },
  kommentarer: { img: kommentarer, frame: 'window' },
  samtaler: { img: samtaler, frame: 'window' },
  tiltak: { img: tiltak, frame: 'window' },
  arshjul: { img: arshjul, frame: 'window' },
  sporsmal: { img: sporsmal, frame: 'phone' },
  rapport: { img: rapport, frame: 'window' },
}

/**
 * Empvibe's pictures (UK-E3, D-272): the same screens in English, of the same scenario told by a
 * British firm, Brackenmoor Civils Ltd (design-fixture.mjs --market gb), so a British reader never
 * meets a Norwegian screen, and assets/produkt/empvibe is where product-shots.mjs --brand empvibe
 * writes them.
 */
const EMPVIBE_SHOTS: Shots = {
  oversikt: { img: empvibeOversikt, frame: 'window' },
  varmekart: { img: empvibeVarmekart, frame: 'window' },
  resultater: { img: empvibeResultater, frame: 'window' },
  kommentarer: { img: empvibeKommentarer, frame: 'window' },
  samtaler: { img: empvibeSamtaler, frame: 'window' },
  tiltak: { img: empvibeTiltak, frame: 'window' },
  arshjul: { img: empvibeArshjul, frame: 'window' },
  sporsmal: { img: empvibeSporsmal, frame: 'phone' },
  rapport: { img: empvibeRapport, frame: 'window' },
}

/**
 * Sweden's pictures (SE-F3, D-276): the leaders' screens in Swedish, of the same scenario told by a
 * Swedish firm, Norrvik Anläggning AB (design-fixture.mjs --market se), with the statements and factor
 * names from the approved Swedish registry rows. The questionnaire is in English, as a Swedish
 * employee meets it until Swedish is switched on in the survey (`locale_sv`, still Tor's decision,
 * X-109): a picture shows the product as it is.
 */
const SE_SHOTS: Shots = {
  oversikt: { img: seOversikt, frame: 'window' },
  varmekart: { img: seVarmekart, frame: 'window' },
  resultater: { img: seResultater, frame: 'window' },
  kommentarer: { img: seKommentarer, frame: 'window' },
  samtaler: { img: seSamtaler, frame: 'window' },
  tiltak: { img: seTiltak, frame: 'window' },
  arshjul: { img: seArshjul, frame: 'window' },
  sporsmal: { img: seSporsmal, frame: 'phone' },
  rapport: { img: seRapport, frame: 'window' },
}

/**
 * Each site of its own's pictures, by its key (lib/hosts.ts `Site.own.key`, lib/site/own.ts
 * siteShots): Empvibe's English screens, Sweden's Swedish ones, and Norway's elsewhere.
 */
export const SITE_SHOTS: Readonly<Record<string, Shots>> = { empvibe: EMPVIBE_SHOTS, se: SE_SHOTS }
