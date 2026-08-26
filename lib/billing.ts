export const PLATFORM_FEE_BPS = 50;
export const PLATFORM_FEE_BPS_DECIMAL = PLATFORM_FEE_BPS / 10_000;

export const STRIPE_FEE_BPS = 290;
export const STRIPE_FEE_BPS_DECIMAL = STRIPE_FEE_BPS / 10_000;
export const STRIPE_FIXED_PER_INVOICE_GBP = 0.3;

export const AGENT_NANOPAYMENT_RAW_USDC_6 = BigInt('50000');
export const AGENT_NANOPAYMENT_DISPLAY_USDC = '0.05';

export const ARC_CHAIN_ID_HEX = '0x5042002';
export const ARC_CHAIN_ID_NUMBER = 5042002;

export const SUBSCRIPTION_LIMITS: Record<'free' | 'pro' | 'business', number> = {
  free: 5,
  pro: 10_000,
  business: 1_000_000,
};

export function monthlyPlatformFeeFromAmountRawBps(amountDecimal: number): number {
  return amountDecimal * PLATFORM_FEE_BPS_DECIMAL;
}

export function monthlyStripeFeeFromAmountGbp(
  amountMonthly: number,
  invoicesCount: number
): number {
  return (
    amountMonthly * STRIPE_FEE_BPS_DECIMAL +
    Math.max(1, invoicesCount) * STRIPE_FIXED_PER_INVOICE_GBP
  );
}
