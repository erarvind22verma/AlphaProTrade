import type { Payload } from 'payload'

import { getCasbinAdapter } from '../authz/CasbinAdapter'
import { EntitlementService } from './EntitlementService'
import { PayloadEntitlementRepository } from './PayloadEntitlementRepository'

export async function createPayloadEntitlementService(payload: Payload): Promise<EntitlementService> {
  return new EntitlementService(new PayloadEntitlementRepository(payload), await getCasbinAdapter())
}
