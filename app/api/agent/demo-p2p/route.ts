import { NextRequest, NextResponse } from 'next/server';
import { ethers } from 'ethers';
import { PLATFORM_FEE_BPS, parseTokenAmount, formatTokenAmount, getTxLink, CONTRACTS } from '@/lib/arc';

export const runtime = 'nodejs';

interface DemoStep {
  timestamp: string;
  agentName: string;
  stepName: string;
  status: string;
  details: Record<string, unknown>;
}

interface DemoInvoice {
  id: string;
  amount: string;
  currency: 'USDC' | 'EURC';
  description: string;
  recipientAddress: string;
  recipientName: string;
  status: 'pending' | 'paid';
  createdAt: string;
}

const FREELANCER = {
  name: 'Ada Lovelace Freelance LLC',
  address: '0xFREE111111111111111111111111111111111111',
};

const CLIENT = {
  name: 'Babbage Consulting Inc',
  address: '0xC111111111111111111111111111111111111111',
  autoApproveBudget: 500.0,
};

function timestamp(): string {
  return new Date().toISOString();
}

function generateInvoiceId(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const seg = (n: number) => Array.from({ length: n }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  return `${seg(4)}-${seg(4)}-${seg(4)}`;
}

function pseudoTxHash(seed: string): string {
  return ethers.keccak256(ethers.toUtf8Bytes(seed));
}

async function tryWriteAgentLog(action: string, details: string, txHash?: string, status = 'success'): Promise<void> {
  try {
    const { prisma } = await import('@/lib/db');
    if (prisma && prisma.agentLog) {
      await prisma.agentLog.create({
        data: { action, details, txHash: txHash ?? null, status },
      });
    }
  } catch {
    // Prisma not available — skip silently in demo mode
  }
}

export async function POST(request: NextRequest) {
  try {
    const steps: DemoStep[] = [];
    let body: Record<string, unknown> = {};
    try {
      body = await request.json();
    } catch {
      // Empty or invalid body — use defaults
    }

    const amount = typeof body.amount === 'string' ? body.amount : '250.00';
    const currency = (body.currency === 'USDC' || body.currency === 'EURC') ? body.currency : 'USDC';
    const description = typeof body.description === 'string' ? body.description : 'Q3 consulting retainer';
    const recipientName = typeof body.recipientName === 'string' ? body.recipientName : 'Freelancer Agent Ada';

    // ── Step (a): FREELANCER creates invoice ──────────────────────────
    const invoiceId = generateInvoiceId();
    const invoice: DemoInvoice = {
      id: invoiceId,
      amount,
      currency,
      description,
      recipientAddress: FREELANCER.address,
      recipientName: FREELANCER.name,
      status: 'pending',
      createdAt: timestamp(),
    };

    steps.push({
      timestamp: timestamp(),
      agentName: FREELANCER.name,
      stepName: 'create-invoice',
      status: 'success',
      details: {
        invoiceId,
        amount,
        currency,
        description,
        recipientName,
        recipientAddress: FREELANCER.address,
      },
    });

    // ── Step (b): CLIENT fetches invoice & runs auto-approve decision ─
    const amountNum = parseFloat(amount);
    const budget = CLIENT.autoApproveBudget;
    let approved = false;
    let approvalRationale = '';

    if (currency === 'USDC' && amountNum <= budget) {
      approved = true;
      approvalRationale = `APPROVAL RATIONALE: Client agent "${CLIENT.name}" auto-approved invoice ${invoiceId}. Reason: Invoice amount (${amount} ${currency}) ≤ auto-approve budget (${budget.toFixed(2)} USDC) && currency === USDC. Both policy checks passed — no human escalation required.`;
    } else if (currency !== 'USDC') {
      approved = false;
      approvalRationale = `APPROVAL RATIONALE: Client agent "${CLIENT.name}" DENIED invoice ${invoiceId}. Reason: Currency is ${currency} but auto-approve policy requires USDC. Escalation to human operator required.`;
    } else {
      approved = false;
      approvalRationale = `APPROVAL RATIONALE: Client agent "${CLIENT.name}" DENIED invoice ${invoiceId}. Reason: Invoice amount (${amount} ${currency}) exceeds auto-approve budget (${budget.toFixed(2)} USDC). Escalation to human operator required.`;
    }

    steps.push({
      timestamp: timestamp(),
      agentName: CLIENT.name,
      stepName: 'auto-approve-decision',
      status: approved ? 'approved' : 'denied',
      details: {
        invoiceId,
        amountNum,
        budget,
        currency,
        approved,
        approvalRationale,
      },
    });

    if (!approved) {
      return NextResponse.json({
        status: 'denied',
        steps,
        invoice,
        approvalRationale,
        message: 'Client agent denied the invoice per auto-approve policy.',
      }, { status: 200 });
    }

    // ── Step (c): CLIENT "pays" — simulate payout + fee split ─────────
    const rawAmount = parseTokenAmount(amount, 6);
    const feeRaw = (rawAmount * BigInt(PLATFORM_FEE_BPS)) / BigInt(10000);
    const netRaw = rawAmount - feeRaw;
    const feeAmount = formatTokenAmount(feeRaw, 6);
    const netAmount = formatTokenAmount(netRaw, 6);

    const payoutSeed = `payout-${invoiceId}-${FREELANCER.address}-${netAmount}-${timestamp()}`;
    const feeSeed = `fee-${invoiceId}-${CONTRACTS.USDC}-${feeAmount}-${timestamp()}`;
    const payoutTxHash = pseudoTxHash(payoutSeed);
    const feeTxHash = pseudoTxHash(feeSeed);

    const payoutTxLink = getTxLink(payoutTxHash);
    const feeTxLink = getTxLink(feeTxHash);

    steps.push({
      timestamp: timestamp(),
      agentName: CLIENT.name,
      stepName: 'fee-split-calc',
      status: 'success',
      details: {
        grossAmount: amount,
        platformFeeBps: PLATFORM_FEE_BPS,
        feeAmount,
        netAmount,
      },
    });

    steps.push({
      timestamp: timestamp(),
      agentName: CLIENT.name,
      stepName: 'broadcast-payout-tx',
      status: 'success',
      details: {
        from: CLIENT.address,
        to: FREELANCER.address,
        asset: currency,
        amount: netAmount,
        txHash: payoutTxHash,
        txLink: payoutTxLink,
      },
    });

    steps.push({
      timestamp: timestamp(),
      agentName: CLIENT.name,
      stepName: 'broadcast-fee-tx',
      status: 'success',
      details: {
        from: CLIENT.address,
        to: 'PLATFORM_WALLET',
        asset: currency,
        amount: feeAmount,
        txHash: feeTxHash,
        txLink: feeTxLink,
      },
    });

    // ── Step (d): Write Prisma AgentLog entries (guarded) ─────────────
    await tryWriteAgentLog(
      'p2p_freelancer_create_invoice',
      `Freelancer ${FREELANCER.name} created invoice ${invoiceId} for ${amount} ${currency}: ${description}`,
      undefined,
      'success'
    );

    await tryWriteAgentLog(
      'p2p_client_pay_invoice',
      `Client ${CLIENT.name} paid invoice ${invoiceId}: net ${netAmount} to ${FREELANCER.name}, fee ${feeAmount} (${PLATFORM_FEE_BPS} bps). Payout tx: ${payoutTxHash}, Fee tx: ${feeTxHash}. ${approvalRationale}`,
      payoutTxHash,
      'success'
    );

    // ── Finalize invoice status ───────────────────────────────────────
    invoice.status = 'paid';

    return NextResponse.json({
      status: 'success',
      steps,
      invoice,
      payment: {
        payoutTxHash,
        feeTxHash,
        netAmount,
        feeAmount,
      },
      onChainLinks: {
        payoutTxLink,
        feeTxLink,
      },
      approvalRationale,
      agents: {
        freelancer: FREELANCER,
        client: CLIENT,
      },
      platformFeeBps: PLATFORM_FEE_BPS,
    }, { status: 200 });
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { status: 'error', error: errMsg || 'P2P agent demo failed' },
      { status: 500 }
    );
  }
}
