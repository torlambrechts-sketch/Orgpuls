import type { Config } from 'tailwindcss'

/**
 * Tokens are transcribed from the Orgpuls design bundle, not chosen here.
 * Every hex below appears verbatim in Orgpuls.dc.html. Do not add a colour that
 * the bundle does not contain, and do not adjust one that it does — the pixel
 * gate diffs against the bundle's own rendering, so an "improved" value fails.
 */
const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // surfaces
        bg: '#FCF6E9',        // app canvas, inset field background
        sf: '#FFFDF6',        // card surface
        // text
        ink: '#191510',       // ink: text, hard border, active pill fill
        body: '#3A342A',      // document body text
        mut: '#5F5849',       // muted text, labels, leads
        faint: '#8A8272',     // faintest text, placeholders
        disabled: '#A39A88',  // disabled text
        // lines
        line: '#E8DFC9',      // hairline border
        rule: '#C4BCA8',      // dashed border, inactive dot
        // accent (yellow)
        ac: '#F5C64A',        // primary CTA
        sbg: '#FBEBBE',       // soft yellow: selected chip, accent panel
        band: '#F5DC96',      // middle risk band
        sand: '#EFE6D2',      // the playbook's Lederpraksis pill
        track: '#F2EAD6',     // design 3: the Enkel/Full track, a side-rail icon at rest
        pulse: '#E4EEEC',     // design 3: a puls — its chip, its type pill, its summary card
        sage: '#9DB8B3',      // design 3: a puls chip's border, a puls bar, the compared year
        stone: '#D9CFB8',     // design 3: a grunnlinje bar on the time line
        cream: '#F7EDD2',     // design 3: Prioritet's "Følg med" quadrant
        mint3: '#8FC7BE',     // design 3: Segmentprofil's "over resten" bar
        amberbar: '#E0A21F',
        caution: '#8A6A00',
        cautiondeep: '#5C4600',
        // green
        link: '#2F5D2A',
        linkhover: '#1E3D1A',
        greendeep: '#20431C',
        greenbar: '#5C9A55',
        mint: '#CFE7E4',      // positive fill
        mint2: '#B5DAD4',     // top distribution segment
        teal: '#A8D5D2',
        // warm / risk
        peach: '#FBD5C4',
        peach2: '#F0B9A0',
        orange: '#E38258',
        orange2: '#EC9B77',
        rustbar: '#D4633A',
        danger: '#A33A16',
        dangerdeep: '#6B240C',
        rustdeep: '#5A2410',  // ink on a peach fill — the varsel notice
      },
      fontFamily: {
        display: ['var(--font-playfair)', 'Playfair Display', 'serif'],
        sans: ['var(--font-dmsans)', 'DM Sans', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        // the bundle's base is 14px, not Tailwind's 16px
        base: ['14px', '1.5'],
      },
      /**
       * Orgpuls does NOT have a single corner radius. It has a scale, and which value
       * a component uses is part of its identity — a nav button is 10, a card is 20,
       * a chip is fully round. Transcribed from the bundle, every value observed:
       *   9  stacked-bar, brand mark, small CTA
       *   10 nav button, Hjelp button, role select, row CTA
       *   11 checklist button, avatar 26-38px, secondary/primary button
       *   12 primary CTA, two-line report button
       *   13 Deltakelse group row, factor card
       *   14 respondent option, comment box, primary answer button
       *   15 task row
       *   16 assistant note card, rounds-list row
       *   18 Malinger panel card
       *   20 panel card
       *   6  focus ring (bundle line 23)
       *   999 pills, dots, avatar chip
       */
      borderRadius: {
        focus: '6px',
        bar: '9px',
        ctl: '10px',
        btn: '11px',
        cta: '12px',
        tile: '13px',
        opt: '14px',
        row: '15px',
        note: '16px',
        panel: '18px',
        card: '20px',
        pill: '999px',
      },
      /**
       * The page column. Design 3 (`pageW`) caps it at 1180px in the top layout and
       * lifts the cap in the side layout, so every screen reads it from one variable the
       * shell sets rather than each hard-coding the number.
       */
      maxWidth: {
        page: 'var(--page-w, 1180px)',
        // Oversikt's narrower column (`ovW`): 880px, or 1040px in the side layout
        overview: 'var(--overview-w, 880px)',
      },
      keyframes: {
        // bundle line 24: @keyframes ht-in
        'ht-in': {
          from: { opacity: '0', transform: 'translateY(6px)' },
          to: { opacity: '1', transform: 'none' },
        },
      },
      animation: {
        'ht-in': 'ht-in .25s ease',
      },
    },
  },
  plugins: [],
}

export default config
