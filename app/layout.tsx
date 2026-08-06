import type { Metadata } from "next";
import "./globals.css";
import QueryClientSetup from "@/lib/QueryClientProviderSetup";

const brandName = process.env.NEXT_PUBLIC_PACTOPUS_NAME || "Pactopus";
const brandTagline =
  process.env.NEXT_PUBLIC_PACTOPUS_TAGLINE ||
  "The octopus-inspired invoicing network that adapts its colors in milliseconds to the blockchain it serves.";

export const metadata: Metadata = {
  title: `${brandName} — Octopus-Adaptive Multi-Chain Invoicing`,
  description: `${brandName} lets freelancers and AI agents create on-chain invoices while the interface adapts its primary colors in milliseconds to match Arc or Algorand branding.`,
  keywords: [
    "stablecoin agreements",
    "escrow pacts",
    "USDC",
    "EURC",
    "Arc blockchain",
    "Algorand",
    "crypto payments",
    brandName,
    "brand-adaptive interface",
    "octopus-inspired fintech",
  ],
  authors: [{ name: "Gabriele Iacopo Langellotto", url: "https://kyrvyn.com" }],
  openGraph: {
    title: `${brandName} — Octopus-Adaptive Multi-Chain Invoicing`,
    description: `${brandTagline} Serve Arc or Algorand with chain-aware branding, optional OctoFun moments, and the same calm invoicing flow.`,
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <body>
        <QueryClientSetup>
          {children}
        </QueryClientSetup>
      </body>
    </html>
  );
}
