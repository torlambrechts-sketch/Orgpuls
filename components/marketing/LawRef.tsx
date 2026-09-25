import { lovdataHref } from '@/lib/marketing/lovdata'

/** A legal reference, linked to its paragraph on Lovdata when it names one (lib/marketing/lovdata). */
export function LawRef({ text, className }: { text: string; className: string }) {
  const href = lovdataHref(text)
  if (!href) return <span className={className}>{text}</span>
  // the link sits inside a span so it stays inline text, as a reference in running text does
  return (
    <span className={className}>
      <a href={href} target="_blank" rel="noopener noreferrer" className="underline decoration-[1px] underline-offset-[3px]">
        {text}
      </a>
    </span>
  )
}
