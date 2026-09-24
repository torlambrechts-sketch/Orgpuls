import { RespondentThread } from '@/components/respond/RespondentThread'

/**
 * A respondent's conversation, opened from the link the done screen gave them (D-78).
 *
 * Public, like the rest of `/s`: no session and no cookie. The key is in the fragment, so
 * this page is the same for everyone as far as the server knows — the browser reads the
 * key and asks for the thread in an action body. `robots` keeps the page out of search.
 */
export const metadata = { robots: { index: false, follow: false } }

export default function RespondentThreadPage() {
  return (
    <main className="animate-entry mx-auto min-h-screen max-w-[420px] bg-bg">
      <RespondentThread />
    </main>
  )
}
