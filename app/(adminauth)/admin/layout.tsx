import type { Metadata } from 'next'

/** The admin's sign-in and second-factor pages (D-90): no shell, never indexed. */
export const metadata: Metadata = { title: 'Orgpuls Admin', robots: { index: false, follow: false } }

export default function AdminAuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main lang="en" className="grid min-h-screen place-items-center bg-bg px-[16px] py-[40px] text-ink">
      <div className="w-full max-w-[400px] rounded-card border border-line bg-sf px-[26px] py-[26px]">{children}</div>
    </main>
  )
}
