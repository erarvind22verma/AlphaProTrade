import 'dotenv/config'

import { randomBytes } from 'node:crypto'
import { appendFile, lstat, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { getPayload } from 'payload'

import config from '../src/payload.config.js'

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : undefined
}

async function main(): Promise<void> {
  const credentialsFile = argument('--credentials-file')
  if (!credentialsFile) throw new Error('Pass --credentials-file pointing to an owner-only local credentials file.')
  const outputPath = resolve(credentialsFile)
  const approvedIgnoredFile = outputPath === resolve(process.cwd(), '.demo-credentials')
  if (outputPath.includes(`${resolve(process.cwd())}/`) && !approvedIgnoredFile) {
    throw new Error('Credential output must be outside the project repository.')
  }

  let existingCredentials = ''
  try {
    const info = await lstat(outputPath)
    if (info.isSymbolicLink() || (info.mode & 0o077) !== 0) {
      throw new Error('Credential file must be a regular owner-only (0600) file.')
    }
    existingCredentials = await readFile(outputPath, 'utf8')
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
    const bootstrapAdmin = admins.docs[0]
    if (!bootstrapAdmin) throw new Error('Bootstrap the first super_admin before seeding demo users.')

    const plans = await payload.find({ collection: 'subscription-plans', limit: 100, overrideAccess: true })
    const planByCode = new Map(plans.docs.map((plan) => [plan.code, plan]))
    const definitions = [
      { name: 'Content Author', email: 'content.author@alphaprotrade.local', role: 'content_author' },
      { name: 'Content Editor', email: 'content.editor@alphaprotrade.local', role: 'content_editor' },
      { name: 'Content Approver', email: 'content.approver@alphaprotrade.local', role: 'content_approver' },
      { name: 'Trader', email: 'trader@alphaprotrade.local', role: 'trader', planCode: 'premium' },
      { name: 'Subscriber', email: 'subscriber@alphaprotrade.local', role: 'subscriber', planCode: 'basic' },
    ]

    for (const definition of definitions) {
      if (definition.planCode && !planByCode.has(definition.planCode)) {
        throw new Error(`Seed subscription plans before demo users; missing ${definition.planCode}.`)
      }
      const exists = await payload.find({
        collection: 'users',
        where: { email: { equals: definition.email } },
        limit: 1,
        overrideAccess: true,
      })
      if (exists.docs.length) throw new Error(`Demo user already exists: ${definition.email}. Refusing to rotate credentials.`)
    }

    const today = new Date()
    const created: Array<{ name: string; email: string; role: string; password: string }> = []
    for (const definition of definitions) {
      const password = randomBytes(24).toString('base64url')
      const user = await payload.create({
        collection: 'users',
        data: {
          email: definition.email,
          password,
          role: definition.role as never,
          accountStatus: 'active',
        },
        user: bootstrapAdmin,
        overrideAccess: true,
      })
      created.push({ name: definition.name, email: definition.email, role: definition.role, password })

      if (definition.planCode) {
        const plan = planByCode.get(definition.planCode)!
        const endDate = new Date(today)
        if (plan.billingInterval === 'yearly') endDate.setFullYear(endDate.getFullYear() + 1)
        else endDate.setMonth(endDate.getMonth() + 1)
        await payload.create({
          collection: 'user-subscriptions',
          data: {
            user: user.id,
            plan: plan.id,
            status: 'active',
            startDate: today.toISOString(),
            endDate: endDate.toISOString(),
          },
          user: bootstrapAdmin,
          overrideAccess: true,
        })
      }
    }

    const section = [
      '',
      'AlphaProTrade local POC demo users',
      `Created: ${new Date().toISOString()}`,
      'Passwords are local-only. Do not commit or share this file.',
      ...created.flatMap((user) => [
        '',
        `${user.name} (${user.role})`,
        `email=${user.email}`,
        `password=${user.password}`,
        `subscription=${user.role === 'subscriber' ? 'Basic' : user.role === 'trader' ? 'Premium' : 'none'}`,
      ]),
      '',
    ].join('\n')
    if (existingCredentials) await appendFile(outputPath, section, { mode: 0o600 })
    else await writeFile(outputPath, section.trimStart(), { mode: 0o600 })
    console.log(`Created five demo accounts; local credentials saved to ${outputPath} with owner-only access.`)
  } finally {
    await payload.destroy()
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Demo user seed failed.')
  process.exitCode = 1
})
