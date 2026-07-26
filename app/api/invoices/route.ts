import { NextRequest, NextResponse } from 'next/server';
import { createInvoice, getDashboardStats } from '@/lib/store';
import type { Currency } from '@/lib/arc';
import { isValidAlgorandAddress } from '@/lib/algo';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { amount, currency, description, recipientAddress, recipientName, network = 'arc' } = body;

    // Validation
    if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
      return NextResponse.json({ error: 'Invalid amount' }, { status: 400 });
    }
    if (!['USDC', 'EURC'].includes(currency)) {
      return NextResponse.json({ error: 'Currency must be USDC or EURC' }, { status: 400 });
    }
    if (!description || description.trim().length < 3) {
      return NextResponse.json({ error: 'Description is required' }, { status: 400 });
    }
    
    // Address validation based on network
    if (network === 'arc') {
      if (!recipientAddress || !recipientAddress.startsWith('0x') || recipientAddress.length !== 42) {
        return NextResponse.json({ error: 'Invalid EVM/Arc wallet address (must start with 0x and be 42 characters)' }, { status: 400 });
      }
    } else if (network === 'algorand') {
      if (!isValidAlgorandAddress(recipientAddress)) {
        return NextResponse.json({ error: 'Invalid Algorand wallet address (must be 58 uppercase characters)' }, { status: 400 });
      }
    } else {
      return NextResponse.json({ error: 'Invalid network' }, { status: 400 });
    }

    const invoice = createInvoice({
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
    return NextResponse.json({ error: errMsg || 'Failed to create invoice' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const network = (searchParams.get('network') as 'arc' | 'algorand') || 'arc';
  const stats = getDashboardStats(network);
  return NextResponse.json(stats);
}
