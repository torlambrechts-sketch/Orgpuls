/**
 * The product pictures the public site can show (D-84), by id. Each is a WebP in
 * assets/produkt, captured from the running app by scripts/marketing/product-shots.mjs.
 * Its caption and alt text are messages, `seo.shots.<id>`.
 *
 * The ids live apart from the images so that the block schema can name them without
 * importing a picture.
 */
export const SHOT_IDS = [
  'oversikt',
  'varmekart',
  'resultater',
  'kommentarer',
  'samtaler',
  'tiltak',
  'arshjul',
  'sporsmal',
  'rapport',
] as const
export type ShotId = (typeof SHOT_IDS)[number]
