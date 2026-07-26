// Arc L1 blockchain configuration
// Chain ID: 5042002 (Arc Testnet)
// USDC-as-gas: native feature
// Sub-second finality via Malachite consensus

export const ARC_CHAIN = {
  id: 5042002,
  name: 'Arc Testnet',
  nativeCurrency: {
    name: 'USD Coin',
    symbol: 'USDC',
    decimals: 6,
  },
  rpcUrls: {
    default: {
      http: [process.env.NEXT_PUBLIC_ARC_RPC_URL || 'https://testnet.arc.eco/rpc'],
    },
  },
  blockExplorers: {
    default: {
      name: 'Arc Explorer',
      url: process.env.NEXT_PUBLIC_ARC_EXPLORER_URL || 'https://explorer.arc.eco',
    },
  },
};

// ERC-20 minimal ABI for USDC / EURC token transfers
export const ERC20_ABI = [
  'function balanceOf(address owner) view returns (uint256)',
  'function transfer(address to, uint256 amount) returns (bool)',
  'function transferFrom(address from, address to, uint256 amount) returns (bool)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
  'event Transfer(address indexed from, address indexed to, uint256 value)',
];

// Deployed token addresses (from deployment.json — Arc Testnet)
export const CONTRACTS = {
  USDC: process.env.NEXT_PUBLIC_USDC_ADDRESS || '0x5FbDB2315678afecb367f032d93F642f64180aa3',
  EURC: process.env.NEXT_PUBLIC_EURC_ADDRESS || '0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0',
};

export type Currency = 'USDC' | 'EURC';

export const CURRENCY_CONFIG: Record<Currency, {
  address: string;
  decimals: number;
  color: string;
  icon: string;
  description: string;
}> = {
  USDC: {
    address: CONTRACTS.USDC,
    decimals: 6,
    color: '#10b981',
    icon: '💵',
    description: 'US Dollar Coin — pegged 1:1 to USD',
  },
  EURC: {
    address: CONTRACTS.EURC,
    decimals: 6,
    color: '#f59e0b',
    icon: '💶',
    description: 'Euro Coin — pegged 1:1 to EUR',
  },
};

// Platform fee: 0.5% of transaction value
export const PLATFORM_FEE_BPS = 50; // basis points
export const PLATFORM_WALLET = process.env.NEXT_PUBLIC_PLATFORM_WALLET || '0x0000000000000000000000000000000000000001';

/**
 * Add Arc testnet to MetaMask
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function addArcNetwork(provider: any): Promise<void> {
  await provider.request({
    method: 'wallet_addEthereumChain',
    params: [{
      chainId: `0x${ARC_CHAIN.id.toString(16)}`,
      chainName: ARC_CHAIN.name,
      nativeCurrency: ARC_CHAIN.nativeCurrency,
      rpcUrls: ARC_CHAIN.rpcUrls.default.http,
      blockExplorerUrls: [ARC_CHAIN.blockExplorers.default.url],
    }],
  });
}

/**
 * Switch to Arc testnet
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function switchToArc(provider: any): Promise<void> {
  try {
    await provider.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: `0x${ARC_CHAIN.id.toString(16)}` }],
    });
  } catch (err: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    // 4902 = chain not added
    if (err.code === 4902) {
      await addArcNetwork(provider);
    } else {
      throw err;
    }
  }
}

/**
 * Format token amount from raw (6 decimals) to display
 */
export function formatTokenAmount(raw: bigint, decimals = 6): string {
  const divisor = BigInt(10 ** decimals);
  const whole = raw / divisor;
  const fraction = raw % divisor;
  const fractionStr = fraction.toString().padStart(decimals, '0').replace(/0+$/, '');
  return fractionStr ? `${whole}.${fractionStr}` : whole.toString();
}

/**
 * Parse display amount to raw token units
 */
export function parseTokenAmount(amount: string, decimals = 6): bigint {
  const [whole, fraction = ''] = amount.split('.');
  const paddedFraction = fraction.padEnd(decimals, '0').slice(0, decimals);
  return BigInt(whole) * BigInt(10 ** decimals) + BigInt(paddedFraction || '0');
}

/**
 * Get Arc block explorer tx link
 */
export function getTxLink(hash: string): string {
  return `${ARC_CHAIN.blockExplorers.default.url}/tx/${hash}`;
}
