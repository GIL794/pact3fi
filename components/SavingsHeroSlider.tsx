'use client';

import React, { useState } from 'react';

function formatGBP(n: number) {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    maximumFractionDigits: 0,
  }).format(n);
}

export default function SavingsHeroSlider() {
  const [monthly, setMonthly] = useState(5000);
  const MIN = 100;
  const MAX = 50000;
  const STEP = 100;

  const avgInvoice = 500;
  const invoicesPerMonth = Math.max(1, Math.round(monthly / avgInvoice));
  const stripeFixed = invoicesPerMonth * 0.3;
  const stripePct = monthly * 0.029;
  const stripeMonthly = stripeFixed + stripePct;
  const pactopusMonthly = monthly * 0.005;

  const savedMonth = Math.max(0, stripeMonthly - pactopusMonthly);
  const savedYear = savedMonth * 12;
  const saved3y = savedMonth * 36;
  const saved5y = savedMonth * 60;
  const saved10y = savedMonth * 120;

  const pct = ((monthly - MIN) / (MAX - MIN)) * 100;

  return (
    <div
      aria-label="Savings calculator"
      style={{
        maxWidth: 760,
        margin: '0 auto 2.75rem',
        padding: '1.5rem 1.75rem',
        borderRadius: 26,
        border: '1px solid rgba(255,255,255,0.08)',
        background:
          'linear-gradient(180deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.015) 100%)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        boxShadow: '0 1px 0 rgba(255,255,255,0.07) inset, 0 10px 40px rgba(0,0,0,0.3)',
        transition: 'transform 220ms cubic-bezier(.2,.8,.2,1), box-shadow 220ms ease',
      }}
      onMouseEnter={(e) => {
        const el = e.currentTarget as HTMLDivElement;
        el.style.transform = 'translateY(-3px)';
        el.style.boxShadow = '0 1px 0 rgba(255,255,255,0.09) inset, 0 18px 55px rgba(0,0,0,0.4)';
      }}
      onMouseLeave={(e) => {
        const el = e.currentTarget as HTMLDivElement;
        el.style.transform = 'translateY(0)';
        el.style.boxShadow = '0 1px 0 rgba(255,255,255,0.07) inset, 0 10px 40px rgba(0,0,0,0.3)';
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: '1rem',
          flexWrap: 'wrap',
          marginBottom: '1.25rem',
          rowGap: '0.75rem',
        }}
      >
        <div style={{ flex: '1 1 240px', minWidth: 0 }}>
          <p
            style={{
              fontSize: '0.72rem',
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              color: 'var(--accent-gold)',
              fontWeight: 700,
              margin: 0,
            }}
          >
            🐙 Ink-redible Savings Calculator
          </p>
          <h3
            id="savings-heading"
            style={{
              margin: '0.4rem 0 0',
              fontSize: '1.15rem',
              fontFamily: 'var(--font-display)',
              color: 'var(--text-primary)',
              fontWeight: 700,
              lineHeight: 1.3,
            }}
          >
            Move the sliders to see how much you save
          </h3>
          <p style={{ margin: '0.3rem 0 0', fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.45 }}>
            Slide the tentacle (or type) and watch how much you save vs the old-guard processors.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: '1 1 180px', justifyContent: 'flex-end', minWidth: 0 }}>
          <span
            style={{
              fontSize: '1rem',
              fontWeight: 700,
              color: 'var(--accent-gold)',
            }}
          >
            £
          </span>
          <input
            type="number"
            min={MIN}
            max={MAX}
            step={STEP}
            value={monthly}
            onChange={(e) => {
              const v = Number(e.target.value);
              if (!Number.isFinite(v)) return;
              setMonthly(Math.max(MIN, Math.min(MAX, Math.round(v / STEP) * STEP)));
            }}
            aria-label="Monthly invoiced amount in pounds"
            style={{
              width: 130,
              padding: '0.55rem 0.8rem',
              fontSize: '1.3rem',
              fontWeight: 800,
              fontFamily: 'var(--font-display)',
              color: 'var(--text-primary)',
              background: 'rgba(0,0,0,0.28)',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: 14,
              outline: 'none',
              textAlign: 'right',
              boxSizing: 'border-box',
              transition: 'border-color 180ms ease, box-shadow 180ms ease',
              fontVariantNumeric: 'tabular-nums',
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = 'rgba(var(--brand-rgb),0.5)';
              e.currentTarget.style.boxShadow = '0 0 0 3px rgba(var(--brand-rgb),0.12)';
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)';
              e.currentTarget.style.boxShadow = 'none';
            }}
          />
        </div>
      </div>

      <div style={{ position: 'relative', padding: '0.75rem 0 2rem' }}>
        <input
          id="savings-range"
          type="range"
          min={MIN}
          max={MAX}
          step={STEP}
          value={monthly}
          aria-labelledby="savings-heading"
          onChange={(e) => setMonthly(Number(e.target.value))}
          style={{
            width: '100%',
            WebkitAppearance: 'none',
            appearance: 'none',
            background: 'transparent',
            cursor: 'pointer',
            height: 32,
            ['--track-pct' as any]: `${pct}%`,
          } as React.CSSProperties}
        />

        <div
          aria-hidden
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            marginTop: '0.7rem',
            fontSize: '0.7rem',
            color: 'var(--text-muted)',
            letterSpacing: '0.04em',
            fontWeight: 600,
          }}
        >
          <span>🐚 £{MIN.toLocaleString()} (tide pool)</span>
          <span>🦑 £{MAX.toLocaleString()} (deep ocean)</span>
        </div>
      </div>

      <div
        style={{
          padding: '1.2rem 1.3rem',
          borderRadius: 18,
          background:
            'linear-gradient(135deg, rgba(250,176,78,0.13) 0%, rgba(255,119,87,0.09) 100%)',
          border: '1px solid rgba(250,176,78,0.25)',
          marginBottom: '1rem',
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06)',
        }}
      >
        <p
          style={{
            margin: 0,
            fontSize: '0.82rem',
            color: 'var(--text-secondary)',
            letterSpacing: '0.01em',
            lineHeight: 1.5,
          }}
        >
          You save <span style={{ color: 'var(--text-primary)', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{formatGBP(savedMonth)}/mo</span> vs
          Stripe (2.9% + 30p) on {invoicesPerMonth} invoice{invoicesPerMonth === 1 ? '' : 's'} of ~£{avgInvoice} — enough to treat all 3 hearts to something nice 💛❤️💙
        </p>
        <div
          style={{
            marginTop: '0.65rem',
            fontSize: '2.1rem',
            fontWeight: 800,
            fontFamily: 'var(--font-display)',
            lineHeight: 1.1,
            backgroundImage:
              'linear-gradient(135deg, var(--accent-gold) 0%, #ff9671 100%)',
            WebkitBackgroundClip: 'text',
            backgroundClip: 'text',
            color: 'transparent',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {formatGBP(savedYear)}{' '}
          <span style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-secondary)', WebkitTextFillColor: 'initial' }}>
            saved in 1 year — cha-ching 🐙💰
          </span>
        </div>
      </div>

      <div
        role="grid"
        className="future-grid"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: '0.75rem',
          flexDirection: 'row',
          flexWrap: 'wrap',
        }}
      >
        {[
          { label: '3 years', value: saved3y, accent: '🐚' },
          { label: '5 years', value: saved5y, highlight: true, accent: '🦑' },
          { label: '10 years', value: saved10y, accent: '🐋' },
        ].map((row) => (
          <div
            key={row.label}
            role="gridcell"
            style={{
              padding: '1rem 0.85rem',
              borderRadius: 18,
              border: row.highlight
                ? '1px solid rgba(250,176,78,0.28)'
                : '1px solid rgba(255,255,255,0.07)',
              backgroundColor: row.highlight
                ? 'transparent'
                : 'rgba(255,255,255,0.025)',
              backgroundImage: row.highlight
                ? 'linear-gradient(180deg, rgba(250,176,78,0.09) 0%, rgba(255,255,255,0.02) 100%)'
                : 'none',
              textAlign: 'center',
              boxShadow: row.highlight
                ? 'inset 0 1px 0 rgba(255,255,255,0.06)'
                : 'inset 0 1px 0 rgba(255,255,255,0.04)',
              transition: 'transform 220ms cubic-bezier(.2,.8,.2,1)',
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-3px)'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.transform = 'translateY(0)'; }}
          >
            <div
              style={{
                fontSize: '0.68rem',
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                color: 'var(--text-muted)',
                marginBottom: '0.35rem',
                fontWeight: 700,
              }}
            >
              {row.accent} {row.label}
            </div>
            <div
              style={{
                fontSize: '1.2rem',
                fontWeight: 800,
                fontFamily: 'var(--font-display)',
                color: row.highlight ? 'var(--accent-gold)' : 'var(--text-primary)',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {formatGBP(row.value)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
