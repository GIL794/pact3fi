import { NextRequest, NextResponse } from 'next/server';
import { sponsorGasForUserOp } from '@/lib/paymaster-kit';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { sender, callData, description } = body;

    if (!sender || typeof sender !== 'string') {
      return NextResponse.json(
        { status: 'error', error: 'Missing or invalid required field: sender (string address)' },
        { status: 400 }
      );
    }
    if (!callData || typeof callData !== 'string') {
      return NextResponse.json(
        { status: 'error', error: 'Missing or invalid required field: callData (hex string)' },
        { status: 400 }
      );
    }
    if (!description || typeof description !== 'string' || description.trim().length < 3) {
      return NextResponse.json(
        { status: 'error', error: 'Missing or invalid required field: description (min 3 chars)' },
        { status: 400 }
      );
    }

    if (!/^0x[a-fA-F0-9]+$/.test(callData)) {
      return NextResponse.json(
        { status: 'error', error: 'callData must be a valid 0x-prefixed hex string' },
        { status: 400 }
      );
    }

    if (!/^0x[a-fA-F0-9]{40}$/.test(sender)) {
      return NextResponse.json(
        { status: 'error', error: 'sender must be a valid 0x-prefixed 20-byte EVM address' },
        { status: 400 }
      );
    }

    const sponsorship = await sponsorGasForUserOp({
      sender,
      nonce: BigInt(0),
      callData,
      callGasLimit: BigInt(200_000),
      description: description.trim(),
    });

    return NextResponse.json(
      {
        status: 'sponsored',
        paymasterAndData: sponsorship.paymasterAndData,
        allowanceRemaining: sponsorship.allowanceRemaining,
      },
      { status: 200 }
    );
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    const statusCode =
      errMsg.toLowerCase().includes('rate limit') ? 429 :
      errMsg.toLowerCase().includes('insufficient') || errMsg.toLowerCase().includes('allowance') ? 402 :
      500;

    return NextResponse.json(
      {
        status: 'error',
        error: errMsg || 'Paymaster sponsorship failed',
      },
      { status: statusCode }
    );
  }
}
