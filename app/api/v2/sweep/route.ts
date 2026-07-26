import { NextRequest, NextResponse } from 'next/server';
import { ethers } from 'ethers';
import { CONTRACTS, ERC20_ABI } from '@/lib/arc';

const ARC_RPC_URL = process.env.NEXT_PUBLIC_ARC_RPC_URL || 'https://testnet.arc.eco/rpc';

// ERC-4626 Vault minimal ABI
const VAULT_ABI = [
  ...ERC20_ABI,
  'function deposit(uint256 assets, address receiver) returns (uint256 shares)',
  'function balanceOf(address owner) view returns (uint256)',
];

// Mock Yield Vault address on Arc Testnet
const YIELD_VAULT_ADDRESS = '0x2272dE9f3c7fa6e0000000000000000000000000';

export async function POST(request: NextRequest) {
  try {
    const key = process.env.ARC_AGENT_PRIVATE_KEY;
    if (!key) {
      return NextResponse.json({ error: 'Configuration Error', message: 'Agent private key not configured.' }, { status: 500 });
    }

    const provider = new ethers.JsonRpcProvider(ARC_RPC_URL);
    const signer = new ethers.Wallet(key, provider);

    const usdc = new ethers.Contract(CONTRACTS.USDC, VAULT_ABI, signer);
    const vault = new ethers.Contract(YIELD_VAULT_ADDRESS, VAULT_ABI, signer);

    // 1. Get current agent balance
    const balanceRaw = await usdc.balanceOf(signer.address);
    const balance = parseFloat(ethers.formatUnits(balanceRaw, 6));

    // Keep a reserve threshold of 100.00 USDC for transaction gas and liquidity
    const reserveThreshold = 100.00;
    
    if (balance <= reserveThreshold) {
      return NextResponse.json({
        status: 'skipped',
        message: `Agent balance (${balance} USDC) is below the sweep threshold (${reserveThreshold} USDC). No action taken.`
      }, { status: 200 });
    }

    const sweepAmount = balance - reserveThreshold;
    const sweepAmountRaw = ethers.parseUnits(sweepAmount.toFixed(6), 6);

    console.log(`[Yield Sweep] Sweeping ${sweepAmount} USDC from ${signer.address} to Vault...`);

    // 2. Approve Vault to pull USDC tokens
    const approveTx = await usdc.approve(YIELD_VAULT_ADDRESS, sweepAmountRaw);
    await approveTx.wait();

    // 3. Deposit USDC tokens into the Yield Vault
    const depositTx = await vault.deposit(sweepAmountRaw, signer.address);
    const receipt = await depositTx.wait();

    return NextResponse.json({
      status: 'success',
      sweptAmount: sweepAmount.toFixed(6),
      txHash: receipt?.hash || '',
      vault: YIELD_VAULT_ADDRESS,
      message: `Successfully swept ${sweepAmount.toFixed(6)} USDC into the yield vault on Arc.`
    }, { status: 200 });
  } catch (err: any) {
    const errMsg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: errMsg || 'Yield sweep execution failed' }, { status: 500 });
  }
}
