import { test as teardown } from '@playwright/test'
import { closeAdmin, DEFAULT_DB } from '../../scripts/seed/sentral-fixture.mjs'
import { releaseAdminLock } from '../../scripts/verify/admin-session.mjs'

/**
 * After the admin projects, however they ended: the local admin is made inactive and its factor
 * deleted, so between runs the fixture's known password opens nothing, and the lock is given back.
 */
teardown('retire the local admin @setup', async () => {
  try {
    closeAdmin(DEFAULT_DB)
  } finally {
    releaseAdminLock(process.ppid)
  }
})
