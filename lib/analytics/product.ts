import 'server-only'
import { createClient } from '@/lib/supabase/server'

/**
 * A signed-in leader opened one of the screens the activation funnel counts (D-90, D-91).
 * `track_product_event` (0049) keeps one row per user, screen and day, with the role, and
 * nothing about what was on the screen. It never fails the page.
 */
export type ProductView = 'results_viewed' | 'report_viewed' | 'comments_viewed' | 'measures_viewed'

export async function countView(name: ProductView): Promise<void> {
  try {
    const supabase = await createClient()
    await supabase.rpc('track_product_event', { p_name: name })
  } catch {
    // a count is not worth a failed page
  }
}
