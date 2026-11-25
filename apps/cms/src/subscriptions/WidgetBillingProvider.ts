export interface WidgetBillingPurchase {
  userId: number | string
  featureCode: string
  billingCycle: 'monthly' | 'yearly'
  amount: number
  currency: string
}

export interface WidgetBillingProvider {
  simulatePurchase(purchase: WidgetBillingPurchase): Promise<void>
  simulateCancellation(subscriptionId: number | string): Promise<void>
}

/**
 * POC payment boundary. Replace this adapter with a recurring billing provider
 * integration later; this implementation never collects payment credentials.
 */
export class SimulatedWidgetBillingProvider implements WidgetBillingProvider {
  async simulatePurchase(_purchase: WidgetBillingPurchase): Promise<void> {}
  async simulateCancellation(_subscriptionId: number | string): Promise<void> {}
}
