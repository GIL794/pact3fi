# Pactopus Agent Guidelines

## Tech Stack
- Next.js 16 (App Router)
- Neon PostgreSQL with Prisma ORM
- Ethers.js v6 & Algorand SDK
- TanStack Query v5

## Core Architectural Invariants
1. All database queries pass through `lib/store.ts` with Prisma/Neon.
2. Invoices support both Arc (0x hex addresses) and Algorand (58-char base32).
3. Payments are split 99.5% payee / 0.5% platform fee and verified on-chain.
