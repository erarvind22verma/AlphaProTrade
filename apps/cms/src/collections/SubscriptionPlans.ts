import type { CollectionConfig } from 'payload'

import { authorizePayloadUser, createAdminOnlyAccess, toAuthorizationSubject } from '../authz/payloadAccess'

export const SubscriptionPlans: CollectionConfig = {
  slug: 'subscription-plans',
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'code', 'price', 'currency', 'billingInterval', 'status'],
  },
  access: createAdminOnlyAccess('subscription-plans'),
  endpoints: [
    {
      path: '/catalog',
      method: 'get',
      handler: async (req) => {
        const plans = await req.payload.find({
          collection: 'subscription-plans',
          where: { status: { equals: 'active' } },
          sort: 'price',
          limit: 100,
          depth: 0,
          overrideAccess: true,
        })
        const catalog = await Promise.all(plans.docs.map(async (plan) => {
          const mappings = await req.payload.find({
            collection: 'feature-entitlements',
            where: { and: [{ plan: { equals: plan.id } }, { status: { equals: 'active' } }] },
            limit: 100,
            depth: 1,
            overrideAccess: true,
          })
          const featureCodes = mappings.docs.flatMap((mapping) => {
            const feature = mapping.feature
            return feature && typeof feature === 'object' && 'code' in feature && typeof feature.code === 'string'
              ? [feature.code]
              : []
          })
          const featureOrder = ['market-overview', 'watchlist', 'basic-charts', 'market-news', 'portfolio-analytics']
          featureCodes.sort((left, right) => featureOrder.indexOf(left) - featureOrder.indexOf(right))
          return {
            id: plan.id,
            name: plan.name,
            code: plan.code,
            description: plan.description,
            price: plan.price,
            currency: plan.currency,
            billingInterval: plan.billingInterval,
            features: featureCodes,
            demoPrice: true,
          }
        }))
        return Response.json({ plans: catalog })
      },
    },
    {
      path: '/simulate-upgrade',
      method: 'post',
      handler: async (req) => {
        const subject = toAuthorizationSubject(req.user)
        if (!subject) return Response.json({ error: 'Authentication required' }, { status: 401 })
        let body: { planCode?: unknown }
        try {
          if (typeof req.json !== 'function') return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
          body = await req.json()
        } catch {
          return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
        }
        if (typeof body.planCode !== 'string') {
          return Response.json({ error: 'A planCode is required' }, { status: 400 })
        }
        const allowed = await authorizePayloadUser(req.user, {
          action: 'upgrade_subscription',
          resource: { type: 'subscription-plans', attributes: { ownerId: subject.id, tenantId: null } },
        })
        if (!allowed) return Response.json({ error: 'Not authorized to change subscriptions' }, { status: 403 })

        const planResult = await req.payload.find({
          collection: 'subscription-plans',
          where: { and: [{ code: { equals: body.planCode } }, { status: { equals: 'active' } }] },
          limit: 1,
          depth: 0,
          overrideAccess: true,
        })
        const plan = planResult.docs[0]
        if (!plan) return Response.json({ error: 'Active plan not found' }, { status: 404 })

        const activeResult = await req.payload.find({
          collection: 'user-subscriptions',
          where: { and: [{ user: { equals: subject.id } }, { status: { equals: 'active' } }] },
          sort: '-startDate',
          limit: 1,
          depth: 0,
          overrideAccess: true,
        })
        const current = activeResult.docs[0]
        const startDate = new Date()
        const endDate = new Date(startDate)
        if (plan.billingInterval === 'yearly') endDate.setFullYear(endDate.getFullYear() + 1)
        else endDate.setMonth(endDate.getMonth() + 1)
        const previousPlanID = current
          ? (typeof current.plan === 'object' ? current.plan.id : current.plan)
          : undefined
        const data = {
          user: subject.id as number,
          plan: plan.id,
          status: 'active' as const,
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
          upgradeHistory: current && previousPlanID !== undefined
            ? [...(current.upgradeHistory ?? []), {
                fromPlan: previousPlanID,
                toPlan: plan.id,
                changedAt: startDate.toISOString(),
                changedBy: subject.id as number,
                notes: 'Simulated POC plan change; no payment was processed.',
              }]
            : current?.upgradeHistory ?? [],
        }
        const subscription = current
          ? await req.payload.update({
              collection: 'user-subscriptions', id: current.id, data: data as never, overrideAccess: true, user: req.user,
            })
          : await req.payload.create({
              collection: 'user-subscriptions', data: data as never, overrideAccess: true, user: req.user,
            })
        return Response.json({ subscription, simulated: true, paymentProcessed: false })
      },
    },
  ],
  fields: [
    { name: 'name', type: 'text', required: true },
    { name: 'code', type: 'text', required: true, unique: true, index: true },
    { name: 'description', type: 'textarea' },
    {
      name: 'price',
      type: 'number',
      required: true,
      min: 0,
      admin: {
        description: 'Demonstration value only. No real payment processing is implemented.',
      },
    },
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
    {
      name: 'billingInterval',
      type: 'select',
      required: true,
      options: [
        { label: 'Monthly', value: 'monthly' },
        { label: 'Yearly', value: 'yearly' },
      ],
    },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'inactive',
      options: [
        { label: 'Active', value: 'active' },
        { label: 'Inactive', value: 'inactive' },
      ],
    },
    {
      name: 'features',
      type: 'join',
      collection: 'feature-entitlements',
      on: 'plan',
      admin: {
        allowCreate: false,
        defaultColumns: ['feature', 'status'],
      },
    },
  ],
}
