export const SENSITIVE_ENV_NAMES: string[] = [
  "DATABASE_URL",
  "ARC_AGENT_PRIVATE_KEY",
  "PAYMASTER_SIGNER_KEY",
  "PAYMASTER_MIN_ALLOWANCE_RAW",
  "PAYMASTER_DAILY_BUDGET_RAW",
  "CIRCLE_API_KEY",
  "CIRCLE_ENTITY_SECRET",
  "TEST_API_KEY",
  "NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID",
  "NEXT_PUBLIC_ALGO_PLATFORM_WALLET",
  "NEXT_PUBLIC_PLATFORM_WALLET",
];

const IS_BUILD_OR_CI_CONTEXT: boolean = Boolean(
  process.env.CI ||
    process.env.VERCEL ||
    process.env.GITHUB_ACTIONS ||
    process.env.NEXT_BUILD_ID ||
    process.env.NETLIFY ||
    process.env.RENDER
);

const MUST_HAVE_CRASH: string[] = [
  "NEXT_PUBLIC_USDC_ADDRESS",
  "NEXT_PUBLIC_PLATFORM_WALLET",
];

const MUST_HAVE_WARN: string[] = [
  "DATABASE_URL",
  "ARC_AGENT_PRIVATE_KEY",
  "CIRCLE_API_KEY",
  "CIRCLE_ENTITY_SECRET",
  "PAYMASTER_SIGNER_KEY",
];

const REMEDIATION_HINTS: Record<string, string> = {
  DATABASE_URL: "set Neon PostgreSQL URL in Vercel env — feature downgrades to local storage if missing",
  ARC_AGENT_PRIVATE_KEY: "export Arc agent 0x-prefixed private key from Coinbase AgentKit — treasury sweep skips when missing",
  CIRCLE_API_KEY: "generate Circle Developer-Controlled Wallets API key at https://console.circle.com — falls back to ethers local signer",
  CIRCLE_ENTITY_SECRET: "create Circle Entity Secret + RSA keypair per Circle docs — paired with CIRCLE_API_KEY",
  PAYMASTER_SIGNER_KEY: "0x-prefixed ECDSA private key that sponsors gas via paymaster — per-boot random signer used if missing",
  NEXT_PUBLIC_USDC_ADDRESS: "USDC token contract address (0x + 40 hex chars) on target chain",
  NEXT_PUBLIC_PLATFORM_WALLET: "Pactopus platform treasury address (0x + 40 hex chars, EVM-compatible)",
};

function isPlaceholderValue(value: string | undefined): boolean {
  if (value === undefined || value === null) return true;
  const trimmed = String(value).trim();
  if (trimmed === "") return true;
  if (/your_private_key_here$/i.test(trimmed)) return true;
  return false;
}

function validateStructure(name: string, value: string): string | null {
  switch (name) {
    case "NEXT_PUBLIC_USDC_ADDRESS":
    case "NEXT_PUBLIC_PLATFORM_WALLET": {
      if (!/^0x[a-fA-F0-9]{40}$/.test(value)) {
        return `${name} must be 0x-prefixed 40-char hex address (got ${value.length} chars)`;
      }
      break;
    }
    case "DATABASE_URL": {
      if (!value.startsWith("postgresql://")) {
        return "DATABASE_URL must start with postgresql://";
      }
      break;
    }
    case "ARC_AGENT_PRIVATE_KEY": {
      if (!/^0x[a-fA-F0-9]{64}$/.test(value)) {
        return "ARC_AGENT_PRIVATE_KEY must be 0x-prefixed 64-char hex private key";
      }
      break;
    }
  }
  return null;
}

export function validateCriticalEnvs(opts?: { mode?: "strict" | "warn" }): void {
  const defaultMode: "strict" | "warn" =
    process.env.NODE_ENV === "production" ? "strict" : "warn";

  let effectiveMode: "strict" | "warn" = opts?.mode ?? defaultMode;

  if (IS_BUILD_OR_CI_CONTEXT && opts?.mode !== "strict") {
    effectiveMode = "warn";
  }

  const missingItems: Array<{ name: string; reason: string; severity: "blocker" | "warning" }> = [];

  for (const name of MUST_HAVE_CRASH) {
    const raw = process.env[name];
    if (isPlaceholderValue(raw)) {
      const hint = REMEDIATION_HINTS[name] ?? "set in environment";
      missingItems.push({ name, reason: `missing → ${hint}`, severity: "blocker" });
      continue;
    }
    const structErr = validateStructure(name, String(raw));
    if (structErr) {
      missingItems.push({ name, reason: `invalid → ${structErr}`, severity: "blocker" });
    }
  }

  for (const name of MUST_HAVE_WARN) {
    const raw = process.env[name];
    if (isPlaceholderValue(raw)) {
      const hint = REMEDIATION_HINTS[name] ?? "set in environment";
      missingItems.push({ name, reason: `missing → ${hint}`, severity: "warning" });
      continue;
    }
    const structErr = validateStructure(name, String(raw));
    if (structErr) {
      missingItems.push({ name, reason: `invalid → ${structErr}`, severity: "warning" });
    }
  }

  for (const name of ["DATABASE_URL", "ARC_AGENT_PRIVATE_KEY"]) {
    const raw = process.env[name];
    if (raw !== undefined && raw !== null && String(raw).trim() !== "") {
      const structErr = validateStructure(name, String(raw));
      if (structErr && !missingItems.some((m) => m.name === name)) {
        missingItems.push({ name, reason: `invalid → ${structErr}`, severity: "warning" });
      }
    }
  }

  if (missingItems.length === 0) return;

  const blockers = missingItems.filter((m) => m.severity === "blocker");
  const warnings = missingItems.filter((m) => m.severity === "warning");
  const lines = missingItems.map(
    (m) => `  - [${m.severity.toUpperCase()}] ${m.name} ${m.reason}`
  );
  const message = `[envguard] ${missingItems.length} environment issue(s) (${blockers.length} blocker, ${warnings.length} warning):\n${lines.join("\n")}`;

  const onlyWarnings = blockers.length === 0;
  if (effectiveMode === "strict" && !onlyWarnings) {
    const err = new Error(message);
    err.name = "EnvGuardValidationError";
    throw err;
  }

  const prefix = "\x1b[33m[envguard] WARN:\x1b[0m";
  for (const m of missingItems) {
    console.warn(`${prefix} ${m.name} (${m.severity}): ${m.reason}`);
  }
}

export function getSafeEnvPublic(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of Object.keys(process.env)) {
    if (key.startsWith("NEXT_PUBLIC_")) {
      const val = process.env[key];
      if (val !== undefined) {
        out[key] = val;
      }
    }
  }
  return out;
}
