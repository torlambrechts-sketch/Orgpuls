/**
 * ja / nei / vet ikke, in the order a count question's options are stored (0067, 0069); and a
 * fourth, «ikke aktuelt», where the question does not apply to everyone (0089): kept out of the share.
 */
export const COUNT_ANSWERS = ['ja', 'nei', 'vet_ikke', 'ikke_aktuelt'] as const
export type CountAnswer = (typeof COUNT_ANSWERS)[number]
