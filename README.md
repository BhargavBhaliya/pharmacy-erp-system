# Pharmacy ERP

A multi-tenant, multi-branch Medical Store / Pharmacy ERP. See the original spec for full scope;
this repo is being built phase-by-phase (see "Project status" below).

## Stack

- **API**: Node.js + TypeScript + Express + Prisma → PostgreSQL, JWT auth (access + rotating refresh tokens)
- **Web**: React + TypeScript + Vite + Bootstrap 5
- **Shared**: `@pharmacy-erp/shared` — RBAC constants (modules/actions/default roles) used by both apps

Monorepo via npm workspaces: `apps/api`, `apps/web`, `packages/shared`.

## Project status

**Phase 1 — Foundation (done):** tenants, branches/warehouses/counters, users, roles &
permissions (RBAC, custom roles supported), JWT auth with refresh-token rotation, audit log,
tenant/branch data isolation enforced server-side. Basic UI for all of the above.

**Not built yet:** products/batches, inventory, purchase, POS/sales, prescriptions, accounting,
GST, reports, notifications, and everything else in the full spec. The dashboard explicitly
marks these as TODO rather than faking data.

## Local database

Development uses a **project-local PostgreSQL 17 cluster** (not the Windows service), stored at
`.pgdata/` in the repo root (git-ignored — never commit it). This was done deliberately: it avoids
needing Administrator/Windows-service privileges for day-to-day dev, and keeps this project's data
completely separate from any other Postgres install on the machine.

- Port: `5433` (not the Postgres default 5432, to avoid clashing with any other local install)
- Superuser: `postgres` / `localdev_pg_pw`
- Database: `pharmacy_erp`

### Start it

```powershell
& "C:\Program Files\PostgreSQL\17\bin\pg_ctl.exe" -D "D:\pharmacy-erp\.pgdata" -o "-p 5433" -l "D:\pharmacy-erp\.pgdata\server.log" start
```

### Stop it

```powershell
& "C:\Program Files\PostgreSQL\17\bin\pg_ctl.exe" -D "D:\pharmacy-erp\.pgdata" stop
```

### Check status

```powershell
& "C:\Program Files\PostgreSQL\17\bin\pg_ctl.exe" -D "D:\pharmacy-erp\.pgdata" status
```

No Administrator rights or Windows Service Manager access needed for any of the above — `pg_ctl`
just starts/stops a normal background process that you own.

## Environment variables

Copy `apps/api/.env.example` to `apps/api/.env` and fill in real values for production. For local
dev, `apps/api/.env` is already configured to point at the cluster above. Never commit `.env`.

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Postgres connection string |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | Signing secrets — generate with `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |
| `JWT_ACCESS_EXPIRES_IN` / `JWT_REFRESH_EXPIRES_IN` | Token lifetimes |
| `PORT` | API port (default 4000) |
| `CORS_ORIGIN` | Allowed frontend origin |

## Running

```powershell
# one-time
npm install
npm run prisma:migrate --workspace=apps/api   # applies schema
npm run prisma:seed --workspace=apps/api      # creates demo tenant + users

# day to day
npm run dev:api   # http://localhost:4000
npm run dev:web   # http://localhost:5173 (proxies /api to :4000)
```

## Tests

```powershell
cd apps/api
npx vitest run
```

Tests run against the real local database (not mocks) — each test creates its own tenant with a
random email and deletes it afterward (cascading delete cleans up everything under it).

## Demo login (development only)

Seeded by `npm run prisma:seed --workspace=apps/api`. Password for all: `Demo@12345`

| Role | Email |
|---|---|
| Super Admin (tenant owner) | owner@demo-pharmacy.test |
| Branch Manager | manager@demo-pharmacy.test |
| Pharmacist | pharmacist@demo-pharmacy.test |
| Billing/Cashier | cashier@demo-pharmacy.test |

## Architecture notes

- **Multi-tenancy**: every business table carries `tenantId`; all queries filter by
  `req.user.tenantId` server-side (never trust a client-supplied tenant id). Verified by
  automated tests in `apps/api/tests/rbac-tenant-isolation.test.ts`.
- **Branch isolation**: `Super Admin`/`Business Owner` roles see all branches in their tenant;
  every other role only sees branches explicitly assigned via `UserBranch`.
- **RBAC**: permissions are `(module, action)` pairs (e.g. `products.edit`), seeded once globally
  and granted to roles per-tenant. Admins can create custom roles and edit any role's permission
  set (`PUT /api/roles/:id/permissions`) — nothing is hardcoded to a role name in business logic,
  only the two tenant-wide role names above are special-cased for branch visibility.
- **Auth**: short-lived JWT access tokens (15m) + opaque, hashed, rotating refresh tokens (7d)
  stored server-side so individual sessions can be revoked (e.g. on password change).
- **Audit log**: every write in branches/users/roles records an entry; the API exposes no
  update/delete for audit logs — they're append-only from the app's perspective.
