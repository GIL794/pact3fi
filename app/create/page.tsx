'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Navbar from '@/components/Navbar';
import PactopusLogo from '@/components/PactopusLogo';
import PactopusCopilot from '@/components/PactopusCopilot';
import { WalletProvider, useWallet } from '@/lib/wallet';
import WalletModal from '@/components/WalletModal';
import { isValidAlgorandAddress } from '@/lib/algo';
import { recordMilestone } from '@/lib/milestones';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

type Currency = 'USDC' | 'EURC';

interface FormData {
  amount: string;
  currency: Currency;
  description: string;
  recipientAddress: string;
  recipientName: string;
}

function CreateForm() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { address, isConnected, network } = useWallet();
  const [showWalletModal, setShowWalletModal] = useState(false);
  const [form, setForm] = useState<FormData>({
    amount: '',
    currency: 'USDC',
    description: '',
    recipientAddress: address || '',
    recipientName: '',
  });
  const [errors, setErrors] = useState<Partial<FormData>>({});

  const [subTier, setSubTier] = useState<'free' | 'pro' | 'business'>(() => {
    if (typeof window !== 'undefined') {
      return (localStorage.getItem('pactopus_subscription') as 'free' | 'pro' | 'business') || 'free';
    }
    return 'free';
  });

  // Pull server-side scoped stats: per (ownerWallet, network, currentMonth) + tier from Prisma.
  const { data: stats } = useQuery({
    queryKey: ['dashboardStats', network, address],
    queryFn: async () => {
      const res = await fetch(`/api/invoices?network=${network}${address ? `&owner=${encodeURIComponent(address)}` : ''}`);
      if (!res.ok) throw new Error('Failed to fetch invoice count');
      return res.json();
    },
    enabled: true,
  });

  // Apply server-side tier (from Prisma Subscription) to keep UI in sync.
  useEffect(() => {
    if (stats?.tier && (stats.tier === 'free' || stats.tier === 'pro' || stats.tier === 'business')) {
      setSubTier(stats.tier);
    }
  }, [stats?.tier]);

  const invoicesUsedThisMonth = typeof stats?.invoicesUsedThisMonth === 'number' ? stats.invoicesUsedThisMonth : 0;
  const invoicesAllowedThisMonth = typeof stats?.invoicesAllowedThisMonth === 'number' ? stats.invoicesAllowedThisMonth : 5;
  const invoiceCount = invoicesUsedThisMonth;
  const isBlocked = subTier === 'free' && invoicesUsedThisMonth >= invoicesAllowedThisMonth;

  // Sync recipient address when wallet connects/changes
  useEffect(() => {
    if (address) {
      setForm(f => ({ ...f, recipientAddress: address }));
    }
  }, [address]);

  // Auto-fill wallet address when connected
  const handleConnectFill = () => {
    if (address) setForm(f => ({ ...f, recipientAddress: address }));
  };

  const validate = (): boolean => {
    const newErrors: Partial<FormData> = {};
    if (isBlocked) {
      newErrors.description = 'You’ve hit the Free plan limit. Upgrade to keep creating invoices.';
      return false;
    }
    if (!form.amount || parseFloat(form.amount) <= 0) newErrors.amount = 'Add an amount greater than 0';
    if (!form.description || form.description.trim().length < 3) newErrors.description = 'Add a short description (at least 3 characters)';
    
    // Address validation based on current network mode
    if (network === 'arc') {
      if (!form.recipientAddress || !form.recipientAddress.startsWith('0x') || form.recipientAddress.length !== 42) {
        newErrors.recipientAddress = 'Paste a valid Arc/EVM wallet address (starts with 0x)';
      }
    } else {
      if (!isValidAlgorandAddress(form.recipientAddress)) {
        newErrors.recipientAddress = 'Paste a valid Algorand wallet address';
      }
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const createMutation = useMutation({
    mutationFn: async (formData: any) => {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (address) headers['X-Pactopus-Owner'] = address;
      const res = await fetch('/api/invoices', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          ...formData,
          ownerAddress: address || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create invoice');
      return data.invoice;
    },
    onSuccess: (invoice) => {
      queryClient.invalidateQueries({ queryKey: ['dashboardStats', network, address] });
      recordMilestone('first_invoice_created');
      router.push(`/pay/${invoice.id}?created=true`);
    },
    onError: (err: any) => {
      setErrors({ description: err.message || 'Failed to create invoice' });
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    createMutation.mutate({
      ...form,
      network,
    });
  };

  const feeAmount = form.amount ? (parseFloat(form.amount) * 0.005).toFixed(2) : '0.00';
  const netAmount = form.amount ? (parseFloat(form.amount) * 0.995).toFixed(2) : '0.00';

  const isAlgo = network === 'algorand';
  const [showCopilot, setShowCopilot] = useState(false);

  const handleCopilotFill = (parsedData: {
    amount: string;
    currency: 'USDC' | 'EURC';
    description: string;
    recipientAddress: string;
    recipientName: string;
  }) => {
    setForm(prev => ({
      ...prev,
      amount: parsedData.amount || prev.amount,
      currency: parsedData.currency || prev.currency,
      description: parsedData.description || prev.description,
      recipientAddress: parsedData.recipientAddress || prev.recipientAddress,
      recipientName: parsedData.recipientName || prev.recipientName,
    }));
  };

  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem', alignItems: 'start' }}>
        {/* Tier status banner */}
        <div style={{ gridColumn: 'span 2', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem 1.25rem', background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-card)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <span style={{ fontSize: '1.25rem' }}>🛡️</span>
            <div>
              <div style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>Your plan ({isAlgo ? 'Algorand' : 'Arc'})</div>
              <div style={{ fontWeight: 700, fontSize: '0.9375rem', textTransform: 'uppercase' }} className="gradient-text-gold">
                {subTier} Tier
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <button
              type="button"
              onClick={() => setShowCopilot(!showCopilot)}
              className="btn btn-secondary btn-sm"
              style={{ borderColor: showCopilot ? 'var(--accent-cyan)' : undefined }}
            >
              {showCopilot ? '✕ Close AI Copilot' : '🤖 AI Copilot & Comms'}
            </button>
            {subTier === 'free' ? (
              <span className="badge badge-cyan" style={{ border: '1px solid var(--border)' }}>
                {invoiceCount} / {invoicesAllowedThisMonth} invoices this month
              </span>
            ) : (
              <span className="badge badge-green">✓ Unlimited invoices</span>
            )}
          </div>
        </div>

        {/* Optional AI Copilot Panel */}
        {showCopilot && (
          <div style={{ gridColumn: 'span 2', marginBottom: '1rem' }}>
            <PactopusCopilot onFillForm={handleCopilotFill} currentForm={form} />
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} noValidate>
          {/* Amount + Currency */}
          <div style={{ marginBottom: '1.5rem' }}>
            <label className="input-label" style={{ marginBottom: '0.625rem', display: 'block' }}>
              Amount
            </label>
            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
              <div style={{ flex: 1 }}>
                <input
                  type="number"
                  className={`input input-lg ${errors.amount ? 'input-error' : ''}`}
                  placeholder="0.00"
                  value={form.amount}
                  onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                  min="0"
                  step="0.01"
                  id="invoice-amount-input"
                  style={{ borderColor: errors.amount ? 'var(--accent-red)' : undefined }}
                />
                {errors.amount && <p style={{ color: 'var(--accent-red)', fontSize: '0.8125rem', marginTop: '0.25rem' }}>{errors.amount}</p>}
              </div>
              <div className="currency-toggle" style={{ flexShrink: 0 }}>
                <button
                  type="button"
                  className={`currency-toggle-btn ${form.currency === 'USDC' ? 'active usdc' : ''}`}
                  onClick={() => setForm(f => ({ ...f, currency: 'USDC' }))}
                  id="select-usdc-btn"
                >
                  💵 USDC
                </button>
                <button
                  type="button"
                  className={`currency-toggle-btn ${form.currency === 'EURC' ? 'active eurc' : ''}`}
                  onClick={() => setForm(f => ({ ...f, currency: 'EURC' }))}
                  id="select-eurc-btn"
                >
                  💶 EURC
                </button>
              </div>
            </div>
          </div>

          {/* Description */}
          <div className="input-group" style={{ marginBottom: '1.5rem' }}>
            <label className="input-label" htmlFor="invoice-description">
              What’s this for?
            </label>
            <textarea
              id="invoice-description"
              className="input"
              placeholder={isAlgo ? "e.g. Algorand dApp testing retained services — Q3 2026" : "e.g. Brand strategy consulting — Q3 2025, 20 hours"}
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              rows={3}
              style={{ borderColor: errors.description ? 'var(--accent-red)' : undefined }}
            />
            {errors.description && <p style={{ color: 'var(--accent-red)', fontSize: '0.8125rem' }}>{errors.description}</p>}
          </div>

          {/* Your name */}
          <div className="input-group" style={{ marginBottom: '1.5rem' }}>
            <label className="input-label" htmlFor="invoice-recipient-name">
              Your name (optional)
            </label>
            <input
              id="invoice-recipient-name"
              type="text"
              className="input"
              placeholder="e.g. Gabriele L."
              value={form.recipientName}
              onChange={e => setForm(f => ({ ...f, recipientName: e.target.value }))}
            />
          </div>

          {/* Wallet Address */}
          <div className="input-group" style={{ marginBottom: '2rem' }}>
            <label className="input-label" htmlFor="invoice-wallet-address" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span>Where should the money go? <span style={{ color: 'var(--accent-red)' }}>*</span></span>
              {isConnected && address && (
                <button
                  type="button"
                  onClick={handleConnectFill}
                  className="btn btn-secondary btn-sm"
                  style={{ fontSize: '0.75rem', padding: '0.25rem 0.625rem' }}
                >
                  Use connected wallet
                </button>
              )}
            </label>
            <input
              id="invoice-wallet-address"
              type="text"
              className="input"
              placeholder={isAlgo ? "Paste your Algorand address…" : "Paste your 0x address…"}
              value={form.recipientAddress}
              onChange={e => setForm(f => ({ ...f, recipientAddress: e.target.value }))}
              style={{
                fontFamily: 'monospace',
                fontSize: '0.875rem',
                borderColor: errors.recipientAddress ? 'var(--accent-red)' : undefined,
              }}
            />
            {errors.recipientAddress && (
              <p style={{ color: 'var(--accent-red)', fontSize: '0.8125rem' }}>{errors.recipientAddress}</p>
            )}
            {!isConnected && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.5rem' }}>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.8125rem' }}>
                  Need a wallet?
                </p>
                <button type="button" onClick={() => setShowWalletModal(true)} className="btn btn-secondary btn-sm" style={{ fontSize: '0.75rem' }}>
                  Pick a wallet
                </button>
              </div>
            )}
            <div className="tooltip-wrapper" style={{ marginTop: '0.375rem' }}>
              <button
                type="button"
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '0.8125rem', cursor: 'help', display: 'flex', alignItems: 'center', gap: '0.25rem' }}
              >
                ℹ️ What is a wallet address?
              </button>
              <div className="tooltip" style={{ whiteSpace: 'normal', maxWidth: 280, textAlign: 'left' }}>
                {isAlgo ? (
                  "This is your receiving address on Algorand. When someone pays, the stablecoins go straight here."
                ) : (
                  "This is your receiving address on Arc/EVM. When someone pays, the stablecoins go straight here."
                )}
              </div>
            </div>
          </div>

          {isBlocked && (
            <div style={{
              padding: '1rem',
              background: 'rgba(var(--danger-rgb), 0.10)',
              border: '1px solid rgba(var(--danger-rgb), 0.22)',
              borderRadius: 'var(--radius-md)',
              color: 'var(--danger)',
              fontSize: '0.875rem',
              marginBottom: '1.5rem',
              lineHeight: 1.5
            }}>
              ⚠️ <strong>You’ve used all {invoicesAllowedThisMonth} Free invoices for this billing month.</strong> Upgrade on the homepage to unlock unlimited invoices, or wait until the next billing cycle when your limit resets automatically.
            </div>
          )}

          <button
            type="submit"
            className="btn btn-primary btn-full btn-lg"
            disabled={createMutation.isPending || isBlocked}
            id="create-invoice-submit-btn"
          >
            {createMutation.isPending ? 'Creating your invoice…' : isBlocked ? '🔒 Upgrade to keep going' : 'Create invoice'}
          </button>
        </form>

        {/* Live Preview */}
        <div>
          <p className="label" style={{ color: 'var(--accent-gold)', marginBottom: '1rem' }}>Preview</p>

          <div className="invoice-preview" style={{ borderTop: '3px solid var(--accent-gold)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
              <div>
                <div className="navbar-logo" style={{ marginBottom: '0.25rem', fontSize: '1.125rem' }}>
                  <PactopusLogo height={28} />
                </div>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>Quick summary</p>
              </div>
              <span className={`badge ${form.currency === 'USDC' ? 'badge-green' : 'badge-gold'}`}>
                {form.currency}
              </span>
            </div>

            <div style={{ marginBottom: '1.5rem' }}>
              <p className="invoice-preview currency-label">
                {form.currency === 'USDC' ? '🇺🇸 US Dollar Coin' : '🇪🇺 Euro Coin'}
              </p>
              <div className="invoice-preview amount" style={{ color: form.currency === 'USDC' ? 'var(--accent-green)' : 'var(--accent-gold)' }}>
                {form.amount ? parseFloat(form.amount).toLocaleString() : '0.00'}
              </div>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginTop: '0.25rem' }}>{form.currency}</p>
            </div>

            <div className="divider" />

            {form.description && (
              <div style={{ marginBottom: '1rem' }}>
                <p className="label" style={{ color: 'var(--text-muted)', marginBottom: '0.25rem' }}>For</p>
                <p style={{ fontSize: '0.9375rem' }}>{form.description}</p>
              </div>
            )}

            {form.recipientName && (
              <div style={{ marginBottom: '1rem' }}>
                <p className="label" style={{ color: 'var(--text-muted)', marginBottom: '0.25rem' }}>From</p>
                <p style={{ fontSize: '0.9375rem', fontWeight: 600 }}>{form.recipientName}</p>
              </div>
            )}

            {form.recipientAddress && (
              <div style={{ marginBottom: '1rem' }}>
                <p className="label" style={{ color: 'var(--text-muted)', marginBottom: '0.25rem' }}>To wallet</p>
                <p style={{ fontSize: '0.8125rem', fontFamily: 'monospace', color: 'var(--text-secondary)', wordBreak: 'break-all' }}>
                  {isAlgo ? (
                    form.recipientAddress.length > 20 ? (
                      `${form.recipientAddress.slice(0, 12)}…${form.recipientAddress.slice(-12)}`
                    ) : (
                      form.recipientAddress
                    )
                  ) : (
                    form.recipientAddress.startsWith('0x') && form.recipientAddress.length === 42 ? (
                      `${form.recipientAddress.slice(0, 10)}…${form.recipientAddress.slice(-8)}`
                    ) : (
                      form.recipientAddress
                    )
                  )}
                </p>
              </div>
            )}

            <div className="divider" />

            {/* Fee breakdown */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.8125rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)' }}>
                <span>Total</span>
                <span>{form.amount || '0.00'} {form.currency}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)' }}>
                <span>Pactopus fee (0.5%)</span>
                <span>-{feeAmount} {form.currency}</span>
              </div>
              <div className="divider" style={{ margin: '0.25rem 0' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, color: 'var(--text-primary)' }}>
                <span>You receive</span>
                <span style={{ color: 'var(--accent-gold)' }}>
                  {netAmount} {form.currency}
                </span>
              </div>
            </div>

            <div style={{ marginTop: '1.25rem', textAlign: 'center' }}>
              <span className="badge badge-cyan">
                {isAlgo ? '⚡ Settles on Algorand in 1.5s' : '⚡ Settles on Arc in <1s'}
              </span>
            </div>
          </div>

          {/* Wallet guide */}
          <div className="card" style={{ marginTop: '1.25rem', padding: '1.25rem' }}>
            <h4 style={{ fontWeight: 600, marginBottom: '0.625rem', fontSize: '0.9375rem' }}>🆕 No wallet yet?</h4>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.8125rem', marginBottom: '0.875rem' }}>
              A wallet is a free app that holds your stablecoins. It takes 2 minutes to set up.
            </p>
            {isAlgo ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <a
                  href="https://www.exodus.com/web3-wallet/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-secondary btn-sm btn-full"
                  id="exodus-install-link"
                >
                  🚀 Get Exodus Extension (Fast 30s setup)
                </a>
                <a
                  href="https://perawallet.app"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-ghost btn-sm btn-full"
                  id="pera-install-link"
                >
                  📱 Get Pera Wallet (Mobile / Web)
                </a>
              </div>
            ) : (
              <a
                href="https://metamask.io"
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-ghost btn-sm btn-full"
                id="metamask-install-link"
              >
                🦊 Get MetaMask (free)
              </a>
            )}
          </div>
        </div>
      </div>

      {showWalletModal && <WalletModal onClose={() => setShowWalletModal(false)} />}
    </>
  );
}

export default function CreatePage() {
  return (
    <WalletProvider>
      <div style={{ minHeight: '100vh' }}>
        <Navbar />
        <div style={{ paddingTop: '8rem', paddingBottom: '4rem' }}>
          <div className="container-md">
            {/* Header */}
            <div style={{ marginBottom: '2.5rem' }}>
              <p className="label" style={{ color: 'var(--accent-gold)', marginBottom: '0.5rem' }}>New invoice</p>
              <h1 className="display-md" style={{ marginBottom: '0.75rem', fontFamily: 'var(--font-display)' }}>
                Create an invoice
              </h1>
              <p style={{ color: 'var(--text-secondary)' }}>
                Add the basics, preview it on the right, then share the link to get paid.
              </p>
            </div>

            <CreateForm />
          </div>
        </div>
      </div>
    </WalletProvider>
  );
}
