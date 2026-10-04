import { expect, test, type Locator, type Page } from '@playwright/test'
import { checkAdminPage, runName, watchAdminConsole } from './admin'

/**
 * The admin's journeys over the CRM as it stands (WP-0.7): what a seller and an admin do from end to
 * end, through the screens, as the fixture's local admin. Each journey makes its own rows under a
 * name no other run uses and removes them for good at the end, through the screens as well, so the
 * local stack is left as it was found. They run locally before each package (DEC-38):
 *
 *   QA_PORT=3400 npx playwright test --project admin --grep '@setup|@journey'
 */
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const section = (page: Page, heading: string): Locator =>
  page.locator('section').filter({ has: page.getByRole('heading', { name: heading, exact: true }) }).first()

async function openCompany(page: Page, name: string) {
  await page.goto(`/admin/crm/prospects?q=${encodeURIComponent(name)}`)
  await page.getByRole('link', { name, exact: true }).click()
  await expect(page.locator('main h1')).toHaveText(name)
}

/**
 * The record's own «Delete …» button, then the confirm in the preview it opens (its activities have
 * «Delete» buttons too); the page then becomes the record's notice that it is in the restore list
 */
async function deleteFromPage(page: Page, button: string) {
  await page.getByRole('button', { name: button, exact: true }).click()
  await page.locator('form').filter({ hasText: 'will be deleted:' }).getByRole('button', { name: 'Delete', exact: true }).click()
  await expect(page.locator('main h1')).toHaveText('In the restore list')
}

/** From the restore list: the record's row, then «Delete permanently» and its second press */
async function purge(page: Page, name: string) {
  await page.goto('/admin/crm/restore')
  const row = page.getByRole('row').filter({ hasText: name })
  await row.getByRole('button', { name: 'Delete permanently' }).click()
  await row.getByRole('button', { name: /cannot be undone/ }).click()
  // the row leaves the list, which says so above it (WP-0.8), and stays gone
  await expect(page.getByRole('row').filter({ hasText: name })).toHaveCount(0)
  await expect(page.getByRole('status').filter({ hasText: 'Deleted for good.' })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('row').filter({ hasText: name })).toHaveCount(0)
}

test('a deal: made on the board, moved, logged, given a person, deleted, restored and removed for good @admin @journey', async ({ page }) => {
  test.setTimeout(180_000)
  const errors = watchAdminConsole(page)
  const name = runName('Journey Deal AS')
  const person = `journey.${Date.now()}@orgpuls.test`

  // the board's «New deal»
  await page.goto('/admin/crm/pipeline')
  await checkAdminPage(page, 'a-pipeline', { axe: false })
  await page.getByRole('button', { name: 'New deal' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.locator('input[name=name]').fill(name)
  await dialog.getByRole('button', { name: 'Create deal' }).click()
  // the new deal opens on its own page, and it is a card on the board in the first stage
  await expect(page.locator('main h1')).toHaveText(name)
  await page.goto('/admin/crm/pipeline')
  await expect(page.getByRole('button', { name: new RegExp(`^${escape(name)} `) })).toBeVisible()

  // its page: made, as the history says
  await openCompany(page, name)
  await checkAdminPage(page, 'a-company')
  await expect(section(page, 'History')).toContainText('Created')

  // the next stage, and the history line for it
  await page.getByRole('button', { name: 'Move to the next stage' }).click()
  await expect(section(page, 'History')).toContainText('Stage changed')

  // an activity, logged
  await page.getByRole('textbox', { name: 'What happened, or what to do' }).fill('Ringte, avtalte møte')
  await page.getByRole('button', { name: 'Log it' }).click()
  await expect(section(page, 'Activity')).toContainText('Ringte, avtalte møte')

  // a person, added on the company's page, is on it and in the contacts list
  const add = section(page, 'Add a person')
  await add.getByRole('textbox', { name: 'E-mail' }).fill(person)
  await add.getByRole('textbox', { name: 'Name', exact: true }).fill('Journey Person')
  await add.getByRole('button', { name: 'Add contact' }).click()
  await expect(section(page, 'People')).toContainText('Journey Person')
  await page.goto(`/admin/crm/contacts?q=${encodeURIComponent(person)}`)
  await expect(page.getByRole('link', { name: 'Journey Person' }).first()).toBeVisible()

  // deleted: into the restore list, out of the companies list
  await openCompany(page, name)
  await deleteFromPage(page, 'Delete company')
  await page.goto(`/admin/crm/prospects?q=${encodeURIComponent(name)}`)
  await expect(page.getByRole('link', { name, exact: true })).toHaveCount(0)

  // restored from the list, it is back where it was
  await page.goto('/admin/crm/restore')
  await checkAdminPage(page, 'a-restore')
  const row = page.getByRole('row').filter({ hasText: name })
  await row.getByRole('button', { name: 'Restore' }).click()
  await expect(page.getByRole('row').filter({ hasText: name })).toHaveCount(0)
  await expect(page.getByRole('status').filter({ hasText: 'Restored.' })).toBeVisible()
  await openCompany(page, name)
  await expect(section(page, 'People')).toContainText('Journey Person')

  // and removed for good, the person first, then the company
  await page.getByRole('link', { name: 'Journey Person' }).first().click()
  await deleteFromPage(page, 'Delete contact')
  await purge(page, 'Journey Person')
  await openCompany(page, name)
  await deleteFromPage(page, 'Delete company')
  await purge(page, name)

  expect(errors, 'console').toEqual([])
})

test('a custom field: added, on the form and the page, filled, and archived @admin @journey', async ({ page }) => {
  test.setTimeout(120_000)
  const errors = watchAdminConsole(page)
  const label = runName('Journey field')
  const key = `journey_${Date.now() % 1_000_000_000}`
  const company = 'Lillesand Dagligvare AS'

  // added to companies, from the registry
  await page.goto('/admin/crm/fields?entity=company')
  await checkAdminPage(page, 'a-fields')
  await page.getByText('A new field', { exact: true }).click()
  const form = page.locator('details[open] form').first()
  await form.locator('input[name=label]').fill(label)
  await form.locator('input[name=key]').fill(key)
  await form.getByRole('button', { name: 'Add the field' }).click()
  await expect(page.locator('summary').filter({ hasText: label })).toBeVisible()

  // on the company's edit form; filled there, it is on the company's page
  await openCompany(page, company)
  const edit = section(page, 'Edit')
  await edit.getByLabel(label).fill('Fra journey')
  await edit.getByRole('button', { name: 'Save' }).click()
  await expect(section(page, 'Company')).toContainText('Fra journey')

  // archived, it leaves the form and the page; the value is kept out of sight
  await page.goto('/admin/crm/fields?entity=company')
  const row = page.locator('li').filter({ has: page.locator('summary').filter({ hasText: label }) })
  await row.locator('summary').click()
  await row.getByRole('button', { name: 'Archive the field' }).click()
  await expect(page.locator('summary').filter({ hasText: label })).toHaveCount(0, { timeout: 15_000 })
  await openCompany(page, company)
  await expect(section(page, 'Company')).not.toContainText('Fra journey')

  expect(errors, 'console').toEqual([])
})

test('operations: the CRM jobs, the subscribers and the week of events, with the rule they follow @admin @journey', async ({ page }) => {
  const errors = watchAdminConsole(page)
  await page.goto('/admin/ops#crm-jobs')
  const card = page.locator('#crm-jobs')
  await expect(card.getByRole('heading', { name: 'CRM jobs' })).toBeVisible()
  for (const job of ['Event dispatcher', 'Restore list purge', 'Lead routing', 'Register triggers']) {
    await expect(card.getByRole('row').filter({ hasText: job })).toHaveCount(1)
  }
  await expect(card.getByRole('row').filter({ hasText: 'Daily count of events per kind' })).toHaveCount(1)
  // the loop window's rule, one click away
  await card.getByRole('link', { name: 'Settings › CRM rules' }).click()
  await expect(page).toHaveURL(/\/admin\/settings\?tab=rules/)
  await expect(page.getByText('Events per record in ten minutes')).toBeVisible()
  await checkAdminPage(page, 'a-rules')
  expect(errors, 'console').toEqual([])
})
