import type { Metadata } from "next";
import "./globals.css";
import QueryClientSetup from "@/lib/QueryClientProviderSetup";

export const metadata: Metadata = {
  title: "Pactopus — Cryptographic Pacts & Escrow Registry",
  description: "Pactopus lets freelancers and professionals codify exchange parameters and receive USDC/EURC stablecoin payments instantly. Bound by code. Powered by Arc.",
  keywords: ["stablecoin agreements", "escrow pacts", "USDC", "EURC", "Arc blockchain", "crypto payments", "Pactopus"],
  authors: [{ name: "Gabriele Iacopo Langellotto", url: "https://kyrvyn.com" }],
  openGraph: {
    title: "Pactopus — Cryptographic Pacts & Escrow Registry",
    description: "Initialize Pacts. Share a link. Execute release law in under 1 second. No bank. No delays. No 3% fees.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <QueryClientSetup>
          {children}
        </QueryClientSetup>
      </body>
    </html>
  );
}
