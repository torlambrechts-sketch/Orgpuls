/**
 * The roles a demo request can name (0146, D-191): app.crm_contacts.role's set (0055), which
 * app.demo_requests checks too and app.demo_lead carries into the contact. The labels are
 * messages, `demo.form.roles.<role>`.
 */
export const DEMO_ROLES = ['daglig_leder', 'hr', 'leder', 'verneombud', 'annet'] as const
export type DemoRole = (typeof DEMO_ROLES)[number]
