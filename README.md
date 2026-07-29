# Pact3Fi — Get Paid in Stablecoins, Instantly

> **Built by Gabriele Iacopo Langellotto — CEO/Founder, Kyrvyn Ltd**  
> **Submitted for the Arc Hackathon (Encode Club) — July 2026**

---

> ⚡ **"Invoicing and Paying will never be the same! Pact3Fi is a versatile platform, built to adapt to different blockchains and redirect to tailored content based on Web3 Wallet detection, no more scattered operations! This platform enables freelancers and automated AI agents to create stablecoin invoices ("Pacts") and receive USDC/EURC payments on Arc L1 and Algorand with sub-second finality, on-chain platform fee routing, server-side verification, and HTTP 402 API nanopayments. On access you don't subscribe, have a payment gate to use the service, or unforeseen costs; it bridges traditional invoices and decentralized micro-pacts, providing a friction-free payment gate with server-side on-chain validation and fee splits."**

---

## What is Pact3Fi?

**Pact3Fi** is a professional payments and agentic billing network designed for freelancers and AI agents. It enables professionals to create stablecoin invoices ("Pacts") and receive **USDC or EURC stablecoin payments** with sub-second finality on the **Arc blockchain** or instantly on **Algorand**.

Pact3Fi bridges traditional invoices and decentralized micro-pacts, providing a friction-free payment gate with server-side on-chain validation and fee splits.

---

## The Problem & The Solution

Freelancers and automated AI agents lose thousands of dollars annually to payment delays, FX conversions, and processing fees.

| Feature | Traditional (Stripe/Wire) | Pact3Fi |
|---------|-------------------------|---------|
| **Settlement Time** | 3–5 business days | **Sub-second (Arc) / 1.5s (Algorand)** |
| **Platform Fee** | 2.9% + £0.30 | **0.5%** |
| **International Transfer** | £25–100 per wire | **~$0.01 (Gas-less options)** |
| **Currency Risk** | Volatile FX Conversions | **USDC / EURC Stablecoins** |
| **API Nanopayments** | Not supported | **HTTP 402 Pay-Per-Invoice** |

---

## Key Features

1. **Dynamic Workspace Routing:** The platform automatically detects browser extensions (MetaMask vs. Pera/MyAlgo). If multiple wallets are present, an elegant workspace overlay prompts users to choose between **Arc L1 Network** or **Algorand Vault**.
2. **On-Chain Payout & Fee Splits:** To guarantee platform sustainability, payments are split on-chain. Payees receive $99.5\%$, and $0.5\%$ is autonomously routed to the platform treasury wallet.
3. **On-Chain Server Verification:** The API verification endpoint queries RPC endpoints to verify transaction receipts (checking logs, transfer event values, and receiver addresses) before marking invoices as paid.
4. **Persistent JSON Database:** Designed for demo-readiness, invoices and payment metrics are saved to local persistent storage (`db/invoices.json`), retaining state across restarts.

---

## 🛠️ Pact3Fi v2 Agentic Blueprints (Arc L1)

Pact3Fi includes a complete implementation of our autonomous v2 agentic payment blueprints:

### Pillar 1: HTTP 402 Nanopayments (`/api/v2/invoices`)
Automated agents can create invoices programmatically by paying a nanopayment fee ($0.05 USDC) per creation.
- If called without payment, the API returns `402 Payment Required` along with payment headers specifying the target address, amount, asset contract, and Chain ID.
- Once the calling agent pays the fee, it retries the request attaching the transaction hash. Ethers verifies the receipt on the Arc RPC before creating the invoice.

### Pillar 2: AI Agent Billing Tooling (`lib/agent-tools.ts`)
Vercel AI SDK compatible tool definitions allowing AI agents to:
- `createInvoiceTool`: Automatically create invoices, capture `402` responses, sign the required on-chain fee, and finalize creation.
- `payInvoiceTool`: Automatically execute payee payouts and fee splits sequentially on Arc.

### Pillar 3: DeFi Yield Sweep (`/api/v2/sweep`)
An automated route that sweeps excess USDC balances above a threshold (e.g. 100 USDC) from the agent's account into a simulated ERC-4626 Yield Vault (`0x2272dE9f3c7fa6e0000000000000000000000000`) on Arc to earn decentralized interest.

---

## Tech Stack

- **Framework:** Next.js 16 (App Router) + Vanilla CSS
- **State Management:** TanStack Query (React Query)
- **Blockchain Libraries:** Ethers.js v6, Algorand SDK
- **Wallet Connectors:** MetaMask, Coinbase Wallet, Pera Wallet, MyAlgo Wallet
- **Verification Engine:** Node.js RPC verifiers + Algonode Indexer API

---

## Project Structure

```
pact3fi/
├── app/
│   ├── page.tsx                ← Landing page with workspace overlay
│   ├── onboarding/page.tsx     ← 4-question Q&A onboarding
│   ├── create/page.tsx         ← Invoice creation & live preview (TanStack useMutation)
│   ├── pay/[id]/page.tsx       ← Multi-chain payment receipt page (USDC/EURC)
│   ├── dashboard/page.tsx      ← Real-time dashboard with 10s auto-polling
│   └── api/
│       ├── invoices/route.ts   ← Invoices lookup & stats compilation
│       ├── pay/route.ts        ← Server-side transaction verifier (Arc + Algorand)
│       ├── v2/
│       │   ├── invoices/route.ts ← HTTP 402 nanopayment invoice generator
│       │   └── sweep/route.ts    ← ERC-4626 DeFi Yield Sweeper
├── components/
│   ├── Navbar.tsx              ← Dynamic network badges (Arc vs. Algorand)
│   ├── WalletModal.tsx         ← Connection interface (EVM vs. Algorand)
├── db/
│   └── invoices.json           ← Persistent JSON invoice database
├── lib/
│   ├── arc.ts                  ← Arc Testnet configurations & Ethers helpers
│   ├── algo.ts                 ← Algorand Testnet constants & validation rules
│   ├── store.ts                ← Persistent local store file operations
│   ├── wallet.tsx              ← Unified Multi-Chain Wallet Provider context
│   ├── agent-tools.ts          ← AI SDK tool definitions (Pillar 2)
│   └── QueryClientProviderSetup.tsx ← Global TanStack Query setup
```

---

## Environment Variables

Copy `.env.example` to `.env.local` and set the following parameters:

```bash
# Arc L1 Chain configuration
NEXT_PUBLIC_ARC_RPC_URL=https://testnet.arc.eco/rpc
NEXT_PUBLIC_USDC_ADDRESS=0x5FbDB2315678afecb367f032d93F642f64180aa3
NEXT_PUBLIC_EURC_ADDRESS=0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0
NEXT_PUBLIC_PLATFORM_WALLET=0x0000000000000000000000000000000000000001

# Agent wallet private key (For yield sweeps & tool signing)
ARC_AGENT_PRIVATE_KEY=your_private_key_here
```

---

## Quick Start

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Compile production bundle
npm run build
npm start
```

---

## 📊 Hackathon Slide Presentation

Pact3Fi includes a standalone, premium-designed interactive slide deck built using Reveal.js:
- **Interactive Presentation:** Open [presentation.html](file:///c:/Users/Gabriele/Documents/GitHub/08_Blockchain_ARC/salario/presentation.html) in any web browser to view the slides.
- It covers: The payments crisis, the Arc L1 solution, multi-chain routing layouts, and details on all three v2 agentic billing pillars.

---

*Pact3Fi — Built by Kyrvyn Ltd · Submitted to the Arc Hackathon (Encode)*
