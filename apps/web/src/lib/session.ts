import type { AppUser, FeatureEntitlement, SubscriptionRecord } from './api'

export interface SessionState {
  user: AppUser | null
  permissions: Record<string, boolean>
  entitlements: FeatureEntitlement[]
  subscription: SubscriptionRecord | null
}

export const emptySession: SessionState = {
  user: null,
  permissions: {},
  entitlements: [],
  subscription: null,
}

export type SessionAction =
  | { type: 'login'; user: AppUser }
  | { type: 'refresh'; state: SessionState }
  | { type: 'logout' }
  | { type: 'unauthorized' }
  | { type: 'subscription'; subscription: SubscriptionRecord | null }

export function sessionReducer(state: SessionState, action: SessionAction): SessionState {
  switch (action.type) {
    case 'login': return { ...emptySession, user: action.user }
    case 'refresh': return action.state
    case 'subscription': return { ...state, subscription: action.subscription }
    case 'logout':
    case 'unauthorized': return emptySession
    default: return state
  }
}

export function getAccessibleFeatureCodes(entitlements: FeatureEntitlement[]): Set<string> {
  return new Set(entitlements.filter((item) => item.allowed).map((item) => item.code))
}

export function isFeatureLocked(code: string, entitlements: FeatureEntitlement[]): boolean {
  return !getAccessibleFeatureCodes(entitlements).has(code)
}

export function replaceSubscription(
  state: SessionState,
  subscription: SubscriptionRecord | null,
): SessionState {
  return { ...state, subscription }
}
