import type { AdminIcon } from '@/lib/admin/nav'

/**
 * The admin menu's icons (X-091): 16px line drawings on a 24px grid, stroked in the text's own
 * colour, so an icon is as dark as its label and turns with it. Decorative: the link or button
 * that holds one carries the name.
 */
const PATHS: Record<AdminIcon | 'collapse' | 'expand' | 'menu' | 'close' | 'signout', string> = {
  dashboard: 'M4 4h7v7H4zM13 4h7v4h-7zM13 10h7v10h-7zM4 13h7v7H4z',
  building: 'M5 21V5a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v16M15 10h3a1 1 0 0 1 1 1v10M3 21h18M8 8h3M8 12h3M8 16h3',
  pulse: 'M3 12h4l2-5 4 10 2-5h6',
  users: 'M16 20v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 18.5V20M10 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7M20 20v-1.5a3.5 3.5 0 0 0-2.5-3.35M15.5 4.2a3.5 3.5 0 0 1 0 6.6',
  ticket: 'M4 8a2 2 0 0 0 0 4v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4a2 2 0 0 1 0-4V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1zM14 4v13',
  target: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8M12 12h.01',
  kanban: 'M4 4h4v16H4zM10 4h4v10h-4zM16 4h4v6h-4z',
  inbox: 'M4 13l2.5-8h11L20 13v6H4zM4 13h5l1 2h4l1-2h5',
  mail: 'M4 6h16v12H4zM4 7l8 6 8-6',
  contacts: 'M6 3h12a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H6zM12 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5M8.5 17a3.5 3.5 0 0 1 7 0M4 7h2M4 12h2M4 17h2',
  list: 'M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01',
  filter: 'M4 5h16l-6 7.5V19l-4 1v-7.5z',
  template: 'M5 4h14v16H5zM8 8h8M8 12h8M8 16h5',
  flag: 'M5 21V4M5 4h11l-2 4 2 4H5',
  chart: 'M4 20V4M4 20h16M8 16v-4M12 16V8M16 16v-6',
  coins: 'M9 11a5 3 0 1 0 0-.01M4 11v4c0 1.66 2.24 3 5 3s5-1.34 5-3v-4M14 7.3c.6-.2 1.3-.3 2-.3 2.76 0 5 1.34 5 3v4c0 1.4-1.6 2.6-3.8 2.9',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14M20 20l-4-4',
  puzzle: 'M9 4h4v2a1.5 1.5 0 0 0 3 0V4h4v4h-2a1.5 1.5 0 0 0 0 3h2v4h-4v-2a1.5 1.5 0 0 0-3 0v2H9v-4H7a1.5 1.5 0 0 1 0-3h2zM9 15v5h11v-5',
  scale: 'M12 4v16M8 20h8M5 7h14M5 7l-3 7a3 3 0 0 0 6 0zM19 7l-3 7a3 3 0 0 0 6 0z',
  globe: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18M3 12h18M12 3c2.5 2.7 3.8 5.7 3.8 9s-1.3 6.3-3.8 9c-2.5-2.7-3.8-5.7-3.8-9S9.5 5.7 12 3',
  activity: 'M4 12h3l3 7 4-14 3 7h3',
  log: 'M8 4h8l3 3v13H5V4zM9 10h6M9 14h6M9 18h3',
  shield: 'M12 3l7 3v5c0 4.5-3 8.3-7 10-4-1.7-7-5.5-7-10V6zM9 12l2 2 4-4',
  collapse: 'M15 6l-6 6 6 6',
  expand: 'M9 6l6 6-6 6',
  menu: 'M4 7h16M4 12h16M4 17h16',
  close: 'M6 6l12 12M18 6L6 18',
  signout: 'M15 4h3a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-3M10 16l-4-4 4-4M6 12h10',
}

export function Icon({ name, size = 16 }: { name: keyof typeof PATHS; size?: number }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={PATHS[name]} />
    </svg>
  )
}
