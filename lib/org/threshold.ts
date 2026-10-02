/**
 * The anonymity threshold's bounds, as the database holds them (0150, D-198).
 *
 * The database is the rule: `app.k_floor()` is a function returning 3, every result reader takes
 * the round's own k (`app.k_round`), floored there, and `organizations.threshold` is
 * `between 3 and 10`. These constants only say what a screen may offer and when it must warn;
 * nothing in the application releases or withholds a figure by them.
 */

/** No result is ever shown for fewer answers than this, in any organisation (`app.k_floor()`). */
export const K_FLOOR = 3

/** Where every organisation starts, and the strong recommendation (`app.k_min()`). */
export const K_DEFAULT = 5

/** The highest threshold an organisation may choose. */
export const K_MAX = 10

/** A threshold under the default needs the warning before it is saved: only for small teams. */
export function belowDefault(k: number): boolean {
  return k < K_DEFAULT
}
