# Pactopus Prisma Migration Workflow — Neon PostgreSQL, PgBouncer, Prisma 7

A step-by-step guide for Pactopus developers to set up, baseline, migrate, validate, and recover from schema drift when using Prisma ORM v7 with a Neon serverless PostgreSQL database (pooler + direct endpoints).

## Contents

- [0. Project State & Two-Endpoint Model](#0-project-state-before-you-begin)
- [1. Pre-Migration Checks — Run Every Time](#1-pre-migration-checks-do-every-time-before-migrate-commands)
- [2. Baseline Workflow — Existing Production DB, No Migration History](#2-baseline-workflow-existing-production-db-no-migration-history)
- [3. Normal Migration Workflow — Add/Change Schema After Baseline](#3-normal-migration-workflow-addingchanging-schema-after-baseline)
- [4. Validation Step — Run After Every Migration](#4-validation-step-run-after-every-migration)
- [5. Drift Recovery — When `migrate dev` Reports Drift or Wants Reset](#5-drift-recovery-when-migrate-dev-says-drift-detected--need-to-reset)
- [6. Troubleshooting FAQs — Pactopus × Neon × Prisma 7](#6-troubleshooting-faqs-for-pactopus--neon--prisma-7)
- [7. Long-Term Best Practices — Avoid Drift Altogether](#7-long-term-best-practices-to-avoid-drift)
- [8. Quick-Reference Cheat Sheet](#8-quick-reference-cheat-sheet)

---

## 0. Project state (before you begin)

| File | Purpose |
|---|---|
| [prisma/schema.prisma](file:///Users/trumpets/Documents/GitHub/pactopus/prisma/schema.prisma) | Data model source of truth. Provider only; connection lives in prisma.config.ts. |
| [prisma.config.ts](file:///Users/trumpets/Documents/GitHub/pactopus/prisma.config.ts) | Prisma CLI config; MUST use **DIRECT (non-pooler) Neon endpoint** for `datasource.url` or every migrate command throws. |
| [.env](file:///Users/trumpets/Documents/GitHub/pactopus/.env) | Has two URLs: `DATABASE_URL` (PgBouncer pooler — runtime PrismaClient + app queries) and `DIRECT_DATABASE_URL` (direct host — CLI/migrate only). |
| [lib/db.ts](file:///Users/trumpets/Documents/GitHub/pactopus/lib/db.ts) | Imports & instantiates PrismaClient with the POOLER `DATABASE_URL`. Unrelated to CLI URL above. |
| `prisma/migrations/*/migration.sql` | Migrations applied on deploy; committed to git. |
| `backups/` | Folder for `pg_dump` dumps; gitignored (if not, add it to `.gitignore`). |

### Why two URLs?
PgBouncer (the pooler) uses transaction-level pooling and does **not** support named prepared statements. Prisma CLI migrate commands run SQL that creates prepared statements, which fails immediately with:
```
Error querying the database: db error: ERROR: prepared statement "s0" already exists
```
**Rule:** Every `prisma migrate *`, `prisma db *`, and `prisma generate` CLI command **must** use `DIRECT_DATABASE_URL`. PrismaClient at runtime uses `DATABASE_URL` (the pooler) because driver adapters bypass the prepared-statement path that PgBouncer rejects.

---

## 1. Pre-migration checks (DO EVERY TIME before migrate commands)

### 1.1 Load env vars and confirm direct endpoint
```bash
cd pactopus
set -a; . ./.env; set +a

# Confirm DIRECT endpoint is set and is NOT the pooler URL
node -e "console.log(process.env.DIRECT_DATABASE_URL ? process.env.DIRECT_DATABASE_URL.includes('-pooler') ? '❌ DIRECT_DATABASE_URL still has -pooler!' : '✅ DIRECT_DATABASE_URL looks clean (no -pooler)' : '❌ DIRECT_DATABASE_URL is empty')"

# Confirm pooler URL and direct URL differ
echo "Pooler URL:    ${DATABASE_URL:0:64}…"
echo "Direct URL:    ${DIRECT_DATABASE_URL:0:64}…"
```

### 1.2 Install libpq (pg_dump) if missing
```bash
# macOS + Homebrew
brew install libpq
echo 'export PATH="/opt/homebrew/opt/libpq/bin:$PATH"' >> ~/.zshrc
export PATH="/opt/homebrew/opt/libpq/bin:$PATH"
pg_dump --version   # should be ≥16
```

### 1.3 Production backup (3 files, 3 formats)
```bash
cd pactopus
set -a; . ./.env; set +a
export PGSSLMODE=require
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
mkdir -p backups

# (A) Custom-format binary (small, restorable with pg_restore — recommended)
pg_dump -Fc --dbname="$DIRECT_DATABASE_URL" --no-owner --no-privileges \
  --file="backups/neon-prod-$STAMP.dump"

# (B) Plain-text schema only (for diffs & audits)
pg_dump -Fp --schema-only --dbname="$DIRECT_DATABASE_URL" --no-owner --no-privileges \
  --file="backups/neon-schema-$STAMP.sql"

# (C) Plain-text data only (for cat/grep/COPY restore)
pg_dump -Fp --data-only --dbname="$DIRECT_DATABASE_URL" --no-owner --no-privileges \
  --file="backups/neon-data-$STAMP.sql"

echo "Backups:"
ls -lh backups/ | tail -5

# chmod 600 so backups aren't world-readable
chmod 600 backups/*
```

### 1.4 Validate codebase
```bash
npx prisma --version
# Expected: prisma 7.9.1 · @prisma/client 7.9.1
npx prisma generate        # Regenerate PrismaClient types from schema
npx tsc --noEmit -p tsconfig.json   # Expected: 0 errors
```

---

## 2. Baseline workflow — Existing production DB, no migration history

**Run once only.** Use it when **both** are true:
1. `prisma migrate status` prints `No migration found in prisma/migrations`
2. Tables already exist on Neon (they were created by `db push`, manual SQL, or an earlier ORM version).

### 2.1 Generate baseline from the LIVE Neon catalog — NOT from schema.prisma
```bash
cd pactopus
set -a; . ./.env; set +a
mkdir -p prisma/migrations/0000_init

# Build the INIT migration by asking Prisma to diff an empty database against
# the actual LIVE Neon catalog. This captures exactly what exists on Neon
# RIGHT NOW (tables + indexes pre-drift).
#
# DO NOT use `--to-schema prisma/schema.prisma` here. If you do, the baseline
# will include columns/tables that exist only in your local schema.prisma but
# not yet on Neon, which triggers drift and a forced schema reset on the very
# next `migrate dev`.
npx prisma migrate diff \
  --from-empty \
  --to-config-datasource \
  --script \
  --output prisma/migrations/0000_init/migration.sql

# Review the output to confirm it matches Neon
wc -l prisma/migrations/0000_init/migration.sql
cat prisma/migrations/0000_init/migration.sql
```

### 2.2 Mark the baseline as APPLIED without executing its SQL
All tables already exist on Neon. Actually running the SQL would fail with *"relation already exists"*. Instead, tell Prisma this migration is applied by writing a `_prisma_migrations` row:
```bash
npx prisma migrate resolve --applied 0000_init
# Expected: "Migration 0000_init marked as applied."
```

### 2.3 Confirm the baseline is clean
```bash
npx prisma migrate status
# Expected output:
#   1 migrations found in prisma/migrations
#   Database schema is up to date!
#
# If it prompts "reset the public schema" → STOP. You generated the baseline
# from schema.prisma instead of from the live Neon catalog. Delete the bad
# 0000_init entry in _prisma_migrations (SQL below) and redo Step 2.1.
```

**Clear a bad baseline row when you sourced it from the wrong place:**
```sql
-- Run via Neon SQL Editor or `psql "$DIRECT_DATABASE_URL"`
DELETE FROM public."_prisma_migrations" WHERE migration_name = '0000_init';
```

---

## 3. Normal migration workflow — Add/change schema after baseline

### 3.1 Edit `prisma/schema.prisma`
Make your schema changes (add models, columns, indexes, enums, defaults). **Never hand-edit** an existing `prisma/migrations/*/migration.sql` once it has been committed.

### 3.2 Create and apply the migration
```bash
cd pactopus
set -a; . ./.env; set +a

# Creates prisma/migrations/YYYYMMDDHHMMSS_<name>/migration.sql AND applies it
npx prisma migrate dev --name invoice_owner_usage
```

Prisma performs all of the following:
1. Diffs `prisma/migrations` history against `prisma/schema.prisma`
2. Generates a deterministic SQL script
3. Applies it against Neon via the direct (non-pooler) URL
4. Inserts a new `_prisma_migrations` row
5. Regenerates Prisma Client

If Prisma prints *"Drift detected … We need to reset the public schema"* → **STOP immediately and go to Section 5.** Never let Prisma reset the production schema.

### 3.3 Apply migrations to production (Vercel deploy)
Vercel's default build command — `prisma generate && next build` — regenerates the client but **never** runs migrations. To actually apply pending migrations to the production Neon database, pick one of the options below.

1. **Option A — Pre-build hook (recommended for Vercel)**
   Add a script to `package.json`:
   ```json
   { "scripts": { "vercel-prebuild": "prisma migrate deploy" } }
   ```
   Then set **Vercel → Project → Settings → Build command** to:
   ```bash
   npm run vercel-prebuild && npx prisma generate && next build
   ```

2. **Option B — Manual apply from your laptop (CI-less deployments)**
   ```bash
   cd pactopus
   set -a; . ./.env; set +a
   npx prisma migrate deploy
   ```

3. **Option C — `prisma db push`**
   **Never on production.** `db push` skips migration history entirely and causes drift. Reserve it for throwaway local prototypes only.

---

## 4. Validation step — Run after every migration

### 4.1 CLI-level checks
```bash
cd pactopus
set -a; . ./.env; set +a

npx prisma migrate status
# Expected: "N migrations found in prisma/migrations" + "Database schema is up to date!"

npx prisma generate
# Regenerates Prisma Client; exits 0

npx tsc --noEmit -p tsconfig.json
# Expected: 0 errors
```

### 4.2 Schema-on-Neon check (Postgres catalog)
```sql
-- Tables in the public schema
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' ORDER BY table_name;
-- Expect: AgentLog, Invoice, InvoiceUsage, Subscription, _prisma_migrations

-- Invoice columns added by the `invoice_owner_usage` migration
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema='public' AND table_name='Invoice'
  AND column_name IN ('ownerAddress','isSystem')
ORDER BY column_name;
-- Expect: isSystem boolean NOT NULL DEFAULT false, ownerAddress text NOT NULL DEFAULT ''

-- Unique composite key on InvoiceUsage (ownerAddress × network × billingMonth)
SELECT i.relname, ix.indisunique
FROM pg_class t
JOIN pg_index ix ON t.oid = ix.indrelid
JOIN pg_class i ON i.oid = ix.indexrelid
JOIN pg_namespace n ON n.oid = t.relnamespace
WHERE n.nspname='public'
  AND i.relname LIKE '%InvoiceUsage_ownerAddress_network_billingMonth%';
-- Expect: indisunique = true

-- _prisma_migrations rows (both applied, neither rolled back)
SELECT migration_name, finished_at IS NOT NULL AS applied,
       rolled_back_at IS NOT NULL AS rolled_back
FROM public."_prisma_migrations" ORDER BY started_at;
-- Expect: 0000_init applied, 202608…_invoice_owner_usage applied, rolled_back=false for both
```

### 4.3 End-to-end smoke against Neon (optional, recommended for risky changes)
Create a throwaway TypeScript file (anything under `scripts/*.mts`; **do not commit**; delete afterwards) that:
1. Connects via the `prisma` singleton exported from `lib/db.ts`.
2. For a throwaway wallet address, calls:
   - `getDashboardStats(network, throwaway_owner)` — expect `invoicesUsedThisMonth = 0`, `invoicesAllowedThisMonth = 5`.
   - Five `createInvoice({ownerAddress: throwaway_owner, ...})` calls — all succeed.
   - A sixth `createInvoice` call — throws *"Free tier limit of 5 invoices/month reached"*.
   - `getMonthlyUsage(owner, network, nextMonthKey)` — `used = 0` (cycle reset).
3. Cleans up throwaway rows with `prisma.invoice.deleteMany`, `prisma.invoiceUsage.deleteMany`, and `prisma.agentLog.deleteMany` scoped to the throwaway owner so the production DB stays pristine.

---

## 5. Drift recovery — When `migrate dev` reports drift or wants reset

*Schema drift* means the migrations history on disk disagrees with what is actually on the Neon catalog — the database has drifted away from its source of truth. Drift typically happens after:
- Running `prisma db push` on a production database
- Running hand-written `ALTER TABLE` / `CREATE TABLE` statements via the Neon SQL Editor
- Switching Git branches that contain different `prisma/migrations/` folders, timestamps, or checksums

### Recovery procedure — production data is preserved in all cases

#### A. Back up first — repeat Section 1.3 verbatim
Always make the three-format backup before any recovery step. If a later step ever needs rollback, restore into a fresh Neon branch first:
```bash
# Restore the binary backup to a NEW Neon branch — never overwrite prod directly
pg_restore --dbname="<new-branch-direct-url>" --no-owner --no-privileges \
  backups/neon-prod-YYYYMMDDTHHMMSSZ.dump
```

#### B. Determine the direction of drift
```bash
cd pactopus
set -a; . ./.env; set +a
npx prisma migrate diff --from-migrations prisma/migrations --to-config-datasource
```
- **Output lists objects that exist on Neon but not in migrations** → *Neon is ahead of migrations*. Generate a new migration to bring the history up to date.
- **Output lists objects that migrations expect but Neon lacks** → *Migrations are ahead of Neon*. Apply the missing SQL by hand on Neon, then mark the migration as applied with `prisma migrate resolve --applied`.

#### C. Case 1 — Missing baseline — most common (no migrations folder, tables exist on Neon)
Carefully redo Section 2 (Baseline). The single most frequent error:
> *"I generated `0000_init` from schema.prisma instead of the live Neon catalog."* → delete the bad row in `_prisma_migrations`, re-diff with `--to-config-datasource`, re-apply.

#### D. Case 2 — Neon received manual ALTERs (Neon is ahead of migrations)
```bash
# Introspect Neon and overwrite schema.prisma TEMPORARILY
npx prisma db pull
# Now manually reconcile: copy any missing columns or indexes you want to keep
# into the REAL prisma/schema.prisma. Do NOT commit db pull's raw output — db pull
# strips @default(now()), enum names, @@unique composite syntax, relation names, etc.
```
Commit the reconciled `schema.prisma` and then run:
```bash
npx prisma migrate dev --name bring_history_current
```
Prisma produces a single migration containing every change that was missing from the migrations folder. No schema reset is required.

#### E. Case 3 — Reset is truly unavoidable (throwaway local dev only)
Only use this on a local clone whose data you can fully re-seed. **Never on production or Neon:**
```bash
# Throwaway dev databases only
npx prisma migrate reset
```

---

## 6. Troubleshooting FAQs — Pactopus × Neon × Prisma 7

### ❓ F1. `prepared statement "s0" already exists` on any migrate command
**Cause:** The Prisma CLI is connecting through the PgBouncer pooler endpoint. Either `DIRECT_DATABASE_URL` is missing, or `prisma.config.ts` still points at the pooler.
**Fix:**
1. Add this line to `.env`:
   ```
   DIRECT_DATABASE_URL="<same as DATABASE_URL, but strip the trailing '-pooler' suffix from the hostname prefix>"
   ```
   Concrete example:
   ```
   Pooler: ep-green-feather-axk7m99d-pooler.c-4.us-east-2.aws.neon.tech
   Direct: ep-green-feather-axk7m99d.c-4.us-east-2.aws.neon.tech
   ```
2. Ensure `prisma.config.ts` contains exactly:
   ```ts
   import 'dotenv/config';
   import { defineConfig } from 'prisma/config';
   const cliConnection = process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL || '';
   export default defineConfig({
     schema: 'prisma/schema.prisma',
     datasource: { url: cliConnection },
   });
   ```

### ❓ F2. `directUrl does not exist in type … Datasource` (TS2353, prisma.config.ts)
**Cause:** `datasource.directUrl` was removed in Prisma 7. It no longer exists on the `defineConfig` type.
**Fix:** Delete the `directUrl` line from the `datasource` object. The CLI uses the single `url` field, and that connection **must** be the direct (non-pooler) endpoint. PrismaClient at runtime (`lib/db.ts`) uses `DATABASE_URL` (pooler) independently — it is unaffected.

### ❓ F3. `datasource property url no longer supported in schema files`
**Cause:** Prisma 6-era `datasource { url = env("DATABASE_URL") }` is still in `schema.prisma`. In Prisma 7, connection configuration has moved out of the datasource block.
**Fix:** Remove `url` and `directUrl` from `schema.prisma`, keep only `provider = "postgresql"`, and set the connection in `prisma.config.ts` as shown in F1 above.

### ❓ F4. `No migration found in prisma/migrations` but tables already exist on Neon
**Fix:** Go to **Section 2 — Baseline** and perform Steps 2.1 → 2.2 → 2.3 exactly as written.

### ❓ F5. `migrate dev` wants to **reset** the public schema and lose data
**Cause:** Prisma detected drift and its generic fallback is a reset.
**Fix:** Press **N** or abort. Back up immediately (Section 1.3), then jump to **Section 5 — Drift Recovery**, identify which case you are in, and apply the non-destructive procedure. **Do NOT press Y against production Neon.**

### ❓ F6. Migration `0000_init` is marked applied but the file on disk no longer matches
**Cause:** You regenerated `0000_init/migration.sql` after marking it applied. The checksum stored in `_prisma_migrations` no longer matches the file contents.
**Fix:**
1. Delete the stale row in `_prisma_migrations`:
   ```sql
   DELETE FROM public."_prisma_migrations" WHERE migration_name = '0000_init';
   ```
2. Regenerate `0000_init` correctly per Section 2.1: diff `--from-empty --to-config-datasource` (live Neon).
3. Re-mark it applied: `npx prisma migrate resolve --applied 0000_init`.
4. Verify: `npx prisma migrate status`.

### ❓ F7. Vercel build succeeds but new columns are `undefined` at runtime
**Cause:** Vercel runs `prisma generate && next build` — that regenerates the client but never runs migrations. `migrate deploy` is missing from the pipeline.
**Fix:** See **Section 3.3** — add `npx prisma migrate deploy` **before** the build step so the Neon catalog is updated with the new columns before any route renders.

### ❓ F8. `FATAL:  password authentication failed` or `The query parameter … is not supported`
**Cause:** `channel_binding=require` in the URL combined with an older Neon node, or the connection string has been manually edited past its valid shape.
**Fix:** Try appending `?sslmode=require` explicitly. If the error persists, grab a fresh pair of **Connection string → Prisma** strings directly from the Neon Console (both the **Pooled** tab and the **Direct** tab) and paste both into `.env`.

---

## 7. Long-term best practices — Prevent drift altogether

1. **One source of truth.** Every schema change happens by editing `prisma/schema.prisma` and then running `npx prisma migrate dev --name <name>`. **Never:**
   - Run `prisma db push` on production
   - Run hand-written `ALTER` / `CREATE` statements against the Neon `public` schema
   - Edit committed `migration.sql` files
2. **Always back up** in all three formats before every migration. In addition to the local `backups/` folder, store backups in encrypted, off-machine storage.
3. **Commit the migrations folder.** Run `git add prisma/migrations/`. A teammate's branch that is missing a migration that your branch expects = drift on their next `migrate dev`.
4. **Separate endpoints, always.** Pooler (`DATABASE_URL`) for runtime PrismaClient; direct (`DIRECT_DATABASE_URL` in `prisma.config.ts`) for every Prisma CLI command. Do not mix.
5. **Pre-deploy deploy step.** In CI / Vercel build:
   ```bash
   npx prisma migrate deploy && npx prisma generate && next build
   ```
6. **Baseline once.** Baseline is a one-time operation for existing unmanaged databases. Re-applying it on every schema change re-introduces drift. After baseline, stick to the normal workflow in Section 3.
7. **Never merge migration conflicts by hand.** If two branches add migrations, rebase the later branch onto `main` so migration timestamps are strictly ordered, then run `npx prisma migrate dev`. Prisma will warn when migration-history order is wrong.
8. **Naming convention for `--name`.** Use lowercase snake_case noun phrases that describe the *effect* of the change, not the feature-branch name.
   - Preferred: `invoice_owner_usage`, `add_customer_tier_enum`
   - Avoid: `fix-bug`, `jwt-login-cleanup`, `my-changes`

---

## 8. Quick-reference cheat sheet

| Task | Command |
|---|---|
| Baseline — run once, existing tables | `mkdir -p prisma/migrations/0000_init && npx prisma migrate diff --from-empty --to-config-datasource --script --output prisma/migrations/0000_init/migration.sql && npx prisma migrate resolve --applied 0000_init` |
| Create and apply a new migration — daily | `npx prisma migrate dev --name <feature>` |
| Apply migrations on production / Vercel | `npx prisma migrate deploy` |
| Regenerate Prisma Client types | `npx prisma generate` |
| Status check | `npx prisma migrate status` |
| Diff migrations → Neon (drift direction) | `npx prisma migrate diff --from-migrations prisma/migrations --to-config-datasource` |
| Mark existing migration applied | `npx prisma migrate resolve --applied <folder_name>` |
| Rollback last applied migration (no data-loss: mark only) | `npx prisma migrate resolve --rolled-back <folder_name>` |
| Full production backup, 3 files | See Section 1.3 |
