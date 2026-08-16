# Pactopus — Sovereign Agentic Invoicing & Bookkeeping Blueprints

This document outlines the architectural specifications, integration APIs, and copy-pasteable TypeScript code templates for **Pactopus** autonomous agentic payments network on Arc L1.

Pactopus leverages the **Circle Agent Stack**, **HTTP 402 Nanopayments**, and **Circle Developer-Controlled Wallets**.

---

## 🛠️ Pillar 1: Pactopus "Pay-Per-Invoice" API (HTTP 402 Nanopayments)

Rather than paying a monthly subscription, automated scripts and external AI agents pay **per invoice created** ($0.05 USDC) using the HTTP 402 protocol.

### Technical Flow
1. External agent calls `POST https://pactopus.com/api/v2/invoices` with payload details.
2. The server responds with `402 Payment Required` and headers detailing price and target address.
3. The calling agent handles the `402` response, signs the `$0.05 USDC` fee on Arc L1, and retries the HTTP request attaching the on-chain transaction hash.
4. Pactopus server verifies the transaction receipt on Arc and creates the invoice.

### Server Implementation (Next.js / Node.js)

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createInvoice } from '@/lib/store';
import { CONTRACTS, PLATFORM_WALLET } from '@/lib/arc';
import { ethers } from 'ethers';

const ARC_RPC_URL = process.env.NEXT_PUBLIC_ARC_RPC_URL || 'https://testnet.arc.eco/rpc';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { amount, currency, description, recipientAddress, recipientName, txHash } = body;

    // Fee: 0.05 USDC
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
        { status: 402, headers: responseHeaders }
      );
    }

    // Verify on-chain payment transfer to the platform wallet
    const isVerified = await verifyArcUSDCPayment(txHash, PLATFORM_WALLET, feeAmountRaw);
    if (!isVerified) {
      return NextResponse.json({ error: 'Invalid Payment' }, { status: 402 });
    }

    const invoice = await createInvoice({
      amount,
      currency,
      description,
      recipientAddress,
      recipientName,
      network: 'arc'
    });

    return NextResponse.json({ status: 'created', invoice }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
```

---

## 🤖 Pillar 2: Vercel AI SDK / LangChain Agent Tooling

Equip any general AI agent (e.g., in a freelancer's dashboard or custom CLI) with the ability to create invoices or pay them programmatically using Circle's SDK.

### Vercel AI SDK Tool Definition (TypeScript)

```typescript
import { z } from 'zod';
import { pactopusAgentTools } from '@/lib/agent-tools';

// Ready for integration with any Vercel AI SDK pipeline:
// - pactopusAgentTools.createInvoiceTool
// - pactopusAgentTools.payInvoiceTool
```

---

## 📈 Pillar 3: Smart Splitting & DeFi Auto-Yield Agent

An automated route that sweeps excess USDC balances above a liquidity threshold (e.g. 100 USDC) into a yield-bearing ERC-4626 vault on Arc to earn decentralized interest.

---

*Pactopus Architectural Blueprint · Circle Agent Stack Integration*
