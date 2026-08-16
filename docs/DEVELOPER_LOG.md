# Pactopus — Developer Handover & Architecture Log

This document provides a technical overview, design decisions, and system specifications for **Pactopus**, created for the Arc Hackathon (Encode Hub, Shoreditch).

---

## 📅 Log & Timestamp
- **Project Name:** Pactopus (Powered by Arc & Algorand, owned by Kyrvyn Ltd)
- **Founder / CEO:** Gabriele Iacopo Langellotto
- **Target Blockchains:** **Arc L1 Testnet** (Chain ID: `5042002`, RPC: `https://testnet.arc.eco/rpc`) & **Algorand Testnet**
- **Supported Stablecoins:** USDC (`0x5FbDB2315678afecb367f032d93F642f64180aa3`) and EURC (`0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0`)

---

## 🛠️ System Specifications & Tech Stack

1. **Framework:** Next.js 16 (App Router, Turbopack, TypeScript)
2. **Database:** Neon PostgreSQL with Prisma ORM (`@prisma/adapter-pg`)
3. **Web3 Integration:** `ethers.js` (v6 syntax) for wallet RPC connections, contract queries, token transfer transactions + Algorand SDK
4. **Styling:** Custom Vanilla CSS implementing space-dark aesthetic with particle physics and responsive design

---

## 🧠 Key Design Decisions

### 1. Unified Cloud & Local Database Layer (`lib/store.ts` & `lib/db.ts`)
- Utilizes Neon PostgreSQL in production and safe fallback for offline scenarios.

### 2. On-Chain Server Verification & Replay Protection
- Payments are verified server-side inside `/api/pay` by calling Arc RPC and Algorand Indexer nodes directly.
- Enforces unique transaction hashes to prevent replay / double-spending.

### 3. Business Model fee of 0.5%
- Structured on-chain splits:
  - Invoice Amount: $A$
  - Fee (0.5%): $A \times 0.005$
  - Recipient Gets: $A \times 0.995$

---

*Pactopus Architectural Documentation · Kyrvyn Ltd*
