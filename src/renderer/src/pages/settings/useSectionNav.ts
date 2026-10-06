import { useCallback, useEffect, useState } from 'react'

/**
 * Scroll-spy for the Settings mini-nav. The active section is the first (in page order)
 * whose element crosses a band near the top of the viewport.
 */
export function useSectionNav(ids: readonly string[]): { active: string; scrollTo: (id: string) => void } {
  const [active, setActive] = useState(ids[0] ?? '')

  useEffect(() => {
    const visible = new Set<string>()
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) visible.add(entry.target.id)
          else visible.delete(entry.target.id)
        }
        const first = ids.find((id) => visible.has(id))
        if (first) setActive(first)
      },
      { rootMargin: '-12% 0px -68% 0px', threshold: 0 }
    )
    for (const id of ids) {
      const el = document.getElementById(id)
      if (el) observer.observe(el)
    }
    return () => observer.disconnect()
  }, [ids])

  const scrollTo = useCallback((id: string): void => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    setActive(id)
  }, [])

  return { active, scrollTo }
}
