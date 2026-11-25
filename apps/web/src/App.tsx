'use client'

import { useCallback, useEffect, useMemo, useReducer, useState } from 'react'
import { usePathname } from 'next/navigation'

import { ThemeToggle } from './components/theme-toggle'
import { api, ApiError } from './lib/api'
import type { AppUser, CMSRecord, SubscriptionPlan, UserWidgetSubscription, WidgetBillingCycle, WidgetCatalogItem } from './lib/api'
import { featureCatalog, newsDemo, watchlist } from './lib/demo'
import { emptySession, getAccessibleFeatureCodes, sessionReducer } from './lib/session'
import type { SessionState } from './lib/session'

type Screen = 'overview' | 'admin' | 'plans' | 'content'
type Dataset = { rows: CMSRecord[]; error?: string; loading: boolean }

const initialDatasets: Record<string, Dataset> = {}
const labelRole = (role = '') => role.replaceAll('_', ' ')
const formatCurrency = (amount: number, currency = 'USD') => new Intl.NumberFormat('en-US', {
  style: 'currency', currency, maximumFractionDigits: 0,
}).format(amount)
const initials = (user: AppUser | null) => (user?.email?.split('@')[0]?.slice(0, 2) || 'AP').toUpperCase()
const canManageCMS = (permissions: Record<string, boolean>) => Boolean(
  permissions.readUsers || permissions.readPlans || permissions.readFeatures,
)

export default function App() {
  const pathname = usePathname()
  if (pathname.replace(/\/$/, '') === '/about') return <PublicCMSPage slug="about" />
  return <AuthenticatedApp />
}

function AuthenticatedApp() {
  const [session, dispatch] = useReducer(sessionReducer, emptySession)
  const [screen, setScreen] = useState<Screen>('overview')
  const [booting, setBooting] = useState(true)
  const [notice, setNotice] = useState('')
  const [plans, setPlans] = useState<SubscriptionPlan[]>([])
  const [datasets, setDatasets] = useState<Record<string, Dataset>>(initialDatasets)
  const [loadingAdmin, setLoadingAdmin] = useState(false)
  const [busyPlan, setBusyPlan] = useState('')
  const handleUnauthorized = useCallback(() => dispatch({ type: 'unauthorized' }), [])

  const refreshSession = useCallback(async (userOverride?: AppUser) => {
    const [me, permissions, entitlements, subscription] = await Promise.all([
      userOverride ? Promise.resolve({ user: userOverride }) : api.me(),
      api.permissions(), api.entitlements(), api.subscription(),
    ])
    const next: SessionState = {
      user: me.user,
      permissions: permissions.permissions,
      entitlements: entitlements.entitlements,
      subscription: subscription.subscription,
    }
    dispatch({ type: 'refresh', state: next })
    return next
  }, [])

  const refreshPlans = useCallback(async () => {
    const result = await api.plans()
    setPlans(result.plans)
  }, [])

  useEffect(() => {
    let alive = true
    const loadSession = refreshSession()
      .then((next) => {
        if (alive && canManageCMS(next.permissions)) setScreen('admin')
      })
      .catch((error: unknown) => {
        if (!alive) return
        if (error instanceof ApiError && error.status === 401) dispatch({ type: 'unauthorized' })
        else if (error instanceof ApiError && error.status === 403) setNotice('Your account does not have access to that area.')
        else if (error instanceof Error && !error.message.includes('401')) setNotice(error.message)
      })
    const loadPlans = refreshPlans().catch(() => {
      if (alive) setPlans([])
    })
    Promise.all([loadSession, loadPlans]).finally(() => alive && setBooting(false))
    return () => { alive = false }
  }, [refreshSession, refreshPlans])

  const isAdmin = canManageCMS(session.permissions)
  const canSeeContent = Boolean(session.permissions.readContent || session.permissions.readAllContent)
  const isAuthenticated = Boolean(session.user)

  const loadAdminData = useCallback(async () => {
    if (!session.user || !isAdmin) return
    const datasetsToLoad: Array<[string, string, string]> = [
      ['Users', 'users', 'limit=100&sort=email'],
      ['Plans', 'subscription-plans', 'limit=100&sort=name'],
      ['Features', 'features', 'limit=100&sort=name'],
      ['Entitlements', 'feature-entitlements', 'limit=100&depth=1'],
      ['Subscriptions', 'user-subscriptions', 'limit=100&depth=1&sort=-startDate'],
      ['Pages', 'pages', 'limit=100&sort=-updatedAt'],
      ['News', 'news', 'limit=100&sort=-updatedAt'],
      ['Banners', 'banners', 'limit=100&sort=displayOrder'],
      ['FAQs', 'faqs', 'limit=100&sort=displayOrder'],
    ]
    setLoadingAdmin(true)
    const entries = await Promise.all(datasetsToLoad.map(async ([label, slug, query]) => {
      try {
        const result = await api.collection<CMSRecord>(slug, query)
        return [label, { rows: result.docs, loading: false }] as const
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) dispatch({ type: 'unauthorized' })
        return [label, { rows: [], loading: false, error: error instanceof Error ? error.message : 'Request failed' }] as const
      }
    }))
    setDatasets(Object.fromEntries(entries))
    setLoadingAdmin(false)
  }, [isAdmin, session.user])

  useEffect(() => {
    if (screen === 'admin') void loadAdminData()
  }, [screen, loadAdminData])

  const handleLogin = async (email: string, password: string) => {
    setNotice('')
    try {
      const result = await api.login(email, password)
      const next = await refreshSession(result.user)
      setScreen(canManageCMS(next.permissions) ? 'admin' : 'overview')
      try {
        await refreshPlans()
      } catch {
        setNotice('Subscription plan information is temporarily unavailable. Your sign-in succeeded.')
      }
    } catch (error) {
      setNotice(error instanceof ApiError && error.status === 401
        ? 'Email or password was not accepted.'
        : error instanceof Error ? error.message : 'Unable to sign in.')
      throw error
    }
  }

  const handleLogout = async () => {
    try { await api.logout() } catch (error) {
      if (!(error instanceof ApiError && error.status === 401)) setNotice('The session could not be closed cleanly.')
    }
    dispatch({ type: 'logout' })
    setScreen('overview')
  }

  const handleUpgrade = async (plan: SubscriptionPlan) => {
    setBusyPlan(plan.code)
    setNotice('')
    try {
      await api.simulateUpgrade(plan.code)
      const next = await refreshSession()
      await refreshPlans()
      dispatch({ type: 'refresh', state: next })
      setNotice(`${plan.name} demo subscription is active. No payment was processed.`)
      setScreen('overview')
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        dispatch({ type: 'unauthorized' })
        setNotice('Your session expired. Sign in again to continue.')
      } else if (error instanceof ApiError && error.status === 403) {
        setNotice('Your account cannot change subscriptions. Contact an administrator.')
      } else setNotice(error instanceof Error ? error.message : 'The demo plan change failed.')
    } finally { setBusyPlan('') }
  }

  if (booting) return <div className="boot-screen"><Brand /><span className="loader" />Preparing your workspace</div>
  if (!isAuthenticated) return <LoginScreen onLogin={handleLogin} notice={notice} />

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Brand />
        <div className="workspace-label">WORKSPACE</div>
        <nav className="primary-nav" aria-label="Main navigation">
          {!isAdmin && <NavItem active={screen === 'overview'} icon="◫" onClick={() => setScreen('overview')}>Market workspace</NavItem>}
          {isAdmin && <NavItem active={screen === 'admin'} icon="▦" onClick={() => setScreen('admin')}>CMS administration</NavItem>}
          {!isAdmin && <NavItem active={screen === 'plans'} icon="◇" onClick={() => setScreen('plans')}>Subscription</NavItem>}
          {(canSeeContent || isAdmin) && <NavItem active={screen === 'content'} icon="▤" onClick={() => setScreen('content')}>Research & content</NavItem>}
        </nav>
        <div className="sidebar-spacer" />
        <div className="market-status"><span className="status-dot" /><span>DEMO MARKET DATA</span><small>Delayed simulation</small></div>
        <div className="sidebar-user">
          <div className="avatar">{initials(session.user)}</div>
          <div className="user-identity"><strong>{session.user?.email.split('@')[0]}</strong><span>{labelRole(session.user?.role)}</span></div>
          <button className="icon-button logout-icon" onClick={() => void handleLogout()} title="Sign out" aria-label="Sign out">↗</button>
        </div>
      </aside>
      <main className="main-area">
        <header className="topbar">
          <div className="crumb"><span>AlphaProTrade</span><b>/</b><strong>{screenTitle(screen)}</strong></div>
          <div className="topbar-actions"><ThemeToggle /><span className="data-badge"><i /> DEMO DATA</span><span className="topbar-date">Markets are simulated</span><button className="top-avatar" onClick={() => void handleLogout()} title="Sign out">{initials(session.user)}</button></div>
        </header>
        {notice && <div className="notice-banner" role="status"><span>{notice}</span><button onClick={() => setNotice('')} aria-label="Dismiss">×</button></div>}
        {screen === 'overview' && !isAdmin && <TraderDashboard session={session} onPlans={() => setScreen('plans')} onContent={() => setScreen('content')} />}
        {screen === 'admin' && (isAdmin ? <AdminDashboard datasets={datasets} loading={loadingAdmin} permissions={session.permissions} /> : <AccessDenied />)}
        {screen === 'plans' && <SubscriptionScreen session={session} plans={plans} busyPlan={busyPlan} onUpgrade={handleUpgrade} onRefresh={refreshSession} />}
        {screen === 'content' && <ContentScreen canSeeContent={canSeeContent} onUnauthorized={handleUnauthorized} />}
      </main>
    </div>
  )
}

function screenTitle(screen: Screen) {
  return ({ overview: 'Market workspace', admin: 'CMS administration', plans: 'Subscription', content: 'Research & content' })[screen]
}

function Brand() {
  return <div className="brand-lockup"><img src="/brand/alphaprotrade_logo.svg" alt="AlphaProTrade — Market Intelligence for Traders" /></div>
}

function NavItem({ active, icon, children, onClick }: { active: boolean; icon: string; children: React.ReactNode; onClick: () => void }) {
  return <button className={`nav-item ${active ? 'active' : ''}`} onClick={onClick}><span className="nav-icon">{icon}</span><span>{children}</span>{active && <i className="nav-indicator" />}</button>
}

function LoginScreen({ onLogin, notice }: { onLogin: (email: string, password: string) => Promise<void>; notice: string }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setSubmitting(true); setError('')
    try { await onLogin(email, password) } catch (e) { setError(e instanceof Error ? e.message : 'Sign in failed.') }
    finally { setSubmitting(false) }
  }
  return <div className="login-page">
    <div className="login-art">
      <div className="login-art-top"><Brand /><span className="data-badge"><i /> DEMO PLATFORM</span></div>
      <div className="login-copy"><div className="eyebrow"><span /> MARKET INTELLIGENCE WORKSPACE</div><h1>See the market<br /><em>with more clarity.</em></h1><p>One workspace for market context, research and portfolio insight. This POC uses simulated market data.</p>
        <div className="login-chart"><div className="chart-labels"><span>6,200</span><span>6,000</span><span>5,800</span><span>5,600</span></div><svg viewBox="0 0 640 220" preserveAspectRatio="none" aria-label="Illustrative market chart"><defs><linearGradient id="fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#54d6b1" stopOpacity=".24"/><stop offset="1" stopColor="#54d6b1" stopOpacity="0"/></linearGradient></defs><path d="M0 175 C35 170 33 138 70 151 S112 180 142 137 S185 120 210 133 S256 92 288 111 S330 131 354 86 S395 76 422 103 S454 80 482 58 S520 78 548 53 S584 42 610 20 S631 34 640 12 V220 H0Z" fill="url(#fill)"/><path d="M0 175 C35 170 33 138 70 151 S112 180 142 137 S185 120 210 133 S256 92 288 111 S330 131 354 86 S395 76 422 103 S454 80 482 58 S520 78 548 53 S584 42 610 20 S631 34 640 12" fill="none" stroke="#54d6b1" strokeWidth="3" vectorEffect="non-scaling-stroke"/></svg><div className="chart-periods"><span>09:30</span><span>10:30</span><span>11:30</span><span>12:30</span><span>13:30</span></div></div>
      </div>
      <div className="login-footer"><span>MARKET DATA IS SIMULATED</span><span>ALPHAPROTRADE POC · 2026</span></div>
    </div>
    <div className="login-panel"><div className="login-panel-theme"><ThemeToggle /></div><div className="mobile-brand"><Brand /></div><div className="login-form-wrap"><div className="eyebrow muted">WELCOME BACK</div><h2>Sign in to your workspace</h2><p className="form-subtitle">Use your existing AlphaProTrade CMS account.</p>
      {(error || notice) && <div className="form-error" role="alert">{error || notice}</div>}
      <form onSubmit={(e) => void submit(e)}><label>Email address<input type="email" required autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" /></label><label>Password<input type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Enter your password" /></label><button className="button button-primary login-submit" disabled={submitting}>{submitting ? 'Signing in…' : 'Sign in'}<span>→</span></button></form>
      <div className="login-security"><span>▣</span><p>Secure sign in powered by the existing Payload CMS authentication service.</p></div>
    </div><div className="login-panel-bottom">By signing in, you agree to use this demonstration platform for evaluation only.</div></div>
  </div>
}

function TraderDashboard({ session, onPlans, onContent }: { session: SessionState; onPlans: () => void; onContent: () => void }) {
  const allowed = useMemo(() => getAccessibleFeatureCodes(session.entitlements), [session.entitlements])
  const userName = session.user?.email?.split('@')[0] || 'trader'
  const currentPlan = planName(session.subscription) || 'No plan'
  return <div className="page-content">
    <section className="page-heading"><div><div className="eyebrow muted">YOUR MARKET DESK</div><h1>Good morning, {userName}<span className="heading-period">.</span></h1><p>Here’s your market snapshot. All figures are illustrative demo data.</p></div><div className="heading-side"><span className="market-open"><i /> SESSION SIMULATION</span><span>Last refreshed just now</span></div></section>
    <section className="demo-strip"><span className="demo-glyph">ⓘ</span><span><strong>Demo environment</strong> Market figures and trading signals are simulated. No live feed or trade execution is connected.</span><button onClick={onContent}>Explore research <b>→</b></button></section>
    <section className="section-heading feature-heading"><div><div className="eyebrow muted">YOUR TOOLKIT</div><h2>Trading widgets <span className="count-pill">{currentPlan}: {allowed.size}/{featureCatalog.length} unlocked</span></h2></div><button className="text-button" onClick={onPlans}>Compare plans <b>→</b></button></section>
    <div className="widget-grid">{featureCatalog.map((feature) => {
      const accessible = allowed.has(feature.code)
      return <article className={`widget-card ${accessible ? '' : 'locked'}`} key={feature.code}>
        <div className={`widget-icon ${accessible ? '' : 'locked-icon'}`} aria-label={accessible ? undefined : 'Locked'}>{accessible ? feature.icon : '🔒'}</div><div className="widget-title-row"><h3>{feature.name}</h3>{accessible ? <span className="access-check">✓</span> : <span className="lock-chip">LOCKED</span>}</div><p>{feature.description}</p>
        {accessible ? <WidgetDemo code={feature.code} /> : <div className="locked-content"><p className="locked-message"><span aria-hidden="true">🔒</span> Upgrade your plan to unlock this widget.</p><button className="unlock-link" onClick={onPlans}>Compare plans <span>→</span></button></div>}
      </article>
    })}</div>
    <div className="data-footnote"><span>◉</span> Demonstration data only · Not investment advice · No live trading connectivity</div>
  </div>
}

function MiniLine({ points, positive }: { points: number[]; positive: boolean }) {
  const d = points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${(index / (points.length - 1)) * 100} ${80 - point}`).join(' ')
  return <svg className="mini-line" viewBox="0 0 100 80" preserveAspectRatio="none"><path d={d} fill="none" stroke={positive ? '#53d5b0' : '#f0717b'} strokeWidth="3" vectorEffect="non-scaling-stroke" /></svg>
}

function WidgetDemo({ code }: { code: string }) {
  if (code === 'market-overview') return <div className="widget-value"><strong>+0.82%</strong><span>Demo market trend</span></div>
  if (code === 'watchlist') return <div className="mini-widget-list">{watchlist.slice(0, 3).map((stock) => <div key={stock.symbol}><b>{stock.symbol}</b><span>{stock.price}</span><em className={stock.positive ? 'positive' : 'negative'}>{stock.change}</em></div>)}</div>
  if (code === 'basic-charts') return <div className="chart-widget"><MiniLine points={[18, 30, 25, 38, 32, 51, 44, 62, 57, 76]} positive /><span>Illustrative price movement</span></div>
  if (code === 'market-news') return <div className="news-widget"><span>{newsDemo[0].tag} · {newsDemo[0].time}</span><strong>{newsDemo[0].headline}</strong><small>{newsDemo[0].source} · demo headline</small></div>
  return <div className="portfolio-demo"><div className="donut" /><span><b>$24,680</b><small>Illustrative portfolio value · +1.8% today</small></span></div>
}

function SubscriptionScreen({ session, plans, busyPlan, onUpgrade, onRefresh }: {
  session: SessionState
  plans: SubscriptionPlan[]
  busyPlan: string
  onUpgrade: (plan: SubscriptionPlan) => void
  onRefresh: () => Promise<unknown>
}) {
  const [widgets, setWidgets] = useState<WidgetCatalogItem[]>([])
  const [widgetSubscriptions, setWidgetSubscriptions] = useState<UserWidgetSubscription[]>([])
  const [widgetCycle, setWidgetCycle] = useState<WidgetBillingCycle>('monthly')
  const [widgetBusy, setWidgetBusy] = useState('')
  const [widgetLoading, setWidgetLoading] = useState(true)
  const [widgetError, setWidgetError] = useState('')
  const [widgetNotice, setWidgetNotice] = useState('')
  const current = planName(session.subscription)
  const refreshWidgets = useCallback(async () => {
    setWidgetLoading(true)
    try {
      const [catalog, subscriptions] = await Promise.all([api.widgetCatalog(), api.widgetSubscriptions()])
      setWidgets(catalog.widgets)
      setWidgetSubscriptions(subscriptions.subscriptions)
      setWidgetError('')
    } catch (error) {
      setWidgetError(error instanceof Error ? error.message : 'Individual widget subscriptions could not be loaded.')
    } finally {
      setWidgetLoading(false)
    }
  }, [])
  useEffect(() => { void refreshWidgets() }, [refreshWidgets])

  const handleWidgetPurchase = async (widget: WidgetCatalogItem) => {
    setWidgetBusy(widget.featureCode)
    setWidgetError('')
    setWidgetNotice('')
    try {
      await api.purchaseWidget(widget.featureCode, widgetCycle)
      await Promise.all([onRefresh(), refreshWidgets()])
      setWidgetNotice(`${widget.name} ${widgetCycle} subscription is active. No payment was processed.`)
    } catch (error) {
      setWidgetError(error instanceof Error ? error.message : 'The simulated widget subscription failed.')
    } finally {
      setWidgetBusy('')
    }
  }

  const handleWidgetCancellation = async (subscription: UserWidgetSubscription) => {
    setWidgetBusy(String(subscription.id))
    setWidgetError('')
    setWidgetNotice('')
    try {
      const result = await api.cancelWidget(subscription.id)
      await Promise.all([onRefresh(), refreshWidgets()])
      setWidgetNotice(`Cancelled. Access remains available through ${new Date(result.accessUntil || subscription.currentPeriodEnd).toLocaleDateString()}.`)
    } catch (error) {
      setWidgetError(error instanceof Error ? error.message : 'The simulated cancellation failed.')
    } finally {
      setWidgetBusy('')
    }
  }

  return <div className="page-content"><section className="page-heading"><div><div className="eyebrow muted">ACCOUNT & ACCESS</div><h1>Your subscription</h1><p>Manage your demo plan and review feature access.</p></div><span className="data-badge"><i /> SIMULATED BILLING</span></section>
    <section className="subscription-current"><div className="current-plan-icon">◇</div><div className="current-plan-copy"><span>CURRENT PLAN</span><h2>{current || 'No active plan'}</h2><p>{session.subscription ? `Active since ${new Date(session.subscription.startDate).toLocaleDateString()}` : 'Choose a plan to unlock trading widgets.'}</p></div><div className="current-plan-status"><span className={session.subscription ? 'plan-status active' : 'plan-status'}><i />{session.subscription ? 'ACTIVE · DEMO' : 'NO SUBSCRIPTION'}</span><small>Access is checked by the CMS entitlement service.</small></div></section>
    <div className="plans-intro"><div><h2>Compare widget access</h2><p>Each plan lists exactly which of the five widgets it includes. All prices and changes are demo only.</p></div><span className="price-disclaimer">NO PAYMENT WILL BE TAKEN</span></div>
    {plans.length === 0 ? <div className="empty-state">No active plans are currently available.</div> : <div className="plan-grid">{plans.map((plan, index) => <article className={`plan-card ${plan.code === current?.toLowerCase() ? 'current' : ''} ${index === 1 ? 'featured-plan' : ''}`} key={plan.code}>
      {index === 1 && <span className="popular-label">MOST POPULAR</span>}<div className="plan-card-top"><span className="plan-tier-icon">{index === 0 ? '◌' : index === 1 ? '◇' : '✧'}</span>{plan.code === current?.toLowerCase() && <span className="current-label">CURRENT</span>}</div><h3>{plan.name}</h3><p>{plan.description}</p><div className="plan-price">{formatCurrency(plan.price, plan.currency)}<span> / {plan.billingInterval === 'yearly' ? 'year' : 'month'}</span></div><div className="plan-demo-note">Demonstration price only</div><div className="plan-included-count">{plan.features.length}/5 widgets included</div><div className="plan-feature-list">{plan.features.map((code) => <div key={code}><i>✓</i>{featureCatalog.find((f) => f.code === code)?.name || code}</div>)}</div><button className={`button ${index === 1 ? 'button-primary' : 'button-secondary'}`} disabled={busyPlan !== '' || plan.code === current?.toLowerCase()} onClick={() => onUpgrade(plan)}>{busyPlan === plan.code ? 'Updating demo plan…' : plan.code === current?.toLowerCase() ? 'Current plan' : `Select ${plan.name}`}<span>→</span></button><small className="access-summary">{plan.features.length} of 5 widgets included on this plan</small>
    </article>)}</div>}
    <div className="payment-note"><span>ⓘ</span><div><strong>Simulation only.</strong> Choosing a plan updates your POC subscription record and refreshes feature access. This does not process a payment or connect to a billing provider.</div></div>
    <section className="individual-widgets" aria-labelledby="individual-widgets-title">
      <div className="individual-widgets-heading"><div><div className="eyebrow muted">ADD-ON ACCESS</div><h2 id="individual-widgets-title">Individual widget subscriptions</h2><p>Subscribe to a single widget if it is not included in your current plan.</p></div>
        <div className="billing-cycle-picker" aria-label="Billing cycle">
          <button type="button" aria-pressed={widgetCycle === 'monthly'} className={widgetCycle === 'monthly' ? 'selected' : ''} onClick={() => setWidgetCycle('monthly')}>Monthly</button>
          <button type="button" aria-pressed={widgetCycle === 'yearly'} className={widgetCycle === 'yearly' ? 'selected' : ''} onClick={() => setWidgetCycle('yearly')}>Yearly</button>
        </div>
      </div>
      {widgetError && <div className="widget-subscription-error" role="alert">{widgetError}</div>}
      {widgetNotice && <div className="widget-subscription-notice" role="status">{widgetNotice}</div>}
      {widgetLoading ? <div className="empty-state">Loading individual widgets…</div> : widgets.length === 0 ? <div className="empty-state">No individually billable widgets are available.</div> : <div className="individual-widget-grid">{widgets.map((widget) => {
        const relatedSubscriptions = widgetSubscriptions.filter((subscription) => subscription.feature?.code === widget.featureCode)
        const currentIndividual = relatedSubscriptions.find((subscription) => subscription.status === 'active' || subscription.status === 'cancelled')
        const monthlyPrice = formatCurrency(widget.monthlyPrice, widget.currency)
        const yearlyPrice = formatCurrency(widget.yearlyPrice, widget.currency)
        const selectedPrice = widgetCycle === 'monthly' ? monthlyPrice : yearlyPrice
        const selectedPeriod = widgetCycle === 'monthly' ? 'month' : 'year'
        return <article className="individual-widget-card" key={widget.featureCode}>
          <div className="individual-widget-top"><span className="widget-addon-icon">◈</span>{widget.includedInMainPlan ? <span className="widget-addon-badge included">Included</span> : currentIndividual ? <span className={`widget-addon-badge ${currentIndividual.status}`}>{currentIndividual.status === 'cancelled' ? 'Cancelling' : 'Subscribed'}</span> : <span className="widget-addon-badge available">Available</span>}</div>
          <h3>{widget.name}</h3><p>{widget.description}</p>
          <div className="widget-addon-prices"><span>Monthly <strong>{monthlyPrice}</strong><small>/ month</small></span><span>Yearly <strong>{yearlyPrice}</strong><small>/ year</small></span></div>
          {widget.includedInMainPlan ? <div className="widget-addon-state">Included with your {current || 'current'} plan.</div> : currentIndividual ? <div className="widget-addon-state">{currentIndividual.status === 'cancelled' ? `Cancelled · access until ${new Date(currentIndividual.currentPeriodEnd).toLocaleDateString()}` : `Renews ${new Date(currentIndividual.renewalDate).toLocaleDateString()}`}</div> : <div className="widget-addon-state">Selected: {selectedPrice} / {selectedPeriod}</div>}
          {currentIndividual && <div className="widget-addon-current-price">{formatCurrency(currentIndividual.price, currentIndividual.currency)} / {currentIndividual.billingCycle === 'yearly' ? 'year' : 'month'} · {currentIndividual.status}</div>}
          <div className="widget-addon-actions">
            {!widget.includedInMainPlan && !currentIndividual && <button type="button" className="button button-primary" disabled={widgetBusy !== ''} onClick={() => void handleWidgetPurchase(widget)}>{widgetBusy === widget.featureCode ? 'Processing…' : `Simulate ${widgetCycle} subscription`}<span>→</span></button>}
            {currentIndividual?.status === 'active' && <button type="button" className="button button-secondary" disabled={widgetBusy !== ''} onClick={() => void handleWidgetCancellation(currentIndividual)}>{widgetBusy === String(currentIndividual.id) ? 'Cancelling…' : 'Cancel subscription'}</button>}
            {widget.includedInMainPlan && <span className="included-plan-note">No add-on needed</span>}
          </div>
        </article>
      })}</div>}
      <div className="payment-note widget-provider-note"><span>ⓘ</span><div><strong>Simulated recurring billing.</strong> Prices are demonstration values. No payment gateway or card details are used. The backend’s billing adapter is the integration point for a future provider.</div></div>
    </section>
  </div>
}

function planName(subscription: SessionState['subscription']): string | null {
  if (!subscription?.plan) return null
  if (typeof subscription.plan === 'object') return subscription.plan.name || subscription.plan.code || null
  return null
}

function ContentScreen({ canSeeContent, onUnauthorized }: { canSeeContent: boolean; onUnauthorized: () => void }) {
  const [pages, setPages] = useState<CMSRecord[]>([])
  const [news, setNews] = useState<CMSRecord[]>([])
  const [banners, setBanners] = useState<CMSRecord[]>([])
  const [faqs, setFaqs] = useState<CMSRecord[]>([])
  const [error, setError] = useState('')
  useEffect(() => {
    Promise.all([
      api.collection<CMSRecord>('pages', 'where[workflowStatus][equals]=published&limit=20&sort=-publishedAt'),
      api.collection<CMSRecord>('news', 'where[workflowStatus][equals]=published&limit=20&sort=-publishedAt'),
      api.collection<CMSRecord>('banners', 'where[status][equals]=active&limit=10&sort=displayOrder'),
      api.collection<CMSRecord>('faqs', 'where[status][equals]=active&limit=30&sort=displayOrder'),
    ]).then(([p, n, b, f]) => { setPages(p.docs); setNews(n.docs); setBanners(b.docs); setFaqs(f.docs) })
      .catch((e: unknown) => {
        if (e instanceof ApiError && e.status === 401) {
          onUnauthorized()
          return
        }
        setError(e instanceof ApiError && e.status === 403 ? 'Your account cannot access this content.' : 'Some content could not be loaded.')
      })
  }, [onUnauthorized])
  return <div className="page-content"><section className="page-heading"><div><div className="eyebrow muted">PUBLISHED FROM PAYLOAD CMS</div><h1>Research & content</h1><p>Published pages, news, active banners and FAQs. Drafts are not requested or displayed.</p></div><span className="data-badge"><i /> PUBLISHED ONLY</span></section>
    {error && <div className="notice-banner">{error}</div>}
    {banners.length > 0 && <div className="content-banner-list">{banners.map((banner) => <article className="content-banner" key={banner.id}>{mediaURL(banner.image) ? <img className="content-banner-image" src={mediaURL(banner.image)!} alt="" /> : <div className="banner-mark">✦</div>}<div><span>FEATURED</span><h3>{banner.heading || banner.title}</h3><p>{banner.description}</p></div>{banner.ctaLabel && <a href={String(banner.ctaURL || '#')} target="_blank" rel="noreferrer">{String(banner.ctaLabel)} ↗</a>}</article>)}</div>}
    <div className="content-columns"><section className="panel-card"><div className="panel-title"><div><div className="eyebrow muted">CMS PAGES</div><h3>Published pages</h3></div><span className="count-pill">{pages.length}</span></div>{pages.length ? pages.map((page) => <article className="content-row" key={page.id}><div><h4>{page.title}</h4><p>{plainText(page.content).slice(0, 240) || page.slug}</p></div><span>↗</span></article>) : <EmptyContent label="No published pages yet" />}</section>
      <section className="panel-card"><div className="panel-title"><div><div className="eyebrow muted">EDITORIAL</div><h3>Latest news</h3></div><span className="count-pill">{news.length}</span></div>{news.length ? news.map((item) => <article className="content-row" key={item.id}>{mediaURL(item.featuredImage) && <img className="news-thumb" src={mediaURL(item.featuredImage)!} alt="" />}<div><h4>{item.title}</h4><p>{item.summary || plainText(item.content).slice(0, 200)}</p><small>{item.publishedAt ? new Date(item.publishedAt).toLocaleDateString() : ''}</small></div><span>↗</span></article>) : <EmptyContent label="No published news yet" />}</section></div>
    {faqs.length > 0 && <section className="panel-card faq-panel"><div className="panel-title"><div><div className="eyebrow muted">HELP CENTER</div><h3>Frequently asked questions</h3></div><span className="count-pill">{faqs.length}</span></div><div className="faq-list">{faqs.map((faq) => <details key={faq.id}><summary>{faq.question}<span>＋</span></summary><div className="faq-answer">{plainText(faq.answer)}</div></details>)}</div></section>}
    {!canSeeContent && <div className="content-public-note">You’re viewing publicly published content from Payload CMS.</div>}
  </div>
}

function EmptyContent({ label }: { label: string }) { return <div className="empty-content">{label}</div> }

function PublicCMSPage({ slug }: { slug: string }) {
  const [page, setPage] = useState<CMSRecord | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let alive = true
    api.collection<CMSRecord>('pages', `where[slug][equals]=${encodeURIComponent(slug)}&where[workflowStatus][equals]=published&limit=1&depth=2`)
      .then(({ docs }) => {
        if (!alive) return
        const published = docs.find((doc) => doc.workflowStatus === 'published' && doc._status === 'published')
        setPage(published ?? null)
      })
      .catch((cause: unknown) => {
        if (alive) setError(cause instanceof Error ? cause.message : 'Unable to load this page.')
      })
      .finally(() => alive && setLoading(false))
    return () => { alive = false }
  }, [slug])

  return <main className="public-cms-page">
    <header className="public-cms-header"><Brand /><div className="public-header-actions"><ThemeToggle /><a href="/">Go to AlphaProTrade <span aria-hidden="true">→</span></a></div></header>
    {loading ? <div className="public-cms-state">Loading page…</div> : error ? <div className="public-cms-state" role="alert">{error}</div> : !page ? <div className="public-cms-state"><h1>Page not found</h1><p>This page is not published.</p></div> : <article className="public-cms-article">
      <div className="eyebrow">ABOUT ALPHAPROTRADE</div>
      <h1>{page.title}</h1>
      <div className="public-cms-content">{renderPublicBlocks(page.content)}</div>
      <div className="content-public-note">Published content from Payload CMS.</div>
    </article>}
  </main>
}

function renderPublicBlocks(value: unknown): React.ReactNode {
  if (!Array.isArray(value)) return null
  return value.map((entry, index) => {
    if (!entry || typeof entry !== 'object') return null
    const block = entry as Record<string, unknown>
    if (block.blockType === 'richText') {
      return <div className="public-rich-text" key={index}>{richTextParagraphs(block.body).map((text, paragraphIndex) => <p key={paragraphIndex}>{text}</p>)}</div>
    }
    if (block.blockType === 'quote' && typeof block.quote === 'string') {
      return <blockquote className="public-quote" key={index}><p>{block.quote}</p>{typeof block.attribution === 'string' && <cite>{block.attribution}</cite>}</blockquote>
    }
    if (block.blockType === 'image') {
      const src = mediaURL(block.image)
      return src ? <figure className="public-image" key={index}><img src={src} alt={typeof block.caption === 'string' ? block.caption : ''} />{typeof block.caption === 'string' && <figcaption>{block.caption}</figcaption>}</figure> : null
    }
    return null
  })
}

function richTextParagraphs(value: unknown): string[] {
  if (!value || typeof value !== 'object') return []
  const root = value as Record<string, unknown>
  const lexicalRoot = root.root && typeof root.root === 'object' ? root.root as Record<string, unknown> : root
  const children = Array.isArray(lexicalRoot.children) ? lexicalRoot.children : []
  const readText = (node: unknown): string => {
    if (!node || typeof node !== 'object') return ''
    const item = node as Record<string, unknown>
    if (typeof item.text === 'string') return item.text
    return Array.isArray(item.children) ? item.children.map(readText).join('') : ''
  }
  return children.map(readText).map((text) => text.trim()).filter(Boolean)
}

function plainText(value: unknown): string {
  if (typeof value === 'string') return value
  if (!value || typeof value !== 'object') return ''
  if (Array.isArray(value)) return value.map(plainText).filter(Boolean).join(' ')
  return Object.values(value as Record<string, unknown>).map(plainText).filter(Boolean).join(' ')
}

function mediaURL(value: unknown): string | null {
  return value && typeof value === 'object' && 'url' in value && typeof value.url === 'string'
    ? value.url
    : null
}

const adminCollections: Array<{ key: string; title: string; icon: string; columns: string[] }> = [
  { key: 'Users', title: 'Users & roles', icon: '◎', columns: ['email', 'role', 'accountStatus'] },
  { key: 'Plans', title: 'Subscription plans', icon: '◇', columns: ['name', 'code', 'price', 'status'] },
  { key: 'Features', title: 'Trading features', icon: '✳', columns: ['name', 'code', 'category', 'status'] },
  { key: 'Entitlements', title: 'Plan entitlements', icon: '⌑', columns: ['plan', 'feature', 'status'] },
  { key: 'Subscriptions', title: 'User subscriptions', icon: '◇', columns: ['user', 'plan', 'status', 'startDate', 'endDate'] },
  { key: 'Pages', title: 'CMS pages', icon: '▤', columns: ['title', 'slug', 'workflowStatus', 'author'] },
  { key: 'News', title: 'Market news', icon: '▧', columns: ['title', 'workflowStatus', 'publishedAt'] },
  { key: 'Banners', title: 'Banners', icon: '▱', columns: ['title', 'status', 'displayOrder'] },
  { key: 'FAQs', title: 'FAQs', icon: '?', columns: ['question', 'category', 'status'] },
]

function AdminDashboard({ datasets, loading, permissions }: { datasets: Record<string, Dataset>; loading: boolean; permissions: Record<string, boolean> }) {
  const permitted = adminCollections.filter(({ key }) => {
    if (key === 'Users') return permissions.readUsers
    if (key === 'Plans') return permissions.readPlans
    if (key === 'Features') return permissions.readFeatures
    if (key === 'Entitlements') return permissions.readEntitlements
    if (key === 'Subscriptions') return permissions.readSubscriptions
    if (key === 'Pages' || key === 'News') return permissions.readContent || permissions.readAllContent
    return permissions.readUsers || permissions.readPlans
  })
  const activeSubs = (datasets.Subscriptions?.rows || []).filter((item) => item.status === 'active').length
  const statItems = [
    { label: 'Registered users', value: datasets.Users?.rows.length, icon: '◎', tone: 'blue' },
    { label: 'Active subscriptions', value: activeSubs, icon: '◇', tone: 'green' },
    { label: 'Trading features', value: datasets.Features?.rows.length, icon: '✳', tone: 'purple' },
    { label: 'Published content', value: [...(datasets.Pages?.rows || []), ...(datasets.News?.rows || [])].filter((d) => d.workflowStatus === 'published').length, icon: '▤', tone: 'amber' },
  ]
  return <div className="page-content"><section className="page-heading"><div><div className="eyebrow muted">CONTROL CENTER</div><h1>CMS administration</h1><p>Content, accounts and access data from Payload CMS.</p></div><span className="data-badge"><i /> SERVER AUTHORIZED</span></section>
    <div className="admin-stat-grid">{statItems.map((stat) => <article className="admin-stat" key={stat.label}><span className={`stat-icon ${stat.tone}`}>{stat.icon}</span><div><small>{stat.label}</small><strong>{loading || stat.value === undefined ? '—' : stat.value}</strong></div><span className="stat-dots">···</span></article>)}</div>
    {permitted.length === 0 ? <AccessDenied /> : <div className="admin-tables">{permitted.map((collection) => <AdminTable key={collection.key} title={collection.title} icon={collection.icon} columns={collection.columns} dataset={datasets[collection.key]} />)}</div>}
    <div className="admin-security-note"><span>▣</span> This dashboard is read-only. Collection access and mutations remain controlled by Payload and the backend authorization adapter.</div>
  </div>
}

function AdminTable({ title, icon, columns, dataset }: { title: string; icon: string; columns: string[]; dataset?: Dataset }) {
  const format = (row: CMSRecord, column: string) => {
    const value = row[column]
    if (value && typeof value === 'object') {
      if ('email' in value) return String((value as { email: unknown }).email)
      if ('name' in value) return String((value as { name: unknown }).name)
      if ('code' in value) return String((value as { code: unknown }).code)
      if ('id' in value) return String((value as { id: unknown }).id)
      return Array.isArray(value) ? `${value.length} items` : '—'
    }
    if (column === 'price' && typeof value === 'number') return formatCurrency(value, String(row.currency || 'USD'))
    if (column === 'publishedAt' && value) return new Date(String(value)).toLocaleDateString()
    if (column === 'role' && typeof value === 'string') return labelRole(value)
    return value === undefined || value === null || value === '' ? '—' : String(value)
  }
  return <section className="admin-table-card"><div className="admin-table-heading"><div className="admin-section-icon">{icon}</div><div><h3>{title}</h3><span>{dataset?.rows.length ?? 0} records</span></div><button className="table-more" aria-label={`More ${title} options`}>···</button></div>{dataset?.error ? <div className="table-error">{dataset.error}</div> : <div className="table-scroll"><table><thead><tr>{columns.map((c) => <th key={c}>{c.replace(/([A-Z])/g, ' $1')}</th>)}</tr></thead><tbody>{dataset?.rows.slice(0, 6).map((row) => <tr key={row.id}>{columns.map((column) => <td key={column}>{format(row, column)}</td>)}</tr>)}</tbody></table>{!dataset?.rows.length && <EmptyContent label="No records available" />}</div>}</section>
}

function AccessDenied() { return <div className="access-denied"><span>▣</span><h2>Access not available</h2><p>Your current account does not have permission to view this section. Requests are checked by the backend.</p></div> }
