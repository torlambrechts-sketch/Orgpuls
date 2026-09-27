/** The note over an industry page shown before launch (?forhandsvis=1): not published, not indexed */
export function PreviewBanner({ text }: { text: string }) {
  return (
    <div role="note" className="bg-sbg px-[18px] py-[10px] text-center text-[13px] font-semibold text-ink">
      {text}
    </div>
  )
}
