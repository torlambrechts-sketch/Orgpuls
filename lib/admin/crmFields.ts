import 'server-only'
import { z } from 'zod'
import { call } from './api'
import { FieldDef, FieldGroup, type FieldEntity } from './crmFieldTypes'

/**
 * The CRM's field registry (0197, D-212; SF-38): the groups and fields the signed-in staff member may see, each
 * with what they may do with it. A holder of the CRM settings (manage) sees every field, archived ones and the
 * access lists included, and the permission sets to choose from.
 */
const Fields = z.object({
  manage: z.boolean(),
  groups: z.array(FieldGroup),
  fields: z.array(FieldDef),
  sets: z.array(z.object({ id: z.string().uuid(), name: z.string(), kind: z.string() })),
  limits: z.object({ fields: z.coerce.number().nullable(), options: z.coerce.number().nullable() }),
})
export type CrmFields = z.infer<typeof Fields>

export const crmFields = (entity: FieldEntity | null = null) => call('admin_crm_fields', { p_entity: entity }, Fields)

/** The live fields a form or page shows for a record, in the registry's order: grouped, then sorted */
export const liveFields = (r: CrmFields, entity: FieldEntity) =>
  r.fields.filter((f) => f.entity === entity && !f.archived && f.access !== 'hidden')
