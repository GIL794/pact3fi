# Pactopus v2 — Agentic Invoicing & Bookkeeping Blueprints

This document outlines the architectural specifications, integration APIs, and copy-pasteable TypeScript code templates required to transition **Pactopus** from the v1 Hackathon MVP to a fully autonomous v2 agentic payments network.

These plans leverage the **Circle Agent Stack**, **HTTP 402 Nanopayments**, and **Circle Developer-Controlled Wallets**.

---

## 🛠️ Pillar 1: Pactopus "Pay-Per-Invoice" API (HTTP 402 Nanopayments)

Rather than paying a monthly subscription, automated scripts and external AI agents pay **per invoice created** ($0.05 USDC) using the HTTP 402 protocol.

### Technical Flow
1. External agent calls `POST https://pactopus.com/api/v2/invoices` with payload details.
2. The server responds with `402 Payment Required` and headers detailing price and target address.
3. The calling agent handles the `402` response, calls its Circle Agent Wallet CLI to transfer `$0.05 USDC` on Base, and retries the HTTP request attaching the on-chain transaction hash.
4. Pactopus server verifies the transaction and creates the invoice.

### Server Implementation (Next.js / Node.js)

```typescript
// npm install @circle-fin/x402-batching
import { NextRequest, NextResponse } from 'next/server';
import { createGatewayMiddleware } from '@circle-fin/x402-batching/server';

const gateway = createGatewayMiddleware({
  // Your verified Base Agent Wallet address set up during the hackathon
  sellerAddress: "0x0537f18b5b7f92be50e47fb2904e42d6c17f26d2", 
});

export async function POST(request: NextRequest) {
  try {
    // 1. Run x402 payment validation middleware
    // If unpaid, this helper throws/returns a 402 Payment Required response.
    await gateway.validate(request, { price: "0.05", currency: "USDC", chain: "BASE" });

    // 2. Process invoice creation if payment is confirmed
    const body = await request.json();
    const { amount, currency, description, recipientAddress } = body;

    // (Insert database insertion / invoice generation logic here)
    const invoiceId = "inv_" + Math.random().toString(36).slice(2, 9);
    
    return NextResponse.json({
      status: 'created',
      invoiceId,
      message: "Invoice created via HTTP 402 nanopayment."
    }, { status: 201 });

  } catch (err: any) {
    if (err.status === 402) {
      return NextResponse.json({
        error: "Payment Required",
        price: "0.05 USDC",
        recipient: "0x0537f18b5b7f92be50e47fb2904e42d6c17f26d2",
        chain: "BASE",
      }, { status: 402, headers: err.headers });
    }
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
```

---

## 🤖 Pillar 2: Vercel AI SDK / LangChain Agent Tooling

Equip any general AI agent (e.g., in a freelancer's dashboard or custom CLI) with the ability to create invoices or pay them programmatically using Circle's SDK.

### Vercel AI SDK Tool Definition (TypeScript)

```typescript
// npm install ai @circle-fin/cli
import { tool } from 'ai';
import { execSync } from 'child_process';

export const pactopusBillingTools = {
  createInvoice: tool({
    description: 'Creates a stablecoin invoice request on Pactopus',
    parameters: z.object({
      amount: z.string().describe('The invoice amount (e.g. "250.00")'),
      currency: z.enum(['USDC', 'EURC']).describe('Token currency type'),
      description: z.string().describe('Description of the work done'),
      recipientAddress: z.string().describe('Freelancer wallet address to receive funds'),
      recipientName: z.string().optional().describe('Freelancer name'),
    }),
    execute: async ({ amount, currency, description, recipientAddress, recipientName }) => {
      // Call Pactopus backend to generate payment link
      const res = await fetch('https://pactopus.com/api/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount, currency, description, recipientAddress, recipientName }),
      });
      const data = await res.json();
      return {
        message: `Invoice created successfully!`,
        paymentUrl: `https://pactopus.com/pay/${data.invoice.id}`,
        invoiceDetails: data.invoice,
      };
    },
  }),

  payInvoice: tool({
    description: 'Pays a Pactopus invoice autonomously using the agent wallet',
    parameters: z.object({
      invoiceId: z.string().describe('The ID of the invoice to pay'),
      amount: z.string().describe('Amount to pay'),
      recipientAddress: z.string().describe('Address of the payee'),
    }),
    execute: async ({ invoiceId, amount, recipientAddress }) => {
      try {
        // Trigger Circle CLI payment autonomously
        // Note: CLI uses BASE chain defaults config
        const cmd = `circle services pay "https://pactopus.com/api/pay" --address "0x0537f18b5b7f92be50e47fb2904e42d6c17f26d2" --chain BASE --data '{"invoiceId":"${invoiceId}","amount":"${amount}","recipientAddress":"${recipientAddress}"}' --output json`;
        
        const output = execSync(cmd).toString();
        const response = JSON.parse(output);

        return {
          status: 'success',
          txHash: response.data.txHash,
          message: `Successfully paid invoice ${invoiceId} with ${amount} USDC on Base.`,
        };
      } catch (err: any) {
        return {
          status: 'failed',
          error: err.message,
        };
      }
    },
  }),
};
```

---

## 📈 Pillar 3: Smart Splitting & DeFi Auto-Yield Agent

Create a background CRON script that monitors your Base Agent Wallet and automatically sweeps extra balances into DeFi protocols (like Aave or Compound) to earn yield.

### Yield Sweep Script (TypeScript)

```typescript
import { ethers } from 'ethers';

// Base USDC Contract details
const USDC_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
// Aave V3 Base pool address
const AAVE_POOL_ADDRESS = "0xA238Dd80C259a72e81d7e4664a9801593F98d1c5";

const ERC20_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function approve(address spender, uint256 value) returns (bool)",
];

const AAVE_ABI = [
  "function supply(address asset, uint256 amount, address onBehalfOf, uint16 referralCode)"
];

async function sweepToYield() {
  const provider = new ethers.JsonRpcProvider("https://mainnet.base.org");
  
  // Load private key securely from environment variables
  const walletKey = process.env.CIRCLE_AGENT_PRIVATE_KEY;
  if (!walletKey) throw new Error("Missing agent wallet private key");
  
  const signer = new ethers.Wallet(walletKey, provider);
  const usdc = new ethers.Contract(USDC_ADDRESS, ERC20_ABI, signer);
  const aave = new ethers.Contract(AAVE_POOL_ADDRESS, AAVE_ABI, signer);

  // Check current balance
  const balanceRaw = await usdc.balanceOf(signer.address);
  const balance = parseFloat(ethers.formatUnits(balanceRaw, 6));
  
  console.log(`Current Agent Balance: ${balance} USDC`);
  
  // Sweep target: Keep 100 USDC for transaction fees/liquid liquidity, sweep the rest
  const targetReserve = 100.00;
  if (balance > targetReserve) {
    const sweepAmount = balance - targetReserve;
    const sweepAmountRaw = ethers.parseUnits(sweepAmount.toFixed(6), 6);
    
    console.log(`Sweeping ${sweepAmount} USDC into Aave Pool for yield generation…`);

    // 1. Approve Aave Pool to spend USDC
    const appTx = await usdc.approve(AAVE_POOL_ADDRESS, sweepAmountRaw);
    await appTx.wait();

    // 2. Supply funds to Aave Pool
    const supplyTx = await aave.supply(USDC_ADDRESS, sweepAmountRaw, signer.address, 0);
    const receipt = await supplyTx.wait();

    console.log(`✅ Success! Sweep transaction confirmed: ${receipt.hash}`);
  } else {
    console.log("Balance below target reserve. No sweep performed.");
  }
}
```

---

*Pactopus v2 Blueprint · Circle Agent Stack Integration*
