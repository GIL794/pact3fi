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
      return NextResponse.json({ error: 'Configuration Error', message: 'Agent private key not configured.' }, { status: 500 });
    }

    const signer = await createCircleSigner({ privateKey: key, blockchain: 'ARC-TESTNET' });

    const provider = new ethers.JsonRpcProvider(ARC_RPC_URL);
    const usdcBalanceContract = new ethers.Contract(CONTRACTS.USDC, ['function balanceOf(address owner) view returns (uint256)'], provider);

    const balanceRaw = await usdcBalanceContract.balanceOf(signer.address);
    const balance = parseFloat(ethers.formatUnits(balanceRaw, 6));

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
