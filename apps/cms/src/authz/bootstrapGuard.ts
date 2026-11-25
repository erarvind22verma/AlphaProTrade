import { createHash, timingSafeEqual } from 'node:crypto'

export type BootstrapInvocation = {
  isDirectCLI: boolean
  isInteractive: boolean
  confirmed: boolean
  providedSecret: string
  expectedSecretHash: string
}

/**
 * Only permit the one-time bootstrap from an interactive direct CLI invocation
 * with an operator confirmation and a secret matching the protected hash.
 */
export function isAuthorizedBootstrapInvocation({
  isDirectCLI,
  isInteractive,
  confirmed,
  providedSecret,
  expectedSecretHash,
}: BootstrapInvocation): boolean {
  if (!isDirectCLI || !isInteractive || !confirmed || providedSecret.length < 32) return false
  if (!/^[a-f0-9]{64}$/i.test(expectedSecretHash)) return false

  const providedHash = createHash('sha256').update(providedSecret).digest()
  const expectedHash = Buffer.from(expectedSecretHash, 'hex')
  return expectedHash.length === providedHash.length && timingSafeEqual(providedHash, expectedHash)
}
