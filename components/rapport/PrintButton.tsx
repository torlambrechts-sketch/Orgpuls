'use client'

import { Button } from '@/components/ui/Button'

/**
 * "Skriv ut eller lagre som PDF".
 *
 * The design's own mechanism, kept: the browser's print dialog, which is also how a
 * PDF is produced — every platform's print path offers "save as PDF". No renderer, no
 * server round trip, and nothing that could send a page of results somewhere else. The
 * print stylesheet in globals.css is what makes the output a document rather than a
 * screenshot of the application: the shell, the chrome and the desk drop away and the
 * sheet becomes the page.
 */
export function PrintButton({ label }: { label: string }) {
  return (
    <Button tone="primary" onClick={() => window.print()}>
      {label}
    </Button>
  )
}
