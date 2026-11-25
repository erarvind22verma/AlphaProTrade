import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'

import { isAuthorizedBootstrapInvocation } from '@/authz/bootstrapGuard'

const secret = 'poc-bootstrap-token-with-at-least-32-characters'
const expectedSecretHash = createHash('sha256').update(secret).digest('hex')
const authorizedInvocation = {
  isDirectCLI: true,
  isInteractive: true,
  confirmed: true,
  providedSecret: secret,
  expectedSecretHash,
}

describe('one-time super-admin bootstrap guard', () => {
  it('accepts a confirmed direct interactive CLI with the matching secret', () => {
    expect(isAuthorizedBootstrapInvocation(authorizedInvocation)).toBe(true)
  })

  it('denies non-interactive and non-CLI attempts', () => {
    expect(isAuthorizedBootstrapInvocation({ ...authorizedInvocation, isInteractive: false })).toBe(false)
    expect(isAuthorizedBootstrapInvocation({ ...authorizedInvocation, isDirectCLI: false })).toBe(false)
  })

  it('denies unconfirmed, missing, and incorrect secrets', () => {
    expect(isAuthorizedBootstrapInvocation({ ...authorizedInvocation, confirmed: false })).toBe(false)
    expect(isAuthorizedBootstrapInvocation({ ...authorizedInvocation, providedSecret: '' })).toBe(false)
    expect(isAuthorizedBootstrapInvocation({ ...authorizedInvocation, providedSecret: 'wrong-token'.repeat(4) })).toBe(false)
  })
})
