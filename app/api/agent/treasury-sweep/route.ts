import { NextRequest, NextResponse } from 'next/server';
import { ethers } from 'ethers';
import { CONTRACTS } from '@/lib/arc';
import { createCircleSigner, approveAndDepositToVaultERC4626 } from '@/lib/circle-wallet-kit';
import { sponsorGasForUserOp, PAYMASTER_CONFIG } from '@/lib/paymaster-kit';

const ARC_RPC_URL = process.env.NEXT_PUBLIC_ARC_RPC_URL || 'https://testnet.arc.eco/rpc';

const VAULT_ABI = [
  'function deposit(uint256 assets, address receiver) returns (uint256 shares)',
  'function balanceOf(address owner) view returns (uint256)',
];

const YIELD_VAULT_ADDRESS = '0x2272dE9f3c7fa6e0000000000000000000000000';

export async function POST(request: NextRequest) {
  try {
    const key = process.env.ARC_AGENT_PRIVATE_KEY;
    if (!key) {
      const hint = process.env.NODE_ENV === 'production'
        ? 'Set ARC_AGENT_PRIVATE_KEY in Vercel Project → Environment Variables. Re-deploy after setting.'
        : 'Set ARC_AGENT_PRIVATE_KEY in .env.local then restart dev server.';
      return NextResponse.json(
        {
          status: 'skipped',
          error: 'Agent private key not configured.',
          hint,
          remediation: 'https://github.com/coinbase/agentkit/blob/main/README.md → Arc wallet export',
        },
        { status: 424 }
      );
    }

    const signer = await createCircleSigner({ privateKey: key, blockchain: 'ARC-TESTNET' });

    const timeoutMs = 15_000;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    let providerBalance: { ok: boolean; balanceRaw?: bigint; err?: Error } | null = null;
    try {
      const provider = new ethers.JsonRpcProvider(ARC_RPC_URL);
      const usdcBalanceContract = new ethers.Contract(CONTRACTS.USDC, ['function balanceOf(address owner) view returns (uint256)'], provider);
      const balancePromise = (async () => {
        try {
          const balanceRaw = await usdcBalanceContract.balanceOf(signer.address);
          return { ok: true as const, balanceRaw: balanceRaw as bigint };
        } catch (e) { return { ok: false as const, err: e instanceof Error ? e : new Error(String(e)) }; }
      })();
      const timeoutPromise = new Promise<{ok:false;err:Error}>((_, reject) => {
        controller.signal.addEventListener('abort', () => reject(new Error(`Treasury sweep RPC timed out after ${timeoutMs}ms`)));
      });
      providerBalance = await Promise.race([balancePromise, timeoutPromise]) as any;
    } catch (err) {
      providerBalance = { ok: false, err: err instanceof Error ? err : new Error(String(err)) };
    } finally {
      clearTimeout(timeoutId);
    }
    if (!providerBalance || !providerBalance.ok) {
      return NextResponse.json(
        {
          status: 'skipped',
          error: providerBalance?.err?.message || 'Could not read agent balance via RPC.',
          hint: 'Verify ARC_RPC_URL is reachable and the Arc Testnet chain is live.',
        },
        { status: 424 }
      );
    }
    const balance = parseFloat(ethers.formatUnits(providerBalance.balanceRaw!, 6));

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

    console.log(`[Yield Sweep] Recording paymaster gas sponsorship for treasury sweep user op...`);
    const depositCallDataHex = ethers.hexlify(ethers.toUtf8Bytes(`deposit:${sweepAmountRaw.toString()}:${signer.address}`));
    const sponsoredSweepOp = await sponsorGasForUserOp({
      sender: signer.address,
      nonce: BigInt(0),
      callData: depositCallDataHex,
      callGasLimit: BigInt(500000),
    });
    console.log(`[Yield Sweep] Paymaster sponsorship recorded. Sponsorship hash: ${sponsoredSweepOp.sponsorshipHash}`);

    console.log(`[Yield Sweep] Executing approve + deposit to ERC-4626 vault via Circle wallet kit...`);
    const depositTx = await approveAndDepositToVaultERC4626(
      signer,
      CONTRACTS.USDC,
      YIELD_VAULT_ADDRESS,
      sweepAmountRaw
    );
    console.log(`[Yield Sweep] Deposit transaction submitted: ${depositTx.hash}`);

    const receipt = await depositTx.wait();

    return NextResponse.json({
      status: 'success',
      sweptAmount: sweepAmount.toFixed(6),
      txHash: receipt?.hash || depositTx.hash,
      vault: YIELD_VAULT_ADDRESS,
      message: `Successfully swept ${sweepAmount.toFixed(6)} USDC into the yield vault on Arc.`
    }, { status: 200 });
  } catch (err: any) {
    const errMsg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: errMsg || 'Yield sweep execution failed' }, { status: 500 });
  }
}
