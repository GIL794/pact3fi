'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Navbar from '@/components/Navbar';
import { WalletProvider, useWallet } from '@/lib/wallet';
import WalletModal from '@/components/WalletModal';
import { recordMilestone } from '@/lib/milestones';
import type { Invoice } from '@/lib/store';
import { getAlgoTxLink } from '@/lib/algo';
import { getTxLink } from '@/lib/arc';
import { useQuery } from '@tanstack/react-query';

interface DashboardStats {
  totalInvoices: number;
  paidInvoices: number;
  pendingInvoices: number;
  totalEarnedUSDC: string;
  totalEarnedEURC: string;
  earningsThisMonth: string;
  recentInvoices: Invoice[];
}

function DashboardContent() {
  const { isConnected, address, usdcBalance, eurcBalance, refreshBalances, network } = useWallet();
  const [showWalletModal, setShowWalletModal] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [subTier] = useState<'free' | 'pro' | 'business'>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('pactopus_subscription') as 'free' | 'pro' | 'business' || 'free';
    }
    return 'free';
  });

  const isAlgo = network === 'algorand';

  useEffect(() => {
    if (!isConnected) return;
    recordMilestone('first_dashboard_visit');
  }, [isConnected]);

  // TanStack Query with dynamic caching & auto-polling every 10s
  const { data: stats, isLoading, refetch } = useQuery<DashboardStats>({
    queryKey: ['dashboardStats', network],
    queryFn: async () => {
      const res = await fetch(`/api/invoices?network=${network}`);
      if (!res.ok) throw new Error('Failed to fetch dashboard stats');
      return res.json();
    },
    refetchInterval: 10000, // Poll every 10 seconds to catch ledger updates
  });

  const handleRefresh = async () => {
    await refreshBalances();
    await refetch();
  };

  const copyInvoiceLink = async (id: string) => {
    const url = `${window.location.origin}/pay/${id}`;
    await navigator.clipboard.writeText(url);
    setCopied(id);
    setTimeout(() => setCopied(null), 2500);
  };

  const statusBadge = (status: Invoice['status']) => {
    if (status === 'paid') return <span className="badge badge-green">✓ Released</span>;
    if (status === 'expired') return <span className="badge badge-red">Cancelled</span>;
    return <span className="badge badge-cyan">Pending</span>;
  };

  if (!isConnected) {
    return (
      <div style={{ textAlign: 'center', padding: '4rem 2rem' }}>
        <div style={{ fontSize: '3rem', marginBottom: '1.5rem' }}>🔌</div>
        <h2 className="heading-lg" style={{ marginBottom: '0.75rem' }}>Connect a wallet to continue</h2>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem' }}>
          Once you’re connected, you’ll see your invoices, payments, and balances here.
        </p>
        <button className="btn btn-primary btn-lg" onClick={() => setShowWalletModal(true)} id="dashboard-connect-btn">
          Connect wallet
        </button>
        {showWalletModal && <WalletModal onClose={() => setShowWalletModal(false)} />}
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '2.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <p className="label" style={{ color: 'var(--accent-gold)', marginBottom: '0.25rem' }}>Overview</p>
          <h1 className="display-md" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap', fontFamily: 'var(--font-display)' }}>
            Your invoices ({isAlgo ? 'Algorand' : 'Arc'})
            <span className={`badge ${subTier === 'free' ? 'badge-cyan' : subTier === 'pro' ? 'badge-purple' : 'badge-green'}`} style={{ textTransform: 'uppercase', fontSize: '0.75rem' }}>
              {subTier} plan
            </span>
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontFamily: 'monospace', fontSize: '0.875rem', marginTop: '0.375rem', wordBreak: 'break-all' }}>
            Wallet: {address}
          </p>
        </div>
        <Link href="/create" className="btn btn-primary" id="dashboard-create-btn">
          New invoice
        </Link>
      </div>

      {/* Balance tiles */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
        <div className="stat-card" style={{ border: '1px solid rgba(var(--success-rgb), 0.28)' }}>
          <div className="stat-label">💵 USDC Balance</div>
          <div className="stat-value" style={{ color: 'var(--accent-green)', marginTop: '0.5rem' }}>{usdcBalance}</div>
          <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>US Dollar Coin</div>
        </div>
        <div className="stat-card" style={{ border: '1px solid rgba(var(--brand-rgb), 0.28)' }}>
          <div className="stat-label">💶 EURC Balance</div>
          <div className="stat-value" style={{ color: 'var(--accent-gold)', marginTop: '0.5rem' }}>{eurcBalance}</div>
          <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>Euro Coin</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">📈 Earned this month</div>
          <div className="stat-value gradient-text" style={{ marginTop: '0.5rem' }}>
            {isLoading ? '—' : `${parseFloat(stats?.earningsThisMonth || '0').toLocaleString()}`}
          </div>
          <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>Combined USDC+EURC</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">📋 Total Invoices</div>
          <div className="stat-value" style={{ marginTop: '0.5rem' }}>{isLoading ? '—' : stats?.totalInvoices}</div>
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
            <span className="badge badge-green" style={{ fontSize: '0.7rem' }}>{stats?.paidInvoices} Paid</span>
            <span className="badge badge-cyan" style={{ fontSize: '0.7rem' }}>{stats?.pendingInvoices} Pending</span>
          </div>
        </div>
      </div>

      {/* Network status */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.875rem 1.25rem', background: 'var(--field-bg)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', marginBottom: '2.5rem', flexWrap: 'wrap' }}>
        <span style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--accent-green)', display: 'inline-block', boxShadow: '0 0 8px var(--accent-green)' }} />
        <span style={{ fontWeight: 600, fontSize: '0.9375rem' }}>
          Connected to {isAlgo ? 'Algorand Testnet' : 'Arc Testnet'}
        </span>
        <span style={{ color: 'var(--text-muted)', fontSize: '0.8125rem' }}>
          {isAlgo
            ? 'Quick blocks · Smooth confirmations · Colors matched to Algorand'
            : 'Fast finality · Simple fees · Colors matched to Arc'}
        </span>
        <button className="btn btn-secondary btn-sm" onClick={handleRefresh} style={{ marginLeft: 'auto' }}>
          ↻ Refresh data
        </button>
      </div>

      {/* Invoices table */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
          <h2 className="heading-lg" style={{ fontFamily: 'var(--font-display)' }}>Recent invoices</h2>
          <Link href="/create" className="btn btn-secondary btn-sm" id="table-create-btn">
            New invoice
          </Link>
        </div>

        {isLoading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {[1, 2, 3].map(i => (
              <div key={i} className="skeleton" style={{ height: 64, borderRadius: 'var(--radius-md)' }} />
            ))}
          </div>
        ) : !stats?.recentInvoices?.length ? (
          <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
            <p style={{ fontSize: '2rem', marginBottom: '1rem' }}>📭</p>
            <h3 className="heading-md" style={{ marginBottom: '0.5rem' }}>No active invoices</h3>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>Create one, share the link, and get paid.</p>
            <Link href="/create" className="btn btn-primary" id="empty-state-create-btn">
              Create an invoice
            </Link>
          </div>
        ) : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Description</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th>Date</th>
                  <th>Transaction</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {stats.recentInvoices.map(inv => (
                  <tr key={inv.id}>
                    <td>
                      <div style={{ fontWeight: 500, color: 'var(--text-primary)', fontSize: '0.9375rem' }}>
                        {inv.description}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.125rem' }}>
                        ID: {inv.id}
                      </div>
                    </td>
                    <td>
                      <span style={{
                        fontFamily: 'var(--font-display)',
                        fontWeight: 700,
                        color: inv.currency === 'USDC' ? 'var(--accent-green)' : 'var(--accent-gold)',
                        fontSize: '1rem',
                      }}>
                        {parseFloat(inv.amount).toLocaleString()}
                      </span>
                      <span style={{ color: 'var(--text-muted)', fontSize: '0.8125rem', marginLeft: '0.375rem' }}>
                        {inv.currency}
                      </span>
                    </td>
                    <td>{statusBadge(inv.status)}</td>
                    <td style={{ whiteSpace: 'nowrap', fontSize: '0.8125rem' }}>
                      {new Date(inv.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
                    </td>
                    <td>
                      {inv.txHash ? (
                        <a
                          href={isAlgo ? getAlgoTxLink(inv.txHash) : getTxLink(inv.txHash)}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: 'var(--accent-cyan)' }}
                          id={`tx-link-${inv.id}`}
                        >
                          {inv.txHash.slice(0, 8)}…
                        </a>
                      ) : (
                        <span style={{ color: 'var(--text-muted)', fontSize: '0.8125rem' }}>—</span>
                      )}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        {inv.status === 'pending' && (
                          <button
                            className="btn btn-secondary btn-sm"
                            onClick={() => copyInvoiceLink(inv.id)}
                            id={`copy-link-${inv.id}`}
                          >
                            {copied === inv.id ? '✓' : '🔗'}
                          </button>
                        )}
                        <Link href={`/pay/${inv.id}`} className="btn btn-ghost btn-sm" id={`view-invoice-${inv.id}`}>
                          View
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Business model callout */}
      <div className="card" style={{ marginTop: '2.5rem', display: 'flex', alignItems: 'center', gap: '1.5rem', flexWrap: 'wrap', background: 'rgba(var(--brand-tertiary-rgb), 0.06)', border: '1px solid rgba(var(--brand-rgb), 0.22)' }}>
        <div style={{ flex: 1 }}>
          <h3 className="heading-md" style={{ marginBottom: '0.375rem', fontFamily: 'var(--font-display)', color: 'var(--accent-gold)' }}>💡 Transparent Fees</h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
            Pactopus takes a simple 0.5% platform fee on paid invoices. The dashboard stays chain-aware too, switching its colors in milliseconds to match Arc or Algorand.
          </p>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Yearly fee savings</div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.75rem', fontWeight: 800, color: 'var(--accent-gold)' }}>1,440 USDC</div>
        </div>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <WalletProvider>
      <div style={{ minHeight: '100vh' }}>
        <Navbar />
        <div style={{ paddingTop: '8rem', paddingBottom: '4rem' }}>
          <div className="container">
            <DashboardContent />
          </div>
        </div>
      </div>
    </WalletProvider>
  );
}
