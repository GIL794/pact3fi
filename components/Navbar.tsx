'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useWallet } from '@/lib/wallet';
import WalletButton from './WalletButton';

export default function Navbar() {
  const pathname = usePathname();
  const { isConnected, address, network } = useWallet();

  const isActive = (path: string) => pathname === path;

  return (
    <nav className="navbar">
      <div className="container">
        <div className="navbar-inner">
          {/* Logo & Network Badge */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <Link href="/" className="navbar-logo" style={{ color: 'var(--text-primary)' }}>
              <img src="/logo.svg" alt="Pact3Fi" style={{ height: '36px', width: 'auto' }} />
            </Link>
            <span className={`badge ${network === 'algorand' ? 'badge-cyan' : 'badge-purple'}`} style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              {network === 'algorand' ? 'Algorand' : 'Arc L1'}
            </span>
          </div>

          {/* Nav Links */}
          <ul className="navbar-links">
            <li>
              <Link
                href="/"
                style={{ color: isActive('/') ? 'var(--accent-gold)' : undefined }}
              >
                Home
              </Link>
            </li>
            <li>
              <Link
                href="/create"
                style={{ color: isActive('/create') ? 'var(--accent-gold)' : undefined }}
              >
                Create Invoice
              </Link>
            </li>
            {isConnected && (
              <li>
                <Link
                  href="/dashboard"
                  style={{ color: isActive('/dashboard') ? 'var(--accent-gold)' : undefined }}
                >
                  Dashboard
                </Link>
              </li>
            )}
            <li>
              <Link
                href="/onboarding"
                style={{ color: isActive('/onboarding') ? 'var(--accent-gold)' : undefined }}
              >
                How it Works
              </Link>
            </li>
          </ul>

          {/* Actions */}
          <div className="navbar-actions">
            {isConnected && address && (
              <span style={{
                fontSize: '0.8125rem',
                color: 'var(--text-muted)',
                fontFamily: 'monospace',
                marginRight: '0.25rem',
              }}>
                {address.slice(0, 6)}…{address.slice(-4)}
              </span>
            )}
            <WalletButton />
          </div>
        </div>
      </div>
    </nav>
  );
}
