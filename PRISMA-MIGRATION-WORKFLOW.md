# Pactopus Prisma Migration Workflow (Neon PostgreSQL + Prisma 7)

A step-by-step guide for Pactopus developers to set up, baseline, migrate, validate, and recover from schema drift when using Prisma ORM v7 with a Neon serverless PostgreSQL database (pooler + direct endpoints).

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
PgBouncer (pooler) uses transaction-level pooling and does not support named prepared statements. Prisma CLI migrate commands run SQL that creates prepared statements. Result:
```
Error querying the database: db error: ERROR: prepared statement "s0" already exists
```
**Rule:** For any `prisma migrate *` / `prisma db *` / `prisma generate` CLI commands the connection MUST be `DIRECT_DATABASE_URL`. PrismaClient at runtime uses `DATABASE_URL` (pooler) because driver adapters don't use the same prepared-statement path.

---

## 1. Pre-migration checks (DO EVERY TIME before migrate commands)

### 1.1 Load env vars and confirm direct endpoint
```bash
cd pactopus
set -a; . ./.env; set +a

# Confirm DIRECT endpoint set and reachable
node -e "console.log(process.env.DIRECT_DATABASE_URL ? process.env.DIRECT_DATABASE_URL.includes('-pooler') ? '❌ DIRECT_DATABASE_URL still has -pooler!' : '✅ DIRECT_DATABASE_URL looks clean (no -pooler)' : '❌ DIRECT_DATABASE_URL is empty')"

# Confirm pooler is different:
echo "Pooler URL:    ${DATABASE_URL:0:64}..."
echo "Direct URL:    ${DIRECT_DATABASE_URL:0:64}..."
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
# prisma : 7.9.1  @prisma/client : 7.9.1
npx prisma generate        # regenerate PrismaClient types from schema
npx tsc --noEmit -p tsconfig.json   # 0 errors expected
```

---

## 2. Baseline workflow (existing production db, NO migration history)

**Only run ONCE** — when:
- `No migration found in prisma/migrations` (per `prisma migrate status`), AND
- Database tables already exist on Neon (created via `db push`, manual SQL, or an earlier ORM version).

### Step 2.1 Generate baseline from LIVE Neon schema (NOT from schema.prisma!)
```bash
cd pactopus
set -a; . ./.env; set +a
mkdir -p prisma/migrations/0000_init

# Build the INIT migration SQL by asking Prisma to diff an empty database → the
# actual LIVE Neon DB. This captures exactly what is on Neon RIGHT NOW (tables
# pre-drift). If we used --to-schema prisma/schema.prisma instead, the baseline
# would include columns/tables that don't yet exist on Neon, causing drift.
npx prisma migrate diff \
  --from-empty \
  --to-config-datasource \
  --script \
  --output prisma/migrations/0000_init/migration.sql

# Review output
wc -l prisma/migrations/0000_init/migration.sql
cat prisma/migrations/0000_init/migration.sql
```

### Step 2.2 Mark baseline AS APPLIED without executing the SQL
Since all those tables already exist on Neon, actually running the SQL would fail with "relation already exists". Instead tell Prisma this migration is applied by writing a `_prisma_migrations` row:
```bash
npx prisma migrate resolve --applied 0000_init
# Expected: "Migration 0000_init marked as applied."
```

### Step 2.3 Confirm baseline clean
```bash
npx prisma migrate status
# Expected output:
#   1 migrations found in prisma/migrations
#   Database schema is up to date!
#
# If it prompts "reset the public schema" → STOP. You generated the baseline
# from schema.prisma instead of from live Neon. Delete the 0000_init entry in
# _prisma_migrations (SQL below) and redo Step 2.1 correctly.
```

**How to clear a bad baseline row if you messed up the source:**
```sql
-- Run via Neon SQL Editor or psql $DIRECT_DATABASE_URL
DELETE FROM public."_prisma_migrations" WHERE migration_name = '0000_init';
```

---

## 3. Normal migration workflow (adding/changing schema after baseline)

### Step 3.1 Edit `prisma/schema.prisma`
Make your schema changes (add models, columns, indexes, enums, defaults). Never hand-edit an existing `prisma/migrations/*/migration.sql` once committed.

### Step 3.2 Create + apply the migration
```bash
cd pactopus
set -a; . ./.env; set +a

# Creates prisma/migrations/YYYYMMDDHHMMSS_<name>/migration.sql AND applies it
npx prisma migrate dev --name invoice_owner_usage
```
- Prisma will: diff `prisma/migrations` history against `prisma/schema.prisma`; generate SQL; run it against Neon direct URL; insert a new `_prisma_migrations` row; regenerate Prisma Client.
- If it says "Drift detected … We need to reset the public schema" → **STOP and go to Section 5.** Never let Prisma reset the production schema.

### Step 3.3 Apply to production (Vercel deploy)
On the next Vercel deploy using build command `prisma generate && next build` — Vercel does NOT run `migrate dev` in production. To actually run migrations on the production Neon database:

1. **Option A — pre-deploy hook (recommended)**
   In package.json add:
   ```json
   { "scripts": { "vercel-prebuild": "prisma migrate deploy" } }
   ```
   Point Vercel Project → Settings → Build command → `npm run vercel-prebuild && prisma generate && next build`

2. **Option B — manual apply from laptop (CI-less deployments)**
   ```bash
   set -a; . ./.env; set +a
   npx prisma migrate deploy
   ```

3. **Option C — `prisma db push`** Never on production. It skips migration history and causes drift. Only for throwaway local prototypes.

---

## 4. Validation step (run after EVERY migration)

### 4.1 CLI-level checks
```bash
cd pactopus
set -a; . ./.env; set +a

npx prisma migrate status
# Expected: "N migrations found in prisma/migrations" + "Database schema is up to date!"

npx prisma generate
# Regenerates PrismaClient; exits 0

npx tsc --noEmit -p tsconfig.json
# Expected: 0 errors
```

### 4.2 Schema-on-Neon check (Postgres catalog)
```sql
-- Tables in public schema
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' ORDER BY table_name;
-- Expect: AgentLog, Invoice, InvoiceUsage, Subscription, _prisma_migrations

-- Invoice new columns after invoice_owner_usage migration
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema='public' AND table_name='Invoice'
  AND column_name IN ('ownerAddress','isSystem')
ORDER BY column_name;
-- Expect: isSystem boolean NO default=false, ownerAddress text NO default=''

-- Unique composite key on InvoiceUsage
SELECT i.relname, ix.indisunique
FROM pg_class t
JOIN pg_index ix ON t.oid = ix.indrelid
JOIN pg_class i ON i.oid = ix.indexrelid
JOIN pg_namespace n ON n.oid = t.relnamespace
WHERE n.nspname='public'
  AND i.relname LIKE '%InvoiceUsage_ownerAddress_network_billingMonth%';
-- Expect: indisunique = true

-- _prisma_migrations 2 rows (both finished, not rolled back)
SELECT migration_name, finished_at IS NOT NULL AS applied,
       rolled_back_at IS NOT NULL AS rolled_back
FROM public."_prisma_migrations" ORDER BY started_at;
-- Expect: 0000_init applied, 202608…_invoice_owner_usage applied, rolled_back=false for both
```

### 4.3 Smoke E2E against Neon (optional but recommended for risky changes)
Create a temp TypeScript file (name it anything under `scripts/*.mts`, don't commit; delete after) that:
1. Connects via `prisma` from `lib/db.ts`
2. For a throwaway wallet, calls:
   - `getDashboardStats(network, throwaway_owner)` → expect `used=0/total=0`
   - 5x `createInvoice({ownerAddress: throwaway_owner, ...})` → all succeed
   - 6th `createInvoice` → throws `Free tier limit of 5 invoices/month reached`
   - `getMonthlyUsage(owner, network, nextMonthKey)` → `used=0` (cycle reset)
3. Deletes the throwaway rows via `prisma.invoice.deleteMany({where:{ownerAddress: throwaway_owner}})` + same for InvoiceUsage + AgentLog

---

## 5. Drift recovery (when migrate dev says "Drift detected" / "Need to reset")

Schema drift = what the migrations history says should be on Neon ≠ what is actually on Neon. The database has "drifted" away from the source of truth. This happens after:
- Running `prisma db push` on production
- Hand-running `ALTER TABLE`/`CREATE TABLE` via Neon SQL editor
- Switching Git branches that have different migration folders

### Recovery flow (production data PRESERVED)

#### Step A. Backup first (repeat Section 1.3!)
Always keep the 3 backups. If a later step goes wrong, restore:
```bash
# Restore binary backup to a *new* Neon branch first — NEVER overwrite prod directly
pg_restore --dbname="<new-branch-direct-url>" --no-owner --no-privileges \
  backups/neon-prod-YYYYMMDDTHHMMSSZ.dump
```

#### Step B. Find which direction drift is in
Run:
```bash
npx prisma migrate diff --from-migrations prisma/migrations --to-config-datasource
```
- **If output lists things Neon has that migrations don't** → drift is "Neon ahead of migrations". Fix: generate a new migration to bring history up to date.
- **If output lists things migrations expect but Neon lacks** → drift is "migrations ahead of Neon". Fix: apply the missing SQL by hand on Neon and mark the migration applied.

#### Step C. Case 1: Neon got manual ALTERs (neon-ahead-of-migrations)
```bash
# Introspect Neon → merge those changes into prisma/schema.prisma temporarily
npx prisma db pull   # overwrites schema.prisma with the live Neon introspection
# Now manually reconcile: copy any missing columns/indices you want to keep
# into the REAL prisma/schema.prisma (hand-merge because db pull strips @default(now()),
# enum names, @@unique composite syntax, etc.)
```
Then commit the reconciled `schema.prisma`, run:
```bash
npx prisma migrate dev --name bring_history_current
```
Prisma will create one migration containing all the changes that were missing from the migrations folder. No reset needed.

#### Step D. Case 2: Missing baseline (NO prisma/migrations folder, tables exist on Neon)
Redo Section 2 (baseline) carefully. The most common error:
> "I generated 0000_init from schema.prisma instead of live Neon" → delete bad row in `_prisma_migrations`, re-diff `--to-config-datasource`, re-apply.

#### Step E. Case 3: Reset is unavoidable (dev local only, throwaway data)
If this is a LOCAL clone with data you can re-seed, it's fine. Never do this on production/Neon:
```bash
# ONLY on a throwaway dev database.
npx prisma migrate reset
```

---

## 6. Troubleshooting FAQs for Pactopus + Neon + Prisma 7

### ❓ F1. `prepared statement "s0" already exists` on any migrate command
**Cause:** You're running CLI against the PgBouncer pooler URL. Missing `DIRECT_DATABASE_URL` or `prisma.config.ts` points at pooler.
**Fix:**
1. Add to `.env`:
   ```
   DIRECT_DATABASE_URL="<same as DATABASE_URL but strip the trailing '-pooler' from the hostname prefix>"
   ```
   Example fix:
   ```
   Pooler: ep-green-feather-axk7m99d-pooler.c-4.us-east-2.aws.neon.tech
   Direct: ep-green-feather-axk7m99d        .c-4.us-east-2.aws.neon.tech
   ```
2. Ensure `prisma.config.ts` reads:
   ```ts
   const cliConnection = process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL || '';
   export default defineConfig({ datasource: { url: cliConnection }, … });
   ```

### ❓ F2. `directUrl does not exist in type … Datasource` on prisma.config.ts TS2353
**Cause:** `datasource.directUrl` was removed in Prisma v7.
**Fix:** Remove the `directUrl` line from `datasource`. CLI uses the single `url` field and that connection must be the **direct endpoint**. PrismaClient runtime (`lib/db.ts`) uses `DATABASE_URL` (pooler) independently.

### ❓ F3. `datasource property url no longer supported in schema files`
**Cause:** Old Prisma 6 `datasource { url = env("DATABASE_URL") }` in schema.prisma.
**Fix:** Remove `url`/`directUrl` from schema.prisma, keep only `provider`, and set connection in `prisma.config.ts`.

### ❓ F4. `No migration found in prisma/migrations` + tables exist on Neon
**Fix:** Go to **Section 2 Baseline** and perform Step 2.1 → 2.3 exactly as written.

### ❓ F5. Migrate dev wants to **reset** public schema, lose data
**Cause:** Drift detected, Prisma's only generic path is reset.
**Fix:** Abort, back up (Section 1.3), go to **Section 5 Drift Recovery**, find which case it is, then apply the non-destructive path. Do NOT press Y.

### ❓ F6. Migration 0000_init marked applied but SQL in file doesn't match Neon
**Cause:** You regenerated the 0000_init/migration.sql file after marking it applied — checksum in `_prisma_migrations` no longer matches.
**Fix:**
1. Delete 0000_init row from `_prisma_migrations` via SQL: `DELETE FROM public."_prisma_migrations" WHERE migration_name='0000_init';`
2. Regenerate 0000_init SQL correctly (Section 2.1): `--from-empty --to-config-datasource`
3. Re-apply mark: `npx prisma migrate resolve --applied 0000_init`
4. Verify: `npx prisma migrate status`

### ❓ F7. Vercel build succeeds but new columns `undefined` at runtime
**Cause:** Vercel runs `prisma generate && next build` which generates client but never runs migrations. `migrate deploy` is missing.
**Fix:** See **Section 3.3** — add `prisma migrate deploy` before the build step.

### ❓ F8. `FATAL:  password authentication failed` / `The query parameter ... is not supported`
**Cause:** `channel_binding=require` in the URL combined with older Neon nodes.
**Fix:** Try adding `?sslmode=require` explicitly. If that fails, copy a fresh `Connection string → Prisma` pair directly from the Neon console (both Pooled and Direct tabs) and paste both into `.env`.

---

## 7. Long-term best practices to avoid drift

1. **One source of truth**: All schema changes happen by editing `prisma/schema.prisma` then running `prisma migrate dev --name <name>`. NEVER:
   - `prisma db push` on production
   - Hand-run ALTER/CREATE on the Neon public schema
   - Edit committed `migration.sql` files
2. **Always back up** 3 formats before migrations. Store backups in encrypted off-machine storage in addition to local `backups/`.
3. **Commit migrations folder.** `git add prisma/migrations/0000_init prisma/migrations/2026…_invoice_owner_usage`. A missing `prisma/migrations` on a teammate's branch = drift on their next `migrate dev`.
4. **Separate endpoints.** Pooler for PrismaClient runtime (`DATABASE_URL`). Direct for CLI (`prisma.config.ts` → `DIRECT_DATABASE_URL`). Do not mix.
5. **Pre-deploy deploy step.** In CI / Vercel build: `prisma migrate deploy && prisma generate && next build`.
6. **Baseline once.** Baseline is a ONE-TIME operation for existing unmanaged databases. Don't re-do it on every schema change. After baseline, use the normal workflow (Section 3).
7. **Never merge migration conflicts manually.** If two branches add migrations, rebase the later branch onto main so the migration timestamps are strictly ordered, then run `prisma migrate dev`. Prisma warns when migration history order is wrong.
8. **Naming convention:** `--name` should be lowercase snake_case noun phrases describing the *effect* of the change, not the feature branch name.
   - Good: `invoice_owner_usage`, `add_customer_tier_enum`
   - Bad: `fix-bug`, `jwt-login-cleanup`, `my-changes`

---

## 8. Quick-reference cheat-sheet

| Task | Command |
|---|---|
| Baseline (once, existing tables) | `mkdir -p prisma/migrations/0000_init && prisma migrate diff --from-empty --to-config-datasource --script --output prisma/migrations/0000_init/migration.sql && prisma migrate resolve --applied 0000_init` |
| Create + apply new migration (daily) | `prisma migrate dev --name <feature>` |
| Apply migrations on prod/vercel | `prisma migrate deploy` |
| Regenerate PrismaClient types | `prisma generate` |
| Status check | `prisma migrate status` |
| Drift between migrations and Neon | `prisma migrate diff --from-migrations prisma/migrations --to-config-datasource` |
| Mark existing migration applied | `prisma migrate resolve --applied <folder_name>` |
| Rollback last applied migration | `prisma migrate resolve --rolled-back <folder_name>` |
| Full production backup (3 files) | See Section 1.3 |
