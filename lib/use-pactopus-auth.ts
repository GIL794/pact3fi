'use client';

import { useCallback } from 'react';
import { useWallet } from './wallet';
import { buildSignedHeaders, AUTH_HEADERS } from './auth';

/**
 * React hook for producing `fetch` headers that pass the server-side
 * verifyOwnerSignature() validator (see lib/auth.ts).
 *
 * Usage from mutations/queries:
 *   const { sign, signedFetch } = usePactopusAuth();
 *   const headers = await sign({ method: 'POST', pathname: '/api/invoices', body });
 *   await fetch('/api/invoices', { method: 'POST', headers, body: JSON.stringify(body) });
 *
 * Wallet signature prompts (Metamask `personal_sign`) happen only once per unique
 * {nonce, body, method, pathname} — nonce = epoch ms so a fresh sign happens for
 * every protected call. This is intentional per OWASP: a 5-minute expiry window
 * prevents replay without introducing nonce-cookie state on the server (the
 * tradeoff is a wallet signature popup on every write; acceptable because
 * creating invoices and paying are infrequent privileged actions).
 */
export function usePactopusAuth() {
  const { address, signMessage, network } = useWallet();

  const sign = useCallback(async (opts: {
    method: 'GET' | 'POST' | 'PUT';
    pathname: string;
    body?: unknown;
  }): Promise<Record<string, string>> => {
    if (network === 'algorand') {
      // For Algorand we fall back to an unsigned header (the server resolves it
      // to empty owner string → owner-scoped filters still apply but are
      // defensive only). Algorand peraWallet.signData to come in a later pass.
      return address ? { [AUTH_HEADERS.WALLET]: address } : {};
    }
    if (!address) return {};
    return buildSignedHeaders({
      wallet: address,
      signMessage,
      method: opts.method,
      pathname: opts.pathname,
      body: opts.body,
    });
  }, [address, signMessage, network]);

  const signedFetch = useCallback(async (input: string, init?: RequestInit & { method: 'GET' | 'POST' | 'PUT' }): Promise<Response> => {
    const method = (init?.method || 'GET') as 'GET' | 'POST' | 'PUT';
    let body: unknown = undefined;
    if (init?.body && typeof init.body === 'string') {
      try { body = JSON.parse(init.body); } catch { body = init.body; }
    }
    const urlPath = new URL(input, typeof window === 'undefined' ? 'http://localhost' : window.location.origin).pathname;
    const extraHeaders = await sign({ method, pathname: urlPath, body });
    const merged: RequestInit = {
      ...(init || {}),
      method,
      headers: {
        'Content-Type': method !== 'GET' ? 'application/json' : (init?.headers as any)?.['Content-Type'] || undefined,
        ...(init?.headers as Record<string, string> || {}),
        ...extraHeaders,
      } as Record<string, string>,
    };
    return fetch(input, merged);
  }, [sign]);

  return { sign, signedFetch, isAuthenticated: Boolean(address && network !== 'algorand') };
}
