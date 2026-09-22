import { SignUpFlow } from '@/components/start/SignUpFlow'

/**
 * Registrering. Orgpuls_Start.dc.html lines 276-434.
 *
 * All three steps live in one client component because nothing is written until step 2
 * submits: there is no half-created state for a URL to address, and none for a back
 * button to replay.
 */
export const dynamic = 'force-dynamic'

export default function RegistrerPage() {
  return <SignUpFlow />
}
