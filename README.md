# Alkhair Flow — POS + Inventory + Loyalty

Vite + React + Tailwind + shadcn + TanStack Query + Supabase. Multi-branch from day one, ledger-based loyalty, branch-scoped RLS.

## Prerequisites

- Node 22 + npm 10 (or Bun)
- Supabase CLI 2.117+ (`npm i -g supabase` or `npx supabase`)
- A Supabase project (project ref `dnugnunwtkcaaodjlsdr` already linked)

## Env

Create `.env` (see `.env.example` if present) from your Supabase project → Project Settings → API:

```ini
VITE_SUPABASE_URL="https://dnugnunwtkcaaodjlsdr.supabase.co"
VITE_SUPABASE_PUBLISHABLE_KEY="eyJhbGci..."
VITE_SUPABASE_PROJECT_ID="dnugnunwtkcaaodjlsdr"
# Do NOT commit service_role keys to the frontend env.
# For scripts/seed only (local, gitignored):
# SUPABASE_SERVICE_ROLE_KEY="eyJhbGci..."
```

## Install & run

```bash
# install (repo has bun.lock + package-lock.json — either works)
npm install
# or
bun install

# dev (http://localhost:5173)
npm run dev

# typecheck + tests
npx tsc --noEmit
npm test

# production build (static SPA in dist/)
npm run build
npm run preview  # preview dist/ on :4173
```

## Supabase setup (linked project)

```bash
npx supabase login            # access token — already linked to dnugnunwtkcaaodjlsdr
npx supabase link --project-ref dnugnunwtkcaaodjlsdr  # if relinking
npx supabase db push --dry-run   # shows pending migrations
npx supabase db push             # applies supabase/migrations/*.sql (branches/categories/product_stock_levels/sales+sale_items/loyalty_*, RLS)
npx supabase gen types typescript --linked --schema public > src/integrations/supabase/types.ts
```

### What migrations do

- `20260923120000_loyalty_normalization.sql` — `branches` (PROD/SHOP/ONLINE seeded), `categories`, `products.category_id`, `product_stock_levels` (branch × product, backfilled from legacy `*_stock` columns), `sales`+`sale_items` (backfilled from `sale_records`), full loyalty model (`loyalty_customers/identifiers/ledger/rewards/redemptions/rules/*_exclusions/tiers/campaigns`) + `sales.customer_id/branch_id`, `transfer_records.from/to_branch_id`, `stock_adjustments.branch_id`, `gift_records.branch_id`, `profiles.branch_id`, roles `admin/branch_manager/cashier`.
- `20260923130000_branch_rls.sql` — `is_admin()/user_branch_id()/can_access_branch()` helpers + branch-scoped RLS for operational tables (`sales`, `product_stock_levels`, `transfer_records`, `stock_adjustments`, `gift_records`, `internal_transactions`); loyalty config admin-only; customers/ledger global-read (single account works across branches).

Legacy columns/tables (`products.shop_stock` etc., `sale_records`) stay during transition; writes dual-write to both.

### Auth & branches

```bash
# create branch-scoped staff via UI (super_admin required):
# User Management → Add User → role cashier|branch_manager + Branch SHOP/ONLINE → profile.branch_id set
# Or via service_role script (see seed-step1.cjs for example using supa.auth.admin.createUser + profiles.branch_id + user_roles).

# Smoke test (already seeded for verification)
# cashier@alkhair.test / Test1234! → SHOP (can sell/adjust SHOP only)
# manager@alkhair.test / Test1234! → ONLINE
# admin@alkhair.test   / Test1234! → global
# super@alkhair.test   / Super1234! → bypass RLS
```

### Email (Resend)

```bash
npx supabase secrets set RESEND_API_KEY=re_xxx RESEND_FROM="AL-KHAIR <noreply@alkhair.ng>"
npx supabase functions deploy send-email   # edge function at supabase/functions/send-email (auth-gated)
npx supabase secrets list                  # verify (do not commit keys)
```

Frontend sends via `src/lib/email.ts` → `supabase.functions.invoke("send-email")` (non-blocking, skips if `loyalty_customers.email` empty). Events: card issued (`loyalty.ts:registerCustomer`), POS earn/redeem (`sales.ts:createSale`), standalone redeem (`loyalty.ts:redeemReward`).

### Loyalty flow (V1)

`Register (phone/email) → QR token (random, no PII, LoyaltyQR + print/SVG) → Scan at POS (token or phone via Sales) → Attach to sale → Earn (rule amount_per_point/min_spend/exclusions × campaign multiplier) → Ledger → Redeem at POS (affordable rewards, discount/free-product, same transaction) → History / Admin dashboard / branch performance`. Balance = `SUM(loyalty_points_ledger.points)`. Void reverses earn+redeem.

## Deploy (static SPA)

Any static host works — `dist/` after `npm run build` is self-contained (hash filenames, no server). SPA fallback required (`index.html` for all routes).

### Vercel

```bash
npm i -g vercel
vercel --prod
# Framework: Vite, Build: npm run build, Output: dist
# Env in Vercel Dashboard → Settings → Environment Variables: VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY, VITE_SUPABASE_PROJECT_ID
```

### Netlify

- Build command: `npm run build`
- Publish directory: `dist`
- Redirects: `_redirects` or `netlify.toml` → `/* /index.html 200`
- Env as above.

### Cloudflare Pages

- Build: `npm run build`, Output: `dist`, Env as above, SPA fallback enabled.

### Docker / NGINX

```dockerfile
FROM node:22-alpine AS build
WORKDIR /app
COPY . .
RUN npm ci && npm run build
FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
```

`nginx.conf` snippet for SPA:

```nginx
try_files $uri $uri/ /index.html;
```

### Pre-deploy checklist

```bash
npx tsc --noEmit && npm test && npm run build
npx supabase db push --dry-run   # should be up-to-date
# rotate Test1234!/Super1234! via User Management → Reset Password
# confirm Resend secrets + send a test loyalty sale with email customer
```

## Scripts & structure

- `src/lib/loyalty.ts` — pure points math + SB layer (ledger-only balance, campaigns, redeem)
- `src/lib/inventory.ts` — branch-aware stock helpers (dual-write)
- `src/lib/sales.ts` — normalized sale (sales+items+stock+earn/redeem+void)
- `src/components/LoyaltyQR.tsx` (`qrcode.react`) — QR for any token
- `src/pages/loyalty/*` — Customers (QR, reissue, redeem, adjust, favourites, ledger, purchases), Rewards & Rules, Dashboard (campaigns × multiplier)
- `supabase/migrations` — run via CLI, never manually in SQL editor without `supabase gen types` sync.

## Troubleshooting

- `No such container: supabase_db_*` on `supabase status` — normal for linked remote-only projects; use `supabase db query --linked "..."`
- `sale_records` vs `sales` — both exist during transition; UI prefers `sales` and falls back to `sale_records` for revenue charts.
- `product_stock_levels` empty — run a stock adjustment or transfer once; dual-write backfills from legacy on migration.
