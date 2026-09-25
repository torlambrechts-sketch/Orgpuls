import 'server-only'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { parseFailed, readFailed } from '@/lib/supabase/read'

/**
 * The organisation's signatures of the data processing agreement (0047, D-87), newest first.
 * RLS returns them to any member of the organisation; nobody else sees a row.
 */
const SignatureRow = z.object({
  version: z.string(),
  text_sha256: z.string().regex(/^[0-9a-f]{64}$/),
  signer_name: z.string(),
  signer_title: z.string(),
  signed_at: z.string(),
})
export type DpaSignature = z.infer<typeof SignatureRow>

export async function getDpaSignatures(orgId: string): Promise<DpaSignature[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .schema('app')
    .from('dpa_signatures')
    .select('version, text_sha256, signer_name, signer_title, signed_at')
    .eq('org_id', orgId)
    .order('signed_at', { ascending: false })

  if (readFailed('getDpaSignatures', error, data)) return []
  const parsed = z.array(SignatureRow).safeParse(data)
  if (parseFailed('getDpaSignatures', parsed)) return []
  return parsed.data
}
