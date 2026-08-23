/* The sidebar's glyphs.
 *
 * Inline SVG, not an icon font and not a sprite file: the panel is served under
 * a strict content policy, and a font or an external sprite is one more request
 * that can fail and leave a row of empty boxes where the navigation was.
 *
 * Drawn on a 24-unit grid with a 1.75 stroke and no fill, so they sit at the
 * same visual weight as the 14px label beside them. `currentColor` throughout,
 * which is what lets the active item tint its icon along with its text without
 * a second rule.
 *
 * A word on legibility, because it is the honest weakness of an icon rail:
 * "Ecosystem", "Data requests" and "Audit trail" have no conventional glyph,
 * and nobody will read these correctly on first sight. That is why every icon
 * keeps its text label in the DOM, why the rail widens to show the labels the
 * moment a pointer or the keyboard reaches it, and why each link carries a
 * title. The icons are here to be recognised on the hundredth visit, not
 * understood on the first.
 */

type IconProps = { className?: string }

function Svg({ children, className }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      className={className ? `icon ${className}` : 'icon'}
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      /* Decorative: every one of these sits beside a real text label, so a
         screen reader announcing it would read the same thing twice. */
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  )
}

/** Four panes — the overview. */
export const IconDashboard = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3" y="3" width="7.5" height="7.5" rx="1.5" />
    <rect x="13.5" y="3" width="7.5" height="7.5" rx="1.5" />
    <rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5" />
    <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.5" />
  </Svg>
)

/** A building with a door: the tenants. */
export const IconOrganisations = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 21V6.5a1.5 1.5 0 0 1 1-1.4l7-2.4a1 1 0 0 1 1.3 1V21" />
    <path d="M13.3 10h5.2a1.5 1.5 0 0 1 1.5 1.5V21" />
    <path d="M2.5 21h19" />
    <path d="M10.5 21v-4h-3v4" />
  </Svg>
)

/** Connected nodes: who is on the platform and how they relate. */
export const IconEcosystem = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="5" r="2.4" />
    <circle cx="5" cy="18" r="2.4" />
    <circle cx="19" cy="18" r="2.4" />
    <path d="M10.4 7 6.6 15.8" />
    <path d="M13.6 7l3.8 8.8" />
    <path d="M7.4 18h9.2" />
  </Svg>
)

/** A document leaving: erasure and export requests. */
export const IconDataRequests = (p: IconProps) => (
  <Svg {...p}>
    <path d="M13.5 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-8" />
    <path d="M13.5 3v6h5.5" />
    <path d="M9 15.5h6" />
    <path d="M12.5 13l2.5 2.5-2.5 2.5" />
  </Svg>
)

/** A raised flag: something is contested. */
export const IconGrievances = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5.5 21V4" />
    <path d="M5.5 4.5h11l-2.2 4 2.2 4h-11" />
  </Svg>
)

/** An envelope: the notification templates. */
export const IconMessages = (p: IconProps) => (
  <Svg {...p}>
    <rect x="2.5" y="5" width="19" height="14" rx="2" />
    <path d="M3.5 6.5 12 13l8.5-6.5" />
  </Svg>
)

/** A frame with a caption: the announcement slides. */
export const IconSlides = (p: IconProps) => (
  <Svg {...p}>
    <rect x="2.5" y="4" width="19" height="12.5" rx="2" />
    <path d="M8 20h8" />
    <path d="M12 16.5V20" />
  </Svg>
)

/** A list under a clock hand: what happened, in order. */
export const IconAudit = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3.5 6.5h11" />
    <path d="M3.5 11.5h6" />
    <path d="M3.5 16.5h5" />
    <circle cx="16.5" cy="15.5" r="5" />
    <path d="M16.5 13.2v2.6l1.8 1.1" />
  </Svg>
)

/** A key: borrowed access, held briefly. */
export const IconSupport = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="7.5" cy="16.5" r="3.5" />
    <path d="M10 14 20 4" />
    <path d="M16.5 7.5 19 10" />
    <path d="M14 10 16.5 12.5" />
  </Svg>
)

/** Two people: the accounts and what they may do. */
export const IconUsers = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="9.5" cy="8" r="3.5" />
    <path d="M3 20a6.5 6.5 0 0 1 13 0" />
    <path d="M16.5 5.2a3.5 3.5 0 0 1 0 6.6" />
    <path d="M18 20a6.6 6.6 0 0 0-1.6-4.3" />
  </Svg>
)

/** A bell: work waiting on the operator. */
export const IconBell = (p: IconProps) => (
  <Svg {...p}>
    <path d="M18 9a6 6 0 1 0-12 0c0 5-2 6.5-2 6.5h16S18 14 18 9" />
    <path d="M13.7 19a2 2 0 0 1-3.4 0" />
  </Svg>
)

/** A tick, for the selected option in a menu. */
export const IconCheck = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4.5 12.5l5 5 10-11" />
  </Svg>
)

/** Leaving. */
export const IconSignOut = (p: IconProps) => (
  <Svg {...p}>
    <path d="M15 4.5h3.5a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H15" />
    <path d="M3.5 12h11" />
    <path d="M11 8.5 14.5 12 11 15.5" />
  </Svg>
)

/** The keyboard. */
export const IconKeyboard = (p: IconProps) => (
  <Svg {...p}>
    <rect x="2" y="6" width="20" height="12" rx="2" />
    <path d="M6 10h.01M9.5 10h.01M13 10h.01M16.5 10h.01" />
    <path d="M8 14h8" />
  </Svg>
)
