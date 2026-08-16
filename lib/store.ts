// Unified Persistent Store Layer — PostgreSQL (Neon / Supabase) with Local JSON fallback
import fs from 'fs';
import path from 'path';
import { Currency } from './arc';
import { prisma, isCloudDbEnabled } from './db';

export type InvoiceStatus = 'pending' | 'paid' | 'expired';

export interface Invoice {
  id: string;
  amount: string;          // Human-readable (e.g. "500.00")
  currency: Currency;
  description: string;
  recipientAddress: string; // Wallet address to receive payment (EVM or Algorand)
  recipientName?: string;
  createdAt: string;        // ISO timestamp
  expiresAt?: string;       // Optional expiry
  status: InvoiceStatus;
  txHash?: string;          // Set when paid
  feeTxHash?: string;
  paidAt?: string;
  paidBy?: string;          // Payer wallet address
  fee?: string;             // Platform fee taken (0.5%)
  network: 'arc' | 'algorand'; // Associated network
}

const DB_DIR = path.join(process.cwd(), 'db');
const DB_FILE = path.join(DB_DIR, 'invoices.json');

// Seed demo invoices for dashboard preview
export function getDemoData(): Invoice[] {
  return [
    // --- Arc (EVM) Invoices ---
    {
      id: 'arc-001',
      amount: '1500.00',
      currency: 'USDC',
      description: 'Brand Strategy Consulting — Q3 2025',
      recipientAddress: '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266',
      recipientName: 'Gabriele L.',
      createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
      status: 'paid',
      txHash: '0xabc123def456abc123def456abc123def456abc123def456abc123def456abc1',
      paidAt: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString(),
      paidBy: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
      fee: '7.50',
      network: 'arc',
    },
    {
      id: 'arc-002',
      amount: '850.00',
      currency: 'EURC',
      description: 'Website Design — Homepage Redesign',
      recipientAddress: '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266',
      recipientName: 'Gabriele L.',
      createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
      status: 'paid',
      txHash: '0xdef456abc123def456abc123def456abc123def456abc123def456abc123def4',
      paidAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
      paidBy: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC',
      fee: '4.25',
      network: 'arc',
    },
    {
      id: 'arc-003',
      amount: '2200.00',
      currency: 'USDC',
      description: 'Monthly Retainer — Product Advisory',
      recipientAddress: '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266',
      recipientName: 'Gabriele L.',
      createdAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
      status: 'pending',
      network: 'arc',
    },

    // --- Algorand Invoices ---
    {
      id: 'algo-001',
      amount: '3200.00',
      currency: 'USDC',
      description: 'Solidity to TEAL Port — smart contract audit',
      recipientAddress: 'J32G7FGD4S6A3R2R5H7P7KP7N5L2G5F4F5E6D7C8B9A1Z2Y3X4W5V6U7TS',
      recipientName: 'Gabriele L.',
      createdAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString(),
      status: 'paid',
      txHash: 'T2G7FGD4S6A3R2R5H7P7KP7N5L2G5F4F5E6D7C8B9A1Z2Y3X4W5V6U7T8S1A2B3C',
      paidAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
      paidBy: 'P2R5H7P7KP7N5L2G5F4F5E6D7C8B9A1Z2Y3X4W5V6U7T8S1A2B3C4D5E6F7G8H9',
      fee: '16.00',
      network: 'algorand',
    },
    {
      id: 'algo-002',
      amount: '1250.00',
      currency: 'USDC',
      description: 'dApp Frontend Deployment on Algorand',
      recipientAddress: 'J32G7FGD4S6A3R2R5H7P7KP7N5L2G5F4F5E6D7C8B9A1Z2Y3X4W5V6U7TS',
      recipientName: 'Gabriele L.',
      createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
      status: 'pending',
      network: 'algorand',
    },
  ];
}

// Local fallback database Map
function readLocalDatabase(): Map<string, Invoice> {
  const map = new Map<string, Invoice>();
  try {
    if (!fs.existsSync(DB_DIR)) {
      fs.mkdirSync(DB_DIR, { recursive: true });
    }
    if (!fs.existsSync(DB_FILE)) {
      const demos = getDemoData();
      fs.writeFileSync(DB_FILE, JSON.stringify(demos, null, 2), 'utf-8');
    }
    const data = fs.readFileSync(DB_FILE, 'utf-8');
    const parsed: Invoice[] = JSON.parse(data);
    parsed.forEach(inv => map.set(inv.id, inv));
  } catch (err) {
    console.error('[Store] Failed to read local database:', err);
  }
  return map;
}

function writeLocalDatabase(map: Map<string, Invoice>) {
  try {
    if (!fs.existsSync(DB_DIR)) {
      fs.mkdirSync(DB_DIR, { recursive: true });
    }
    const arr = Array.from(map.values());
    fs.writeFileSync(DB_FILE, JSON.stringify(arr, null, 2), 'utf-8');
  } catch (err) {
    console.error('[Store] Failed to write local database:', err);
  }
}

/**
 * Generate a short unique invoice ID
 */
export function generateInvoiceId(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const seg = (n: number) => Array.from({ length: n }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  return `${seg(4)}-${seg(4)}-${seg(4)}`;
}

/**
 * Format Prisma DB Invoice to application Invoice model
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function formatDbInvoice(row: any): Invoice {
  return {
    id: row.id,
    amount: row.amount,
    currency: row.currency as Currency,
    description: row.description,
    recipientAddress: row.recipientAddress,
    recipientName: row.recipientName || undefined,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
    expiresAt: row.expiresAt ? (row.expiresAt instanceof Date ? row.expiresAt.toISOString() : String(row.expiresAt)) : undefined,
    status: row.status as InvoiceStatus,
    txHash: row.txHash || undefined,
    feeTxHash: row.feeTxHash || undefined,
    paidAt: row.paidAt ? (row.paidAt instanceof Date ? row.paidAt.toISOString() : String(row.paidAt)) : undefined,
    paidBy: row.paidBy || undefined,
    fee: row.fee || undefined,
    network: row.network as 'arc' | 'algorand',
  };
}

/**
 * Create a new Invoice
 */
export async function createInvoice(data: Omit<Invoice, 'id' | 'createdAt' | 'status'>): Promise<Invoice> {
  const id = generateInvoiceId();
  const now = new Date();

  if (isCloudDbEnabled && prisma) {
    try {
      const created = await prisma.invoice.create({
        data: {
          id,
          amount: data.amount,
          currency: data.currency,
          description: data.description,
          recipientAddress: data.recipientAddress,
          recipientName: data.recipientName || null,
          network: data.network || 'arc',
          status: 'pending',
          createdAt: now,
        },
      });
      return formatDbInvoice(created);
    } catch (err) {
      console.warn('[Store] Prisma createInvoice failed, fallback to local storage:', err);
    }
  }

  // Local fallback
  const db = readLocalDatabase();
  const invoice: Invoice = {
    ...data,
    id,
    createdAt: now.toISOString(),
    status: 'pending',
  };
  db.set(id, invoice);
  writeLocalDatabase(db);
  return invoice;
}

/**
 * Get an invoice by ID
 */
export async function getInvoice(id: string): Promise<Invoice | undefined> {
  if (isCloudDbEnabled && prisma) {
    try {
      const row = await prisma.invoice.findUnique({
        where: { id },
      });
      if (row) return formatDbInvoice(row);
    } catch (err) {
      console.warn('[Store] Prisma getInvoice failed, fallback to local:', err);
    }
  }

  const db = readLocalDatabase();
  return db.get(id);
}

/**
 * Check if a txHash has already been used (Double-spend prevention)
 */
export async function isTxHashUsed(txHash: string, excludeInvoiceId?: string): Promise<boolean> {
  if (isCloudDbEnabled && prisma) {
    try {
      const match = await prisma.invoice.findFirst({
        where: {
          txHash,
          ...(excludeInvoiceId ? { id: { not: excludeInvoiceId } } : {}),
        },
      });
      return Boolean(match);
    } catch (err) {
      console.warn('[Store] Prisma isTxHashUsed check failed:', err);
    }
  }

  const db = readLocalDatabase();
  for (const inv of db.values()) {
    if (inv.txHash && inv.txHash.toLowerCase() === txHash.toLowerCase() && inv.id !== excludeInvoiceId) {
      return true;
    }
  }
  return false;
}

/**
 * Retrieve all invoices
 */
export async function getAllInvoices(network?: 'arc' | 'algorand'): Promise<Invoice[]> {
  if (isCloudDbEnabled && prisma) {
    try {
      const rows = await prisma.invoice.findMany({
        where: network ? { network } : undefined,
        orderBy: { createdAt: 'desc' },
      });
      return rows.map(formatDbInvoice);
    } catch (err) {
      console.warn('[Store] Prisma getAllInvoices failed, fallback to local:', err);
    }
  }

  const db = readLocalDatabase();
  const arr = Array.from(db.values());
  const filtered = network ? arr.filter(i => i.network === network) : arr;
  return filtered.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

/**
 * Mark invoice as paid
 */
export async function markInvoicePaid(
  id: string,
  txHash: string,
  paidBy: string,
  fee: string,
  feeTxHash?: string
): Promise<Invoice | null> {
  const now = new Date();

  if (isCloudDbEnabled && prisma) {
    try {
      const updated = await prisma.invoice.update({
        where: { id },
        data: {
          status: 'paid',
          txHash,
          feeTxHash: feeTxHash || null,
          paidBy,
          fee,
          paidAt: now,
        },
      });
      return formatDbInvoice(updated);
    } catch (err) {
      console.warn('[Store] Prisma markInvoicePaid failed, fallback to local:', err);
    }
  }

  const db = readLocalDatabase();
  const inv = db.get(id);
  if (!inv) return null;
  const updated: Invoice = {
    ...inv,
    status: 'paid',
    txHash,
    feeTxHash,
    paidAt: now.toISOString(),
    paidBy,
    fee,
  };
  db.set(id, updated);
  writeLocalDatabase(db);
  return updated;
}

/**
 * Calculate dashboard stats
 */
export async function getDashboardStats(network: 'arc' | 'algorand' = 'arc') {
  const all = await getAllInvoices(network);
  const paid = all.filter(i => i.status === 'paid');
  const pending = all.filter(i => i.status === 'pending');

  const totalEarned = paid.reduce((sum, i) => {
    return sum + (i.currency === 'USDC' ? parseFloat(i.amount) : 0);
  }, 0);

  const totalEarnedEURC = paid.reduce((sum, i) => {
    return sum + (i.currency === 'EURC' ? parseFloat(i.amount) : 0);
  }, 0);

  const thisMonth = new Date();
  thisMonth.setDate(1);
  thisMonth.setHours(0, 0, 0, 0);

  const paidThisMonth = paid.filter(i => i.paidAt && new Date(i.paidAt) >= thisMonth);
  const earningsThisMonth = paidThisMonth.reduce((sum, i) => sum + parseFloat(i.amount), 0);

  return {
    totalInvoices: all.length,
    paidInvoices: paid.length,
    pendingInvoices: pending.length,
    totalEarnedUSDC: totalEarned.toFixed(2),
    totalEarnedEURC: totalEarnedEURC.toFixed(2),
    earningsThisMonth: earningsThisMonth.toFixed(2),
    recentInvoices: all.slice(0, 10),
  };
}
