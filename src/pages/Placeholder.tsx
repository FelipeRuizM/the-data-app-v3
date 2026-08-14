import { Label } from '../components/ui'

/**
 * Stand-in for routes whose real page arrives in a later phase. Deliberately
 * says which phase, so a half-built app never reads as a broken one.
 */
export function Placeholder({ title, phase }: { title: string; phase: string }) {
  return (
    <section className="flex flex-col gap-4 py-16">
      <Label>Not built yet</Label>
      <h1 className="m-0 text-2xl font-semibold text-ink-0">{title}</h1>
      <p className="m-0 max-w-prose text-ink-1">
        This page lands in <span className="font-mono text-ink-0">{phase}</span>. The
        shell, tokens and deploy pipeline are what Phase 1 ships — see{' '}
        <span className="font-mono text-ink-0">PLAN.md</span>.
      </p>
    </section>
  )
}
