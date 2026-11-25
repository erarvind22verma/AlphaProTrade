import 'dotenv/config'

import { randomBytes } from 'node:crypto'
import { appendFile, lstat, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { getPayload } from 'payload'

import config from '../src/payload.config.js'

const DEMO_ACCOUNTS = [
  { name: 'Basic Demo', email: 'subscriber@alphaprotrade.local', role: 'subscriber', planCode: 'basic' },
  { name: 'Premium Demo', email: 'trader@alphaprotrade.local', role: 'trader', planCode: 'premium' },
  { name: 'Enterprise Demo', email: 'enterprise.demo@alphaprotrade.local', role: 'trader', planCode: 'enterprise' },
] as const

function getCredentialsPath(): string {
  const flag = '--credentials-file'
  const index = process.argv.indexOf(flag)
  const value = index >= 0 ? process.argv[index + 1] : undefined
  if (!value) throw new Error(`Pass ${flag} for the owner-only local credentials file.`)
  const path = resolve(value)
  if (path !== resolve(process.cwd(), '.demo-credentials')) {
    throw new Error('Credential output must use the ignored .demo-credentials file in apps/cms.')
  }
  return path
}

function idOf(value: unknown): number | string | null {
  if (typeof value === 'number' || typeof value === 'string') return value
  if (value && typeof value === 'object' && 'id' in value) {
    const id = (value as { id?: unknown }).id
    if (typeof id === 'number' || typeof id === 'string') return id
  }
  return null
}

async function main(): Promise<void> {
  const credentialsPath = getCredentialsPath()
  let existingCredentials = ''
  try {
    const info = await lstat(credentialsPath)
    if (info.isSymbolicLink() || (info.mode & 0o077) !== 0) {
      throw new Error('Credential file must be a regular owner-only (0600) file.')
    }
    existingCredentials = await readFile(credentialsPath, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }

  const payload = await getPayload({ config: await config })
  try {
    const admins = await payload.find({
      collection: 'users',
      where: { role: { equals: 'super_admin' } },
      limit: 1,
      overrideAccess: true,
    })
    const operator = admins.docs[0]
    if (!operator) throw new Error('A bootstrapped super_admin is required before preparing demo accounts.')

    // The administrator is for CMS operations only. EntitlementService already
    // grants active staff access for support, so no paid subscription is needed.
    const operatorSubscriptions = await payload.find({
      collection: 'user-subscriptions',
      where: { user: { equals: operator.id } },
      limit: 100,
      overrideAccess: true,
    })
    for (const subscription of operatorSubscriptions.docs) {
      if (subscription.status === 'active') {
        await payload.update({
          collection: 'user-subscriptions',
          id: subscription.id,
          data: { status: 'cancelled' },
          user: operator,
          overrideAccess: true,
        })
      }
    }

    const plansResult = await payload.find({ collection: 'subscription-plans', limit: 100, overrideAccess: true })
    const plansByCode = new Map(plansResult.docs.map((plan) => [plan.code, plan]))
    const today = new Date()
    const generatedCredentials: Array<{ name: string; email: string; role: string; password: string; plan: string }> = []

    for (const account of DEMO_ACCOUNTS) {
      const plan = plansByCode.get(account.planCode)
      if (!plan || plan.status !== 'active') throw new Error(`Missing active ${account.planCode} plan.`)

      const existingUsers = await payload.find({
        collection: 'users',
        where: { email: { equals: account.email } },
        limit: 2,
        overrideAccess: true,
      })
      if (existingUsers.docs.length > 1) throw new Error(`Duplicate demo account records found for ${account.email}.`)

      let user = existingUsers.docs[0]
      if (user) {
        if (user.role !== account.role) throw new Error(`Existing demo account ${account.email} has an unexpected role.`)
        if (user.accountStatus !== 'active') {
          user = await payload.update({
            collection: 'users',
            id: user.id,
            data: { accountStatus: 'active' },
            user: operator,
            overrideAccess: true,
          })
        }
      } else {
        const password = randomBytes(24).toString('base64url')
        user = await payload.create({
          collection: 'users',
          data: { email: account.email, password, role: account.role, accountStatus: 'active' },
          user: operator,
          overrideAccess: true,
        })
        generatedCredentials.push({
          name: account.name,
          email: account.email,
          role: account.role,
          password,
          plan: account.planCode,
        })
      }

      const subscriptions = await payload.find({
        collection: 'user-subscriptions',
        where: { user: { equals: user.id } },
        sort: '-startDate',
        limit: 100,
        overrideAccess: true,
      })
      const currentActive = subscriptions.docs.filter((subscription) => subscription.status === 'active')
      const existingPlanSub = currentActive.find((subscription) => idOf(subscription.plan) === plan.id)
      const endDate = new Date(today)
      if (plan.billingInterval === 'yearly') endDate.setFullYear(endDate.getFullYear() + 1)
      else endDate.setMonth(endDate.getMonth() + 1)

      for (const subscription of currentActive) {
        if (existingPlanSub && subscription.id === existingPlanSub.id) continue
        if (!existingPlanSub && subscription === currentActive[0]) continue
        await payload.update({
          collection: 'user-subscriptions',
          id: subscription.id,
          data: { status: 'cancelled' },
          user: operator,
          overrideAccess: true,
        })
      }

      const subscriptionData = {
        user: user.id,
        plan: plan.id,
        status: 'active' as const,
        startDate: today.toISOString(),
        endDate: endDate.toISOString(),
      }
      if (existingPlanSub) {
        await payload.update({
          collection: 'user-subscriptions',
          id: existingPlanSub.id,
          data: subscriptionData as never,
          user: operator,
          overrideAccess: true,
        })
      } else if (currentActive[0]) {
        await payload.update({
          collection: 'user-subscriptions',
          id: currentActive[0].id,
          data: subscriptionData as never,
          user: operator,
          overrideAccess: true,
        })
      } else {
        await payload.create({
          collection: 'user-subscriptions',
          data: subscriptionData as never,
          user: operator,
          overrideAccess: true,
        })
      }
    }

    if (generatedCredentials.length) {
      const section = [
        '',
        'Enterprise demo account',
        `Created: ${today.toISOString()}`,
        'Password is local-only. Do not commit or share this file.',
        ...generatedCredentials.flatMap((account) => [
          '',
          `${account.name} (${account.role})`,
          `email=${account.email}`,
          `password=${account.password}`,
          `subscription=${account.plan}`,
        ]),
        '',
      ].join('\n')
      if (existingCredentials) await appendFile(credentialsPath, section, { mode: 0o600 })
      else await writeFile(credentialsPath, section.trimStart(), { mode: 0o600 })
    }

    console.log('Kept the super_admin account admin-only and prepared one active subscriber account for each plan.')
  } finally {
    await payload.destroy()
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Demo account preparation failed.')
  process.exitCode = 1
})
