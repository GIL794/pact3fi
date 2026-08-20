import fs from 'fs';
import path from 'path';
import { Currency } from './arc';
import { prisma, isCloudDbEnabled } from './db';
import { safeLogger } from './log-redact';

export type InvoiceStatus = 'pending' | 'paid' | 'expired';

export interface Invoice {
  id: string;
  ownerAddress: string;
  amount: string;
  currency: Currency;
  description: string;
  recipientAddress: string;
  recipientName?: string;
  createdAt: string;
  expiresAt?: string;
  status: InvoiceStatus;
  txHash?: string;
  feeTxHash?: string;
  paidAt?: string;
  paidBy?: string;
  fee?: string;
  network: 'arc' | 'algorand';
  isSystem?: boolean;
}

export interface MonthlyUsageInfo {
  ownerAddress: string;
  network: 'arc' | 'algorand';
  billingMonth: string; // YYYY-MM
  invoicesUsed: number;
  invoicesAllowed: number;
  tier: 'free' | 'pro' | 'business';
  billingCycleStart: string; // ISO date string
  billingCycleEnd: string;   // ISO date string
}

export const SUBSCRIPTION_LIMITS: Record<'free' | 'pro' | 'business', number> = {
  free: 5,
  pro: 10_000,
  business: 1_000_000,
};

const DB_DIR = path.join(process.cwd(), 'db');
const DB_FILE = path.join(DB_DIR, 'invoices.json');
const USAGE_FILE = path.join(DB_DIR, 'usage.json');

export function getDemoData(): Invoice[] {
  const now = Date.now();
  const owner = 'SYSTEM_SAMPLE_PREVIEW';
  return [
    {
      id: 'arc-001',
      ownerAddress: owner,
      amount: '1500.00',
      currency: 'USDC',
      description: 'Brand Strategy Consulting — Q3 2025',
      recipientAddress: '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266',
      recipientName: 'Gabriele L.',
      createdAt: new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString(),
      status: 'paid',
      txHash: '0xabc123def456abc123def456abc123def456abc123def456abc123def456abc1',
      paidAt: new Date(now - 6 * 24 * 60 * 60 * 1000).toISOString(),
      paidBy: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
      fee: '7.50',
      network: 'arc',
      isSystem: true,
    },
    {
      id: 'arc-002',
      ownerAddress: owner,
      amount: '850.00',
      currency: 'EURC',
      description: 'Website Design — Homepage Redesign',
      recipientAddress: '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266',
      recipientName: 'Gabriele L.',
      createdAt: new Date(now - 3 * 24 * 60 * 60 * 1000).toISOString(),
      status: 'paid',
      txHash: '0xdef456abc123def456abc123def456abc123def456abc123def456abc123def4',
      paidAt: new Date(now - 2 * 24 * 60 * 60 * 1000).toISOString(),
      paidBy: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC',
      fee: '4.25',
      network: 'arc',
      isSystem: true,
    },
    {
      id: 'arc-003',
      ownerAddress: owner,
      amount: '2200.00',
      currency: 'USDC',
      description: 'Monthly Retainer — Product Advisory',
      recipientAddress: '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266',
      recipientName: 'Gabriele L.',
      createdAt: new Date(now - 1 * 24 * 60 * 60 * 1000).toISOString(),
      status: 'pending',
      network: 'arc',
      isSystem: true,
    },
    {
      id: 'algo-001',
      ownerAddress: owner,
      amount: '3200.00',
      currency: 'USDC',
      description: 'Solidity to TEAL Port — smart contract audit',
      recipientAddress: 'J32G7FGD4S6A3R2R5H7P7KP7N5L2G5F4F5E6D7C8B9A1Z2Y3X4W5V6U7TS',
      recipientName: 'Gabriele L.',
      createdAt: new Date(now - 8 * 24 * 60 * 60 * 1000).toISOString(),
      status: 'paid',
      txHash: 'T2G7FGD4S6A3R2R5H7P7KP7N5L2G5F4F5E6D7C8B9A1Z2Y3X4W5V6U7T8S1A2B3C',
      paidAt: new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString(),
      paidBy: 'P2R5H7P7KP7N5L2G5F4F5E6D7C8B9A1Z2Y3X4W5V6U7T8S1A2B3C4D5E6F7G8H9',
      fee: '16.00',
      network: 'algorand',
      isSystem: true,
    },
    {
      id: 'algo-002',
      ownerAddress: owner,
      amount: '1250.00',
      currency: 'USDC',
      description: 'dApp Frontend Deployment on Algorand',
      recipientAddress: 'J32G7FGD4S6A3R2R5H7P7KP7N5L2G5F4F5E6D7C8B9A1Z2Y3X4W5V6U7TS',
      recipientName: 'Gabriele L.',
      createdAt: new Date(now - 2 * 24 * 60 * 60 * 1000).toISOString(),
      status: 'pending',
      network: 'algorand',
      isSystem: true,
    },
  ];
}

export function billingMonthKeyFor(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

export function billingCycleBoundsFor(billingMonth: string): { start: Date; end: Date } {
  const [yStr, mStr] = billingMonth.split('-');
  const year = parseInt(yStr, 10);
  const monthZeroIdx = parseInt(mStr, 10) - 1;
  const start = new Date(year, monthZeroIdx, 1, 0, 0, 0, 0);
  const end = new Date(year, monthZeroIdx + 1, 1, 0, 0, 0, 0);
  return { start, end };
}

function ensureDbDir() {
  try {
    if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });
  } catch (err) {
    safeLogger.warn('[Store] ensureDbDir failed', err);
  }
}

function readLocalDatabase(): Map<string, Invoice> {
  const map = new Map<string, Invoice>();
  try {
    ensureDbDir();
    if (!fs.existsSync(DB_FILE)) {
      const demos = getDemoData();
      fs.writeFileSync(DB_FILE, JSON.stringify(demos, null, 2), 'utf-8');
    }
    const data = fs.readFileSync(DB_FILE, 'utf-8');
    const parsed: Invoice[] = JSON.parse(data);
    parsed.forEach(inv => map.set(inv.id, inv));
  } catch (err) {
    safeLogger.warn('[Store] Failed to read local database:', err);
  }
  return map;
}

function writeLocalDatabase(map: Map<string, Invoice>) {
  try {
    ensureDbDir();
    const arr = Array.from(map.values());
    fs.writeFileSync(DB_FILE, JSON.stringify(arr, null, 2), 'utf-8');
  } catch (err) {
    safeLogger.warn('[Store] Failed to write local database:', err);
  }
}

interface LocalUsageStoreShape {
  [compositeKey: string]: {
    ownerAddress: string;
    network: 'arc' | 'algorand';
    billingMonth: string;
    invoicesUsed: number;
    updatedAt: string;
  };
}

function usageKey(ownerAddress: string, network: 'arc' | 'algorand', billingMonth: string): string {
  return `${ownerAddress}|${network}|${billingMonth}`;
}

function readLocalUsage(): LocalUsageStoreShape {
  try {
    ensureDbDir();
    if (!fs.existsSync(USAGE_FILE)) {
      const fresh: LocalUsageStoreShape = {};
      fs.writeFileSync(USAGE_FILE, JSON.stringify(fresh, null, 2), 'utf-8');
      return fresh;
    }
    const data = fs.readFileSync(USAGE_FILE, 'utf-8');
    return JSON.parse(data) as LocalUsageStoreShape;
  } catch (err) {
    safeLogger.warn('[Store] Failed to read local usage store:', err);
    return {};
  }
}

function writeLocalUsage(store: LocalUsageStoreShape) {
  try {
    ensureDbDir();
    fs.writeFileSync(USAGE_FILE, JSON.stringify(store, null, 2), 'utf-8');
  } catch (err) {
    safeLogger.warn('[Store] Failed to write local usage store:', err);
  }
}

export function generateInvoiceId(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const seg = (n: number) => Array.from({ length: n }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  return `${seg(4)}-${seg(4)}-${seg(4)}`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function formatDbInvoice(row: any): Invoice {
  return {
    id: row.id,
    ownerAddress: row.ownerAddress || '',
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
    isSystem: Boolean(row.isSystem),
  };
}

export async function getSubscriptionTier(ownerAddress: string): Promise<'free' | 'pro' | 'business'> {
  const normalizedOwner = (ownerAddress || '').trim();
  if (!normalizedOwner) return 'free';
  if (isCloudDbEnabled && prisma) {
    try {
      const row = await prisma.subscription.findUnique({ where: { address: normalizedOwner } });
      const tier = row?.tier;
      if (tier === 'pro' || tier === 'business' || tier === 'free') return tier;
    } catch (err) {
      safeLogger.warn('[Store] Prisma getSubscriptionTier failed, fallback to free:', err);
    }
  }
  return 'free';
}

export async function getMonthlyUsage(
  ownerAddress: string,
  network: 'arc' | 'algorand',
  billingMonth?: string
): Promise<MonthlyUsageInfo> {
  const normalizedOwner = (ownerAddress || '').trim();
  const monthKey = billingMonth || billingMonthKeyFor(new Date());
  const { start, end } = billingCycleBoundsFor(monthKey);
  const tier = await getSubscriptionTier(normalizedOwner);
  const invoicesAllowed = SUBSCRIPTION_LIMITS[tier];

  let invoicesUsed = 0;
  if (normalizedOwner) {
    if (isCloudDbEnabled && prisma) {
      try {
        const record = await prisma.invoiceUsage.findUnique({
          where: {
            ownerAddress_network_billingMonth: {
              ownerAddress: normalizedOwner,
              network,
              billingMonth: monthKey,
            },
          },
        });
        if (record) {
          invoicesUsed = Math.max(0, Number(record.invoicesUsed) || 0);
        } else {
          const invoicesInCycle = await prisma.invoice.count({
            where: {
              ownerAddress: normalizedOwner,
              network,
              isSystem: false,
              createdAt: { gte: start, lt: end },
            },
          });
          invoicesUsed = invoicesInCycle || 0;
          try {
            await prisma.invoiceUsage.upsert({
              where: {
                ownerAddress_network_billingMonth: {
                  ownerAddress: normalizedOwner,
                  network,
                  billingMonth: monthKey,
                },
              },
              update: { invoicesUsed },
              create: {
                ownerAddress: normalizedOwner,
                network,
                billingMonth: monthKey,
                invoicesUsed,
              },
            });
          } catch (_upsertErr) {
            // best-effort initial counter sync — ignore race
          }
        }
      } catch (err) {
        safeLogger.warn('[Store] Prisma getMonthlyUsage failed, fallback to local store:', err);
      }
    } else {
      const localUsage = readLocalUsage();
      const key = usageKey(normalizedOwner, network, monthKey);
      const record = localUsage[key];
      if (record) {
        invoicesUsed = Math.max(0, Number(record.invoicesUsed) || 0);
      } else {
        const db = readLocalDatabase();
        for (const inv of db.values()) {
          if (inv.isSystem) continue;
          if ((inv.ownerAddress || '') !== normalizedOwner) continue;
          if (inv.network !== network) continue;
          const created = new Date(inv.createdAt).getTime();
          if (created >= start.getTime() && created < end.getTime()) invoicesUsed++;
        }
        localUsage[key] = {
          ownerAddress: normalizedOwner,
          network,
          billingMonth: monthKey,
          invoicesUsed,
          updatedAt: new Date().toISOString(),
        };
        writeLocalUsage(localUsage);
      }
    }
  }

  safeLogger.info(
    `[invoice_usage:get] owner=${normalizedOwner || '(none)'} network=${network} month=${monthKey} used=${invoicesUsed}/${invoicesAllowed} tier=${tier}`
  );

  return {
    ownerAddress: normalizedOwner,
    network,
    billingMonth: monthKey,
    invoicesUsed,
    invoicesAllowed,
    tier,
    billingCycleStart: start.toISOString(),
    billingCycleEnd: end.toISOString(),
  };
}

async function incrementMonthlyUsage(
  ownerAddress: string,
  network: 'arc' | 'algorand',
  billingMonth: string,
  invoiceId: string
): Promise<number> {
  const normalizedOwner = (ownerAddress || '').trim();
  if (!normalizedOwner) return 0;

  if (isCloudDbEnabled && prisma) {
    try {
      const existing = await prisma.invoiceUsage.findUnique({
        where: {
          ownerAddress_network_billingMonth: {
            ownerAddress: normalizedOwner,
            network,
            billingMonth,
          },
        },
      });
      let nextUsed;
      if (!existing) {
        nextUsed = 1;
        await prisma.invoiceUsage.create({
          data: {
            ownerAddress: normalizedOwner,
            network,
            billingMonth,
            invoicesUsed: nextUsed,
          },
        });
      } else {
        nextUsed = Math.max(0, Number(existing.invoicesUsed) || 0) + 1;
        await prisma.invoiceUsage.update({
          where: {
            ownerAddress_network_billingMonth: {
              ownerAddress: normalizedOwner,
              network,
              billingMonth,
            },
          },
          data: { invoicesUsed: nextUsed },
        });
      }
      try {
        await prisma.agentLog.create({
          data: {
            action: 'invoice_usage:increment',
            details: JSON.stringify({
              ownerAddress: normalizedOwner,
              network,
              billingMonth,
              invoiceId,
              invoicesUsedAfter: nextUsed,
            }),
            status: 'success',
          },
        });
      } catch (_logErr) {
        /* audit best-effort */
      }
      safeLogger.info(
        `[invoice_usage:increment] owner=${normalizedOwner} network=${network} month=${billingMonth} invoice=${invoiceId} used_after=${nextUsed}`
      );
      return nextUsed;
    } catch (err) {
      safeLogger.warn('[Store] Prisma incrementMonthlyUsage failed, fallback to local:', err);
    }
  }

  const local = readLocalUsage();
  const key = usageKey(normalizedOwner, network, billingMonth);
  const current = local[key] ? Math.max(0, Number(local[key].invoicesUsed) || 0) : 0;
  const nextUsed = current + 1;
  local[key] = {
    ownerAddress: normalizedOwner,
    network,
    billingMonth,
    invoicesUsed: nextUsed,
    updatedAt: new Date().toISOString(),
  };
  writeLocalUsage(local);
  safeLogger.info(
    `[invoice_usage:increment:local] owner=${normalizedOwner} network=${network} month=${billingMonth} invoice=${invoiceId} used_after=${nextUsed}`
  );
  return nextUsed;
}

export async function createInvoice(
  data: Omit<Invoice, 'id' | 'createdAt' | 'status' | 'ownerAddress' | 'isSystem'> & { ownerAddress?: string }
): Promise<Invoice> {
  const id = generateInvoiceId();
  const now = new Date();
  const monthKey = billingMonthKeyFor(now);
  const network = (data.network || 'arc') as 'arc' | 'algorand';
  const normalizedOwner = (data.ownerAddress || '').trim();
  let tier: 'free' | 'pro' | 'business' = 'free';

  if (normalizedOwner) {
    tier = await getSubscriptionTier(normalizedOwner);
    const usage = await getMonthlyUsage(normalizedOwner, network, monthKey);
    if (tier !== 'business' && usage.invoicesUsed >= usage.invoicesAllowed) {
      safeLogger.warn(
        `[invoice_usage:limit_reached] owner=${normalizedOwner} network=${network} month=${monthKey} used=${usage.invoicesUsed}/${usage.invoicesAllowed} tier=${tier}`
      );
      if (isCloudDbEnabled && prisma) {
        try {
          await prisma.agentLog.create({
            data: {
              action: 'invoice_usage:limit_reached',
              details: JSON.stringify({
                ownerAddress: normalizedOwner,
                network,
                billingMonth: monthKey,
                invoicesUsed: usage.invoicesUsed,
                invoicesAllowed: usage.invoicesAllowed,
                tier,
              }),
              status: 'blocked',
            },
          });
        } catch (_) {
          /* best-effort */
        }
      }
      const errorMessage =
        `Free tier limit of ${usage.invoicesAllowed} invoices/month reached for ${network}. ` +
        `You used ${usage.invoicesUsed}. Upgrade to Pro/Business for higher limits.`;
      throw new Error(errorMessage);
    }
  }

  const common: Invoice = {
    id,
    ownerAddress: normalizedOwner,
    amount: data.amount,
    currency: data.currency,
    description: data.description,
    recipientAddress: data.recipientAddress,
    recipientName: data.recipientName,
    network,
    createdAt: now.toISOString(),
    status: 'pending',
    isSystem: false,
  };

  if (isCloudDbEnabled && prisma) {
    try {
      const created = await prisma.invoice.create({
        data: {
          id: common.id,
          ownerAddress: common.ownerAddress,
          amount: common.amount,
          currency: common.currency,
          description: common.description,
          recipientAddress: common.recipientAddress,
          recipientName: common.recipientName || null,
          network: common.network,
          status: 'pending',
          createdAt: now,
          isSystem: false,
        },
      });
      if (normalizedOwner) {
        await incrementMonthlyUsage(normalizedOwner, network, monthKey, id);
      }
      if (isCloudDbEnabled && prisma) {
        try {
          await prisma.agentLog.create({
            data: {
              action: 'invoice:created',
              details: JSON.stringify({
                ownerAddress: normalizedOwner || '(anonymous)',
                network,
                billingMonth: monthKey,
                invoiceId: id,
                amount: common.amount,
                currency: common.currency,
                tier,
              }),
              status: 'success',
            },
          });
        } catch (_) {
          /* best-effort audit */
        }
      }
      return formatDbInvoice(created);
    } catch (err) {
      if (err instanceof Error && /limit of \d+ invoices/i.test(err.message)) {
        throw err;
      }
      safeLogger.warn('[Store] Prisma createInvoice failed, fallback to local storage:', err);
    }
  }

  // Local fallback: still enforce limit counter
  if (normalizedOwner) {
    await incrementMonthlyUsage(normalizedOwner, network, monthKey, id);
  }
  const db = readLocalDatabase();
  db.set(id, common);
  writeLocalDatabase(db);
  return common;
}

export async function getInvoice(id: string): Promise<Invoice | undefined> {
  if (isCloudDbEnabled && prisma) {
    try {
      const row = await prisma.invoice.findUnique({ where: { id } });
      if (row) return formatDbInvoice(row);
    } catch (err) {
      safeLogger.warn('[Store] Prisma getInvoice failed, fallback to local:', err);
    }
  }
  const db = readLocalDatabase();
  return db.get(id);
}

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
      safeLogger.warn('[Store] Prisma isTxHashUsed check failed:', err);
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

export async function getAllInvoices(
  network?: 'arc' | 'algorand',
  ownerAddress?: string
): Promise<Invoice[]> {
  const normalizedOwner = ownerAddress ? ownerAddress.trim() : '';
  if (isCloudDbEnabled && prisma) {
    try {
      const rows = await prisma.invoice.findMany({
        where: {
          ...(network ? { network } : {}),
          ...(normalizedOwner ? { ownerAddress: normalizedOwner, isSystem: false } : { isSystem: false }),
        },
        orderBy: { createdAt: 'desc' },
      });
      return rows.map(formatDbInvoice);
    } catch (err) {
      safeLogger.warn('[Store] Prisma getAllInvoices failed, fallback to local:', err);
    }
  }

  const db = readLocalDatabase();
  const arr = Array.from(db.values());
  const filtered = arr.filter((inv) => {
    if (network && inv.network !== network) return false;
    if (normalizedOwner) return !inv.isSystem && inv.ownerAddress === normalizedOwner;
    return !inv.isSystem;
  });
  return filtered.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

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
      safeLogger.warn('[Store] Prisma markInvoicePaid failed, fallback to local:', err);
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

export interface DashboardStats {
  totalInvoices: number;
  paidInvoices: number;
  pendingInvoices: number;
  totalEarnedUSDC: string;
  totalEarnedEURC: string;
  earningsThisMonth: string;
  recentInvoices: Invoice[];
  tier: 'free' | 'pro' | 'business';
  invoicesUsedThisMonth: number;
  invoicesAllowedThisMonth: number;
  billingCycleStart: string;
  billingCycleEnd: string;
}

export async function getDashboardStats(
  network: 'arc' | 'algorand' = 'arc',
  ownerAddress?: string
): Promise<DashboardStats> {
  const normalizedOwner = ownerAddress ? ownerAddress.trim() : '';
  const all = await getAllInvoices(network, normalizedOwner);
  const paid = all.filter((i) => i.status === 'paid');
  const pending = all.filter((i) => i.status === 'pending');

  const totalEarnedUSDC = paid.reduce((sum, i) => {
    return sum + (i.currency === 'USDC' ? parseFloat(i.amount) : 0);
  }, 0);

  const totalEarnedEURC = paid.reduce((sum, i) => {
    return sum + (i.currency === 'EURC' ? parseFloat(i.amount) : 0);
  }, 0);

  const thisMonth = new Date();
  thisMonth.setDate(1);
  thisMonth.setHours(0, 0, 0, 0);

  const paidThisMonth = paid.filter(
    (i) => i.paidAt && new Date(i.paidAt).getTime() >= thisMonth.getTime()
  );
  const earningsThisMonth = paidThisMonth.reduce((sum, i) => sum + parseFloat(i.amount), 0);

  const usage = await getMonthlyUsage(normalizedOwner, network);

  return {
    totalInvoices: all.length,
    paidInvoices: paid.length,
    pendingInvoices: pending.length,
    totalEarnedUSDC: totalEarnedUSDC.toFixed(2),
    totalEarnedEURC: totalEarnedEURC.toFixed(2),
    earningsThisMonth: earningsThisMonth.toFixed(2),
    recentInvoices: all.slice(0, 10),
    tier: usage.tier,
    invoicesUsedThisMonth: usage.invoicesUsed,
    invoicesAllowedThisMonth: usage.invoicesAllowed,
    billingCycleStart: usage.billingCycleStart,
    billingCycleEnd: usage.billingCycleEnd,
  };
}
