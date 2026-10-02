import { describe, expect, it } from 'vitest'
import { ConnectResult, problemFrom, slackGate, SlackStatus } from '@/lib/slack/schema'

/** The Slack screen's decisions (0185, D-205): what it offers whom, and what it echoes */
describe('the Slack screen', () => {
  it('offers a connect button only to a daglig leder, and only when the app is configured', () => {
    expect(slackGate({ connected: false, working: null, daglig_leder: true }, true)).toBe('can_connect')
    expect(slackGate({ connected: false, working: null, daglig_leder: false }, true)).toBe('leader_only')
    expect(slackGate({ connected: false, working: null, daglig_leder: true }, false)).toBe('not_configured')
    expect(slackGate(null, true)).toBe('leader_only')
  })

  it('says «Tilkoblet» only over a working installation', () => {
    expect(slackGate({ connected: true, working: true, daglig_leder: true }, false)).toBe('connected')
    expect(slackGate({ connected: true, working: false, daglig_leder: true }, true)).toBe('broken')
  })

  it('echoes only problems from its closed list', () => {
    expect(problemFrom('team_taken')).toBe('team_taken')
    expect(problemFrom('<script>')).toBeNull()
    expect(problemFrom(undefined)).toBeNull()
  })

  it('parses the database’s answers, never casts them', () => {
    expect(ConnectResult.safeParse({ ok: false, revoke: false, error: 'team_taken' }).success).toBe(true)
    expect(ConnectResult.safeParse({ ok: false, error: 'something_else' }).success).toBe(false)
    const status = {
      ok: true, connected: false, working: null, team_name: null, grid: null, installed_at: null, installed_by: null,
      broken_reason: null, broken_at: null, synced_at: null, sync_requested_at: null, sync_members: null, sync_error: null,
      daglig_leder: false, counts: null, last_event: null,
    }
    expect(SlackStatus.safeParse(status).success).toBe(true)
    expect(SlackStatus.safeParse({ ...status, counts: { active: -1, with_email: 0, matched: 0, sent_30d: 0 } }).success).toBe(false)
  })
})
