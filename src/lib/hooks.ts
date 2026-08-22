import { useCallback, useEffect, useState } from 'react'

export interface QueryMeta {
  page: number
  page_size: number
  total: number
  has_more: boolean
}

export interface Query<T> {
  data: T | null
  meta: QueryMeta | null
  /** A request for the current dependencies is in flight. */
  loading: boolean
  /** What `data` holds was fetched for an earlier set of dependencies. */
  stale: boolean
  error: unknown
  reload: () => void
}

/* A deliberately small data hook rather than a query library. The panel makes a
 * dozen distinct calls; a cache layer would be more configuration than code.
 *
 * `loading` is derived from whether the stored result belongs to the current
 * set of dependencies, rather than being set at the top of the effect. Both
 * produce the same behaviour, but setting state synchronously inside an effect
 * schedules a second render before the first has painted, and React's lint
 * rules flag it for that reason.
 *
 * The last result is kept while the next one is in flight, and reported as
 * `stale`. Discarding it instead unmounts the whole table on every filter
 * change, which costs the operator their scroll position and replaces fifty
 * rows with the word "Loading" for as long as the round trip takes. Keeping it
 * is not a lie as long as the screen says so, which is what `stale` is for:
 * the caller puts a progress bar over the region and marks it aria-busy and
 * inert, so the rows on screen read as the previous answer rather than as a
 * wrong current one.
 */
export function useQuery<T>(
  fetcher: (signal: AbortSignal) => Promise<{ data: T; meta?: QueryMeta | null }>,
  deps: unknown[],
): Query<T> {
  const [nonce, setNonce] = useState(0)
  // Dependencies are filter values — strings and numbers — so serialising them
  // is a sound identity for "this is the same request".
  const key = `${JSON.stringify(deps)}|${nonce}`

  const [result, setResult] = useState<{
    key: string
    data: T | null
    meta: QueryMeta | null
    error: unknown
  } | null>(null)

  useEffect(() => {
    const controller = new AbortController()

    fetcher(controller.signal)
      .then(res => {
        if (controller.signal.aborted) return
        setResult({ key, data: res.data, meta: res.meta ?? null, error: null })
      })
      .catch(err => {
        // An abort is a navigation, not a failure. Reporting it would flash an
        // error panel every time somebody changes a filter.
        if (controller.signal.aborted || err?.name === 'AbortError') return
        setResult({ key, data: null, meta: null, error: err })
      })

    return () => controller.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  const fresh = result?.key === key
  const reload = useCallback(() => setNonce(n => n + 1), [])

  return {
    // Held over from the previous dependencies when the current request has
    // not landed yet. An error is not held over: a stale table beside a fresh
    // error message would read as though the rows were what failed.
    data: result?.data ?? null,
    meta: result?.meta ?? null,
    loading: !fresh,
    stale: !fresh && result !== null && result.error == null,
    error: fresh ? result.error : null,
    reload,
  }
}

/** Delays a rapidly-changing value — a search box, typically. */
export function useDebounced<T>(value: T, ms = 300) {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), ms)
    return () => window.clearTimeout(id)
  }, [value, ms])

  return debounced
}
