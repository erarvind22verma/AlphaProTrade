export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message)
    this.name = 'ApiError'
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    ...init,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...init.headers },
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    const message = typeof data.error === 'string' ? data.error : response.statusText || 'Request failed'
    throw new ApiError(message, response.status)
  }
  return data as T
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) => request<T>(path, {
    method: 'POST',
    body: body === undefined ? undefined : JSON.stringify(body),
  }),
  login: (email: string, password: string) => api.post<{ user: AppUser }>('/api/users/login', { email, password }),
  logout: () => api.post<{ message?: string }>('/api/users/logout'),
  me: () => api.get<{ user: AppUser | null }>('/api/users/me'),
  permissions: () => api.get<PermissionResponse>('/api/users/permissions'),
  entitlements: () => api.get<{ entitlements: FeatureEntitlement[] }>('/api/features/entitlements/me'),
  subscription: () => api.get<{ subscription: SubscriptionRecord | null }>('/api/user-subscriptions/me'),
  plans: () => api.get<{ plans: SubscriptionPlan[] }>('/api/subscription-plans/catalog'),
  simulateUpgrade: (planCode: string) => api.post<{ subscription: SubscriptionRecord; simulated: boolean; paymentProcessed: false }>(
    '/api/subscription-plans/simulate-upgrade', { planCode },
  ),
  widgetCatalog: () => api.get<{ widgets: WidgetCatalogItem[]; simulatedBilling: boolean }>('/api/user-widget-subscriptions/catalog'),
  widgetSubscriptions: () => api.get<{ subscriptions: UserWidgetSubscription[] }>('/api/user-widget-subscriptions/me'),
  purchaseWidget: (featureCode: string, billingCycle: WidgetBillingCycle) => api.post<{
    subscription: UserWidgetSubscription
    simulated: boolean
    paymentProcessed: false
  }>('/api/user-widget-subscriptions/purchase', { featureCode, billingCycle }),
  cancelWidget: (subscriptionId: string | number) => api.post<{
    subscription: UserWidgetSubscription
    accessUntil?: string
    simulated: boolean
  }>('/api/user-widget-subscriptions/cancel', { subscriptionId }),
  collection: <T>(slug: string, query = 'limit=50&sort=-createdAt') =>
    api.get<{ docs: T[]; totalDocs: number }>(`/api/${slug}?${query}`),
}

export interface AppUser {
  id: string | number
  email: string
  role?: string
  accountStatus?: string
  name?: string
}

export interface PermissionResponse {
  user: AppUser
  permissions: Record<string, boolean>
}

export interface FeatureEntitlement {
  code: string
  name: string
  allowed: boolean
}

export interface SubscriptionPlan {
  id: string | number
  name: string
  code: string
  description?: string
  ctaLabel?: string
  ctaURL?: string
  price: number
  currency: string
  billingInterval: 'monthly' | 'yearly'
  features: string[]
  demoPrice?: boolean
}

export interface SubscriptionRecord {
  id: string | number
  status: string
  startDate: string
  endDate?: string | null
  plan?: SubscriptionPlan | { id: string | number; name?: string; code?: string; price?: number; currency?: string } | string | number
}

export type WidgetBillingCycle = 'monthly' | 'yearly'

export interface WidgetCatalogItem {
  featureId: string | number
  featureCode: string
  name: string
  description?: string
  monthlyPrice: number
  yearlyPrice: number
  currency: string
  includedInMainPlan: boolean
  demoPrice: true
}

export interface UserWidgetSubscription {
  id: string | number
  feature: { id: string | number; code: string; name: string } | null
  billingCycle: WidgetBillingCycle
  price: number
  currency: string
  startDate: string
  currentPeriodEnd: string
  renewalDate: string
  status: 'active' | 'cancelled' | 'expired'
  cancellationDate?: string | null
}

export interface CMSRecord {
  id: string | number
  title?: string
  question?: string
  email?: string
  name?: string
  code?: string
  role?: string
  status?: string
  workflowStatus?: string
  slug?: string
  summary?: string
  description?: string
  ctaLabel?: string
  ctaURL?: string
  heading?: string
  category?: string
  price?: number
  currency?: string
  billingInterval?: string
  displayOrder?: number
  publishedAt?: string | null
  createdAt?: string
  author?: string | number | { id: string | number; email?: string }
  plan?: unknown
  feature?: unknown
  image?: unknown
  featuredImage?: unknown
  content?: unknown
  [key: string]: unknown
}
