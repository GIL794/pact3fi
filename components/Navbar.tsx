'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useWallet } from '@/lib/wallet';
import { useTheme } from '@/lib/theme';
import { isFunModeEnabled, setFunModeEnabled } from '@/lib/milestones';
import toast from 'react-hot-toast';
import PactopusLogo from './PactopusLogo';
import WalletButton from './WalletButton';

export default function Navbar() {
  const pathname = usePathname();
  const { isConnected, address, network } = useWallet();
  const { theme, toggleTheme } = useTheme();
  const [funMode, setFunMode] = useState(false);

  const isActive = (path: string) => pathname === path;

  useEffect(() => {
    setFunMode(isFunModeEnabled());
  }, []);

  return (
    <nav className="navbar">
      <div className="container">
        <div className="navbar-inner">
          {/* Logo & Network Badge */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <Link href="/" className="navbar-logo" style={{ color: 'var(--text-primary)' }}>
              <PactopusLogo height={36} />
            </Link>
            <span className={`badge ${network === 'algorand' ? 'badge-cyan' : 'badge-purple'}`} style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              {network === 'algorand' ? 'Algorand Palette' : 'Arc Palette'}
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
                New Invoice
              </Link>
            </li>
            {isConnected && (
              <li>
                <Link
                  href="/dashboard"
                  style={{ color: isActive('/dashboard') ? 'var(--accent-gold)' : undefined }}
                >
                  My Dashboard
                </Link>
              </li>
            )}
            <li>
              <Link
                href="/onboarding"
                style={{ color: isActive('/onboarding') ? 'var(--accent-gold)' : undefined }}
              >
                Help
              </Link>
            </li>
          </ul>

          {/* Actions */}
          <div className="navbar-actions">
            <button
              type="button"
              className="icon-btn"
              onClick={toggleTheme}
              aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
              title={theme === 'dark' ? 'Light theme' : 'Dark theme'}
            >
              {theme === 'dark' ? '☀️' : '🌙'}
            </button>
            <button
              type="button"
              className={`octofun-toggle ${funMode ? 'is-on' : 'is-off'}`}
              aria-pressed={funMode}
              onClick={() => {
                const next = !funMode;
                setFunMode(next);
                setFunModeEnabled(next);
                if (next) {
                  toast.custom(t => (
                    <div
                      className="toast toast-milestone"
                      style={{
                        opacity: t.visible ? 1 : 0,
                        transform: t.visible ? 'translateY(0)' : 'translateY(8px)',
                        transition: 'opacity 180ms ease, transform 180ms ease',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
                        <div style={{ fontSize: '1.25rem', lineHeight: 1 }}>🐙</div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 800, marginBottom: '0.15rem' }}>OctoFun is on!</div>
                          <div style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', lineHeight: 1.4 }}>
                            You’ll get little rewards at milestones.
                          </div>
                        </div>
                        <button
                          type="button"
                          className="icon-btn"
                          aria-label="Dismiss notification"
                          onClick={() => toast.dismiss(t.id)}
                          style={{ marginTop: -2 }}
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  ));
                }
              }}
              aria-label={funMode ? 'toggle the octofun! (on)' : 'toggle the octofun! (off)'}
              title="toggle the octofun!"
            >
              <span aria-hidden="true" className="octofun-emoji">🐙</span>
              <span className="octofun-label">toggle the octofun!</span>
            </button>
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
