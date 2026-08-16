'use client';

import React from 'react';

interface PactopusLogoProps {
  height?: number | string;
  width?: number | string;
  showWordmark?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

export default function PactopusLogo({
  height = 38,
  width = 'auto',
  showWordmark = true,
  className = '',
  style = {}
}: PactopusLogoProps) {
  return (
    <div
      className={`pactopus-adaptive-logo ${className}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.625rem',
        textDecoration: 'none',
        userSelect: 'none',
        ...style
      }}
    >
      {/* ── Dynamic Color-Adaptive Scholar Octopus SVG ───────────────── */}
      <svg
        viewBox="0 0 120 120"
        style={{
          height: typeof height === 'number' ? `${height}px` : height,
          width: typeof width === 'number' ? `${width}px` : width,
          aspectRatio: '1 / 1',
          overflow: 'visible',
          transition: 'transform 0.3s ease',
        }}
      >
        <defs>
          {/* Dynamic Glow Filter bound to the active network's brand colors */}
          <filter id="pactopusGlow" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>

          {/* Dynamic Linear Gradient using CSS Variables */}
          <linearGradient id="pactopusPrimaryGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="var(--brand, #00F0FF)" style={{ transition: 'stop-color 0.4s ease' }} />
            <stop offset="100%" stopColor="var(--brand-secondary, #FFA800)" style={{ transition: 'stop-color 0.4s ease' }} />
          </linearGradient>

          <linearGradient id="pactopusSecondaryGrad" x1="0%" y1="100%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="var(--brand-secondary, #FFA800)" style={{ transition: 'stop-color 0.4s ease' }} />
            <stop offset="100%" stopColor="var(--brand, #00F0FF)" style={{ transition: 'stop-color 0.4s ease' }} />
          </linearGradient>

          <linearGradient id="shieldGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="rgba(var(--brand-tertiary-rgb, 10, 20, 40), 0.85)" />
            <stop offset="100%" stopColor="rgba(5, 10, 20, 0.95)" />
          </linearGradient>
        </defs>

        {/* ── Background Aura ── */}
        <circle
          cx="60"
          cy="60"
          r="48"
          fill="none"
          stroke="url(#pactopusPrimaryGrad)"
          strokeWidth="1.5"
          strokeDasharray="4 6"
          opacity="0.4"
          style={{ transition: 'stroke 0.4s ease' }}
        />

        {/* ── TENTACLES (Flowing Mathematical Geometry) ── */}
        {/* Top-Left Tentacle */}
        <path
          d="M 46 36 C 30 24 16 32 20 46 C 24 58 38 60 44 72"
          fill="none"
          stroke="url(#pactopusPrimaryGrad)"
          strokeWidth="3.5"
          strokeLinecap="round"
          style={{ transition: 'stroke 0.4s ease' }}
        />
        <circle cx="20" cy="46" r="1.5" fill="var(--brand, #00F0FF)" />

        {/* Top-Right Tentacle */}
        <path
          d="M 74 36 C 90 24 104 32 100 46 C 96 58 82 60 76 72"
          fill="none"
          stroke="url(#pactopusSecondaryGrad)"
          strokeWidth="3.5"
          strokeLinecap="round"
          style={{ transition: 'stroke 0.4s ease' }}
        />
        <circle cx="100" cy="46" r="1.5" fill="var(--brand-secondary, #FFA800)" />

        {/* Mid-Left Tentacle wrapping Escrow Shield */}
        <path
          d="M 38 56 C 22 58 20 78 34 88 C 42 94 52 88 52 82"
          fill="none"
          stroke="url(#pactopusPrimaryGrad)"
          strokeWidth="3"
          strokeLinecap="round"
          style={{ transition: 'stroke 0.4s ease' }}
        />

        {/* Mid-Right Tentacle wrapping Escrow Shield */}
        <path
          d="M 82 56 C 98 58 100 78 86 88 C 78 94 68 88 68 82"
          fill="none"
          stroke="url(#pactopusSecondaryGrad)"
          strokeWidth="3"
          strokeLinecap="round"
          style={{ transition: 'stroke 0.4s ease' }}
        />

        {/* ── SCHOLAR OCTOPUS CROWN / HEAD ── */}
        <path
          d="M 60 18 C 50 18 45 28 48 42 C 50 48 56 52 60 54 C 64 52 70 48 72 42 C 75 28 70 18 60 18 Z"
          fill="url(#shieldGrad)"
          stroke="url(#pactopusPrimaryGrad)"
          strokeWidth="2.5"
          style={{ transition: 'stroke 0.4s ease, fill 0.4s ease' }}
        />

        {/* Scholar Academic Cap / Geometric Crest lines */}
        <path
          d="M 52 24 Q 60 20 68 24 L 60 32 Z"
          fill="none"
          stroke="url(#pactopusSecondaryGrad)"
          strokeWidth="1.5"
          opacity="0.85"
        />

        {/* Intelligent Cybernetic Eyes */}
        <circle cx="53" cy="38" r="2.2" fill="var(--brand, #00F0FF)" style={{ transition: 'fill 0.4s ease' }} />
        
        {/* Scholar Monocle on Right Eye */}
        <circle
          cx="67"
          cy="38"
          r="4.2"
          fill="none"
          stroke="var(--brand-secondary, #FFA800)"
          strokeWidth="1.8"
          filter="url(#pactopusGlow)"
          style={{ transition: 'stroke 0.4s ease' }}
        />
        <line x1="71" y1="40" x2="75" y2="48" stroke="var(--brand-secondary, #FFA800)" strokeWidth="1.2" />
        <circle cx="67" cy="38" r="1.8" fill="var(--brand-secondary, #FFA800)" />

        {/* ── ESCROW PACT SHIELD ── */}
        <polygon
          points="60,48 82,58 82,82 60,98 38,82 38,58"
          fill="url(#shieldGrad)"
          stroke="url(#pactopusPrimaryGrad)"
          strokeWidth="2.5"
          strokeLinejoin="round"
          style={{ transition: 'stroke 0.4s ease, fill 0.4s ease' }}
        />

        {/* Inner Shield Gold/Teal Inset */}
        <polygon
          points="60,53 77,61 77,80 60,93 43,80 43,61"
          fill="none"
          stroke="url(#pactopusSecondaryGrad)"
          strokeWidth="1.2"
          opacity="0.8"
          style={{ transition: 'stroke 0.4s ease' }}
        />

        {/* Central "P" Cryptographic Monogram */}
        <path
          d="M 56 66 L 63 66 C 67 66 68 68 68 71 C 68 74 67 76 63 76 L 56 76 Z M 56 66 L 56 82"
          fill="none"
          stroke="#FFFFFF"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Constellation Nodes */}
        <circle cx="60" cy="58" r="1.2" fill="var(--brand, #00F0FF)" />
        <circle cx="60" cy="88" r="1.2" fill="var(--brand-secondary, #FFA800)" />
      </svg>

      {/* ── Wordmark with Adaptive Gradient ──────────────────────────── */}
      {showWordmark && (
        <span
          style={{
            fontFamily: 'var(--font-display, "Space Grotesk", sans-serif)',
            fontSize: '1.25rem',
            fontWeight: 800,
            letterSpacing: '0.04em',
            display: 'inline-flex',
            alignItems: 'baseline',
          }}
        >
          <span style={{ color: 'var(--text-primary, #FFFFFF)' }}>Pact</span>
          <span
            style={{
              color: 'var(--brand, #00D2FF)',
              transition: 'color 0.4s ease',
              marginLeft: '1px',
            }}
          >
            opus
          </span>
        </span>
      )}
    </div>
  );
}
