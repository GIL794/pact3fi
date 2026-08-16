import { NextRequest, NextResponse } from 'next/server';
import { getInvoice, markInvoicePaid, isTxHashUsed } from '@/lib/store';
import { CONTRACTS, PLATFORM_WALLET } from '@/lib/arc';
import { ethers } from 'ethers';

const ARC_RPC_URL = process.env.NEXT_PUBLIC_ARC_RPC_URL || 'https://testnet.arc.eco/rpc';

// Server-side Arc EVM on-chain verification for both Payout and Fee split receipts
async function verifyArcPayment(
  payoutTxHash: string,
  feeTxHash: string | undefined,
  expectedAsset: string,
  expectedRecipient: string,
  expectedNetAmount: bigint,
  expectedFeeAmount: bigint
): Promise<boolean> {
  try {
    const provider = new ethers.JsonRpcProvider(ARC_RPC_URL);
    
    // 1. Verify payout transaction receipt
    const payoutReceipt = await provider.getTransactionReceipt(payoutTxHash);
    if (!payoutReceipt || payoutReceipt.status !== 1) {
      console.error('Verify failed: Payout tx not found or failed on Arc');
      return false;
    }

    const transferTopic = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
    let verifiedPayout = false;

    for (const log of payoutReceipt.logs) {
      if (log.address.toLowerCase() !== expectedAsset.toLowerCase()) continue;
      if (log.topics[0] !== transferTopic) continue;

      const toHex = log.topics[2];
      if (!toHex) continue;

      const recipientAddress = '0x' + toHex.slice(26).toLowerCase();
      const value = BigInt(log.data);

      if (recipientAddress === expectedRecipient.toLowerCase() && value >= expectedNetAmount) {
        verifiedPayout = true;
      }
    }

    // If no fee expected (e.g. subscription upgrade direct payment), return payout status
    if (expectedFeeAmount === BigInt(0) || !feeTxHash) {
      return verifiedPayout;
    }

    // 2. Verify platform fee transaction receipt
    const feeReceipt = await provider.getTransactionReceipt(feeTxHash);
    if (!feeReceipt || feeReceipt.status !== 1) {
      console.error('Verify failed: Fee tx not found or failed on Arc');
      return false;
    }

    let verifiedFee = false;

    for (const log of feeReceipt.logs) {
      if (log.address.toLowerCase() !== expectedAsset.toLowerCase()) continue;
      if (log.topics[0] !== transferTopic) continue;

      const toHex = log.topics[2];
      if (!toHex) continue;

      const recipientAddress = '0x' + toHex.slice(26).toLowerCase();
      const value = BigInt(log.data);

      if (recipientAddress === PLATFORM_WALLET.toLowerCase() && value >= expectedFeeAmount) {
        verifiedFee = true;
      }
    }

    return verifiedPayout && verifiedFee;
  } catch (err) {
    console.error('Arc transaction verification error:', err);
    return false;
  }
}

// Server-side Algorand on-chain verification
async function verifyAlgorandPayment(
  txHash: string,
  expectedAssetId: number,
  expectedRecipient: string,
  expectedNetAmount: number
): Promise<boolean> {
  try {
    const res = await fetch(`https://testnet-idx.algonode.cloud/v2/transactions/${txHash}`);
    if (!res.ok) {
      console.error('Verify failed: Tx not found on Algorand Indexer');
      return false;
    }

    const data = await res.json();
    const tx = data.transaction;
    if (!tx) return false;

    const assetTx = tx['asset-transfer-transaction'];
    if (!assetTx) return false;

    const assetId = assetTx['asset-id'];
    const receiver = assetTx['receiver'];
    const amount = assetTx['amount'];

    if (assetId !== expectedAssetId) return false;
    if (receiver.toUpperCase() !== expectedRecipient.toUpperCase()) return false;
    if (amount < expectedNetAmount) return false;

    return true;
  } catch (err) {
    console.error('Algorand transaction verification error:', err);
    return false;
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { invoiceId, txHash, feeTxHash, payerAddress, tier } = body;

    // Support upgrades subscription verify
    if (tier && txHash) {
      const planAmount = tier === 'pro' ? 15 : 50;
      const expectedAmountRaw = BigInt(planAmount * 1000000); // USDC has 6 decimals
      const isVerified = await verifyArcPayment(txHash, undefined, CONTRACTS.USDC, PLATFORM_WALLET, expectedAmountRaw, BigInt(0));

      if (!isVerified) {
        return NextResponse.json({ error: 'Upgrade payment verification failed' }, { status: 400 });
      }
      return NextResponse.json({ status: 'paid', txHash });
    }

    if (!invoiceId || !txHash || !payerAddress) {
      return NextResponse.json({ error: 'Missing required fields: invoiceId, txHash, payerAddress' }, { status: 400 });
    }

    // Double-spend protection: check if this txHash was already used on another invoice
    const alreadyUsed = await isTxHashUsed(txHash, invoiceId);
    if (alreadyUsed) {
      return NextResponse.json({ error: 'Transaction hash has already been registered for another invoice.' }, { status: 409 });
    }

    const invoice = await getInvoice(invoiceId);
    if (!invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    }
    if (invoice.status === 'paid') {
      return NextResponse.json({ status: 'already-paid', invoice }, { status: 200 });
    }

    const amountVal = parseFloat(invoice.amount);
    const feeVal = (amountVal * 0.005).toFixed(2);
    const netVal = amountVal - parseFloat(feeVal);

    let isVerified = false;

    if (invoice.network === 'algorand') {
      const assetId = invoice.currency === 'USDC' ? 10458941 : 230190169;
      const expectedAmountUnits = Math.round(netVal * 1000000);
      isVerified = await verifyAlgorandPayment(txHash, assetId, invoice.recipientAddress, expectedAmountUnits);
    } else {
      // Arc (EVM)
      const assetAddress = invoice.currency === 'USDC' ? CONTRACTS.USDC : CONTRACTS.EURC;
      const expectedNetUnits = ethers.parseUnits(netVal.toFixed(6), 6);
      const expectedFeeUnits = ethers.parseUnits(parseFloat(feeVal).toFixed(6), 6);
      isVerified = await verifyArcPayment(txHash, feeTxHash, assetAddress, invoice.recipientAddress, expectedNetUnits, expectedFeeUnits);
    }

    if (!isVerified) {
      return NextResponse.json({ error: 'Payment transaction verification failed on-chain.' }, { status: 402 });
    }

    // Mark invoice as paid once verified on-chain
    const updatedInvoice = await markInvoicePaid(invoiceId, txHash, payerAddress, feeVal, feeTxHash);

    return NextResponse.json({
      status: 'paid',
      invoice: updatedInvoice,
      fee: feeVal,
      message: `Payment of ${invoice.amount} ${invoice.currency} verified on-chain on ${invoice.network === 'algorand' ? 'Algorand' : 'Arc'}.`,
    });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: errMsg || 'Payment processing failed' }, { status: 500 });
  }
}
