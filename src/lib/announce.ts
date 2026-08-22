import { createContext, useContext } from 'react'

/* The announcement channel.
 *
 * Kept apart from the component that renders it so that both a page and the
 * provider can import the hook without pulling a component into a module that
 * exports only functions — which is what breaks Fast Refresh.
 */

/** How an announcement is coloured. The words always carry the meaning too. */
export type Tone = 'ok' | 'warn' | 'danger'

export type Announce = (message: string, tone?: Tone) => void

export const AnnouncerContext = createContext<Announce>(() => {})

/**
 * Reports the result of an action: spoken into the page's ARIA live region and
 * shown on screen at the same time.
 */
export const useAnnounce = () => useContext(AnnouncerContext)
