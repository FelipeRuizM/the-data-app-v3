import { Link } from 'react-router-dom'
import { Label } from '../components/ui'

export function NotFound() {
  return (
    <section className="flex flex-col gap-4 py-16">
      <Label>404</Label>
      <h1 className="m-0 text-2xl font-semibold text-ink-0">No such page.</h1>
      <p className="m-0 max-w-prose text-ink-1">
        That route doesn&rsquo;t exist. It may be from a later phase, or the URL may
        have lost part of itself.
      </p>
      <p className="m-0">
        <Link
          to="/"
          className="font-mono text-label uppercase tracking-[0.12em] text-accent"
        >
          Back to home
        </Link>
      </p>
    </section>
  )
}
