import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { App } from './App'

/** Shell smoke tests. The engines get real coverage from Phase 3 onward. */
describe('App shell', () => {
  it('renders the primary navigation', () => {
    render(<App />)
    const nav = screen.getByRole('navigation', { name: 'Primary' })
    expect(nav).toBeInTheDocument()
    for (const label of ['Home', 'Workouts', 'Runs', 'Analytics']) {
      expect(screen.getByRole('link', { name: label })).toBeInTheDocument()
    }
  })

  it('renders a skip link as an escape from nav for keyboard users', () => {
    render(<App />)
    expect(screen.getByRole('link', { name: 'Skip to content' })).toBeInTheDocument()
  })

  it('shows the 404 page for an unknown route', () => {
    window.location.hash = '#/no-such-page'
    render(<App />)
    expect(screen.getByRole('heading', { name: 'No such page.' })).toBeInTheDocument()
  })

  it('renders the styleguide with the validated palette warning intact', () => {
    window.location.hash = '#/styleguide'
    render(<App />)
    expect(
      screen.getByRole('heading', { name: 'Categorical palette' }),
    ).toBeInTheDocument()
    // If someone deletes this warning, the next person brightens cat-1 and
    // silently breaks colourblind separation.
    expect(screen.getByText(/Do not brighten cat-1/i)).toBeInTheDocument()
  })
})
