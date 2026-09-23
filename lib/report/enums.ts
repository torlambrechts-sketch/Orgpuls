/**
 * The two enums section 8 is written in (migration 0023), shared by the reader, the
 * write actions and the register's selects. Kept apart from `tail.ts` because that module
 * is server-only and the register is a client component.
 */
export const INFORMATION_AUDIENCES = ['alle_ansatte', 'verneombud', 'tillitsvalgte', 'ledere', 'amu'] as const
export const INFORMATION_CHANNELS = ['allmote', 'skriftlig', 'epost', 'mote', 'intranett'] as const

export type InformationAudience = (typeof INFORMATION_AUDIENCES)[number]
export type InformationChannel = (typeof INFORMATION_CHANNELS)[number]
