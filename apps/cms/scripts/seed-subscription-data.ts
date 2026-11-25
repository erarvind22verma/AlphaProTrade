import 'dotenv/config'

import { getPayload } from 'payload'

import config from '../src/payload.config.js'
import { FEATURE_SEEDS, PLAN_SEEDS } from '../src/subscriptions/seedData'

const relationshipID = (value: unknown): number | string | null => {
  if (typeof value === 'number' || typeof value === 'string') return value
  if (value && typeof value === 'object' && 'id' in value) {
    const id = (value as { id?: unknown }).id
    if (typeof id === 'number' || typeof id === 'string') return id
  }
  return null
}

async function main(): Promise<void> {
  const payloadConfig = await config
  const payload = await getPayload({ config: payloadConfig })

  try {
    const featureIDs = new Map<string, number>()
    const activeFeatureCodes = new Set<string>(FEATURE_SEEDS.map(({ code }) => code))
    const allExistingFeatures = await payload.find({
      collection: 'features',
      limit: 1000,
      overrideAccess: true,
    })
    for (const feature of allExistingFeatures.docs) {
      if (!activeFeatureCodes.has(feature.code) && feature.status !== 'inactive') {
        await payload.update({
          collection: 'features',
          id: feature.id,
          data: { status: 'inactive' },
          overrideAccess: true,
        })
      }
    }

    for (const feature of FEATURE_SEEDS) {
      const existing = await payload.find({
        collection: 'features',
        where: { code: { equals: feature.code } },
        limit: 1,
        overrideAccess: true,
      })
      const saved = existing.docs[0]
        ? await payload.update({
            collection: 'features',
            id: existing.docs[0].id,
            data: feature,
            overrideAccess: true,
          })
        : await payload.create({
            collection: 'features',
            data: feature,
            overrideAccess: true,
          })
      featureIDs.set(feature.code, saved.id)
    }

    for (const plan of PLAN_SEEDS) {
      const { featureCodes, ...planData } = plan
      const existing = await payload.find({
        collection: 'subscription-plans',
        where: { code: { equals: plan.code } },
        limit: 1,
        overrideAccess: true,
      })
      const saved = existing.docs[0]
        ? await payload.update({
            collection: 'subscription-plans',
            id: existing.docs[0].id,
            data: planData,
            overrideAccess: true,
          })
        : await payload.create({
            collection: 'subscription-plans',
            data: planData,
            overrideAccess: true,
          })

      const desiredFeatureIDs = new Set<number>()
      for (const featureCode of featureCodes) {
        const featureID = featureIDs.get(featureCode)
        if (featureID === undefined) throw new Error('Missing seeded feature: ' + featureCode)
        desiredFeatureIDs.add(featureID)
      }

      const existingEntitlements = await payload.find({
        collection: 'feature-entitlements',
        where: { plan: { equals: saved.id } },
        limit: 1000,
        overrideAccess: true,
      })
      const retainedFeatureIDs = new Set<number>()
      for (const entitlement of existingEntitlements.docs) {
        const featureID = relationshipID(entitlement.feature)
        const isDesired = featureID !== null && desiredFeatureIDs.has(Number(featureID))
        const keepActive = isDesired && !retainedFeatureIDs.has(Number(featureID))
        if (keepActive) retainedFeatureIDs.add(Number(featureID))
        if (entitlement.status !== (keepActive ? 'active' : 'inactive')) {
          await payload.update({
            collection: 'feature-entitlements',
            id: entitlement.id,
            data: { status: keepActive ? 'active' : 'inactive' },
            overrideAccess: true,
          })
        }
      }

      for (const featureID of desiredFeatureIDs) {
        if (retainedFeatureIDs.has(featureID)) continue
        await payload.create({
          collection: 'feature-entitlements',
          data: { plan: saved.id, feature: featureID, status: 'active' },
          overrideAccess: true,
        })
      }
    }

    console.log('Reconciled five features and three demonstration plans; obsolete records and mappings remain inactive.')
  } finally {
    await payload.destroy()
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Subscription seed failed.')
  process.exitCode = 1
})
