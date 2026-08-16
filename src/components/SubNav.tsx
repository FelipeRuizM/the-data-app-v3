import { Link } from 'react-router-dom'

/**
 * The sub-page links that sit beside a page's heading — Records and the monthly
 * report on a category list, Admin on Settings (D-62).
 *
 * One component so every sub-page link in the app looks and reads the same. A
 * route with nothing pointing at it is not a shipped feature, and this is where
 * that pointing happens.
 */
export function SubNav({
  links,
  label = 'Section',
}: {
  links: Array<{ to: string; label: string }>
  label?: string
}) {
  if (links.length === 0) return null

  return (
    <nav aria-label={label} className="flex flex-wrap gap-4">
      {links.map((link) => (
        <Link
          key={link.to}
          to={link.to}
          className="font-mono text-label tracking-[0.12em] text-ink-2 uppercase no-underline hover:text-ink-0"
        >
          {link.label}
        </Link>
      ))}
    </nav>
  )
}
