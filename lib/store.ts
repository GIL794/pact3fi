// File-backed invoice database persistence layer (demo-ready)
import fs from 'fs';
import path from 'path';
import { Currency } from './arc';

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
  paidAt?: string;
  paidBy?: string;          // Payer wallet address
  fee?: string;             // Platform fee taken (0.5%)
  network: 'arc' | 'algorand'; // Associated network
}

const DB_DIR = path.join(process.cwd(), 'db');
const DB_FILE = path.join(DB_DIR, 'invoices.json');

// Seed some demo invoices for dashboard preview
function getDemoData(): Invoice[] {
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

// Load database Map from file
function readDatabase(): Map<string, Invoice> {
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
    console.error('Failed to load database file:', err);
  }
  return map;
}

// Save database Map to file
function writeDatabase(map: Map<string, Invoice>) {
  try {
    if (!fs.existsSync(DB_DIR)) {
      fs.mkdirSync(DB_DIR, { recursive: true });
    }
    const arr = Array.from(map.values());
    fs.writeFileSync(DB_FILE, JSON.stringify(arr, null, 2), 'utf-8');
  } catch (err) {
    console.error('Failed to write database file:', err);
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

export function createInvoice(data: Omit<Invoice, 'id' | 'createdAt' | 'status'>): Invoice {
  const db = readDatabase();
  const id = generateInvoiceId();
  const invoice: Invoice = {
    ...data,
    id,
    createdAt: new Date().toISOString(),
    status: 'pending',
  };
  db.set(id, invoice);
  writeDatabase(db);
  return invoice;
}

export function getInvoice(id: string): Invoice | undefined {
  const db = readDatabase();
  return db.get(id);
}

export function getAllInvoices(): Invoice[] {
  const db = readDatabase();
  return Array.from(db.values()).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

export function markInvoicePaid(
  id: string,
  txHash: string,
  paidBy: string,
  fee: string
): Invoice | null {
  const db = readDatabase();
  const inv = db.get(id);
  if (!inv) return null;
  const updated: Invoice = {
    ...inv,
    status: 'paid',
    txHash,
    paidAt: new Date().toISOString(),
    paidBy,
    fee,
  };
  db.set(id, updated);
  writeDatabase(db);
  return updated;
}

export function getDashboardStats(network: 'arc' | 'algorand' = 'arc') {
  const all = getAllInvoices().filter(i => i.network === network);
  const paid = all.filter(i => i.status === 'paid');
  const pending = all.filter(i => i.status === 'pending');

  const totalEarned = paid.reduce((sum, i) => {
    return sum + (i.currency === 'USDC' ? parseFloat(i.amount) : 0);
  }, 0);

  const totalEarnedEURC = paid.reduce((sum, i) => {
    return sum + (i.currency === 'EURC' ? parseFloat(i.amount) : 0);
  }, 0);

  // Payments this month
  const thisMonth = new Date();
  thisMonth.setDate(1);
  const paidThisMonth = paid.filter(i => new Date(i.paidAt!) >= thisMonth);
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
