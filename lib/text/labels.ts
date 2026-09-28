import 'server-only'
import { getTranslations } from 'next-intl/server'
import type { MaskLabels } from './mask'

/** The words a masked name is drawn as, in the reader's language (lib/text/mask.ts) */
export async function getMaskLabels(): Promise<MaskLabels> {
  const t = await getTranslations('masked')
  return { n: t('n'), a: t('a'), s: t('s') }
}
