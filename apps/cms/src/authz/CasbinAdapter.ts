import { resolve } from 'node:path'
import { newEnforcer, type Enforcer } from 'casbin'

import type { AuthorizationAdapter, AuthorizationRequest } from './AuthorizationAdapter'

export class CasbinAdapter implements AuthorizationAdapter {
  constructor(private readonly enforcer: Enforcer) {}

  static async create(): Promise<CasbinAdapter> {
    const authzDirectory = resolve(process.cwd(), 'src/authz')
    const enforcer = await newEnforcer(
      resolve(authzDirectory, 'model.conf'),
      resolve(authzDirectory, 'policy.csv'),
    )

    return new CasbinAdapter(enforcer)
  }

  async isAllowed({ subject, action, resource, context = {} }: AuthorizationRequest): Promise<boolean> {
    if (
      !subject ||
      !subject.id ||
      !subject.role ||
      subject.accountStatus !== 'active' ||
      !action ||
      !resource?.type ||
      !resource.attributes
    ) {
      return false
    }

    const isSelf =
      context.targetIsSelf === true ||
      (resource.id !== undefined && String(resource.id) === String(subject.id))

    try {
      return await this.enforcer.enforce(
        {
          id: String(subject.id),
          role: subject.role,
          accountStatus: subject.accountStatus,
        },
        {
          type: resource.type,
          id: resource.id === undefined ? '' : String(resource.id),
          attributes: {
            ...resource.attributes,
            ownerId:
              resource.attributes.ownerId === undefined || resource.attributes.ownerId === null
                ? null
                : String(resource.attributes.ownerId),
            tenantId: resource.attributes.tenantId ?? null,
          },
        },
        action,
        {
          ...context,
          targetIsSelf: isSelf,
          tenantId: context.tenantId ?? resource.attributes.tenantId ?? null,
        },
      )
    } catch {
      // Fail closed if the model, policy, or request cannot be evaluated.
      return false
    }
  }
}

let adapterPromise: Promise<CasbinAdapter> | undefined

/** Lazily load and reuse the server-side enforcer. */
export function getCasbinAdapter(): Promise<CasbinAdapter> {
  adapterPromise ??= CasbinAdapter.create()
  return adapterPromise
}
