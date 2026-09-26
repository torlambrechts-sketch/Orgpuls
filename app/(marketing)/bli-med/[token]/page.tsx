import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { getInvitePreview } from '@/lib/members/read'
import { AcceptInvite, JoinWithPassword } from '@/components/start/JoinInvite'
import { signOutForInvite } from '@/app/(marketing)/bli-med/actions'
import { GoogleButton, GoogleDivider } from '@/components/start/GoogleButton'
import { googleEnabled } from '@/lib/auth/google'

/**
 * Where an invitation link lands (0028, D-51). Not in the design; built in the sign-in
 * card's own styling, because it is the same act — getting into the product — for someone
 * who was asked in rather than someone who signed up.
 *
 * The token in the path is a credential, as the respondent's is: no referrer leaves the
 * site (security headers), and analytics never reports this path (lib/analytics/scrub.ts).
 */
export const dynamic = 'force-dynamic'

export default async function BliMedPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const t = await getTranslations('bliMed')
  const tr = await getTranslations('oppsett.roller')

  const valid = /^[0-9a-f]{64}$/.test(token)
  const preview = valid ? await getInvitePreview(token) : null
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  const signedInAs = auth.user?.email?.toLowerCase() ?? null

  const card = 'rounded-card border border-line bg-sf p-[clamp(24px,3.5vw,32px)]'

  let body: React.ReactNode
  if (!preview || !preview.ok || preview.state !== 'open') {
    const state = !preview || !preview.ok ? 'not_found' : preview.state
    body = (
      <div className={card}>
        <span className="inline-block rounded-pill bg-sbg px-[12px] py-[5px] text-[11.5px] font-bold">{t('badge')}</span>
        <p className="mt-[14px] text-[15px] leading-[1.6] [text-wrap:pretty]">{t(`state.${state}`)}</p>
        <Link
          href="/logg-inn"
          className="mt-[16px] inline-flex h-[44px] items-center rounded-btn border border-line px-[17px] text-[13.5px] font-semibold text-ink no-underline hover:text-ink hover:no-underline"
        >
          {t('toSignIn')}
        </Link>
      </div>
    )
  } else {
    const role = tr(`role.${preview.role}`)
    body = (
      <div className={card}>
        <span className="inline-block rounded-pill bg-sbg px-[12px] py-[5px] text-[11.5px] font-bold">{t('badge')}</span>
        <h1 className="mt-[13px] font-display text-[clamp(26px,3.6vw,31px)] font-semibold leading-[1.12] [text-wrap:balance]">
          {t('title', { org: preview.org_name })}
        </h1>
        <p className="mt-[10px] text-[14px] leading-[1.6] text-mut [text-wrap:pretty]">
          {preview.group_name
            ? t('leadGroup', { role: role.toLowerCase(), group: preview.group_name })
            : t('lead', { role: role.toLowerCase() })}{' '}
          {t('forEmail', { email: preview.email })}
        </p>

        {signedInAs === null ? (
          <>
            <JoinWithPassword token={token} />
            {(await googleEnabled()) ? (
              <>
                <GoogleDivider label={t('or')} />
                <GoogleButton label={t('google')} fields={{ flow: 'invite', token }} />
                <p className="mb-0 mt-[8px] text-[12.5px] leading-[1.55] text-mut [text-wrap:pretty]">{t('googleNote')}</p>
              </>
            ) : null}
          </>
        ) : signedInAs === preview.email ? (
          <AcceptInvite token={token} />
        ) : (
          <form action={signOutForInvite}>
            <input type="hidden" name="token" value={token} />
            <p className="mt-[16px] text-[13.5px] leading-[1.6] [text-wrap:pretty]">
              {t('signedInAs', { email: signedInAs, invited: preview.email })}
            </p>
            <button
              type="submit"
              className="mt-[12px] inline-flex h-[44px] cursor-pointer items-center rounded-btn border border-ink bg-transparent px-[17px] text-[13.5px] font-semibold text-ink"
            >
              {t('signOut')}
            </button>
          </form>
        )}
      </div>
    )
  }

  return (
    <div className="animate-entry mx-auto max-w-[560px] px-[16px] pb-[70px] pt-[44px] md:px-[26px]">
      {body}
    </div>
  )
}
