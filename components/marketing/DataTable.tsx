import { Rich } from './Rich'

/**
 * A table in the public pages' own surfaces: the `table` block's renderer, and the QPSNordic
 * items' (QpsItems). Under 640px each row is a card of label–value pairs, so no column is cut
 * off at the edge (D-233); from 640px a table that scrolls sideways if it must.
 */
export function DataTable({ head, rows }: { head: string[]; rows: string[][] }) {
  return (
    <>
      <div className="flex flex-col gap-[9px] sm:hidden">
        {rows.map((row, r) => (
          <dl key={r} className="m-0 rounded-note border border-line bg-sf px-[16px] py-[13px] text-[14px] leading-[1.5]">
            {row.map((cell, c) =>
              c === 0 ? (
                <dt key={c} className="font-semibold">
                  <Rich text={cell} />
                </dt>
              ) : (
                <dd key={c} className="m-0 mt-[6px]">
                  <span className="block text-[11px] font-bold uppercase tracking-[0.06em] text-mut">{head[c]}</span>
                  <Rich text={cell} />
                </dd>
              ),
            )}
          </dl>
        ))}
      </div>
      <div className="hidden overflow-x-auto rounded-note border border-line bg-sf sm:block">
        <table className="w-full border-collapse text-left text-[14px] leading-[1.5]">
          <thead>
            <tr>
              {head.map((h, i) => (
                <th key={i} scope="col" className="border-b border-line px-[15px] py-[11px] text-[12px] font-bold uppercase tracking-[0.06em] text-mut">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, r) => (
              <tr key={r} className={r < rows.length - 1 ? 'border-b border-line' : ''}>
                {row.map((cell, c) => (
                  <td key={c} className={`px-[15px] py-[11px] align-top ${c === 0 ? 'font-semibold' : ''}`}>
                    <Rich text={cell} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
