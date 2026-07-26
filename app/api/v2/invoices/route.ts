import { NextRequest, NextResponse } from 'next/server';
import { createInvoice } from '@/lib/store';
import { CONTRACTS, PLATFORM_WALLET } from '@/lib/arc';
import { ethers } from 'ethers';

const ARC_RPC_URL = process.env.NEXT_PUBLIC_ARC_RPC_URL || 'https://testnet.arc.eco/rpc';

// Server-side transaction verification helper
async function verifyArcUSDCPayment(
  txHash: string,
  recipient: string,
  amount: bigint
): Promise<boolean> {
  try {
    const provider = new ethers.JsonRpcProvider(ARC_RPC_URL);
    const receipt = await provider.getTransactionReceipt(txHash);

    if (!receipt || receipt.status !== 1) {
      return false;
    }

    const transferTopic = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
    const usdcAddress = CONTRACTS.USDC.toLowerCase();

    for (const log of receipt.logs) {
      if (log.address.toLowerCase() !== usdcAddress) continue;
      if (log.topics[0] !== transferTopic) continue;

      const toHex = log.topics[2];
      if (!toHex) continue;
      
      const recipientAddress = '0x' + toHex.slice(26).toLowerCase();
      if (recipientAddress !== recipient.toLowerCase()) continue;

      const value = BigInt(log.data);
      if (value >= amount) {
        return true;
      }
    }
    return false;
  } catch (err) {
    console.error('Error verifying payment transaction:', err);
    return false;
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { amount, currency, description, recipientAddress, recipientName, txHash } = body;

    // Billing rate: 0.05 USDC nanopayment fee
    const feeAmountRaw = BigInt(50000); // 0.05 USDC with 6 decimals

    // If txHash is missing, request payment (HTTP 402)
    if (!txHash) {
      const responseHeaders = new Headers();
      responseHeaders.set('X-Payment-Target', PLATFORM_WALLET);
      responseHeaders.set('X-Payment-Amount', '0.05');
      responseHeaders.set('X-Payment-Asset', CONTRACTS.USDC);
      responseHeaders.set('X-Payment-Chain-Id', '5042002');

      return NextResponse.json(
        {
          error: 'Payment Required',
          message: 'Invoice creation requires a 0.05 USDC nanopayment.',
          paymentTarget: PLATFORM_WALLET,
          paymentAmount: '0.05',
          paymentAsset: CONTRACTS.USDC,
          paymentChainId: 5042002
        },
        {
          status: 402,
          headers: responseHeaders
        }
      );
    }

    // Verify on-chain payment transfer to the platform wallet
    const isVerified = await verifyArcUSDCPayment(txHash, PLATFORM_WALLET, feeAmountRaw);

    if (!isVerified) {
      return NextResponse.json(
        { error: 'Invalid Payment', message: 'The payment transaction could not be verified on the Arc L1 network.' },
        { status: 402 }
      );
    }

    // Create the invoice once payment is successfully verified
    const invoice = createInvoice({
      amount,
      currency,
      description,
      recipientAddress,
      recipientName,
      network: 'arc'
    });

    return NextResponse.json(
      {
        status: 'created',
        invoice,
        message: 'Invoice created successfully via HTTP 402 nanopayment verification.'
      },
      { status: 201 }
    );
  } catch (err: any) {
    const errMsg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: errMsg || 'Invoice creation failed' }, { status: 500 });
  }
}
