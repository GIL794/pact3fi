// Wallet connection context — MetaMask, Coinbase, WalletConnect, Pera Wallet, MyAlgo
'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { ARC_CHAIN, switchToArc, CURRENCY_CONFIG } from '@/lib/arc';

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ethereum?: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    algorand?: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    algo?: any;
  }
}

export type WalletType = 'metamask' | 'coinbase' | 'walletconnect' | 'pera' | 'myalgo' | null;

interface WalletState {
  address: string | null;
  isConnected: boolean;
  isConnecting: boolean;
  walletType: WalletType;
  chainId: number | null;
  isWrongNetwork: boolean;
  usdcBalance: string;
  eurcBalance: string;
  error: string | null;
  network: 'arc' | 'algorand';
}

interface WalletContextType extends WalletState {
  connect: (type: WalletType) => Promise<void>;
  disconnect: () => void;
  switchNetwork: () => Promise<void>;
  refreshBalances: () => Promise<void>;
  setNetwork: (network: 'arc' | 'algorand') => void;
}

const WalletContext = createContext<WalletContextType | null>(null);

export function WalletProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<WalletState>({
    address: null,
    isConnected: false,
    isConnecting: false,
    walletType: null,
    chainId: null,
    isWrongNetwork: false,
    usdcBalance: '0.00',
    eurcBalance: '0.00',
    error: null,
    network: 'arc',
  });

  const [peraWallet, setPeraWallet] = useState<any>(null);

  // Initialize Pera Wallet client-side to prevent SSR issues
  useEffect(() => {
    if (typeof window !== 'undefined') {
      import('@perawallet/connect')
        .then(({ PeraWalletConnect }) => {
          setPeraWallet(new PeraWalletConnect());
        })
        .catch(err => {
          console.error('Failed to initialize PeraWalletConnect', err);
        });
    }
  }, []);

  const getProvider = useCallback(() => {
    if (typeof window === 'undefined') return null;
    return window.ethereum || null;
  }, []);

  const setNetwork = useCallback((network: 'arc' | 'algorand') => {
    setState(prev => {
      if (prev.network === network) return prev;
      // When switching networks, disconnect the active session to prevent mixed state
      if (typeof window !== 'undefined') {
        localStorage.removeItem('pactyfi_wallet');
      }
      return {
        ...prev,
        network,
        address: null,
        isConnected: false,
        walletType: null,
        chainId: null,
        isWrongNetwork: false,
        usdcBalance: '0.00',
        eurcBalance: '0.00',
      };
    });
  }, []);

  const fetchAlgoBalances = useCallback(async (address: string) => {
    try {
      const res = await fetch(`https://testnet-api.algonode.cloud/v2/accounts/${address}`);
      if (!res.ok) return;
      const data = await res.json();
      
      // USDC Asset ID: 10458941, EURC Asset ID: 230190169
      const usdcAsset = data.assets?.find((a: any) => a['asset-id'] === 10458941);
      const usdc = usdcAsset ? (usdcAsset.amount / 1000000).toFixed(2) : '0.00';
      const eurcAsset = data.assets?.find((a: any) => a['asset-id'] === 230190169);
      const eurc = eurcAsset ? (eurcAsset.amount / 1000000).toFixed(2) : '0.00';

      setState(prev => ({
        ...prev,
        usdcBalance: usdc,
        eurcBalance: eurc,
      }));
    } catch (err) {
      console.error('Failed to fetch Algorand balances', err);
    }
  }, []);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fetchBalances = useCallback(async (address: string, provider: any) => {
    try {
      const balanceOfSig = '0x70a08231' + address.slice(2).padStart(64, '0');

      const callToken = async (tokenAddress: string) => {
        const result = await provider.request({
          method: 'eth_call',
          params: [{ to: tokenAddress, data: balanceOfSig }, 'latest'],
        });
        if (result && result !== '0x') {
          const raw = BigInt(result);
          const divisor = BigInt(1_000_000);
          const whole = raw / divisor;
          const fraction = (raw % divisor).toString().padStart(6, '0').replace(/0+$/, '') || '00';
          return `${whole}.${fraction.slice(0, 2)}`;
        }
        return '0.00';
      };

      const [usdc, eurc] = await Promise.all([
        callToken(CURRENCY_CONFIG.USDC.address),
        callToken(CURRENCY_CONFIG.EURC.address),
      ]);

      setState(prev => ({ ...prev, usdcBalance: usdc, eurcBalance: eurc }));
    } catch {
      // ignore
    }
  }, []);

  const connect = useCallback(async (type: WalletType) => {
    setState(prev => ({ ...prev, isConnecting: true, error: null }));
    try {
      if (type === 'pera') {
        if (!peraWallet) throw new Error('Pera Wallet provider not initialized');
        const accounts = await peraWallet.connect();
        
        peraWallet.connector?.on('disconnect', () => {
          disconnect();
        });

        const address = accounts[0];
        if (typeof window !== 'undefined') {
          localStorage.setItem('pactyfi_wallet', JSON.stringify({ type, address, network: 'algorand' }));
        }

        setState(prev => ({
          ...prev,
          address,
          isConnected: true,
          isConnecting: false,
          walletType: type,
          network: 'algorand',
          error: null,
        }));

        await fetchAlgoBalances(address);
      } else if (type === 'myalgo') {
        const algo = (window as any).algorand || (window as any).algo;
        if (!algo) {
          throw new Error('Algorand Wallet extension (Pera or Kibisis) not detected. Please install it.');
        }
        const accounts = await algo.enable();
        if (!accounts || !accounts.length) throw new Error('No accounts found');
        const address = typeof accounts[0] === 'string' ? accounts[0] : accounts[0].address;

        if (typeof window !== 'undefined') {
          localStorage.setItem('pactyfi_wallet', JSON.stringify({ type, address, network: 'algorand' }));
        }

        setState(prev => ({
          ...prev,
          address,
          isConnected: true,
          isConnecting: false,
          walletType: type,
          network: 'algorand',
          error: null,
        }));

        await fetchAlgoBalances(address);
      } else {
        // EVM / Arc logic
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let provider: any = null;

        if (type === 'walletconnect') {
          const { EthereumProvider } = await import('@walletconnect/ethereum-provider');
          provider = await EthereumProvider.init({
            projectId: '8e811bc2e8c2574e4c25f4fb4fb4f8ff1',
            chains: [ARC_CHAIN.id],
            showQrModal: true,
            rpcMap: {
              [ARC_CHAIN.id]: ARC_CHAIN.rpcUrls.default.http[0]
            }
          });
          await provider.connect();
        } else {
          provider = getProvider();
          if (!provider) {
            if (type === 'metamask') {
              window.open('https://metamask.io/download/', '_blank');
              throw new Error('MetaMask not installed. Please install it and refresh.');
            }
            throw new Error('No browser wallet detected. Please install MetaMask.');
          }
        }

        const accounts: string[] = await provider.request({ method: 'eth_requestAccounts' });
        if (!accounts.length) throw new Error('No accounts found');

        const address = accounts[0].toLowerCase();
        const chainIdHex: string = await provider.request({ method: 'eth_chainId' });
        const chainId = parseInt(chainIdHex, 16);

        if (typeof window !== 'undefined') {
          localStorage.setItem('pactyfi_wallet', JSON.stringify({ type, address, network: 'arc' }));
        }

        setState(prev => ({
          ...prev,
          address,
          isConnected: true,
          isConnecting: false,
          walletType: type,
          chainId,
          isWrongNetwork: chainId !== ARC_CHAIN.id,
          network: 'arc',
          error: null,
        }));

        await fetchBalances(address, provider);
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      setState(prev => ({
        ...prev,
        isConnecting: false,
        error: errMsg || 'Failed to connect wallet',
      }));
    }
  }, [getProvider, fetchBalances, fetchAlgoBalances, peraWallet]);

  const disconnect = useCallback(() => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('pactyfi_wallet');
    }
    if (state.walletType === 'pera' && peraWallet) {
      peraWallet.disconnect().catch(() => {});
    }
    setState(prev => ({
      ...prev,
      address: null,
      isConnected: false,
      isConnecting: false,
      walletType: null,
      chainId: null,
      isWrongNetwork: false,
      usdcBalance: '0.00',
      eurcBalance: '0.00',
      error: null,
    }));
  }, [state.walletType, peraWallet]);

  const switchNetwork = useCallback(async () => {
    if (state.network === 'algorand') return; // Algorand doesn't use EVM chain switching
    const provider = getProvider();
    if (!provider) return;
    try {
      await switchToArc(provider);
      setState(prev => ({ ...prev, isWrongNetwork: false, chainId: ARC_CHAIN.id }));
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      setState(prev => ({ ...prev, error: errMsg }));
    }
  }, [getProvider, state.network]);

  const refreshBalances = useCallback(async () => {
    if (state.network === 'algorand') {
      if (state.address) await fetchAlgoBalances(state.address);
    } else {
      const provider = getProvider();
      if (!provider || !state.address) return;
      await fetchBalances(state.address, provider);
    }
  }, [getProvider, state.address, state.network, fetchBalances, fetchAlgoBalances]);

  // Auto-reconnect on mount
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const saved = localStorage.getItem('pactyfi_wallet');
    if (saved) {
      try {
        const { type, address, network } = JSON.parse(saved);
        if (network === 'algorand') {
          if (type === 'pera' && peraWallet) {
            peraWallet.reconnectSession().then((accounts: string[]) => {
              if (accounts && accounts.length) {
                setState(prev => ({
                  ...prev,
                  address: accounts[0],
                  isConnected: true,
                  walletType: 'pera',
                  network: 'algorand',
                }));
                fetchAlgoBalances(accounts[0]);
              }
            }).catch(() => {});
          } else if (type === 'myalgo') {
            const algo = (window as any).algorand || (window as any).algo;
            if (algo) {
              algo.enable().then((accounts: any[]) => {
                if (accounts && accounts.length) {
                  const addr = typeof accounts[0] === 'string' ? accounts[0] : accounts[0].address;
                  setState(prev => ({
                    ...prev,
                    address: addr,
                    isConnected: true,
                    walletType: 'myalgo',
                    network: 'algorand',
                  }));
                  fetchAlgoBalances(addr);
                }
              }).catch(() => {});
            }
          }
        } else {
          // EVM Reconnect
          setTimeout(() => {
            connect(type).catch(() => {});
          }, 0);
        }
      } catch { /* ignore */ }
    }
  }, [connect, peraWallet, fetchAlgoBalances]);

  // Listen for EVM account/chain changes
  useEffect(() => {
    if (state.network === 'algorand') return;
    const provider = getProvider();
    if (!provider) return;

    const onAccountsChanged = (accounts: string[]) => {
      if (accounts.length === 0) {
        disconnect();
      } else {
        setState(prev => ({ ...prev, address: accounts[0].toLowerCase() }));
      }
    };
    const onChainChanged = (chainIdHex: string) => {
      const chainId = parseInt(chainIdHex, 16);
      setState(prev => ({ ...prev, chainId, isWrongNetwork: chainId !== ARC_CHAIN.id }));
    };

    provider.on?.('accountsChanged', onAccountsChanged);
    provider.on?.('chainChanged', onChainChanged);

    return () => {
      provider.removeListener?.('accountsChanged', onAccountsChanged);
      provider.removeListener?.('chainChanged', onChainChanged);
    };
  }, [getProvider, disconnect, state.network]);

  return (
    <WalletContext.Provider value={{ ...state, connect, disconnect, switchNetwork, refreshBalances, setNetwork }}>
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet() {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error('useWallet must be used within WalletProvider');
  return ctx;
}
