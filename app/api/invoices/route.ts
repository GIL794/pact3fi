import { NextRequest, NextResponse } from 'next/server';
import { createInvoice, getDashboardStats } from '@/lib/store';
import type { Currency } from '@/lib/arc';
import { isValidAlgorandAddress } from '@/lib/algo';
import { safeLogger } from '@/lib/log-redact';

const HEADER_OWNER = 'x-pactopus-owner';

function extractOwner(request: NextRequest, body?: Record<string, unknown>): string {
  const fromHeader = request.headers.get(HEADER_OWNER);
  if (fromHeader) return fromHeader.trim();
  const fromQuery = request.nextUrl.searchParams.get('owner');
  if (fromQuery) return fromQuery.trim();
  if (body) {
    const bOwner = (body.ownerAddress ?? body.owner) as string | undefined;
    if (bOwner && typeof bOwner === 'string') return bOwner.trim();
  }
  return '';
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { amount, currency, description, recipientAddress, recipientName, network = 'arc' } = body;
    const ownerAddress = extractOwner(request, body as Record<string, unknown>);

    if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
      return NextResponse.json({ error: 'Invalid amount' }, { status: 400 });
    }
    if (!['USDC', 'EURC'].includes(currency)) {
      return NextResponse.json({ error: 'Currency must be USDC or EURC' }, { status: 400 });
    }
    if (!description || description.trim().length < 3) {
      return NextResponse.json({ error: 'Description is required (min 3 characters)' }, { status: 400 });
    }

    if (network === 'arc') {
      if (!recipientAddress || !recipientAddress.startsWith('0x') || recipientAddress.length !== 42) {
        return NextResponse.json(
          { error: 'Invalid EVM/Arc wallet address (must start with 0x and be 42 characters)' },
          { status: 400 }
        );
      }
    } else if (network === 'algorand') {
      if (!isValidAlgorandAddress(recipientAddress)) {
        return NextResponse.json(
          { error: 'Invalid Algorand wallet address (must be 58 uppercase characters)' },
          { status: 400 }
        );
      }
    } else {
      return NextResponse.json({ error: 'Invalid network specification' }, { status: 400 });
    }

    safeLogger.info(
      `[API:invoices:POST] create owner=${ownerAddress || '(anonymous)'} network=${network} amount=${amount} currency=${currency}`
    );

    const invoice = await createInvoice({
      ownerAddress,
      amount: parseFloat(amount).toFixed(2),
      currency: currency as Currency,
      description: description.trim(),
      recipientAddress: network === 'arc' ? recipientAddress.toLowerCase() : recipientAddress.toUpperCase(),
      recipientName: recipientName?.trim() || undefined,
      network: network as 'arc' | 'algorand',
    });

    return NextResponse.json({ invoice }, { status: 201 });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    safeLogger.warn(`[API:invoices:POST] failed: ${errMsg}`);
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
    const ownerAddress = extractOwner(request);
    safeLogger.info(
      `[API:invoices:GET] dashboard owner=${ownerAddress || '(anonymous)'} network=${network}`
    );
    const stats = await getDashboardStats(network, ownerAddress);
    return NextResponse.json(stats);
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    safeLogger.warn(`[API:invoices:GET] failed: ${errMsg}`);
    return NextResponse.json(
      { error: errMsg || 'Failed to fetch dashboard stats' },
      { status: 500 }
    );
  }
}
