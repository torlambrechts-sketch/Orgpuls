import { Rich } from './Rich'

/**
 * Diagram blocks (D-237): a page's argument drawn, not only written. Each takes its words from the
 * block (messages), so a figure is translated with the page and a new one is a message, not a
 * component. The drawing is CSS and inline SVG in the site's own tokens; under 768px every figure
 * becomes a plain vertical list, so nothing is cut at the edge of a phone.
 */

type Step = { title: string; ref?: string; text: string }

/** A legal reference stays on one line in a narrow card: «§ 6-2» never breaks after § or at the hyphen. */
export const keep = (text: string) =>
  text.replace(/§ (\d+ ?[A-Z]?)-(\d+)/g, (_, a: string, b: string) => `§\u00a0${a.replace(' ', '\u00a0')}-\u2060${b}`)

const STEP_FILLS = ['bg-sbg', 'bg-mint', 'bg-cream', 'bg-pulse', 'bg-sand', 'bg-viz3']

/** An arrow between two of the ring's cards, pointing the way the steps go. */
function Arrow({ dir }: { dir: 'right' | 'down' | 'left' | 'up' }) {
  const rotate = { right: '', down: 'rotate-90', left: 'rotate-180', up: '-rotate-90' }[dir]
  return (
    <svg aria-hidden="true" viewBox="0 0 40 16" className={`h-[16px] w-[40px] ${rotate}`} fill="none">
      <path d="M2 8H34" stroke="#191510" strokeWidth="2" strokeLinecap="round" />
      <path d="M28 2L36 8L28 14" stroke="#191510" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/**
 * A cycle: steps that lead back to the first, around what holds them together – drawn for four.
 * Wide, the cards sit in the corners of a 3×3 grid, clockwise from the top left, with an arrow in each
 * cell between them and the common ground in the middle cell. That drawing is hidden from screen
 * readers, which read the list in step order instead.
 */
export function Cycle({ center, items }: { center: string; items: Step[] }) {
  const card = (s: Step, i: number) => (
    <div key={i} className="relative self-stretch rounded-note border border-line bg-sf px-[20px] pb-[18px] pt-[22px]">
      <span
        className={`absolute -top-[14px] left-[18px] flex h-[28px] min-w-[28px] items-center justify-center rounded-pill border border-ink px-[8px] text-[13px] font-bold ${STEP_FILLS[i % STEP_FILLS.length]}`}
      >
        {i + 1}
      </span>
      <span className="block text-[15.5px] font-bold leading-[1.3]">{s.title}</span>
      {s.ref ? <span className="mt-[2px] block text-[12px] font-semibold text-link">{s.ref}</span> : null}
      <span className="mt-[6px] block text-[13.5px] leading-[1.55] text-mut [text-wrap:pretty]">
        <Rich text={keep(s.text)} />
      </span>
    </div>
  )
  const [a, b, c, d] = items as [Step, Step, Step, Step]
  return (
    <figure className="m-0 my-[8px] pt-[14px]">
      <div aria-hidden="true" className="hidden grid-cols-[minmax(0,1fr)_140px_minmax(0,1fr)] grid-rows-[auto_140px_auto] items-center md:grid">
        {card(a, 0)}
        <div className="flex justify-center">
          <Arrow dir="right" />
        </div>
        {card(b, 1)}
        <div className="flex justify-center">
          <Arrow dir="up" />
        </div>
        <div className="flex justify-center">
          <span className="flex h-[132px] w-[132px] items-center justify-center rounded-pill bg-ink p-[14px] text-center text-[12.5px] font-semibold leading-[1.35] text-bg shadow-[0_18px_40px_-24px_rgba(25,21,16,.45)] [text-wrap:balance]">
            {center}
          </span>
        </div>
        <div className="flex justify-center">
          <Arrow dir="down" />
        </div>
        {card(d, 3)}
        <div className="flex justify-center">
          <Arrow dir="left" />
        </div>
        {card(c, 2)}
      </div>
      {/* narrow: the same steps as a list, the common ground first – and, read aloud, the figure on every width */}
      <div className="md:sr-only">
        <p className="m-0 mb-[12px] rounded-note bg-ink px-[16px] py-[12px] text-[13.5px] font-semibold text-bg">{center}</p>
        <ol className="m-0 flex list-none flex-col gap-[10px] border-l-2 border-rule p-0 pl-[18px]">
          {items.map((s, i) => (
            <li key={i} className="relative rounded-note border border-line bg-sf px-[16px] py-[13px]">
              <span
                className={`absolute -left-[33px] top-[12px] flex h-[26px] w-[26px] items-center justify-center rounded-pill border border-ink text-[12px] font-bold ${STEP_FILLS[i % STEP_FILLS.length]}`}
              >
                {i + 1}
              </span>
              <span className="block text-[15px] font-bold">{s.title}</span>
              {s.ref ? <span className="block text-[12px] font-semibold text-link">{s.ref}</span> : null}
              <span className="mt-[4px] block text-[13.5px] leading-[1.55] text-mut">
                <Rich text={keep(s.text)} />
              </span>
            </li>
          ))}
        </ol>
      </div>
    </figure>
  )
}

/** A hub: who carries the responsibility, and who works with them. */
export function Hub({ center, items }: { center: { title: string; text: string }; items: { title: string; text: string }[] }) {
  const n = items.length
  return (
    <figure className="m-0 my-[8px]">
      <div className="mx-auto max-w-[460px] rounded-note border-2 border-ink bg-ink px-[22px] py-[18px] text-center text-bg">
        <span className="block font-display text-[21px] font-semibold">{center.title}</span>
        <span className="mt-[6px] block text-[13.5px] leading-[1.55] opacity-[0.82] [text-wrap:balance]">
          <Rich text={keep(center.text)} />
        </span>
      </div>
      {/* the bracket from the one to the many, wide screens only */}
      <svg aria-hidden="true" className="hidden h-[40px] w-full md:block" viewBox="0 0 100 40" preserveAspectRatio="none">
        <line x1="50" y1="0" x2="50" y2="18" stroke="#191510" strokeWidth="1.6" vectorEffect="non-scaling-stroke" />
        <line x1={100 / (2 * n)} y1="18" x2={100 - 100 / (2 * n)} y2="18" stroke="#191510" strokeWidth="1.6" vectorEffect="non-scaling-stroke" />
        {items.map((_, i) => {
          const x = (100 / n) * i + 100 / (2 * n)
          return <line key={i} x1={x} y1="18" x2={x} y2="40" stroke="#191510" strokeWidth="1.6" vectorEffect="non-scaling-stroke" />
        })}
      </svg>
      <ul
        className={`m-0 mt-[12px] grid list-none gap-[13px] p-0 md:mt-0 ${n === 3 ? 'md:grid-cols-3' : n === 2 ? 'md:grid-cols-2' : 'md:grid-cols-4'}`}
      >
        {items.map((s, i) => (
          <li key={i} className={`rounded-note border border-line px-[18px] py-[16px] ${STEP_FILLS[(i + 1) % STEP_FILLS.length]}`}>
            <span className="block text-[15px] font-bold">{s.title}</span>
            <span className="mt-[6px] block text-[13.5px] leading-[1.55] text-body [text-wrap:pretty]">
              <Rich text={keep(s.text)} />
            </span>
          </li>
        ))}
      </ul>
    </figure>
  )
}

const LADDER_FILLS = ['bg-sbg', 'bg-band', 'bg-peach', 'bg-peach2']
/** each step's riser, taller as the measure gets heavier */
const LADDER_HEIGHTS = ['h-[28px]', 'h-[56px]', 'h-[84px]', 'h-[112px]', 'h-[140px]']

/** A ladder: measures in rising order of weight, the heavier ones standing taller. */
export function Ladder({ items }: { items: Step[] }) {
  return (
    <figure className="m-0 my-[8px]">
      <ol className="m-0 flex list-none flex-col gap-[10px] p-0 md:flex-row md:items-end md:gap-[12px]">
        {items.map((s, i) => (
          <li key={i} className="flex flex-1 flex-col">
            <div className="rounded-note border border-line bg-sf px-[16px] py-[14px]">
              <span className="block text-[15px] font-bold leading-[1.3]">{s.title}</span>
              {s.ref ? <span className="block text-[12px] font-semibold text-link">{s.ref}</span> : null}
              <span className="mt-[6px] block text-[13px] leading-[1.5] text-mut [text-wrap:pretty]">
                <Rich text={keep(s.text)} />
              </span>
            </div>
            <div
              aria-hidden="true"
              className={`mt-[8px] hidden rounded-t-[12px] border border-b-0 border-ink md:block ${LADDER_FILLS[Math.min(i, LADDER_FILLS.length - 1)]} ${LADDER_HEIGHTS[Math.min(i, LADDER_HEIGHTS.length - 1)]}`}
            />
          </li>
        ))}
      </ol>
      <div aria-hidden="true" className="hidden h-[2px] bg-ink md:block" />
    </figure>
  )
}

/**
 * A timeline: dated steps along one line – across the column for up to three, down it for more, where
 * each step's label gets a column of its own so long titles are not squeezed.
 */
export function Timeline({ items }: { items: { date: string; title: string; text?: string }[] }) {
  if (items.length <= 3)
    return (
      <figure className="m-0 my-[8px]">
        <ol className="relative m-0 flex list-none flex-col gap-[14px] p-0 md:flex-row md:gap-[16px]">
          <span
            aria-hidden="true"
            className="absolute bottom-[8px] left-[7px] top-[8px] w-[2px] bg-rule md:bottom-auto md:left-[8px] md:right-[8px] md:top-[7px] md:h-[2px] md:w-auto"
          />
          {items.map((s, i) => (
            <li key={i} className="relative flex-1 pl-[30px] md:pl-0 md:pt-[30px]">
              <span
                aria-hidden="true"
                className={`absolute left-0 top-[2px] h-[16px] w-[16px] rounded-pill border-2 border-ink md:top-0 ${i === items.length - 1 ? 'bg-ac' : 'bg-sf'}`}
              />
              <span className="block text-[12px] font-bold uppercase tracking-[0.08em] text-mut">{s.date}</span>
              <span className="mt-[4px] block text-[15px] font-bold leading-[1.3]">{s.title}</span>
              {s.text ? (
                <span className="mt-[4px] block text-[13.5px] leading-[1.55] text-mut [text-wrap:pretty]">
                  <Rich text={keep(s.text)} />
                </span>
              ) : null}
            </li>
          ))}
        </ol>
      </figure>
    )
  return (
    <figure className="m-0 my-[8px]">
      <ol className="relative m-0 flex list-none flex-col gap-[18px] p-0">
        <span aria-hidden="true" className="absolute bottom-[10px] left-[7px] top-[10px] w-[2px] bg-rule" />
        {items.map((s, i) => (
          <li key={i} className="relative grid gap-x-[20px] gap-y-[4px] pl-[34px] md:grid-cols-[170px_minmax(0,1fr)]">
            <span
              aria-hidden="true"
              className={`absolute left-0 top-[3px] h-[16px] w-[16px] rounded-pill border-2 border-ink ${i === items.length - 1 ? 'bg-ac' : 'bg-sf'}`}
            />
            <span className="pt-[1px] text-[12px] font-bold uppercase leading-[1.5] tracking-[0.08em] text-mut">{s.date}</span>
            <span className="rounded-note border border-line bg-sf px-[18px] py-[14px]">
              <span className="block text-[15px] font-bold leading-[1.3]">{s.title}</span>
              {s.text ? (
                <span className="mt-[5px] block text-[13.5px] leading-[1.55] text-mut [text-wrap:pretty]">
                  <Rich text={keep(s.text)} />
                </span>
              ) : null}
            </span>
          </li>
        ))}
      </ol>
    </figure>
  )
}
