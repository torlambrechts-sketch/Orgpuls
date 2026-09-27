import 'server-only'
import { isError, legalSources, modules } from '@/lib/admin/api'
import { getFactors } from '@/lib/instrument/read'
import type { LegalInputs } from './registry'

/**
 * What the legal review reads from the database (D-130), loaded one way for the page and for
 * the approve action, so the texts the action checks a hash against are the ones the page showed.
 * A read that fails leaves its units out rather than showing them empty; the page says so.
 */
export async function legalInputs(): Promise<LegalInputs & { failed: string[] }> {
  const [factors, mods, db] = await Promise.all([getFactors(), modules(), legalSources()])
  const failed: string[] = []
  if (isError(mods)) failed.push('modules')
  if (isError(db)) failed.push('crm')
  // getFactors answers a failed read with no factors; the instrument always has them
  if (!factors.length) failed.push('factors')
  return {
    factors: factors.length ? factors : null,
    // a module's texts are live when that version is published in the database
    publishedModules: new Set(isError(mods) ? [] : mods.modules.filter((m) => m.status === 'published').map((m) => `${m.key}@${m.version}`)),
    crmTemplates: isError(db) ? null : db.templates,
    crmLists: isError(db) ? null : db.lists,
    failed,
  }
}
