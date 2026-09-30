import 'server-only'
import { call } from './api'
import { Deliverability } from './deliverability'
import { GrowthMagnets } from './magnets'

/**
 * The reads of phase G4 (0144, D-185). Each function checks the growth section's roles — super_admin,
 * analyst and marketing, with the second factor — and audits the read before it answers; the reply
 * is parsed, never cast.
 */
/** The magnet registry with its true statuses, double opt-in as counted, and the Krav-sjekk rules' current versions */
export const growthMagnets = () => call('admin_growth_magnets', {}, GrowthMagnets)

/** The two streams' seven days, their last authentication check, the template registry with 7-day counts, the daily cap */
export const growthDeliverability = () => call('admin_growth_deliverability', {}, Deliverability)
