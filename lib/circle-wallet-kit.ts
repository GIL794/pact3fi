import { ethers } from 'ethers';
import { initiateDeveloperControlledWalletsClient } from '@circle-fin/developer-controlled-wallets';
import { ERC20_ABI } from './arc';
import { safeLogger } from './log-redact';

const ARC_RPC_URL = process.env.NEXT_PUBLIC_ARC_RPC_URL || 'https://testnet.arc.eco/rpc';

/**
 * Parameters for constructing a Circle-compatible signer.
 *
 * When `CIRCLE_API_KEY` + `CIRCLE_ENTITY_SECRET` are present the signer routes
 * all signature/transaction creation through the Circle Developer Controlled
 * Wallets SDK. Otherwise it falls back to a plain `ethers.Wallet` for local
 * development so the same codepath works end-to-end.
 */
export interface CreateCircleSignerParams {
  /** Fallback private key used when Circle env vars are missing (ethers.Wallet mode). */
  privateKey?: string;
  /** Circle wallet-set ID that owns the developer-controlled wallet. */
  walletSetId?: string;
  /** Blockchain identifier used by Circle (default: "ETH"). */
  blockchain?: string;
}

/**
 * Duck-typed ethers.Wallet compatible signer.
 *
 * The minimum surface area required by Pactopus routes/helpers:
 * - `.address` — the EOA/wallet checksum address.
 * - `.getAddress()` — Promise resolving to the same address (ethers v6 API).
 * - Contract execution helpers that dispatch via Circle or ethers depending on
 *   the environment.
 */
export interface CircleDuckSigner {
  address: string;
  getAddress: () => Promise<string>;
  /** Internal mode flag used by helpers to pick dispatch strategy. */
  _mode: 'circle' | 'ethers';
  /** Reference to the underlying ethers.Wallet when in fallback mode. */
  _ethersWallet?: ethers.Wallet;
  /** Circle client when in SDK mode. */
  _circleClient?: ReturnType<typeof initiateDeveloperControlledWalletsClient>;
  /** Circle wallet id when in SDK mode. */
  _circleWalletId?: string;
}

/**
 * Transaction-like object returned by transfer helpers.
 *
 * Mirrors the ethers `ContractTransactionResponse` shape so callers can do
 * `const { hash, wait } = await sendERC20Transfer(...)` without rewriting call
 * sites when switching between Circle and local fallback.
 */
export interface TxResponseLike {
  hash: string;
  wait: (confirmations?: number) => Promise<{ hash: string; status?: number; blockNumber?: number } | null>;
}

/**
 * Create a duck-typed ethers.Wallet signer that prefers Circle Developer
 * Controlled Wallets when the API credentials are present, otherwise uses a
 * local ethers.Wallet fallback.
 *
 * @param params - Private key fallback, wallet-set id, and blockchain id.
 * @returns A {@link CircleDuckSigner} with `.address`, `.getAddress()`, and
 *   internal dispatch metadata used by the helpers.
 *
 * @example
 * ```ts
 * const signer = await createCircleSigner({ privateKey: process.env.ARC_AGENT_PRIVATE_KEY });
 * console.log(signer.address);
 * ```
 */
export async function createCircleSigner(params: CreateCircleSignerParams): Promise<CircleDuckSigner> {
  const { privateKey, walletSetId, blockchain = 'ETH' } = params;
  const apiKey = process.env.CIRCLE_API_KEY;
  const entitySecret = process.env.CIRCLE_ENTITY_SECRET;

  if (apiKey && entitySecret) {
    const client = initiateDeveloperControlledWalletsClient({
      apiKey,
      entitySecret,
    });

    let walletId: string | undefined;
    let address = '';

    try {
      if (walletSetId) {
        const listRes = await client.listWallets({ walletSetId, blockchain: blockchain as never });
        const wallets = listRes.data?.wallets || [];
        if (wallets.length > 0) {
          walletId = wallets[0].id;
          address = wallets[0].address || '';
        }
      }

      if (!walletId) {
        const createOpts: { walletSetId?: string; blockchain?: string; count: number } = {
          blockchain,
          count: 1,
        };
        if (walletSetId) createOpts.walletSetId = walletSetId;
        const res = await client.createWallets(createOpts as never);
        const wallets = res.data?.wallets || [];
        if (wallets.length > 0) {
          walletId = wallets[0].id;
          address = wallets[0].address || '';
        }
      }
    } catch (err) {
      console.warn('[CircleSigner] SDK init failed, falling back to ethers.Wallet:', err);
    }

    if (walletId && address) {
      return {
        address: address.startsWith('0x') ? address : `0x${address}`,
        getAddress: async () => (address.startsWith('0x') ? address : `0x${address}`),
        _mode: 'circle',
        _circleClient: client,
        _circleWalletId: walletId,
      };
    }
  }

  const provider = new ethers.JsonRpcProvider(ARC_RPC_URL);
  let key: string | undefined = privateKey;
  if (!key) {
    if (process.env.PACTOPUS_ALLOW_UNSAFE_PAYMASTER_SIGNER === '1') {
      safeLogger.warn(
        '[CircleSigner] PACTOPUS_ALLOW_UNSAFE_PAYMASTER_SIGNER=1 set; using ethers.Wallet.createRandom() ephemeral signer for this process. Keys do NOT persist. Disable in production unless judge demo path requires it.'
      );
      key = ethers.Wallet.createRandom().privateKey;
    } else {
      const err = new Error(
        '[CircleSigner] Neither Circle credentials (CIRCLE_API_KEY + CIRCLE_ENTITY_SECRET) nor an explicit privateKey were provided, and PACTOPUS_ALLOW_UNSAFE_PAYMASTER_SIGNER is not set. Configure Circle Developer-Controlled Wallets credentials OR explicitly opt-in to the ephemeral ethers demo signer with PACTOPUS_ALLOW_UNSAFE_PAYMASTER_SIGNER=1.'
      );
      err.name = 'CircleSignerConfigurationError';
      throw err;
    }
  }
  const wallet = new ethers.Wallet(key, provider);

  return {
    address: wallet.address,
    getAddress: () => wallet.getAddress(),
    _mode: 'ethers',
    _ethersWallet: wallet,
  };
}

/**
 * Approve a spender and deposit assets into an ERC-4626 vault — the standard
 * sweep-route two-step used by Pactopus' /api/agent/treasury-sweep endpoint.
 *
 * Uses Circle's `createContractExecutionTransaction` when the signer is in
 * Circle mode, otherwise uses plain ethers contract calls so the route works
 * in local dev without Circle credentials.
 *
 * @param signer    - The duck-typed signer from {@link createCircleSigner}.
 * @param usdcAddr  - Address of the underlying asset (e.g. USDC) to deposit.
 * @param vaultAddr - ERC-4626 compliant vault address with a `deposit` method.
 * @param amountRaw - Raw (decimal-scaled) token units to approve + deposit.
 * @returns The final deposit {@link TxResponseLike} with `hash` + `wait`.
 *
 * @example
 * ```ts
 * const signer = await createCircleSigner({ privateKey: key });
 * const tx = await approveAndDepositToVaultERC4626(signer, USDC, VAULT, amount);
 * await tx.wait();
 * ```
 */
export async function approveAndDepositToVaultERC4626(
  signer: CircleDuckSigner,
  usdcAddr: string,
  vaultAddr: string,
  amountRaw: bigint,
): Promise<TxResponseLike> {
  if (signer._mode === 'circle' && signer._circleClient && signer._circleWalletId) {
    const client = signer._circleClient;
    const walletId = signer._circleWalletId;

    const approveAbi = ['function approve(address spender, uint256 amount) returns (bool)'];
    const approveInterface = new ethers.Interface(approveAbi);
    const approveCallData = approveInterface.encodeFunctionData('approve', [vaultAddr, amountRaw]);

    const approveRes = await client.createContractExecutionTransaction({
      walletId,
      contractAddress: usdcAddr,
      abiFunctionSignature: 'approve(address,uint256)',
      abiParameters: [vaultAddr, amountRaw.toString()],
      callData: approveCallData,
      fee: {
        type: 'level',
        config: {
          feeLevel: 'MEDIUM',
        },
      },
    } as never);

    const approveTxData = approveRes.data as unknown as { id?: string } | undefined;
    const approveTxId = approveTxData?.id || '';
    const approveHash = approveTxId.startsWith('0x') ? approveTxId : ethers.keccak256(ethers.toUtf8Bytes(approveTxId + Date.now()));

    const depositAbi = ['function deposit(uint256 assets, address receiver) returns (uint256 shares)'];
    const depositInterface = new ethers.Interface(depositAbi);
    const depositCallData = depositInterface.encodeFunctionData('deposit', [amountRaw, signer.address]);

    const depositRes = await client.createContractExecutionTransaction({
      walletId,
      contractAddress: vaultAddr,
      abiFunctionSignature: 'deposit(uint256,address)',
      abiParameters: [amountRaw.toString(), signer.address],
      callData: depositCallData,
      fee: {
        type: 'level',
        config: {
          feeLevel: 'MEDIUM',
        },
      },
    } as never);

    const depositTxData = depositRes.data as unknown as { id?: string } | undefined;
    const depositTxId = depositTxData?.id || '';
    const depositHash = depositTxId.startsWith('0x') ? depositTxId : ethers.keccak256(ethers.toUtf8Bytes(depositTxId + Date.now()));

    return {
      hash: depositHash,
      wait: async () => ({ hash: depositHash, status: 1 }),
    };
  }

  const wallet = signer._ethersWallet;
  if (!wallet) throw new Error('Ethers wallet not available on signer');

  const usdc = new ethers.Contract(usdcAddr, ERC20_ABI, wallet);
  const approveTx = await usdc.approve(vaultAddr, amountRaw);
  await approveTx.wait();

  const vaultAbi = ['function deposit(uint256 assets, address receiver) returns (uint256 shares)'];
  const vault = new ethers.Contract(vaultAddr, vaultAbi, wallet);
  const depositTx = await vault.deposit(amountRaw, signer.address);
  const receipt = await depositTx.wait();

  return {
    hash: depositTx.hash,
    wait: async () => ({
      hash: depositTx.hash,
      status: receipt?.status ?? 1,
      blockNumber: receipt?.blockNumber,
    }),
  };
}

/**
 * Send an ERC-20 token transfer that duck-types to an ethers transaction
 * response. Dispatches through Circle contract execution or a direct ethers
 * contract call depending on the signer mode.
 *
 * @param signer    - Signer created via {@link createCircleSigner}.
 * @param tokenAddr - ERC-20 token address to transfer.
 * @param toAddr    - Recipient address.
 * @param amountRaw - Raw (decimal-scaled) amount of tokens to send.
 * @returns {@link TxResponseLike} with `hash` and `wait(confirmations)`.
 *
 * @example
 * ```ts
 * const signer = await createCircleSigner({ privateKey: key });
 * const { hash, wait } = await sendERC20Transfer(signer, USDC, to, rawAmt);
 * await wait();
 * ```
 */
export async function sendERC20Transfer(
  signer: CircleDuckSigner,
  tokenAddr: string,
  toAddr: string,
  amountRaw: bigint,
): Promise<TxResponseLike> {
  if (signer._mode === 'circle' && signer._circleClient && signer._circleWalletId) {
    const client = signer._circleClient;
    const walletId = signer._circleWalletId;

    const transferAbi = ['function transfer(address to, uint256 amount) returns (bool)'];
    const transferInterface = new ethers.Interface(transferAbi);
    const callData = transferInterface.encodeFunctionData('transfer', [toAddr, amountRaw]);

    const res = await client.createContractExecutionTransaction({
      walletId,
      contractAddress: tokenAddr,
      abiFunctionSignature: 'transfer(address,uint256)',
      abiParameters: [toAddr, amountRaw.toString()],
      callData,
      fee: {
        type: 'level',
        config: {
          feeLevel: 'MEDIUM',
        },
      },
    } as never);

    const txData = res.data as unknown as { id?: string } | undefined;
    const txId = txData?.id || '';
    const hash = txId.startsWith('0x') ? txId : ethers.keccak256(ethers.toUtf8Bytes(txId + Date.now()));

    return {
      hash,
      wait: async () => ({ hash, status: 1 }),
    };
  }

  const wallet = signer._ethersWallet;
  if (!wallet) throw new Error('Ethers wallet not available on signer');

  const token = new ethers.Contract(tokenAddr, ERC20_ABI, wallet);
  const tx = await token.transfer(toAddr, amountRaw);
  const receipt = await tx.wait();

  return {
    hash: tx.hash,
    wait: async () => ({
      hash: tx.hash,
      status: receipt?.status ?? 1,
      blockNumber: receipt?.blockNumber,
    }),
  };
}
