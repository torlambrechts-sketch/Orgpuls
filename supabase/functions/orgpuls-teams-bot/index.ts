/**
 * orgpuls-teams-bot — the Orgpuls Teams app's messaging endpoint (0176, D-203).
 *
 * The Azure Bot resource's «Messaging endpoint» points here:
 *   {SUPABASE_URL}/functions/v1/orgpuls-teams-bot
 * `verify_jwt` is off because the caller is Microsoft's Bot Connector, not a Supabase user; every
 * request is authenticated instead by the Bot Framework JWT in its Authorization header, checked
 * in full (supabase/functions/_shared/teams.ts verifyBotJwt): signature by a key from
 * https://login.botframework.com/v1/.well-known/openidconfiguration, issuer
 * https://api.botframework.com, audience this bot's app id, validity with five minutes' skew, the
 * serviceUrl claim equal to the activity's, and the key endorsed for the channel msteams.
 *
 * What it does with a valid call (teams.ts handleBotCall), and nothing else:
 *   * the app installed for a person (installationUpdate add, or the bot added to a 1:1 chat):
 *     keep the conversation for the employee with that object id in the organisation that bound
 *     that tenant (teams_conversation_set); an unknown tenant or person is ignored;
 *   * the app removed (installationUpdate remove, or the bot removed from the chat): forget it,
 *     and note that Teams does not reach the person until it is installed again;
 *   * anything else — a message above all — is answered 200 and dropped. The bot is
 *     notification-only: a message's text is never read, never stored, never logged.
 *
 * Log lines carry the activity's kind and a code. Never an id, a name, a tenant, a token or text.
 */
import { createClient } from 'npm:@supabase/supabase-js@2'
import { handleBotCall, openIdKeys, type FetchLike } from '../_shared/teams.ts'

const keys = openIdKeys(fetch as unknown as FetchLike)
const svc = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', {
  auth: { persistSession: false },
})

Deno.serve((req) =>
  handleBotCall(req, {
    appId: (Deno.env.get('TEAMS_BOT_APP_ID') ?? '').trim().toLowerCase(),
    keys,
    now: Date.now,
    rpc: async (fn, args) => {
      const { data, error } = await svc.rpc(fn, args)
      return { data, error: error ? { code: error.code } : null }
    },
    log: (line) => console.error(line),
  }),
)
