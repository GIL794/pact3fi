# PactyFi — Developer Handover & Architecture Log

This document provides a technical overview, design decisions, and system specifications for the **PactyFi** MVP project, created for the Arc Hackathon (Encode Hub, Shoreditch) on **July 7, 2026**. It serves as a timestamp and guide for future developers onboarding to this codebase.

---

## 📅 Log & Timestamp
- **Project Name:** PactyFi (Powered by Arc, owned by Kyrvyn Ltd)
- **Founder / CEO:** Gabriele Iacopo Langellotto
- **Created Date:** July 7, 2026, 10:49 AM BST
- **Release Version:** 0.1.0 (Hackathon MVP)

---

## 🛠️ System Specifications & Tech Stack

1. **Framework:** Next.js 16.2.10 (App Router, Turbopack, TypeScript)
2. **Web3 Integration:** `ethers.js` (v6 syntax) for wallet RPC connections, contract queries, and token transfer transactions
3. **Styling:** Custom Vanilla CSS (`app/globals.css`) implementing a premium space-dark theme with micro-animations, custom particle physics (rendered on Canvas), and a responsive layout
4. **Target Blockchain:** **Arc L1 Testnet** (Chain ID: `5042002`, RPC: `https://testnet.arc.eco/rpc`)
5. **Supported Stablecoins:** USDC (`0x5FbDB2315678afecb367f032d93F642f64180aa3`) and EURC (`0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0`)

---

## 📁 File Structure & Architecture

```
pactyfi/
├── app/
│   ├── globals.css           # Token-driven design system and layout styling
│   ├── layout.tsx            # Root layout with premium fonts (Inter + Space Grotesk) and SEO tags
│   ├── page.tsx              # Landing page (hero canvas, live ticker, pricing, comparisons)
│   ├── onboarding/
│   │   └── page.tsx          # Beginner-friendly 4-question onboarding wizard
│   ├── create/
│   │   └── page.tsx          # Invoice creation flow with live side-by-side preview
│   ├── pay/
│   │   └── [id]/
│   │       └── page.tsx      # Payment page with wallet connect, switch-network, and tx submission
│   │                         # triggers real ERC-20 transfers with 0.5% fee calculation
│   └── api/
│       ├── invoices/
│       │   └── route.ts      # REST API: Create invoice (POST), Fetch dashboard stats (GET)
│       ├── invoices/[id]/
│       │   └── route.ts      # REST API: Retrieve individual invoice (GET)
│       └── pay/
│           └── route.ts      # REST API: Confirm payment on-chain with idempotency checks
├── components/
│   ├── Navbar.tsx            # Global navigation with wallet context binding
│   ├── WalletButton.tsx      # Connect/disconnect controls with state transitions
│   └── WalletModal.tsx       # Selection modal supporting MetaMask, Coinbase Wallet, WalletConnect
├── lib/
│   ├── arc.ts                # Network definitions, token ABIs, parse/format helpers, switch network
│   ├── store.ts              # Global in-memory data store with demo data seeding
│   └── wallet.tsx            # React Context Provider managing wallet state, balances, network switches
├── .env.example              # Template for environment configuration
└── .env.local                # Local environment configuration file with default testnet settings
```

---

## 🧠 Key Design Decisions & Trade-offs

### 1. In-Memory Store (`lib/store.ts`)
- **Decision:** Used a server-side `Map` to store invoices instead of a database (like PostgreSQL or MongoDB) for the hackathon MVP.
- **Trade-off:** High-speed development, zero setup time for presentation, and instant CRUD operations. However, restarting the Next.js process wipes the database (outside of seeded demo transactions).
- **Refactoring Note:** The CRUD functions are modularized in `lib/store.ts`. Replacing the `Map` with a Prisma client or Supabase SDK only requires modifying these internal function bodies.

### 2. Client-Side On-Chain Transfers with Server Verification
- **Decision:** Payments are executed client-side via the user's browser wallet (MetaMask) and verified against the backend via `/api/pay`.
- **Reasoning:** Minimizes server trust, eliminates key management security risks for the platform (non-custodial), and follows standard Web3 paradigms.
- **Verification Loop:** Once the transaction hash is received from MetaMask, it is passed to the backend, which processes fees and logs the confirmation in the invoice database.

### 3. Business Model fee of 0.5%
- **Decision:** Implemented a fixed 0.5% fee on payments (visible in invoice previews and dashboards).
- **Calculation:** Handled inside `/api/pay` and calculated in `BigInt` formats in frontend JS to avoid floating-point errors.
- **Structure:**
  - Invoice Amount: $A$
  - Fee (0.5%): $A \times 0.005$
  - Recipient Gets: $A \times 0.995$

### 4. Adaptive Onboarding Wizard (`app/onboarding/page.tsx`)
- **Decision:** A custom-built multi-step wizard explaining Web3 concepts (wallets, gas, stablecoin stability) using interactive questions.
- **Goal:** Focuses on user-friendliness for traditional freelancers who are completely new to stablecoins.

---

## 🚀 Recommended Future Development Phases

1. **Database Integration:** Connect `lib/store.ts` to a persistent database (e.g., PostgreSQL via Prisma).
2. **On-Chain Event Listener:** Write a background worker (e.g., in NextJS or Go) that listens to Arc blockchain transfer events to update payment status automatically (eliminating reliance on the frontend to report the tx hash).
3. **Smart Contract Payments:** Build a dedicated payment router smart contract to split the fee (0.5%) and recipient transfer (99.5%) in a single atomic transaction rather than doing direct token transfers.
4. **USDC-as-Gas optimization:** Implement Arc's native gasless/USDC-gas abstraction to allow clients to sign transactions without holding native L1 gas tokens.

---

*Documented by the Antigravity Coding Assistant · July 2026*
