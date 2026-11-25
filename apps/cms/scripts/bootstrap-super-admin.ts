import 'dotenv/config'

import { readFile, stat } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { getPayload } from 'payload'

import config from '../src/payload.config.js'
import { isAuthorizedBootstrapInvocation } from '../src/authz/bootstrapGuard'

function getArgument(name: string): string | undefined {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : undefined
}

async function main(): Promise<void> {
  const scriptPath = process.argv[1] ? resolve(process.argv[1]) : ''
  const isDirectCLI = scriptPath === resolve(fileURLToPath(import.meta.url))
  const secretFile = getArgument('--secret-file')

  if (!secretFile) {
    throw new Error('Pass --secret-file pointing to a protected, temporary token file.')
  }

  const secretPath = resolve(secretFile)
  const secretStat = await stat(secretPath)
  if ((secretStat.mode & 0o077) !== 0) {
    throw new Error('Bootstrap token file permissions must be owner-only (0600).')
  }
  if (typeof process.getuid === 'function' && secretStat.uid !== process.getuid()) {
    throw new Error('Bootstrap token file must be owned by the current operator.')
  }

  const providedSecret = (await readFile(secretPath, 'utf8')).trim()
  const authorized = isAuthorizedBootstrapInvocation({
    isDirectCLI,
    isInteractive: Boolean(process.stdin.isTTY && process.stdout.isTTY),
    confirmed: process.argv.includes('--confirm'),
    providedSecret,
    expectedSecretHash: process.env.ALPHAPROTRADE_BOOTSTRAP_SECRET_SHA256 ?? '',
  })
  if (!authorized) {
    throw new Error('Bootstrap denied. Run only as an interactive, confirmed CLI operation with the configured secret.')
  }

  const email = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim()
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD
  if (!email || !password || password.length < 16) {
    throw new Error('Set BOOTSTRAP_ADMIN_EMAIL and a BOOTSTRAP_ADMIN_PASSWORD of at least 16 characters.')
  }

  const payloadConfig = await config
  const payload = await getPayload({ config: payloadConfig })

  try {
    const existing = await payload.find({
      collection: 'users',
      where: { role: { equals: 'super_admin' } },
      limit: 1,
      overrideAccess: true,
    })
    if (existing.docs.length > 0) {
      throw new Error('A super_admin already exists. Bootstrap is one-time and cannot be repeated.')
    }

    await payload.create({
      collection: 'users',
      data: {
        email,
        password,
        role: 'super_admin',
        accountStatus: 'active',
      },
      overrideAccess: true,
      context: { alphaProTradeBootstrap: true },
    })

    console.log('Created the first super_admin account for ' + email + '. Remove the temporary token and unset bootstrap secrets now.')
  } finally {
    await payload.destroy()
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Bootstrap failed.')
  process.exitCode = 1
})
