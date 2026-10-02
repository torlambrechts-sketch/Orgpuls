# Slack — owner setup (D-205)

Slack sends a person's survey link as a direct message from the Orgpuls bot. Nothing is set up until
the two keys below exist; until then Oppsett › Integrasjoner › Slack says Slack is not set up.

## 1. Create the app

At https://api.slack.com/apps → Create New App → From a manifest, paste:

```yaml
display_information:
  name: Orgpuls
  description: Lenken til arbeidsmiljøundersøkelsen, som direktemelding i Slack.
  background_color: "#191510"
features:
  app_home:
    home_tab_enabled: false
    messages_tab_enabled: true
    messages_tab_read_only_enabled: true
  bot_user:
    display_name: Orgpuls
    always_online: false
oauth_config:
  redirect_urls:
    - https://www.orgpuls.com/integrasjoner/slack/callback
    - https://en.orgpuls.com/integrasjoner/slack/callback
  scopes:
    bot: [chat:write, im:write, users:read, users:read.email]
settings:
  org_deploy_enabled: false
  socket_mode_enabled: false
  token_rotation_enabled: true
```

No event subscriptions and no interactivity. The Messages tab must be on (read-only): Slack refuses a
bot's direct messages with it off. Token rotation cannot be switched off again once on.

Then Manage Distribution → activate public distribution **without** a Marketplace listing (unlisted).

## 2. Keys

From Basic Information → App Credentials:

- Vercel (Production): `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET`.
- Supabase Edge Function secrets (used by `orgpuls-dispatch` to refresh and revoke tokens): the same two.

No signing secret is needed — nothing comes in from Slack.

## 3. Try it

As daglig leder: Oppsett › Integrasjoner › Slack → Koble til Slack → approve in Slack → back in Orgpuls,
«Synkroniser nå» shows how many people in the register were found in the workspace. Switch Slack on,
choose «påminnelser» or «alle», and send a test round. A person Slack refuses gets the link by e-mail.
