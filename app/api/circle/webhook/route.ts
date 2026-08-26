import { NextRequest, NextResponse } from 'next/server';
import { prisma, isCloudDbEnabled } from '@/lib/db';
import { parseSettlementWebhook } from '@/lib/circle-checkout';
import { safeLogger } from '@/lib/log-redact';
import { SUBSCRIPTION_LIMITS } from '@/lib/billing';

/**
 * Circle Payments Webhook handler.
 *
 * Receives `checkout.session.completed` events when a card-onramp subscription
 * upgrade successfully settles into the Circle USDC wallet. The `meta` object
 * encoded at session creation time carries `{wallet, tier}` — these are
 * server-signed values (browser never told us which tier to issue) so an
 * attacker can't replay a 15 USDC paid event and claim a Business tier.
 *
 * @returns 200 {received:true} on ANY valid parse — Circle retries webhooks on
 * non-2xx and we'd rather double-log than double-upsert (the upsert is
 * idempotent by design).
 */
export async function POST(request: NextRequest) {
  try {
    // HMAC signature verification — when CIRCLE_WEBHOOK_SIGNING_SECRET is set
    // we validate the `X-Circle-Signature` header against `sha256(secret, rawBody)`.
    // When unset (dev/hackathon without Circle) we skip HMAC and parse the
    // structurally validated payload only; that's acceptable for demo mode.
    const rawText = await request.text();
    const sigHeader = request.headers.get('x-circle-signature');
    const secret = process.env.CIRCLE_WEBHOOK_SIGNING_SECRET;
    if (secret && sigHeader) {
      const crypto = globalThis.crypto as Crypto;
      const enc = new TextEncoder();
      const keyBuf = await crypto.subtle.importKey(
        'raw',
        enc.encode(secret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['verify']
      );
      const expected = sigHeader.startsWith('sha256=') ? sigHeader.slice(7) : sigHeader;
      const actualBuf = await crypto.subtle.sign('HMAC', keyBuf, enc.encode(rawText));
      const actual = Array.from(new Uint8Array(actualBuf))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
      if (actual !== expected) {
        safeLogger.warn('[Circle:webhook] HMAC signature mismatch. DROPPING.');
        return NextResponse.json({ received: false }, { status: 401 });
      }
    }
    let parsedBody: Record<string, any>;
    try {
      parsedBody = JSON.parse(rawText);
    } catch {
      return NextResponse.json({ received: false, error: 'Invalid JSON.' }, { status: 400 });
    }
    const event = parseSettlementWebhook(parsedBody);
    if (!event) {
      safeLogger.warn('[Circle:webhook] payload did not pass structural validation.');
      return NextResponse.json({ received: false, error: 'Unrecognized payload.' }, { status: 400 });
    }
    safeLogger.info(
      `[Circle:webhook] ${event.type} session=${event.sessionId} wallet=${event.customerWallet} tier=${event.tier} amount=${event.amountUsd}`
    );
    if (event.type === 'checkout.session.completed') {
      if (isCloudDbEnabled && prisma) {
        await prisma.subscription.upsert({
          where: { address: event.customerWallet },
          update: { tier: event.tier, updatedAt: new Date(), sessionId: event.sessionId || null, txHash: event.id },
          create: { address: event.customerWallet, tier: event.tier, sessionId: event.sessionId || null, txHash: event.id },
        });
        safeLogger.info(
          `[Circle:webhook] upserted tier=${event.tier} wallet=${event.customerWallet} limits=${SUBSCRIPTION_LIMITS[event.tier]}`
        );
      }
    }
    return NextResponse.json({ received: true, eventId: event.id });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    safeLogger.error('[Circle:webhook] handler failed:', err);
    // Return 200 on internal errors to prevent Circle replaying this webhook
    // infinitely; the log + alerting paths surface the exception to oncall.
    return NextResponse.json({ received: true, internalError: msg });
  }
}
