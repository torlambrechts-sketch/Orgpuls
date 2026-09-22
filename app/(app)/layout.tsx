import { AppHeader } from '@/components/shell/AppHeader'
import { AppFooter } from '@/components/shell/AppFooter'

/**
 * The signed-in shell. Every application screen renders inside this, so the header and
 * footer are built and verified once rather than per screen — which is exactly what the
 * previous codebase failed to do.
 *
 * The page background is #FCF6E9 from globals.css; the header and footer are #FFFDF6,
 * and that contrast is what separates the rails from the content in the design.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <AppHeader />
      <div className="flex-1">{children}</div>
      <AppFooter />
    </div>
  )
}
