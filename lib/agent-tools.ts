import { z } from 'zod';
import { ethers } from 'ethers';
import { CONTRACTS, PLATFORM_WALLET, ERC20_ABI, parseTokenAmount, PLATFORM_FEE_BPS } from './arc';

const ARC_RPC_URL = process.env.NEXT_PUBLIC_ARC_RPC_URL || 'https://testnet.arc.eco/rpc';

export const pact3fiAgentTools = {
  /**
   * Tool to create an invoice autonomously.
   * If the endpoint requires HTTP 402 nanopayment, the agent wallet signs and pays the fee.
   */
  createInvoiceTool: {
    description: 'Creates a stablecoin invoice request on Pact3Fi, paying the HTTP 402 fee autonomously on Arc L1.',
    parameters: z.object({
      amount: z.string().describe('The invoice amount (e.g. "250.00")'),
      currency: z.enum(['USDC', 'EURC']).describe('Token currency type'),
      description: z.string().describe('Description of the work done'),
      recipientAddress: z.string().describe('Wallet address to receive funds'),
      recipientName: z.string().optional().describe('Payee name'),
      agentPrivateKey: z.string().describe('Private key of the agent wallet to sign nanopayments'),
      apiBaseUrl: z.string().optional().default('http://localhost:3000').describe('Pact3Fi API base URL'),
    }),
    execute: async ({ amount, currency, description, recipientAddress, recipientName, agentPrivateKey, apiBaseUrl }: any) => {
      try {
        const payload = { amount, currency, description, recipientAddress, recipientName };
        
        // 1. Initial attempt to create invoice
        const res = await fetch(`${apiBaseUrl}/api/v2/invoices`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        // 2. Handle HTTP 402 Payment Required
        if (res.status === 402) {
          const payDetails = await res.json();
          const target = payDetails.paymentTarget || PLATFORM_WALLET;
          const assetAddress = payDetails.paymentAsset || CONTRACTS.USDC;
          const payAmount = payDetails.paymentAmount || '0.05';

          console.log(`[Pact3Fi Agent] HTTP 402 Received. Paying ${payAmount} USDC nanopayment on Arc to ${target}...`);

          // Setup Ethers provider and signer
          const provider = new ethers.JsonRpcProvider(ARC_RPC_URL);
          const signer = new ethers.Wallet(agentPrivateKey, provider);
          
          // Construct token transfer contract instance
          const token = new ethers.Contract(assetAddress, ERC20_ABI, signer);
          const rawAmount = parseTokenAmount(payAmount, 6);

          // Submit the transfer transaction
          const tx = await token.transfer(target, rawAmount);
          console.log(`[Pact3Fi Agent] Nanopayment transaction submitted: ${tx.hash}`);
          
          // Wait for block finality
          await tx.wait();
          console.log(`[Pact3Fi Agent] Nanopayment transaction confirmed.`);

          // 3. Retry invoice creation with transaction hash
          const retryRes = await fetch(`${apiBaseUrl}/api/v2/invoices`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              ...payload,
              txHash: tx.hash,
            }),
          });

          if (!retryRes.ok) {
            const errorData = await retryRes.json();
            throw new Error(errorData.message || 'Nanopayment retry verification failed');
          }

          const retryData = await retryRes.json();
          return {
            status: 'success',
            invoice: retryData.invoice,
            txHash: tx.hash,
            message: 'Invoice created successfully after verifying Arc L1 nanopayment.',
          };
        }

        if (!res.ok) {
          const errorData = await res.json();
          throw new Error(errorData.error || 'Failed to create invoice');
        }

        const data = await res.json();
        return {
          status: 'success',
          invoice: data.invoice,
          message: 'Invoice created successfully without required payment.',
        };
      } catch (err: any) {
        return {
          status: 'failed',
          error: err.message || 'Invoice creation failed',
        };
      }
    },
  },

  /**
   * Tool to pay a pending invoice, executing both net amount and fee transfers on-chain.
   */
  payInvoiceTool: {
    description: 'Pays a Pact3Fi invoice autonomously, routing both recipient payout and platform fee on-chain.',
    parameters: z.object({
      invoiceId: z.string().describe('The ID of the invoice to pay'),
      agentPrivateKey: z.string().describe('Private key of the payer agent wallet'),
      apiBaseUrl: z.string().optional().default('http://localhost:3000').describe('Pact3Fi API base URL'),
    }),
    execute: async ({ invoiceId, agentPrivateKey, apiBaseUrl }: any) => {
      try {
        // 1. Fetch invoice details
        const invoiceRes = await fetch(`${apiBaseUrl}/api/invoices/${invoiceId}`);
        if (!invoiceRes.ok) throw new Error('Invoice not found');
        const { invoice } = await invoiceRes.json();

        if (invoice.status === 'paid') {
          return { status: 'success', message: 'Invoice was already paid.' };
        }

        // Setup Ethers
        const provider = new ethers.JsonRpcProvider(ARC_RPC_URL);
        const signer = new ethers.Wallet(agentPrivateKey, provider);

        const assetAddress = invoice.currency === 'USDC' ? CONTRACTS.USDC : CONTRACTS.EURC;
        const token = new ethers.Contract(assetAddress, ERC20_ABI, signer);

        const rawAmount = parseTokenAmount(invoice.amount, 6);
        const feeRaw = (rawAmount * BigInt(PLATFORM_FEE_BPS)) / BigInt(10000);
        const netRaw = rawAmount - feeRaw;

        console.log(`[Pact3Fi Agent] Transferring net amount ${ethers.formatUnits(netRaw, 6)} ${invoice.currency} to payee...`);
        // Transfer 1: Payee payout
        const payoutTx = await token.transfer(invoice.recipientAddress, netRaw);
        console.log(`[Pact3Fi Agent] Payout Tx Hash: ${payoutTx.hash}`);

        console.log(`[Pact3Fi Agent] Transferring fee amount ${ethers.formatUnits(feeRaw, 6)} ${invoice.currency} to platform...`);
        // Transfer 2: Platform fee transfer
        const feeTx = await token.transfer(PLATFORM_WALLET, feeRaw);
        console.log(`[Pact3Fi Agent] Fee Tx Hash: ${feeTx.hash}`);

        // Wait for finalities
        await payoutTx.wait();
        await feeTx.wait();

        // 2. Submit payment confirmation to backend
        const confirmRes = await fetch(`${apiBaseUrl}/api/pay`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            invoiceId,
            txHash: payoutTx.hash,
            payerAddress: signer.address,
          }),
        });

        if (!confirmRes.ok) {
          const confirmErr = await confirmRes.json();
          throw new Error(confirmErr.error || 'Server validation of invoice payment failed');
        }

        const confirmData = await confirmRes.json();
        return {
          status: 'success',
          txHash: payoutTx.hash,
          feeTxHash: feeTx.hash,
          invoice: confirmData.invoice,
          message: `Successfully paid invoice ${invoiceId} and distributed fee on-chain.`,
        };
      } catch (err: any) {
        return {
          status: 'failed',
          error: err.message || 'Payment execution failed',
        };
      }
    },
  },
};
