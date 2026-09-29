import type { Route } from 'next'
import { notFound, permanentRedirect, redirect } from 'next/navigation'
import { cmsRedirect } from '@/lib/cms/read'

/**
 * A deeper address the site does not own (/blogg/et-gammelt-innlegg): where the admin has
 * redirected it (0114, X-094), else nothing. The industries' question pages (/[bransje]/sporsmal)
 * are their own route and win over this one.
 */
export default async function Moved({ params }: { params: Promise<{ bransje: string; rest: string[] }> }) {
  const { bransje, rest } = await params
  const moved = await cmsRedirect(`/${[bransje, ...rest].join('/')}`)
  if (moved) (moved.permanent ? permanentRedirect : redirect)(moved.to as Route)
  notFound()
}
