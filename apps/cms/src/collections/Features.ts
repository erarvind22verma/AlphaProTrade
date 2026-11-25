import type { CollectionConfig } from 'payload'

import { authorizePayloadUser, createAdminOnlyAccess, toAuthorizationSubject } from '../authz/payloadAccess'
import { createPayloadEntitlementService } from '../subscriptions/payloadService'

export const Features: CollectionConfig = {
  slug: 'features',
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'code', 'category', 'status'],
  },
  access: createAdminOnlyAccess('features'),
  endpoints: [
    {
      path: '/entitlements/me',
      method: 'get',
      handler: async (req) => {
        const subject = toAuthorizationSubject(req.user)
        if (!subject) return Response.json({ error: 'Authentication required' }, { status: 401 })
        const features = await req.payload.find({
          collection: 'features',
          where: { status: { equals: 'active' } },
          limit: 100,
          depth: 0,
          overrideAccess: true,
        })
        const service = await createPayloadEntitlementService(req.payload)
        const entitlements = await Promise.all(features.docs.map(async (feature) => ({
          code: feature.code,
          name: feature.name,
          allowed: await service.canAccessFeature(subject.id, feature.code),
        })))
        return Response.json({ entitlements })
      },
    },
    {
      path: '/market-overview/data',
      method: 'get',
      handler: async (req) => {
        const user = toAuthorizationSubject(req.user)
        if (!user) return Response.json({ error: 'Authentication required' }, { status: 401 })

        const featureCode = 'market-overview'
        const authorized = await authorizePayloadUser(req.user, {
          action: 'use_feature',
          resource: {
            type: 'features',
            attributes: { ownerId: null, tenantId: null, code: featureCode },
          },
          context: { tenantId: null },
        })
        if (!authorized) return Response.json({ error: 'Forbidden' }, { status: 403 })

        const entitlements = await createPayloadEntitlementService(req.payload)
        const entitled = await entitlements.canAccessFeature(user.id, featureCode)
        if (!entitled) return Response.json({ error: 'Feature entitlement required' }, { status: 403 })

        return Response.json({
          feature: featureCode,
          demo: true,
          data: { message: 'Market Overview feature access granted.' },
        })
      },
    },
    {
      path: '/stock-watchlist/data',
      method: 'get',
      handler: async (req) => {
        const user = toAuthorizationSubject(req.user)
        if (!user) return Response.json({ error: 'Authentication required' }, { status: 401 })

        const featureCode = 'watchlist'
        const authorized = await authorizePayloadUser(req.user, {
          action: 'use_feature',
          resource: {
            type: 'features',
            attributes: { ownerId: null, tenantId: null, code: featureCode },
          },
          context: { tenantId: null },
        })
        if (!authorized) return Response.json({ error: 'Forbidden' }, { status: 403 })

        const entitlements = await createPayloadEntitlementService(req.payload)
        const entitled = await entitlements.canAccessFeature(user.id, featureCode)
        if (!entitled) return Response.json({ error: 'Feature entitlement required' }, { status: 403 })

        return Response.json({
          feature: featureCode,
          demo: true,
          data: [
            { symbol: 'ALPH', price: 124.82, changePercent: 1.42 },
            { symbol: 'BETA', price: 88.16, changePercent: -0.37 },
            { symbol: 'GAMM', price: 56.03, changePercent: 0.81 },
          ],
        })
      },
    },
  ],
  fields: [
    { name: 'name', type: 'text', required: true },
    { name: 'code', type: 'text', required: true, unique: true, index: true },
    { name: 'description', type: 'textarea' },
    {
      name: 'monthlyPrice',
      type: 'number',
      min: 0,
      admin: { description: 'Simulated individual widget price per month. No payment is processed.' },
    },
    {
      name: 'yearlyPrice',
      type: 'number',
      min: 0,
      admin: { description: 'Simulated individual widget price per year. No payment is processed.' },
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
      name: 'category',
      type: 'select',
      required: true,
      options: [
        { label: 'Market Data', value: 'market-data' },
        { label: 'Charting', value: 'charting' },
        { label: 'News', value: 'news' },
        { label: 'Analysis', value: 'analysis' },
        { label: 'Portfolio', value: 'portfolio' },
        { label: 'AI', value: 'ai' },
      ],
    },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'active',
      options: [
        { label: 'Active', value: 'active' },
        { label: 'Inactive', value: 'inactive' },
      ],
    },
  ],
}
