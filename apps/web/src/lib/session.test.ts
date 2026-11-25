import { describe, expect, it } from 'vitest'

import { emptySession, getAccessibleFeatureCodes, isFeatureLocked, sessionReducer } from './session'
import { featureCatalog } from './demo'

describe('frontend authorization state helpers', () => {
  it('shows only the five simplified trading widgets', () => {
    expect(featureCatalog.map(({ name }) => name)).toEqual([
      'Market Overview',
      'Stock Watchlist',
      'Stock Charts',
      'Market News',
      'Portfolio Summary',
    ])
  })

  it('stores the Payload login user and clears it at logout', () => {
    const user = { id: 7, email: 'trader@example.test', role: 'trader' }
    const loggedIn = sessionReducer(emptySession, { type: 'login', user })
    expect(loggedIn.user).toEqual(user)
    expect(sessionReducer(loggedIn, { type: 'logout' })).toEqual(emptySession)
  })

  it('treats features without a backend grant as locked', () => {
    const entitlements = [
      { code: 'market-overview', name: 'Market Overview', allowed: true },
      { code: 'watchlist', name: 'Stock Watchlist', allowed: false },
      { code: 'basic-charts', name: 'Stock Charts', allowed: false },
      { code: 'market-news', name: 'Market News', allowed: false },
      { code: 'portfolio-analytics', name: 'Portfolio Summary', allowed: false },
    ]
    expect([...getAccessibleFeatureCodes(entitlements)]).toEqual(['market-overview'])
    expect(isFeatureLocked('market-overview', entitlements)).toBe(false)
    expect(isFeatureLocked('watchlist', entitlements)).toBe(true)
    expect(isFeatureLocked('unknown-feature', entitlements)).toBe(true)
    expect(featureCatalog).toHaveLength(5)
    expect(getAccessibleFeatureCodes(entitlements).size).toBe(1)
  })

  it('drops authentication state after a 401 signal', () => {
    const loggedIn = sessionReducer(emptySession, {
      type: 'login', user: { id: 7, email: 'trader@example.test' },
    })
    expect(sessionReducer(loggedIn, { type: 'unauthorized' })).toEqual(emptySession)
  })

  it('updates the visible subscription after a successful simulated plan change', () => {
    const subscription = { id: 12, status: 'active', startDate: '2026-11-25T00:00:00.000Z', plan: { id: 5, code: 'premium' } }
    const changed = sessionReducer(emptySession, { type: 'subscription', subscription })
    expect(changed.subscription).toEqual(subscription)
  })
})
