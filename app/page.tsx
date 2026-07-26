'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState, Suspense } from 'react';
import Navbar from '@/components/Navbar';
import { WalletProvider, useWallet } from '@/lib/wallet';
import WalletModal from '@/components/WalletModal';
import { CURRENCY_CONFIG, ARC_CHAIN, parseTokenAmount, PLATFORM_WALLET } from '@/lib/arc';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

// Animated particle canvas
function Particles() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = () => {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    const particles: { x: number; y: number; vx: number; vy: number; r: number; alpha: number; color: string }[] = [];
    const colors = ['rgba(197,155,39,', 'rgba(122,0,16,', 'rgba(58,7,34,'];

    for (let i = 0; i < 60; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        vx: (Math.random() - 0.5) * 0.4,
        vy: (Math.random() - 0.5) * 0.4,
        r: Math.random() * 2 + 0.5,
        alpha: Math.random() * 0.5 + 0.1,
        color: colors[Math.floor(Math.random() * colors.length)],
      });
    }

    let animId: number;
    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      particles.forEach(p => {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0) p.x = canvas.width;
        if (p.x > canvas.width) p.x = 0;
        if (p.y < 0) p.y = canvas.height;
        if (p.y > canvas.height) p.y = 0;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `${p.color}${p.alpha})`;
        ctx.fill();
      });
      // Draw connections
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 100) {
            ctx.beginPath();
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.strokeStyle = `rgba(197,155,39,${0.06 * (1 - dist / 100)})`;
            ctx.lineWidth = 0.5;
            ctx.stroke();
          }
        }
      }
      animId = requestAnimationFrame(draw);
    };
    draw();
    return () => { cancelAnimationFrame(animId); window.removeEventListener('resize', resize); };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
    />
  );
}

interface SubscriptionModalProps {
  plan: 'free' | 'pro' | 'business';
  price: string;
  onClose: () => void;
  onSuccess: () => void;
}

function SubscriptionModal({ plan, price, onClose, onSuccess }: SubscriptionModalProps) {
  const { isConnected, isWrongNetwork, switchNetwork, address, network } = useWallet();
  const [step, setStep] = useState<'review' | 'paying' | 'success' | 'error'>('review');
  const [showWalletModal, setShowWalletModal] = useState(false);
  const [error, setError] = useState('');
  const [txHash, setTxHash] = useState('');

  const payMutation = useMutation({
    mutationFn: async () => {
      if (!isConnected) {
        setShowWalletModal(true);
        throw new Error('Wallet not connected');
      }

      if (network === 'algorand') {
        const planAmountUSDC = plan === 'pro' ? 15 : 50;
        const algo = (window as any).algorand || (window as any).algo;
        if (!algo) throw new Error('Algorand Wallet provider extension not detected');

        const txParams = {
          from: address,
          to: 'P2R5H7P7KP7N5L2G5F4F5E6D7C8B9A1Z2Y3X4W5V6U7T8S1A2B3C4D5E6F7G8H9', // Platform wallet
          assetId: 10458941, // USDC Asset ID
          amount: Math.round(planAmountUSDC * 1000000), // 6 decimals
        };

        const result = await algo.signTxns([{ txn: txParams }]);
        return result[0]?.txID || 'algo-tx-' + Math.random().toString(36).slice(2);
      }

      // EVM (Arc L1)
      if (isWrongNetwork) {
        await switchNetwork();
      }

      const provider = (window as any).ethereum;
      if (!provider) throw new Error('No wallet provider found');

      const planAmountUSDC = plan === 'pro' ? '15.0' : '50.0';
      const config = CURRENCY_CONFIG.USDC;
      const rawAmount = parseTokenAmount(planAmountUSDC);

      const funcSelector = '0xa9059cbb';
      const encodedTo = PLATFORM_WALLET.slice(2).padStart(64, '0');
      const encodedAmt = rawAmount.toString(16).padStart(64, '0');
      const data = funcSelector + encodedTo + encodedAmt;

      const txParams = {
        from: address,
        to: config.address,
        data,
        chainId: `0x${ARC_CHAIN.id.toString(16)}`,
      };

      return await provider.request({
        method: 'eth_sendTransaction',
        params: [txParams],
      });
    },
    onMutate: () => {
      setStep('paying');
      setError('');
    },
    onSuccess: async (hash: string) => {
      setTxHash(hash);
      try {
        const res = await fetch('/api/pay', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            txHash: hash,
            tier: plan,
          }),
        });
        const data2 = await res.json();
        if (!res.ok) {
          throw new Error(data2.error || 'Server validation failed');
        }

        localStorage.setItem('pactyfi_subscription', plan);
        setStep('success');
      } catch (err: any) {
        setError(err.message || 'Escrow confirmation failed');
        setStep('error');
      }
    },
    onError: (err: any) => {
      if (err.message === 'Wallet not connected') return; // Handled by opening modal
      setError(err.message || 'Transaction failed');
      setStep('error');
    }
  });

  return (
    <div className="modal-overlay">
      <div className="modal-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <h3 className="heading-lg" style={{ textTransform: 'capitalize' }}>Upgrade to {plan}</h3>
          <button className="btn-close" onClick={onClose}>×</button>
        </div>

        {step === 'review' && (
          <div>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>
              Confirm your subscription upgrade. You will pay in USDC on {network === 'algorand' ? 'Algorand' : 'Arc'}.
            </p>
            <div className="card-flat" style={{ marginBottom: '1.5rem', background: 'rgba(0,0,0,0.2)', padding: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                <span>Subtotal</span>
                <span>{price === '£12' ? '15.00 USDC' : price === '£49' ? '50.00 USDC' : '0.00 USDC'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600, borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '0.5rem' }}>
                <span>Total Due</span>
                <span className="gradient-text-gold">{price === '£12' ? '15.00 USDC' : price === '£49' ? '50.00 USDC' : '0.00 USDC'}</span>
              </div>
            </div>
            <button className="btn btn-primary btn-full" onClick={() => payMutation.mutate()}>
              Confirm Escrow & Upgrade
            </button>
          </div>
        )}

        {step === 'paying' && (
          <div style={{ textAlign: 'center', padding: '2rem 0' }}>
            <div className="loader" style={{ margin: '0 auto 1.5rem' }} />
            <h4 className="heading-md" style={{ marginBottom: '0.5rem' }}>Confirming Payment</h4>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
              Confirm the transaction in your wallet to lock payment.
            </p>
            {txHash && (
              <p style={{ marginTop: '1rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                Hash: {txHash.slice(0, 12)}...
              </p>
            )}
          </div>
        )}

        {step === 'success' && (
          <div style={{ textAlign: 'center', padding: '1rem 0' }}>
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🛡️</div>
            <h4 className="heading-md" style={{ marginBottom: '0.5rem' }}>[ Payment Successful ]</h4>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem', fontSize: '0.875rem' }}>
              Your account has been bound by code to the {plan} tier.
            </p>
            <button className="btn btn-primary btn-full" onClick={onSuccess}>
              Go to Dashboard
            </button>
          </div>
        )}

        {step === 'error' && (
          <div>
            <div style={{ color: 'var(--accent-red)', fontSize: '2.5rem', textAlign: 'center', marginBottom: '1rem' }}>⚠️</div>
            <h4 className="heading-md" style={{ marginBottom: '0.5rem', textAlign: 'center' }}>Payment Failed</h4>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '1.5rem', textAlign: 'center' }}>
              {error}
            </p>
            <button className="btn btn-primary btn-full" onClick={() => setStep('review')}>
              Retry Signing
            </button>
          </div>
        )}
      </div>
      {showWalletModal && <WalletModal onClose={() => setShowWalletModal(false)} />}
    </div>
  );
}

// Fullscreen Workspace Selection Overlay for Double Injected Wallet Extension Case
function WorkspaceOverlay({ onSelect }: { onSelect: (network: 'arc' | 'algorand') => void }) {
  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      zIndex: 99999,
      background: 'rgba(5, 5, 6, 0.95)',
      backdropFilter: 'blur(20px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '2rem'
    }}>
      <div style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-xl)',
        padding: '3rem 2.5rem',
        maxWidth: '850px',
        width: '100%',
        boxShadow: '0 25px 60px rgba(0,0,0,0.6)',
        textAlign: 'center',
        position: 'relative',
        overflow: 'hidden'
      }}>
        {/* Glow Effects */}
        <div style={{ position: 'absolute', top: -150, left: '20%', width: 300, height: 300, background: 'radial-gradient(circle, rgba(58,7,34,0.4), transparent)', filter: 'blur(50px)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', bottom: -150, right: '20%', width: 300, height: 300, background: 'radial-gradient(circle, rgba(0,212,255,0.15), transparent)', filter: 'blur(50px)', pointerEvents: 'none' }} />

        <div style={{ marginBottom: '1.5rem' }}>
          <img src="/logo.svg" alt="Pact3Fi Logo" style={{ height: '48px', margin: '0 auto 1.5rem' }} />
          <h2 className="heading-xl" style={{ fontFamily: 'var(--font-display)', marginBottom: '0.5rem' }}>Multiple Wallets Detected</h2>
          <p style={{ color: 'var(--text-secondary)', maxWidth: '520px', margin: '0 auto', fontSize: '0.9375rem', lineHeight: 1.6 }}>
            Both EVM (MetaMask/Coinbase) and Algorand extensions were found. Select which network workspace you want to initialize.
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem', marginTop: '2.5rem' }}>
          {/* Arc Option */}
          <div 
            className="card select-card"
            style={{
              padding: '2.25rem 1.75rem',
              cursor: 'pointer',
              border: '1px solid rgba(197,155,39,0.15)',
              background: 'rgba(255,255,255,0.01)',
              transition: 'all 0.3s ease',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              height: '100%'
            }}
            onClick={() => onSelect('arc')}
          >
            <div>
              <div style={{ fontSize: '2.5rem', marginBottom: '1.25rem' }}>🏛️</div>
              <h3 className="heading-md" style={{ marginBottom: '0.75rem', color: 'var(--accent-gold)' }}>Arc L1 Network</h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.8125rem', lineHeight: 1.6, marginBottom: '2rem' }}>
                Access the Roman legal court of Arc. Escrow USDC/EURC stablecoins, and release transactions in under 1 second using metamask.
              </p>
            </div>
            <button className="btn btn-secondary btn-full" style={{ borderColor: 'var(--accent-gold)', color: 'var(--accent-gold)' }}>
              Enter Arc Portal
            </button>
          </div>

          {/* Algorand Option */}
          <div 
            className="card select-card"
            style={{
              padding: '2.25rem 1.75rem',
              cursor: 'pointer',
              border: '1px solid rgba(0,212,255,0.15)',
              background: 'rgba(255,255,255,0.01)',
              transition: 'all 0.3s ease',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              height: '100%'
            }}
            onClick={() => onSelect('algorand')}
          >
            <div>
              <div style={{ fontSize: '2.5rem', marginBottom: '1.25rem' }}>⚡</div>
              <h3 className="heading-md" style={{ marginBottom: '0.75rem', color: 'var(--accent-cyan)' }}>Algorand Vault</h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.8125rem', lineHeight: 1.6, marginBottom: '2rem' }}>
                Connect to the Algorand blockchain vault. Register invoices, opt-in ASA tokens, and manage client funds using Pera or MyAlgo.
              </p>
            </div>
            <button className="btn btn-secondary btn-full" style={{ borderColor: 'var(--accent-cyan)', color: 'var(--accent-cyan)' }}>
              Enter Algorand Portal
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function HomeContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryNetwork = searchParams.get('network');
  const { setNetwork, network } = useWallet();

  const [showSubModal, setShowSubModal] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<{ plan: 'free' | 'pro' | 'business', price: string } | null>(null);

  // TanStack Query to check browser-injected wallets
  const { data: extensions } = useQuery({
    queryKey: ['injectedWallets'],
    queryFn: async () => {
      if (typeof window === 'undefined') return { evm: false, algo: false };
      const evm = !!window.ethereum;
      const algo = !!window.algorand || !!window.algo;
      return { evm, algo };
    },
    staleTime: Infinity,
  });

  const [overlayDecided, setOverlayDecided] = useState(false);
  const [showOverlay, setShowOverlay] = useState(false);

  // Sync network state and handle smart redirections
  useEffect(() => {
    if (typeof window === 'undefined' || !extensions) return;

    // 1. Prioritize dynamic query parameter URL setting
    if (queryNetwork === 'algorand') {
      setNetwork('algorand');
      setOverlayDecided(true);
      setShowOverlay(false);
      return;
    } else if (queryNetwork === 'arc') {
      setNetwork('arc');
      setOverlayDecided(true);
      setShowOverlay(false);
      return;
    }

    // 2. Check for active saved session
    const saved = localStorage.getItem('pactyfi_wallet');
    if (saved) {
      try {
        const { network: savedNet } = JSON.parse(saved);
        if (savedNet === 'arc' || savedNet === 'algorand') {
          setNetwork(savedNet);
          setOverlayDecided(true);
          setShowOverlay(false);
          return;
        }
      } catch { /* ignore */ }
    }

    // 3. Fallback to extension detection logic
    if (extensions.evm && !extensions.algo) {
      setNetwork('arc');
      setOverlayDecided(true);
    } else if (extensions.algo && !extensions.evm) {
      setNetwork('algorand');
      setOverlayDecided(true);
    } else if (extensions.evm && extensions.algo) {
      if (!overlayDecided) {
        setShowOverlay(true);
      }
    }
  }, [extensions, queryNetwork, setNetwork, overlayDecided]);

  const handleWorkspaceChoice = (chosenNetwork: 'arc' | 'algorand') => {
    setNetwork(chosenNetwork);
    setOverlayDecided(true);
    setShowOverlay(false);
  };

  const handlePlanClick = (plan: 'free' | 'pro' | 'business', price: string) => {
    if (plan === 'free') {
      router.push('/create');
    } else {
      setSelectedPlan({ plan, price });
      setShowSubModal(true);
    }
  };

  const handleSubSuccess = () => {
    setShowSubModal(false);
    router.push('/create?sub_active=true');
  };

  const isAlgo = network === 'algorand';

  return (
    <div style={{ minHeight: '100vh' }}>
      {showOverlay && <WorkspaceOverlay onSelect={handleWorkspaceChoice} />}

      <Navbar />

      {/* ── Hero ─────────────────────────────────────── */}
      <section style={{ position: 'relative', paddingTop: '8rem', paddingBottom: '6rem', overflow: 'hidden', minHeight: '100vh', display: 'flex', alignItems: 'center' }}>
        <div className="hero-bg">
          <div className="hero-grid" />
          <div className="hero-glow-1" style={{ position: 'absolute', width: 700, height: 700, background: isAlgo ? 'radial-gradient(circle, rgba(0,212,255,0.15), transparent)' : 'radial-gradient(circle, rgba(58,7,34,0.35), transparent)', top: -200, left: '50%', transform: 'translateX(-50%)', filter: 'blur(80px)' }} />
          <div className="hero-glow-2" style={{ position: 'absolute', width: 400, height: 400, background: isAlgo ? 'radial-gradient(circle, rgba(16,185,129,0.1), transparent)' : 'radial-gradient(circle, rgba(122,0,16,0.25), transparent)', bottom: 0, right: 0, filter: 'blur(80px)' }} />
          <Particles />
        </div>

        <div className="container" style={{ position: 'relative', textAlign: 'center' }}>
          {/* Eyebrow Tag */}
          <div style={{ marginBottom: '1.5rem' }}>
            <span className="badge badge-cyan" style={{ border: '1px solid var(--accent-gold)', textTransform: 'uppercase', letterSpacing: '0.12em', padding: '0.5rem 1rem' }}>
              <span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%', background: 'var(--accent-gold)', marginRight: '0.5rem', boxShadow: '0 0 8px var(--accent-gold)' }} />
              [ {isAlgo ? 'THE WEB3 INVOICING PLATFORM FOR ALGORAND' : 'THE WEB3 INVOICING PLATFORM FOR FREELANCERS'} ]
            </span>
          </div>

          {/* Latin Legal Accent */}
          <div style={{ fontStyle: 'italic', fontSize: '0.75rem', letterSpacing: '0.25em', color: 'var(--accent-gold)', marginBottom: '1rem', textTransform: 'uppercase' }}>
            § FAST, SECURE, IRREVERSIBLE PAYMENTS §
          </div>

          {/* Headline */}
          <h1 className="display-xl" style={{ maxWidth: 950, margin: '0 auto 1.5rem', lineHeight: '1.15' }}>
            Send Invoices.<br />
            Get Paid in <span className="gradient-text-gold">{isAlgo ? 'ALGO & USDC' : 'Seconds'}</span>.
          </h1>

          {/* Subheadline */}
          <p className="body-lg" style={{ color: 'var(--text-secondary)', maxWidth: 680, margin: '0 auto 2.5rem', lineHeight: '1.7' }}>
            Create secure, trustless invoices on the {isAlgo ? 'Algorand' : 'Arc'} blockchain. Your funds are locked in escrow and released instantly upon completion.
          </p>

          {/* CTAs */}
          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap', marginBottom: '3.5rem' }}>
            <Link href="/create" className="btn btn-primary btn-lg btn-pulse" id="hero-create-invoice-btn" style={{ minWidth: 200 }}>
              Create Your First Invoice
            </Link>
            <Link href="/onboarding" className="btn btn-secondary btn-lg" id="hero-learn-more-btn" style={{ minWidth: 200 }}>
              See How It Works
            </Link>
          </div>

          {/* Social proof stats */}
          <div style={{ display: 'flex', gap: '3rem', justifyContent: 'center', flexWrap: 'wrap' }}>
            {[
              { value: isAlgo ? '1.5s' : '<1s', label: isAlgo ? 'Block finality' : 'Instant finality' },
              { value: '0.5%', label: 'Release fee vs 2.9% Stripe' },
              { value: isAlgo ? '0.001 ALGO' : '$0.01', label: isAlgo ? 'Gas cost on Algorand' : 'Gas cost on Arc' },
              { value: '6×', label: 'Cheaper than bank wires' },
            ].map(stat => (
              <div key={stat.label} style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '1.75rem', fontWeight: 800, fontFamily: 'var(--font-display)', color: 'var(--accent-gold)' }}>
                  {stat.value}
                </div>
                <div style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                  {stat.label}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Live ticker ───────────────────────────────── */}
      <div className="ticker-wrap">
        <div className="ticker-inner">
          {isAlgo ? (
            [
              '💵 250 USDC paid on Algorand — 1.5s', '💶 800 EURC paid on Algorand — 1.4s',
              '💵 1,500 USDC paid on Algorand — 1.5s', '💵 300 ALGO paid on Algorand — 1.5s',
              '💵 950 USDC paid on Algorand — 1.5s', '💶 400 EURC paid on Algorand — 1.5s',
              '💵 250 USDC paid on Algorand — 1.5s', '💶 800 EURC paid on Algorand — 1.4s',
            ].map((item, i) => (
              <span className="ticker-item" key={i}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--accent-green)', display: 'inline-block' }} />
                {item}
              </span>
            ))
          ) : (
            [
              '💵 500 USDC paid to @Gabriele — 0.8s', '💶 1,200 EURC paid to @Sara — 0.6s',
              '💵 3,500 USDC paid to @Marco — 0.9s', '💶 750 EURC paid to @Emma — 0.7s',
              '💵 2,000 USDC paid to @Alex — 0.5s', '💶 900 EURC paid to @Luca — 1.1s',
              '💵 500 USDC paid to @Gabriele — 0.8s', '💶 1,200 EURC paid to @Sara — 0.6s',
            ].map((item, i) => (
              <span className="ticker-item" key={i}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--accent-green)', display: 'inline-block' }} />
                {item}
              </span>
            ))
          )}
        </div>
      </div>

      {/* ── How it works ──────────────────────────────── */}
      <section style={{ padding: '6rem 0' }}>
        <div className="container">
          <div style={{ textAlign: 'center', marginBottom: '3.5rem' }}>
            <p className="label" style={{ color: 'var(--accent-gold)', marginBottom: '0.75rem' }}>§ II: The Process</p>
            <h2 className="display-md">How Pact3Fi Works</h2>
            <p style={{ color: 'var(--text-secondary)', marginTop: '0.75rem' }}>Immutable, secure, and absolute</p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem' }}>
            {[
              {
                step: 'I',
                icon: '📜',
                title: 'Create a Pact (Invoice)',
                desc: `Define the amount, set the deliverables, choose USDC or EURC, and bind your recipient wallet on ${isAlgo ? 'Algorand' : 'Arc'}. Takes 30 seconds.`,
                color: 'var(--accent-gold)',
              },
              {
                step: 'II',
                icon: '⚖️',
                title: 'Lock the Terms',
                desc: 'Generate your secure payment link and send it to the client. The terms are locked on the blockchain.',
                color: 'var(--accent-red)',
              },
              {
                step: 'III',
                icon: '🏛️',
                title: 'Instant Release',
                desc: `The client locks funds in escrow. Once deliverable proof is registered, assets release in under ${isAlgo ? '2 seconds' : '1 second'}.`,
                color: 'var(--accent-gold)',
              },
            ].map(item => (
              <div key={item.step} className="card" style={{ textAlign: 'center', padding: '2.5rem 2rem', borderTop: `2px solid ${item.color}` }}>
                <div style={{
                  width: 56, height: 56, borderRadius: '50%',
                  background: `${item.color}18`,
                  border: `1px solid ${item.color}30`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  margin: '0 auto 1.25rem',
                  fontSize: '1.5rem',
                }}>
                  {item.icon}
                </div>
                <div className="label" style={{ color: item.color, marginBottom: '0.5rem' }}>Step {item.step}</div>
                <h3 className="heading-md" style={{ marginBottom: '0.75rem' }}>{item.title}</h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.9375rem', lineHeight: 1.65 }}>{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Comparison ───────────────────────────────── */}
      <section style={{ padding: '5rem 0', background: 'var(--bg-surface)' }}>
        <div className="container">
          <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
            <p className="label" style={{ color: 'var(--accent-red)', marginBottom: '0.75rem' }}>The Law of Exchange</p>
            <h2 className="display-md">Old way vs Pact3Fi</h2>
            <p style={{ color: 'var(--text-secondary)', marginTop: '0.75rem' }}>Based on a £5,000 monthly invoice</p>
          </div>

          <div className="compare-grid" style={{ maxWidth: 720, margin: '0 auto' }}>
            <div className="compare-card old" style={{ borderTop: '3px solid var(--accent-red)' }}>
              <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>🏛️</div>
              <h3 className="heading-md" style={{ marginBottom: '1.5rem', color: 'var(--accent-red)' }}>Bank Wire / Stripe</h3>
              {[
                ['Settlement', '3–5 business days'],
                ['Fee', '2.9% + £0.30 = ~£145'],
                ['Currency risk', 'FX conversion fees'],
                ['Reversals', 'Chargebacks possible'],
                ['Hours', 'Business hours only'],
              ].map(([k, v]) => (
                <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.625rem 0', borderBottom: '1px solid rgba(255,255,255,0.04)', fontSize: '0.875rem' }}>
                  <span style={{ color: 'var(--text-muted)' }}>{k}</span>
                  <span style={{ color: 'var(--accent-red)' }}>{v}</span>
                </div>
              ))}
            </div>

            <div className="compare-card new" style={{ borderTop: '3px solid var(--accent-gold)' }}>
              <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>⚡</div>
              <h3 className="heading-md" style={{ marginBottom: '1.5rem', color: 'var(--accent-gold)' }}>Pact3Fi on {isAlgo ? 'Algorand' : 'Arc'}</h3>
              {[
                ['Settlement', isAlgo ? '1.5 seconds' : '<1 second'],
                ['Fee', '0.5% = £25 — save £120'],
                ['Currency risk', 'Stablecoins = stable value'],
                ['Reversals', 'Blockchain = irreversible'],
                ['Hours', '24/7/365'],
              ].map(([k, v]) => (
                <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.625rem 0', borderBottom: '1px solid rgba(255,255,255,0.04)', fontSize: '0.875rem' }}>
                  <span style={{ color: 'var(--text-muted)' }}>{k}</span>
                  <span style={{ color: 'var(--accent-gold)' }}>{v}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Features ─────────────────────────────────── */}
      <section style={{ padding: '6rem 0' }}>
        <div className="container">
          <div style={{ textAlign: 'center', marginBottom: '3.5rem' }}>
            <p className="label" style={{ color: 'var(--accent-gold)', marginBottom: '0.75rem' }}>§ III: WHY IT WORKS</p>
            <h2 className="display-md">Powerful Escrow Features</h2>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '2rem' }}>
            {[
              {
                icon: '🏛️',
                title: isAlgo ? 'Built on Algorand' : 'Built on Arc',
                desc: isAlgo ? 'Built natively on Algorand. Pure Proof-of-Stake consensus guarantees maximum speed, decentralized security, and fork-proof finality.' : 'Built natively on Arc. Smart contracts run independently, ensuring your invoice (Pact) is secure and immutable on the blockchain.'
              },
              {
                icon: '🔒',
                title: 'Secure Escrow',
                desc: 'Funds are locked safely in smart contracts. Neither party can cancel arbitrarily, and funds release instantly upon verified completion.'
              },
              {
                icon: '⚖️',
                title: 'Perfect Alignment',
                desc: 'Pact3Fi creates a perfect balance of trust between clients and freelancers, backed by the certainty of the blockchain.'
              }
            ].map(f => (
              <div key={f.title} className="card" style={{ padding: '2.5rem 2rem' }}>
                <div style={{ fontSize: '2rem', marginBottom: '1.25rem', color: 'var(--accent-gold)' }}>
                  {f.icon}
                </div>
                <h3 className="heading-md" style={{ marginBottom: '1rem', fontFamily: 'var(--font-display)', color: 'var(--accent-gold)' }}>{f.title}</h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.9375rem', lineHeight: 1.65 }}>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Pricing ───────────────────────────────────── */}
      <section style={{ padding: '5rem 0', background: 'var(--bg-surface)' }}>
        <div className="container">
          <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
            <p className="label" style={{ color: 'var(--accent-gold)', marginBottom: '0.75rem' }}>Transparent Pricing</p>
            <h2 className="display-md">Choose Your Plan</h2>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1.5rem', maxWidth: 900, margin: '0 auto' }}>
            {[
              {
                plan: 'free' as const,
                price: '£0',
                period: 'forever',
                features: ['5 invoices/month', 'USDC & EURC', 'Shareable payment links', '0.5% transaction fee'],
                cta: 'Start for free',
                highlight: false,
              },
              {
                plan: 'pro' as const,
                price: '£12',
                period: '/month',
                features: ['Unlimited invoices', 'Custom branding', 'CSV export', '0.4% transaction fee', 'Priority support'],
                cta: 'Go Pro',
                highlight: true,
              },
              {
                plan: 'business' as const,
                price: '£49',
                period: '/month',
                features: ['Everything in Pro', 'Team accounts (5 seats)', 'API access', '0.3% transaction fee', 'Dedicated support'],
                cta: 'Contact us',
                highlight: false,
              },
            ].map(tier => (
              <div
                key={tier.plan}
                className="card"
                style={{
                  padding: '2rem',
                  position: 'relative',
                  ...(tier.highlight ? {
                    border: '1px solid var(--accent-cyan)',
                    boxShadow: '0 0 40px rgba(0,212,255,0.12)',
                  } : {}),
                }}
              >
                {tier.highlight && (
                  <div style={{ position: 'absolute', top: '14px', left: '50%', transform: 'translateX(-50%)', zIndex: 10 }}>
                    <span className="badge badge-cyan">Most popular</span>
                  </div>
                )}
                <p className="label" style={{ color: 'var(--text-muted)', marginBottom: '0.5rem' }}>{tier.plan}</p>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.25rem', marginBottom: '1.5rem' }}>
                  <span style={{ fontFamily: 'var(--font-display)', fontSize: '2.5rem', fontWeight: 800 }}>{tier.price}</span>
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>{tier.period}</span>
                </div>
                <ul style={{ listStyle: 'none', marginBottom: '2rem' }}>
                  {tier.features.map(f => (
                    <li key={f} style={{ padding: '0.5rem 0', borderBottom: '1px solid rgba(255,255,255,0.04)', fontSize: '0.875rem', color: 'var(--text-secondary)', display: 'flex', gap: '0.5rem' }}>
                      <span style={{ color: 'var(--accent-green)' }}>✓</span> {f}
                    </li>
                  ))}
                </ul>
                <button
                  onClick={() => handlePlanClick(tier.plan, tier.price)}
                  className={`btn ${tier.highlight ? 'btn-primary' : 'btn-secondary'} btn-full`}
                  id={`pricing-${tier.plan}-btn`}
                >
                  {tier.cta}
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ───────────────────────────────────────── */}
      <section style={{ padding: '6rem 0', textAlign: 'center' }}>
        <div className="container-sm">
          <h2 className="display-md" style={{ marginBottom: '1rem' }}>
            Ready to create your first <span className="gradient-text-gold">Pact</span>?
          </h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '2.5rem', fontSize: '1.0625rem' }}>
            Join freelancers and consultants already using Pact3Fi. Deploy your first contract — free, no setup required.
          </p>
          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link href="/create" className="btn btn-primary btn-lg btn-pulse" id="bottom-cta-btn">
              Create Your First Invoice →
            </Link>
            <Link href="/onboarding" className="btn btn-ghost btn-lg">
              See How It Works
            </Link>
          </div>
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────── */}
      <footer className="footer">
        <div className="container">
          <div className="footer-inner">
            <div>
              <div className="navbar-logo" style={{ marginBottom: '0.5rem' }}>
                <img src="/logo.svg" alt="Pact3Fi" style={{ height: '36px', width: 'auto' }} />
              </div>
              <p className="footer-copy">
                © 2026 Kyrvyn Ltd. All rights reserved.<br />
                Built by Gabriele Iacopo Langellotto. Powered by {isAlgo ? 'Algorand' : 'Arc'}.
              </p>
            </div>
            <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap' }}>
              <Link href="/onboarding" style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>How it Works</Link>
              <Link href="/create" style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>Create Invoice</Link>
              <Link href="/dashboard" style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>Dashboard</Link>
            </div>
          </div>
        </div>
      </footer>

      {showSubModal && selectedPlan && (
        <SubscriptionModal
          plan={selectedPlan.plan}
          price={selectedPlan.price}
          onClose={() => setShowSubModal(false)}
          onSuccess={handleSubSuccess}
        />
      )}
    </div>
  );
}

export default function HomePage() {
  return (
    <WalletProvider>
      <Suspense fallback={
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#050506', color: '#fff' }}>
          <div className="loader" />
        </div>
      }>
        <HomeContent />
      </Suspense>
    </WalletProvider>
  );
}
