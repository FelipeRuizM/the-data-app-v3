import { useState, type FormEvent } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { Button, Label, Rule } from '../components/ui'
import { useAuth } from '../auth/hooks'

/**
 * The only route reachable without a session. Serves three distinct states,
 * which is the part worth getting right:
 *
 *  1. signed out            → offer sign-in
 *  2. signed in, provisioned → bounce to wherever they were headed
 *  3. signed in, NOT provisioned → say so plainly and offer a way out
 *
 * State 3 is the one an invite-only app must handle well. Silently looping
 * someone back to a sign-in button they just used reads as a broken site.
 */
export function Login() {
  const { status, user, role, error, signInWithGoogle, signInAsGuest, signOut } =
    useAuth()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)

  if (status === 'loading') {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <Label>Checking your session…</Label>
      </div>
    )
  }

  if (role !== 'none') {
    const from = (location.state as { from?: string } | null)?.from
    return <Navigate to={from && from !== '/login' ? from : '/'} replace />
  }

  const onGuestSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    await signInAsGuest(email.trim(), password)
    setBusy(false)
  }

  // Signed in with a real Google account, but nobody invited them.
  if (user) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-5 px-5">
        <Label>Not invited</Label>
        <h1 className="m-0 text-2xl font-semibold text-ink-0">
          This account doesn&rsquo;t have access.
        </h1>
        <p className="m-0 text-ink-1">
          You&rsquo;re signed in as{' '}
          <span className="font-mono text-ink-0">{user.email ?? user.uid}</span>, but
          this app is invite-only. Ask the owner to add your account, or sign in with a
          different one.
        </p>
        <div>
          <Button onClick={() => void signOut()}>Sign out</Button>
        </div>
      </main>
    )
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 px-5">
      <header className="flex flex-col gap-2">
        <Label>the data app</Label>
        <h1 className="m-0 text-2xl font-semibold tracking-tight text-ink-0">
          Sign in to continue.
        </h1>
        <p className="m-0 text-sm text-ink-2">
          Everything in here is behind an account. Invite-only.
        </p>
      </header>

      {error ? (
        <p
          role="alert"
          className="m-0 border-l-2 border-accent py-1 pl-3 text-sm text-ink-1"
        >
          {error}
        </p>
      ) : null}

      <Button variant="primary" onClick={() => void signInWithGoogle()}>
        Continue with Google
      </Button>

      <div className="flex items-center gap-3">
        <div className="flex-1">
          <Rule />
        </div>
        <Label>or guest access</Label>
        <div className="flex-1">
          <Rule />
        </div>
      </div>

      <form className="flex flex-col gap-3" onSubmit={(e) => void onGuestSubmit(e)}>
        <label className="flex flex-col gap-1">
          <Label>Email</Label>
          <input
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="rounded-sm border border-rule bg-transparent px-3 py-2 font-mono text-sm text-ink-0 placeholder:text-ink-3"
            placeholder="guest@…"
          />
        </label>
        <label className="flex flex-col gap-1">
          <Label>Password</Label>
          <input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="rounded-sm border border-rule bg-transparent px-3 py-2 font-mono text-sm text-ink-0"
          />
        </label>
        <div>
          <Button type="submit" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in as guest'}
          </Button>
        </div>
      </form>

      <p className="m-0 text-xs text-ink-3">
        Guest access is read-only. Every write control is hidden, and the database rules
        reject writes regardless.
      </p>
    </main>
  )
}
