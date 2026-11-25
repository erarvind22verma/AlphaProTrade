import type { CollectionConfig } from 'payload'

import { authorizePayloadUser, createAdminOnlyAccess, toAuthorizationSubject } from '../authz/payloadAccess'
import { PayloadEntitlementRepository } from '../subscriptions/PayloadEntitlementRepository'
import { SimulatedWidgetBillingProvider } from '../subscriptions/WidgetBillingProvider'
import {
  calculateCurrentPeriodEnd,
  effectiveWidgetSubscriptionStatus,
  parseWidgetPurchaseRequest,
  subscriptionOwnedBy,
  widgetPurchaseConflict,
} from '../subscriptions/widgetBilling'

const rolesAllowedToSubscribe = new Set(['subscriber', 'trader'])
const billingProvider = new SimulatedWidgetBillingProvider()
const adminAccess = createAdminOnlyAccess('user-widget-subscriptions')

async function getPurchasingUser(req: any) {
  const subject = toAuthorizationSubject(req.user)
  if (!subject || subject.accountStatus !== 'active' || !rolesAllowedToSubscribe.has(subject.role)) return null
  const authorized = await authorizePayloadUser(req.user, {
    action: 'upgrade_subscription',
    resource: { type: 'subscription-plans', attributes: { ownerId: subject.id, tenantId: null } },
  })
  return authorized ? subject : null
}

function relationID(value: unknown): number | string | null {
  if (typeof value === 'number' || typeof value === 'string') return value
  if (value && typeof value === 'object' && 'id' in value) {
    const id = (value as { id?: unknown }).id
    if (typeof id === 'number' || typeof id === 'string') return id
  }
  return null
}

function serializeWidgetSubscription(doc: any, now: Date) {
  const feature = doc.feature && typeof doc.feature === 'object' ? doc.feature : null
  return {
    id: doc.id,
    feature: feature ? { id: feature.id, code: feature.code, name: feature.name } : null,
    billingCycle: doc.billingCycle,
    price: doc.price,
    currency: doc.currency,
    startDate: doc.startDate,
    currentPeriodEnd: doc.currentPeriodEnd,
    renewalDate: doc.currentPeriodEnd,
    status: effectiveWidgetSubscriptionStatus(doc.status, doc.currentPeriodEnd, now),
    cancellationDate: doc.cancellationDate ?? null,
  }
}

function hasConfiguredPrice(value: unknown): boolean {
  return value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value)) && Number(value) >= 0
}

function isUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const candidate = error as { code?: unknown; cause?: unknown; originalError?: unknown }
  if (candidate.code === '23505') return true
  return isUniqueViolation(candidate.cause) || isUniqueViolation(candidate.originalError)
}

export const UserWidgetSubscriptions: CollectionConfig = {
  slug: 'user-widget-subscriptions',
  admin: {
    useAsTitle: 'status',
    defaultColumns: ['user', 'feature', 'billingCycle', 'price', 'currency', 'status', 'currentPeriodEnd'],
  },
  access: {
    create: () => false,
    read: adminAccess.read,
    update: () => false,
    delete: () => false,
  },
  hooks: {
    beforeValidate: [({ data, operation, req }) => {
      if (req.context?.widgetSubscriptionOperation !== true) {
        throw new Error('Widget subscriptions can only be changed through their authenticated API endpoints.')
      }
      if (operation === 'create' && !subscriptionOwnedBy(relationID(data?.user), req.user?.id)) {
        throw new Error('Widget subscription owner must match the authenticated user.')
      }
      return data
    }],
  },
  endpoints: [
    {
      path: '/catalog',
      method: 'get',
      handler: async (req: any) => {
        const subject = await getPurchasingUser(req)
        if (!subject) return Response.json({ error: 'Active subscriber authentication required' }, { status: req.user ? 403 : 401 })
        const result = await req.payload.find({
          collection: 'features',
          where: { status: { equals: 'active' } },
          sort: 'name',
          limit: 100,
          depth: 0,
          overrideAccess: true,
        })
        const repository = new PayloadEntitlementRepository(req.payload)
        const widgets = await Promise.all(result.docs.flatMap((feature: any) => {
          if (!hasConfiguredPrice(feature.monthlyPrice) || !hasConfiguredPrice(feature.yearlyPrice)) return []
          return [repository.hasMainPlanFeature(subject.id, feature.id, new Date()).then((includedInMainPlan) => ({
            featureId: feature.id,
            featureCode: feature.code,
            name: feature.name,
            description: feature.description ?? '',
            monthlyPrice: Number(feature.monthlyPrice),
            yearlyPrice: Number(feature.yearlyPrice),
            currency: feature.currency,
            includedInMainPlan,
            demoPrice: true,
          }))]
        }))
        return Response.json({ widgets, simulatedBilling: true })
      },
    },
    {
      path: '/me',
      method: 'get',
      handler: async (req: any) => {
        const subject = await getPurchasingUser(req)
        if (!subject) return Response.json({ error: 'Active subscriber authentication required' }, { status: req.user ? 403 : 401 })
        const result = await req.payload.find({
          collection: 'user-widget-subscriptions',
          where: { user: { equals: subject.id } },
          sort: '-startDate',
          limit: 100,
          depth: 1,
          overrideAccess: true,
        })
        const now = new Date()
        const subscriptions = []
        for (let doc of result.docs) {
          const end = Date.parse(doc.currentPeriodEnd)
          if ((doc.status === 'active' || doc.status === 'cancelled') && (!Number.isFinite(end) || end <= now.getTime())) {
            doc = await req.payload.update({
              collection: 'user-widget-subscriptions',
              id: doc.id,
              data: { status: 'expired' },
              overrideAccess: true,
              user: req.user,
              context: { widgetSubscriptionOperation: true },
            })
          }
          subscriptions.push(serializeWidgetSubscription(doc, now))
        }
        return Response.json({ subscriptions })
      },
    },
    {
      path: '/purchase',
      method: 'post',
      handler: async (req: any) => {
        const subject = await getPurchasingUser(req)
        if (!subject) return Response.json({ error: 'Active subscriber authentication required' }, { status: req.user ? 403 : 401 })
        let body: unknown
        try {
          body = await req.json()
        } catch {
          return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
        }
        const purchase = parseWidgetPurchaseRequest(body)
        if (!purchase) return Response.json({ error: 'featureCode and a monthly or yearly billingCycle are required' }, { status: 400 })
        const featureResult = await req.payload.find({
          collection: 'features',
          where: { and: [{ code: { equals: purchase.featureCode } }, { status: { equals: 'active' } }] },
          limit: 1,
          depth: 0,
          overrideAccess: true,
        })
        const feature = featureResult.docs[0]
        if (!feature) return Response.json({ error: 'Active widget not found' }, { status: 404 })
        const price = Number(purchase.billingCycle === 'monthly' ? feature.monthlyPrice : feature.yearlyPrice)
        if (!Number.isFinite(price) || price < 0 || !feature.currency) {
          return Response.json({ error: 'This widget is not available for individual billing' }, { status: 409 })
        }

        const now = new Date()
        const repository = new PayloadEntitlementRepository(req.payload)
        const includedInMainPlan = await repository.hasMainPlanFeature(subject.id, feature.id, now)
        const existing = await repository.getWidgetSubscriptions(subject.id)
        const matching = existing.filter((subscription) => String(subscription.featureId) === String(feature.id))
        const conflict = widgetPurchaseConflict({ includedInMainPlan, subscriptions: matching, now })
        if (conflict === 'included-in-main-plan') {
          return Response.json({ error: 'This widget is already included in your main subscription' }, { status: 409 })
        }
        if (conflict === 'already-subscribed') {
          return Response.json({ error: 'An individual subscription for this widget is already active through its paid period' }, { status: 409 })
        }

        for (const subscription of matching) {
          if (subscription.status === 'active' || subscription.status === 'cancelled') {
            await req.payload.update({
              collection: 'user-widget-subscriptions',
              id: subscription.id as never,
              data: { status: 'expired' },
              overrideAccess: true,
              user: req.user,
              context: { widgetSubscriptionOperation: true },
            })
          }
        }

        const currentPeriodEnd = calculateCurrentPeriodEnd(now, purchase.billingCycle)
        await billingProvider.simulatePurchase({
          userId: subject.id,
          featureCode: feature.code,
          billingCycle: purchase.billingCycle,
          amount: price,
          currency: feature.currency,
        })
        try {
          const subscription = await req.payload.create({
            collection: 'user-widget-subscriptions',
            data: {
              user: subject.id,
              feature: feature.id,
              billingCycle: purchase.billingCycle,
              price,
              currency: feature.currency,
              startDate: now.toISOString(),
              currentPeriodEnd: currentPeriodEnd.toISOString(),
              status: 'active',
            } as never,
            overrideAccess: true,
            user: req.user,
            context: { widgetSubscriptionOperation: true },
          })
          return Response.json({ subscription: serializeWidgetSubscription(subscription, now), simulated: true, paymentProcessed: false }, { status: 201 })
        } catch (error) {
          if (isUniqueViolation(error)) {
            return Response.json({ error: 'An individual subscription for this widget is already active' }, { status: 409 })
          }
          throw error
        }
      },
    },
    {
      path: '/cancel',
      method: 'post',
      handler: async (req: any) => {
        const subject = await getPurchasingUser(req)
        if (!subject) return Response.json({ error: 'Active subscriber authentication required' }, { status: req.user ? 403 : 401 })
        let body: { subscriptionId?: unknown }
        try {
          body = await req.json()
        } catch {
          return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
        }
        if (typeof body.subscriptionId !== 'number' && typeof body.subscriptionId !== 'string') {
          return Response.json({ error: 'subscriptionId is required' }, { status: 400 })
        }
        let subscription: any
        try {
          subscription = await req.payload.findByID({
            collection: 'user-widget-subscriptions',
            id: body.subscriptionId as never,
            depth: 1,
            overrideAccess: true,
          })
        } catch {
          return Response.json({ error: 'Subscription not found' }, { status: 404 })
        }
        if (!subscriptionOwnedBy(relationID(subscription.user), subject.id)) {
          return Response.json({ error: 'Subscription not found' }, { status: 404 })
        }
        const now = new Date()
        const periodEnd = Date.parse(subscription.currentPeriodEnd)
        if (subscription.status === 'cancelled' && Number.isFinite(periodEnd) && periodEnd > now.getTime()) {
          return Response.json({ subscription: serializeWidgetSubscription(subscription, now), simulated: true })
        }
        if (subscription.status !== 'active' || !Number.isFinite(periodEnd) || periodEnd <= now.getTime()) {
          if (subscription.status === 'active') {
            subscription = await req.payload.update({
              collection: 'user-widget-subscriptions',
              id: subscription.id,
              data: { status: 'expired' },
              overrideAccess: true,
              user: req.user,
              context: { widgetSubscriptionOperation: true },
            })
          }
          return Response.json({ error: 'This widget subscription is no longer active' }, { status: 409 })
        }
        await billingProvider.simulateCancellation(subscription.id)
        subscription = await req.payload.update({
          collection: 'user-widget-subscriptions',
          id: subscription.id,
          data: { status: 'cancelled', cancellationDate: now.toISOString() },
          overrideAccess: true,
          user: req.user,
          context: { widgetSubscriptionOperation: true },
        })
        return Response.json({ subscription: serializeWidgetSubscription(subscription, now), accessUntil: subscription.currentPeriodEnd, simulated: true })
      },
    },
  ],
  fields: [
    { name: 'user', type: 'relationship', relationTo: 'users', required: true, index: true },
    { name: 'feature', type: 'relationship', relationTo: 'features', required: true, index: true },
    {
      name: 'billingCycle',
      type: 'select',
      required: true,
      options: [
        { label: 'Monthly', value: 'monthly' },
        { label: 'Yearly', value: 'yearly' },
      ],
    },
    { name: 'price', type: 'number', required: true, min: 0 },
    {
      name: 'currency',
      type: 'select',
      required: true,
      defaultValue: 'USD',
      options: [
        { label: 'USD', value: 'USD' },
        { label: 'INR', value: 'INR' },
        { label: 'EUR', value: 'EUR' },
      ],
    },
    { name: 'startDate', type: 'date', required: true },
    { name: 'currentPeriodEnd', type: 'date', required: true, index: true },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'active',
      options: [
        { label: 'Active', value: 'active' },
        { label: 'Cancelled', value: 'cancelled' },
        { label: 'Expired', value: 'expired' },
      ],
    },
    { name: 'cancellationDate', type: 'date' },
  ],
}
