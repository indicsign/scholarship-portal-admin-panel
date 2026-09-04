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

/* A document with a tick: verification.
 *
 * This slot held a document with an arrow leaving it, for the export and
 * erasure queue, and was pressed into service for verification when that queue
 * went. The two are opposite acts — one sends a record away, one attests to it —
 * and an icon that says the wrong thing is worse than a generic one, because the
 * rail is glyph-only until it is hovered. */
export const IconVerifications = (p: IconProps) => (
  <Svg {...p}>
    <path d="M13.5 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h5" />
    <path d="M13.5 3v6H19v3" />
    <path d="M9 12h3" />
    <path d="M14 17.5l2 2 4-4" />
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

/* A grid with ticks: rows against columns, which is literally what the screen
 * is. Deliberately not a key or a padlock — both say "security" and neither says
 * "a table of who may do what", and a padlock beside IconUsers would read as
 * locking accounts rather than as setting their reach. */
export const IconRoles = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <path d="M3 9h18" />
    <path d="M9 9v11" />
    <path d="M11.4 12.6l1.4 1.4 2.6-2.8" />
    <path d="M11.4 17.1l1.4 1.4 2.6-2.8" />
  </Svg>
)

/** A mortarboard: what the money is for. */
export const IconScholarships = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 3.6 22 8.3 12 13 2 8.3z" />
    <path d="M6.6 10.5v4.4c0 1.6 2.4 2.9 5.4 2.9s5.4-1.3 5.4-2.9v-4.4" />
    <path d="M22 8.3v4.8" />
  </Svg>
)

/* --- authoring form sections -------------------------------------------------
 *
 * Landmarks in a long dialog. The heading beside each one says what it is, so
 * these only have to be distinguishable from one another at a glance while
 * scrolling — which is what makes a single bold object right here and a clever
 * composite wrong. */

/** A page with writing on it: the listing itself. */
export const IconScheme = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6 3h7l5 5v12.5a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" />
    <path d="M13 3v5h5" />
    <path d="M8.5 13h7" />
    <path d="M8.5 16.5h4.5" />
  </Svg>
)

/** A banknote: what the student actually receives. */
export const IconBenefit = (p: IconProps) => (
  <Svg {...p}>
    <rect x="2.5" y="6" width="19" height="12" rx="2" />
    <circle cx="12" cy="12" r="2.6" />
    <path d="M6 10v4" />
    <path d="M18 10v4" />
  </Svg>
)

/** A funnel: the conditions that narrow who this is for. */
export const IconEligibility = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 5h18l-7 8.2V20l-4 1.5v-8.3z" />
  </Svg>
)

/** An arrow leaving a frame: where the student goes next. */
export const IconApply = (p: IconProps) => (
  <Svg {...p}>
    <path d="M14 3.5h6.5V10" />
    <path d="M20.5 3.5 12 12" />
    <path d="M18.5 14v5.5a2 2 0 0 1-2 2h-11a2 2 0 0 1-2-2v-11a2 2 0 0 1 2-2H11" />
  </Svg>
)

/** A label with its eyelet: how a visitor finds this in the directory. */
export const IconTag = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 12.4V4.6a1.6 1.6 0 0 1 1.6-1.6h7.8l8.2 8.2a1.6 1.6 0 0 1 0 2.3l-6.5 6.5a1.6 1.6 0 0 1-2.3 0z" />
    <circle cx="7.6" cy="7.6" r="1.5" />
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
