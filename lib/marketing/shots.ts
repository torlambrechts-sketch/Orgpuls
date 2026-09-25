import type { StaticImageData } from 'next/image'
import arshjul from '@/assets/produkt/arshjul.webp'
import kommentarer from '@/assets/produkt/kommentarer.webp'
import oversikt from '@/assets/produkt/oversikt.webp'
import rapport from '@/assets/produkt/rapport.webp'
import resultater from '@/assets/produkt/resultater.webp'
import samtaler from '@/assets/produkt/samtaler.webp'
import sporsmal from '@/assets/produkt/sporsmal.webp'
import tiltak from '@/assets/produkt/tiltak.webp'
import varmekart from '@/assets/produkt/varmekart.webp'
import type { ShotId } from './shot-ids'

/**
 * Each picture and how it is framed: a screen from the desktop app sits in a browser
 * window, and the questionnaire, captured at phone width, in a phone. The pictures are
 * captured at twice the pixel density, so half their width is the widest they are shown.
 */
export const SHOTS: Record<ShotId, { img: StaticImageData; frame: 'window' | 'phone' }> = {
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
