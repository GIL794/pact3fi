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
      className="savings-card noise-overlay"
      aria-label="Savings calculator"
    >
      <header className="savings-head">
        <div className="savings-head-copy">
          <p className="savings-kicker">🐙 Ink-redible Savings Calculator</p>
          <h3 className="savings-title" id="savings-heading">
            Move the sliders to see how much you save
          </h3>
          <p className="savings-sub">
            Slide the tentacle (or type) and watch how much you save vs the old-guard processors.
          </p>
        </div>
        <div className="savings-head-amount">
          <span className="savings-amount-symbol">£</span>
          <input
            className="savings-amount-input"
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
          />
        </div>
      </header>

      <div className="savings-slider-wrap">
        <input
          className="savings-slider"
          id="savings-range"
          type="range"
          min={MIN}
          max={MAX}
          step={STEP}
          value={monthly}
          aria-labelledby="savings-heading"
          onChange={(e) => setMonthly(Number(e.target.value))}
          style={{ ['--track-pct' as any]: `${pct}%` } as React.CSSProperties}
        />
        <div className="savings-axis" aria-hidden>
          <span>🐚 £{MIN.toLocaleString()} (tide pool)</span>
          <span>🦑 £{MAX.toLocaleString()} (deep ocean)</span>
        </div>
      </div>

      <div className="savings-highlight">
        <p className="savings-highlight-copy">
          You save{' '}
          <strong>{formatGBP(savedMonth)}/mo</strong> vs Stripe (2.9% + 30p) on{' '}
          {invoicesPerMonth} invoice{invoicesPerMonth === 1 ? '' : 's'} of ~£
          {avgInvoice} — enough to treat all 3 hearts to something nice 💛❤️💙
        </p>
        <div className="savings-year-total">
          <span className="amount">{formatGBP(savedYear)}</span>
          <span className="suffix">saved in 1 year — cha-ching 🐙💰</span>
        </div>
      </div>

      <div
        className="savings-future-grid"
        role="grid"
        aria-label="Projected savings over 3, 5, and 10 years"
      >
        {[
          { label: '3 years', value: saved3y, accent: '🐚' },
          { label: '5 years', value: saved5y, highlight: true, accent: '🦑' },
          { label: '10 years', value: saved10y, accent: '🐋' },
        ].map((row) => (
          <div
            key={row.label}
            role="gridcell"
            className={`savings-future-cell${row.highlight ? ' highlight' : ''}`}
          >
            <div className="savings-future-label">
              {row.accent} {row.label}
            </div>
            <div className="savings-future-value">{formatGBP(row.value)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
