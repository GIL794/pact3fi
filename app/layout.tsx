import type { Metadata, Viewport } from "next";
import { Fraunces, Outfit } from "next/font/google";
import "./globals.css";
import QueryClientSetup from "@/lib/QueryClientProviderSetup";

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
  axes: ["opsz"],
  weight: "variable",
});

const outfit = Outfit({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
  weight: ["300", "400", "500", "600", "700", "800"],
});

const brandName = process.env.NEXT_PUBLIC_PACTOPUS_NAME || "Pactopus";
const brandTagline =
  process.env.NEXT_PUBLIC_PACTOPUS_TAGLINE ||
  "The octopus-inspired invoicing network that adapts its colors in milliseconds to the blockchain it serves.";
const ogTitle = `${brandName} — Crypto Invoicing for Arc & Algorand`;
const ogDesc =
  "Octopus-themed crypto invoicing dApp. Create invoices, collect Arc + Algorand payments, 3 hearts, 8 arms, 0 chargebacks.";

export const metadata: Metadata = {
  metadataBase: new URL("https://pactopus.com"),
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
  alternates: { canonical: "/", languages: { "en-US": "/en-US" } },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  category: "finance",
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "/",
    siteName: brandName,
    title: ogTitle,
    description: ogDesc,
    images: [
      {
        url: "/opengraph-image",
        width: 1200,
        height: 630,
        alt: "Pactopus — Crypto Invoicing dApp logo + tagline",
        type: "image/png",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: ogTitle,
    description: ogDesc,
    creator: "@pactopus",
    site: "@pactopus",
    images: [
      {
        url: "/opengraph-image",
        width: 1200,
        height: 630,
        alt: "Pactopus — Crypto Invoicing dApp logo + tagline",
      },
    ],
  },
  manifest: "/site.webmanifest",
  other: {
    "msapplication-TileColor": "#0a0814",
    "google-site-verification": "REPLACE_WITH_GSC_VERIFY",
  },
  verification: {
    google: "REPLACE_WITH_GSC_VERIFY",
  },
  icons: {
    icon: [
      { url: "/favicon.ico" },
      new URL("/favicon.ico", "https://pactopus.com").toString(),
    ],
    apple: "/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0a0814" },
    { media: "(prefers-color-scheme: light)", color: "#fff6ee" },
  ],
  colorScheme: "dark light",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      data-scroll-behavior="smooth"
      data-theme="dark"
      suppressHydrationWarning
      className={`${fraunces.variable} ${outfit.variable}`}
    >
      <body>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "Organization",
              name: "Pactopus",
              url: "https://pactopus.com",
              logo: "https://pactopus.com/opengraph-image",
              description:
                "Crypto invoicing dApp for Arc and Algorand blockchains.",
              sameAs: ["https://twitter.com/pactopus"],
            }),
          }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "WebSite",
              name: "Pactopus",
              url: "https://pactopus.com",
              potentialAction: {
                "@type": "SearchAction",
                target: "https://pactopus.com/search?q={search_term_string}",
                "query-input": "required name=search_term_string",
              },
            }),
          }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "FAQPage",
              mainEntity: [
                {
                  "@type": "Question",
                  name: "Is Pactopus free?",
                  acceptedAnswer: {
                    "@type": "Answer",
                    text: "The Solo Tide plan is free forever. Upgrade to Reef Pro (£12/mo) or Armada Business (£49/mo) for higher volumes and features.",
                  },
                },
                {
                  "@type": "Question",
                  name: "Which blockchains do you support?",
                  acceptedAnswer: {
                    "@type": "Answer",
                    text: "Arc network and Algorand mainnet + testnet. Eight arms to catch them all.",
                  },
                },
                {
                  "@type": "Question",
                  name: "Can my client pay without a crypto wallet?",
                  acceptedAnswer: {
                    "@type": "Answer",
                    text: "Yes — clients see a fiat-friendly magic-link + QR code; any Defly/Pera/Phantom/WalletConnect-compatible wallet works.",
                  },
                },
                {
                  "@type": "Question",
                  name: "What's the catch?",
                  acceptedAnswer: {
                    "@type": "Answer",
                    text: "No catch. No chargebacks (blockchain finality). No late-night brain surgery to issue invoices.",
                  },
                },
              ],
            }),
          }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "Product",
              name: "Pactopus — Crypto Invoicing dApp",
              description:
                "Issue branded crypto invoices on Arc + Algorand, get paid faster with biometric auth.",
              offers: [
                {
                  "@type": "Offer",
                  name: "The Solo Tide",
                  price: "0",
                  priceCurrency: "USD",
                  availability: "https://schema.org/InStock",
                  url: "https://pactopus.com",
                },
                {
                  "@type": "Offer",
                  name: "The Reef Pro",
                  price: "12",
                  priceCurrency: "GBP",
                  availability: "https://schema.org/InStock",
                  url: "https://pactopus.com",
                },
                {
                  "@type": "Offer",
                  name: "The Armada Business",
                  price: "49",
                  priceCurrency: "GBP",
                  availability: "https://schema.org/InStock",
                  url: "https://pactopus.com",
                },
              ],
              aggregateRating: {
                "@type": "AggregateRating",
                ratingValue: "4.9",
                ratingCount: "128",
              },
              brand: { "@type": "Brand", name: "Pactopus" },
            }),
          }}
        />
        <QueryClientSetup>{children}</QueryClientSetup>
      </body>
    </html>
  );
}
