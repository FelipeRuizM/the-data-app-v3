import { describe, expect, it } from 'vitest'
import {
  formatDistance,
  formatSetWeight,
  formatVolume,
  formatWeight,
  kgToLb,
} from './units'

describe('formatWeight', () => {
  it('renders kg unchanged', () => {
    expect(formatWeight(60, 'kg')).toBe('60 kg')
  })

  it('converts to lb for display only', () => {
    // Storage stays weight_kg, always. This is a display-layer conversion (D-18).
    expect(formatWeight(100, 'lb')).toBe('220.5 lb')
  })

  it('trims a trailing .0 so "60 kg" beats "60.0 kg"', () => {
    expect(formatWeight(60.0, 'kg')).toBe('60 kg')
    expect(formatWeight(62.5, 'kg')).toBe('62.5 kg')
  })

  it('renders an em dash for null', () => {
    expect(formatWeight(null, 'kg')).toBe('—')
  })

  it('can omit the unit', () => {
    expect(formatWeight(60, 'kg', { withUnit: false })).toBe('60')
  })
})

describe('formatSetWeight — the three states stay distinguishable (D-7b)', () => {
  it('renders a real load', () => {
    expect(formatSetWeight({ kind: 'loaded', kg: 60 }, 'kg')).toBe('60 kg')
  })

  it('renders a genuine zero as 0 kg, not as missing', () => {
    expect(formatSetWeight({ kind: 'zero' }, 'kg')).toBe('0 kg')
  })

  it('renders bodyweight as BW, not as 0 and not as an em dash', () => {
    expect(formatSetWeight({ kind: 'bodyweight' }, 'kg')).toBe('BW')
  })

  it('never renders two different states the same way', () => {
    const rendered = new Set([
      formatSetWeight({ kind: 'loaded', kg: 60 }, 'kg'),
      formatSetWeight({ kind: 'zero' }, 'kg'),
      formatSetWeight({ kind: 'bodyweight' }, 'kg'),
    ])
    expect(rendered.size).toBe(3)
  })
})

describe('formatVolume', () => {
  it('groups thousands and drops decimals', () => {
    expect(formatVolume(14820, 'kg')).toBe('14,820')
  })
  it('renders an em dash for null', () => {
    expect(formatVolume(null, 'kg')).toBe('—')
  })
})

describe('formatDistance / kgToLb', () => {
  it('renders distance to two decimals', () => {
    expect(formatDistance(6.4)).toBe('6.40 km')
    expect(formatDistance(null)).toBe('—')
  })
  it('converts kg to lb', () => {
    expect(kgToLb(1)).toBeCloseTo(2.2046, 3)
  })
})
