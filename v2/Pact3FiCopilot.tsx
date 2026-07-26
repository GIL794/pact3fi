'use client';

import { useState } from 'react';

interface Pact3FiCopilotProps {
  onFillForm: (data: {
    amount: string;
    currency: 'USDC' | 'EURC';
    description: string;
    recipientAddress: string;
    recipientName: string;
  }) => void;
  currentForm: {
    amount: string;
    currency: 'USDC' | 'EURC';
    description: string;
    recipientAddress: string;
    recipientName: string;
  };
}

export default function Pact3FiCopilot({ onFillForm, currentForm }: Pact3FiCopilotProps) {
  const [input, setInput] = useState('');
  const [status, setStatus] = useState<'idle' | 'parsing' | 'success'>('idle');
  const [logs, setLogs] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<'copilot' | 'comms' | 'explain'>('copilot');

  const handleCommandSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

    setStatus('parsing');
    setLogs([]);

    const logSteps = [
      '⚡ Starting Pact3Fi AI Copilot…',
      '🔍 Analyzing natural language input…',
      '🤖 Parsing intent: CREATE_INVOICE',
      '📦 Extracting invoice parameters…',
    ];

    let currentStep = 0;
    const interval = setInterval(() => {
      if (currentStep < logSteps.length) {
        setLogs(prev => [...prev, logSteps[currentStep]]);
        currentStep++;
      } else {
        clearInterval(interval);
        
        // Simple NLP regex parsing
        const lowercaseInput = input.toLowerCase();
        
        // Match amount (digits, optional decimals)
        const amountMatch = input.match(/(\d+([.,]\d{1,2})?)/);
        const amount = amountMatch ? amountMatch[1].replace(',', '.') : '';

        // Match currency
        let currency: 'USDC' | 'EURC' = 'USDC';
        if (lowercaseInput.includes('eur') || lowercaseInput.includes('eurc') || lowercaseInput.includes('euro')) {
          currency = 'EURC';
        }

        // Match address (0x...)
        const addressMatch = input.match(/(0x[a-fA-F0-9]{40})/);
        const recipientAddress = addressMatch ? addressMatch[1] : '';

        // Match description (look for terms like "for", "service", "work")
        let description = 'Consulting Services';
        if (lowercaseInput.includes('for ')) {
          const parts = input.split(/for /i);
          if (parts[1]) {
            // Take the text until the next connector (to, at, address)
            description = parts[1].split(/to |at |address |0x/i)[0].trim();
            // Capitalize first letter
            description = description.charAt(0).toUpperCase() + description.slice(1);
          }
        }

        // Match recipient name (look for "to [Name]", "recipient [Name]")
        let recipientName = '';
        if (lowercaseInput.includes('to ')) {
          const parts = input.split(/to /i);
          if (parts[1]) {
            recipientName = parts[1].split(/for |at |address |0x/i)[0].trim();
            recipientName = recipientName.charAt(0).toUpperCase() + recipientName.slice(1);
          }
        } else if (lowercaseInput.includes('client ')) {
          const parts = input.split(/client /i);
          if (parts[1]) {
            recipientName = parts[1].split(/for |at |address |0x/i)[0].trim();
            recipientName = recipientName.charAt(0).toUpperCase() + recipientName.slice(1);
          }
        }

        // Trigger parent state updates
        onFillForm({
          amount,
          currency,
          description,
          recipientAddress,
          recipientName,
        });

        setLogs(prev => [
          ...prev,
          `✅ Parsed parameters:`,
          `   • Amount: ${amount || 'unknown'}`,
          `   • Currency: ${currency}`,
          `   • Description: "${description}"`,
          `   • Recipient Name: "${recipientName || 'Not specified'}"`,
          `   • Target Wallet: ${recipientAddress ? recipientAddress.slice(0, 10) + '…' : 'None detected'}`,
          `🎉 Form auto-filled successfully!`,
        ]);
        setStatus('success');
      }
    }, 600);
  };

  // Generate billing communications based on current form
  const getCommsDrafts = () => {
    const amt = currentForm.amount || '0.00';
    const curr = currentForm.currency;
    const desc = currentForm.description || 'services rendered';
    const client = currentForm.recipientName || 'Client';

    const invoiceUrl = 'https://pact3fi.com/pay/demo-id'; // placeholder URL representing what is generated

    return {
      email: {
        subject: `Payment Request: ${desc} (${amt} ${curr})`,
        body: `Dear ${client},\n\nI hope you are well.\n\nThis is a request for payment regarding the following work: "${desc}".\n\nYou can pay this invoice securely in stablecoins using the link below:\n👉 ${invoiceUrl}\n\nStablecoin payments settle instantly on the Arc network with extremely low transaction fees. Please let me know if you have any questions.\n\nBest regards,\n[Your Name]`,
      },
      slack: `Hi ${client}, here is the payment link for the "${desc}" (${amt} ${curr}): ${invoiceUrl} ⚡ Thanks!`,
      whatsapp: `Hello! Here's the secure link to pay the invoice for "${desc}" (${amt} ${curr}) via stablecoins: ${invoiceUrl} Settle in under 1 second!`,
    };
  };

  const getStablecoinExplain = () => {
    return {
      intro: "What are stablecoins?",
      body: "Stablecoins are digital currencies pegged 1:1 to traditional assets like the US Dollar (USDC) or Euro (EURC). Unlike Bitcoin, they are non-volatile and maintain a stable value.",
      benefits: [
        "Instant settlement: Transactions confirm on the Arc network in less than 1 second.",
        "6× cheaper: Pact3Fi charges only a 0.5% fee compared to 2.9% + fixed costs for Stripe/PayPal.",
        "Non-custodial: Payments flow directly from client to freelancer wallet — no third-party hold.",
        "Global: Clients can pay internationally without bank delays, exchange rate surcharges, or SWIFT fees."
      ]
    };
  };

  const drafts = getCommsDrafts();
  const explainer = getStablecoinExplain();

  return (
    <div className="card" style={{ background: 'rgba(13, 21, 37, 0.4)', borderColor: 'var(--border)', minHeight: 460, display: 'flex', flexDirection: 'column' }}>
      {/* Header Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border-subtle)', marginBottom: '1.25rem' }}>
        {[
          { id: 'copilot' as const, label: '🤖 AI Copilot' },
          { id: 'comms' as const, label: '✉️ Billing Comms' },
          { id: 'explain' as const, label: '💡 Stablecoin FAQ' },
        ].map(tab => (
          <button
             key={tab.id}
             onClick={() => setActiveTab(tab.id)}
             style={{
               flex: 1,
               padding: '0.75rem 0.5rem',
               background: 'none',
               border: 'none',
               borderBottom: activeTab === tab.id ? '2px solid var(--accent-cyan)' : '2px solid transparent',
               color: activeTab === tab.id ? 'var(--text-primary)' : 'var(--text-muted)',
               fontWeight: activeTab === tab.id ? 600 : 400,
               fontSize: '0.8125rem',
               cursor: 'pointer',
               transition: 'all 0.2s',
             }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'copilot' && (
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
          <p className="label" style={{ color: 'var(--accent-cyan)', marginBottom: '0.5rem' }}>Billing Agent Assistant</p>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.8125rem', marginBottom: '1.25rem', lineHeight: 1.5 }}>
            Type your billing request in plain English. The AI agent will parse the amount, description, currency, and recipient to autofill your form!
          </p>

          <form onSubmit={handleCommandSubmit} style={{ marginBottom: '1rem' }}>
            <textarea
              className="input"
              style={{
                width: '100%',
                height: 70,
                resize: 'none',
                fontSize: '0.875rem',
                padding: '0.75rem',
                marginBottom: '0.75rem',
                background: 'rgba(0,0,0,0.2)',
              }}
              placeholder="Example: Create an invoice to Circle for 500 USDC for smart contract review work..."
              value={input}
              onChange={e => setInput(e.target.value)}
            />
            <button
              type="submit"
              className="btn btn-primary btn-sm btn-full"
              disabled={status === 'parsing'}
              id="autofill-billing-assistant-btn"
            >
              {status === 'parsing' ? '⚡ Parsing request…' : '🤖 Parse and Auto-fill'}
            </button>
          </form>

          {/* Terminal Console Output */}
          <div style={{
            flex: 1,
            background: '#040711',
            borderRadius: 'var(--radius-md)',
            border: '1px solid rgba(255,255,255,0.05)',
            padding: '0.875rem',
            fontFamily: 'monospace',
            fontSize: '0.75rem',
            color: '#a5f3fc',
            overflowY: 'auto',
            maxHeight: 180,
            lineHeight: 1.5,
          }}>
            {logs.length === 0 ? (
              <span style={{ color: 'rgba(255,255,255,0.25)' }}>&gt; Billing Agent output console ready...</span>
            ) : (
              logs.map((log, index) => (
                <div key={index} style={{ whiteSpace: 'pre-wrap' }}>
                  {log}
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {activeTab === 'comms' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', flex: 1 }}>
          <p className="label" style={{ color: 'var(--accent-purple)', marginBottom: '0.25rem' }}>Client billing communication</p>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.8125rem', lineHeight: 1.4 }}>
            Generate messages to share your payment request. Pact3Fi prepares these automatically using your current invoice details.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem', overflowY: 'auto', maxHeight: 300, paddingRight: '0.25rem' }}>
            {/* Email draft */}
            <div className="card-flat" style={{ background: 'rgba(255,255,255,0.02)', padding: '0.75rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--accent-purple)' }}>📧 Email Template</span>
                <button
                  className="btn btn-ghost btn-sm"
                  style={{ fontSize: '0.6875rem', padding: '2px 6px' }}
                  onClick={() => navigator.clipboard.writeText(`Subject: ${drafts.email.subject}\n\n${drafts.email.body}`)}
                >
                  Copy
                </button>
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontFamily: 'monospace', whiteSpace: 'pre-wrap', maxHeight: 110, overflowY: 'auto', background: 'rgba(0,0,0,0.15)', padding: '0.5rem', borderRadius: '4px' }}>
                <strong>Subject:</strong> {drafts.email.subject}<br /><br />
                {drafts.email.body}
              </div>
            </div>

            {/* Slack draft */}
            <div className="card-flat" style={{ background: 'rgba(255,255,255,0.02)', padding: '0.75rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--accent-cyan)' }}>💬 Slack / Discord</span>
                <button
                  className="btn btn-ghost btn-sm"
                  style={{ fontSize: '0.6875rem', padding: '2px 6px' }}
                  onClick={() => navigator.clipboard.writeText(drafts.slack)}
                >
                  Copy
                </button>
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontFamily: 'monospace', background: 'rgba(0,0,0,0.15)', padding: '0.5rem', borderRadius: '4px' }}>
                {drafts.slack}
              </div>
            </div>

            {/* Whatsapp draft */}
            <div className="card-flat" style={{ background: 'rgba(255,255,255,0.02)', padding: '0.75rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--accent-green)' }}>📱 WhatsApp / Telegram</span>
                <button
                  className="btn btn-ghost btn-sm"
                  style={{ fontSize: '0.6875rem', padding: '2px 6px' }}
                  onClick={() => navigator.clipboard.writeText(drafts.whatsapp)}
                >
                  Copy
                </button>
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontFamily: 'monospace', background: 'rgba(0,0,0,0.15)', padding: '0.5rem', borderRadius: '4px' }}>
                {drafts.whatsapp}
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'explain' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', flex: 1, overflowY: 'auto', maxHeight: 380 }}>
          <p className="label" style={{ color: 'var(--accent-green)', marginBottom: '0.25rem' }}>Circle Stablecoins Explanation</p>
          <h4 style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--text-primary)' }}>{explainer.intro}</h4>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.8125rem', lineHeight: 1.5 }}>
            {explainer.body}
          </p>
          <div className="divider" style={{ margin: '0.5rem 0' }} />
          <p style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--accent-green)' }}>Key Benefits for your Client:</p>
          <ul style={{ paddingLeft: '1.25rem', margin: 0, fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {explainer.benefits.map((benefit, index) => (
              <li key={index} style={{ lineHeight: 1.4 }}>
                {benefit}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
