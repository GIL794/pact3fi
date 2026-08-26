import { NextRequest, NextResponse } from 'next/server';
import { createInvoice, getDashboardStats } from '@/lib/store';
import type { Currency } from '@/lib/arc';
import { isValidAlgorandAddress } from '@/lib/algo';
import { safeLogger } from '@/lib/log-redact';
import { CreateInvoiceRequestZ, safeParse } from '@/lib/schemas';
import { AUTH_HEADERS, verifyOwnerSignature } from '@/lib/auth';
import { applyRateLimit, RL_BUCKET_KEY_INVOICES } from '@/lib/rate-limit';

/**
 * Extract the authenticated owner from *only* the signed x-pactopus-owner header.
 *
 * P2 HARDENING: No longer accepts `body.ownerAddress` / `body.owner` or URL
 * `?owner=` parameters for write-scoped attribution. Those inputs were the
 * direct Sybil bypass flagged in the production audit. Callers must present a
 * `personal_sign` signature over the request via verifyOwnerSignature(); if
 * the signature is missing or invalid we reject with 401 instead of falling
 * back to the unsigned header.
 *
 * Public dashboards use empty-string fallback scoped to no invoices.
 */
async function resolveAuthenticatedOwner(
  request: NextRequest,
  rawBody: Record<string, unknown> | null,
  options?: { required?: boolean }
): Promise<{ wallet: string; errorResponse?: NextResponse }> {
  const result = await verifyOwnerSignature(request, rawBody);
  if (result.success) return { wallet: result.wallet };
  if (options?.required === false) return { wallet: '' };
  safeLogger.warn('[API:invoices] Auth failed', { path: request.nextUrl.pathname, error: result.error });
  return {
    wallet: '',
    errorResponse: NextResponse.json(
      { error: result.error, authRequired: true },
      { status: result.status }
    ),
  };
}

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.json();

    // --- rate-limit Sybil dampening: 50 invoice-create attempts / wallet / day.
    const rlWallet = request.headers.get(AUTH_HEADERS.WALLET) || request.headers.get('X-Pactopus-Owner') || '';
    const rlIp = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '127.0.0.1';
    const rl = await applyRateLimit([`${RL_BUCKET_KEY_INVOICES}:wallet:${rlWallet}`, `${RL_BUCKET_KEY_INVOICES}:ip:${rlIp}`]);
    if (!rl.ok) {
      return NextResponse.json(
        { error: `Rate limit reached. Try again in ${rl.retryAfterSeconds}s.` },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfterSeconds) } }
      );
    }

    const { wallet, errorResponse } = await resolveAuthenticatedOwner(request, rawBody as Record<string, unknown>, { required: true });
    if (errorResponse) return errorResponse;

    const parsed = safeParse(CreateInvoiceRequestZ, rawBody);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid payload', issues: parsed.issues },
        { status: 400 }
      );
    }

    const {
      amount,
      currency,
      description,
      recipientAddress: rawRecipient,
      recipientName,
      network,
      expiresAt,
    } = parsed.data;

    if (network === 'algorand' && !isValidAlgorandAddress(rawRecipient)) {
      return NextResponse.json(
        { error: 'Invalid Algorand wallet address (must be 58 uppercase base32 characters)' },
        { status: 400 }
      );
    }

    const recipientAddress =
      network === 'arc' ? rawRecipient.toLowerCase() : rawRecipient.toUpperCase();

    safeLogger.info(
      `[API:invoices:POST] create owner=${wallet} network=${network} amount=${amount} currency=${currency}`
    );

    const invoice = await createInvoice({
      ownerAddress: wallet,
      amount: parseFloat(amount).toFixed(2),
      currency: currency as Currency,
      description: (description ?? '').trim() || '(no description)',
      recipientAddress,
      recipientName: (recipientName ?? '').trim() || undefined,
      network,
      expiresAt,
    });

    return NextResponse.json({ invoice }, { status: 201 });
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    safeLogger.warn(`[API:invoices:POST] failed: ${errMsg}`, err);
    const isLimitErr = /invoices.*month.*reached|limit of \d+ invoices/i.test(errMsg);
    return NextResponse.json(
      { error: errMsg || 'Failed to create invoice', limitReached: isLimitErr },
      { status: isLimitErr ? 402 : 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const network = (searchParams.get('network') as 'arc' | 'algorand') || 'arc';
    const { wallet, errorResponse } = await resolveAuthenticatedOwner(request, null, { required: false });
    if (errorResponse) return errorResponse;
    safeLogger.info(
      `[API:invoices:GET] dashboard owner=${wallet || '(public-anonymous)'} network=${network}`
    );
    const stats = await getDashboardStats(network, wallet);
    return NextResponse.json(stats);
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    safeLogger.warn(`[API:invoices:GET] failed: ${errMsg}`, err);
    return NextResponse.json(
      { error: errMsg || 'Failed to fetch dashboard stats' },
      { status: 500 }
    );
  }
}
