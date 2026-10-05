# Pharmacy ERP

A multi-tenant, multi-branch Medical Store / Pharmacy ERP: auth & RBAC, product/batch/expiry
inventory with FEFO, purchase workflow, POS/sales, customers/doctors/prescriptions, basic
accounting (expenses, receipts, supplier payments, cash sessions), reports, notifications,
barcode labels, and tenant-scoped settings/backup.

All 8 planned phases are built, tested, and committed. See **Known limitations** below for what
is deliberately out of scope rather than half-built.

---

## 1. Architecture

**Monorepo** (npm workspaces): `apps/api`, `apps/web`, `packages/shared`.

```
apps/api/   Node.js + TypeScript + Express + Prisma → PostgreSQL
apps/web/   React + TypeScript + Vite + Bootstrap 5
packages/shared/   RBAC constants (modules/actions/default roles/permission grants)
                    used by both apps so the frontend and backend agree on what a
                    permission code looks like.
```

**Multi-tenancy**: one shared PostgreSQL database; every business table carries `tenantId`.
Every query filters by `req.user.tenantId` server-side — never a client-supplied value. Verified
by `tests/rbac-tenant-isolation.test.ts` (one tenant genuinely cannot read another's rows) and
`tests/settings.test.ts` (a data export never contains another tenant's rows).

**Branch isolation**: `Super Admin` / `Business Owner` roles see every branch in their tenant;
every other role only sees branches explicitly assigned via `UserBranch`. Enforced in
`middleware/auth.ts`, not just hidden in the UI.

**RBAC**: permissions are `(module, action)` pairs (e.g. `products.edit`), seeded once globally
(`ensureGlobalPermissions`) and granted to roles per-tenant at registration
(`seedDefaultRolesForTenant`, driven by `DEFAULT_ROLE_PERMISSION_GRANTS` in the shared package).
Admins can create custom roles and edit any role's permission set via the Roles UI — nothing in
business logic is hardcoded to a role name except the two tenant-wide role names used for branch
visibility.

**Auth**: short-lived JWT access tokens (15 min) + opaque, hashed, rotating refresh tokens
(7 days, httpOnly cookie) stored server-side so individual sessions can be revoked (e.g. on
password change). Auth endpoints are rate-limited separately from the general API limiter.

**Inventory correctness** (the part of the spec most concerned with data integrity):
- Every stock change writes an immutable `StockTransaction` row (`lib/inventory.ts`) inside the
  same DB transaction as the balance update — purchase, sale, sale return, purchase return,
  transfer, and manual adjustment all go through one function (`adjustStock`).
- **FEFO** (`findAvailableBatchesFefo` / `allocateFefoQuantity`): a sale allocates against the
  soonest-expiring non-expired batch(es) first, splitting across batches when one runs out. A
  batch past its expiry date is excluded from FEFO and `adjustStock` additionally refuses to
  reduce a batch for a `SALE` transaction if it's expired, even called directly.
- Every `SaleItem` and `PurchaseItem` references its exact `batchId`, so stock is traceable
  purchase → batch → sale → return, per spec.

**Document numbering**: `lib/documentNumber.ts` gives every Purchase/PO/Purchase Return/Sale/Sale
Return a financial-year-scoped, atomically-incremented number (e.g. `INV/2026-27/000001`), reset
each FY per the tenant's configured `financialYearStartMonth`.

**Money without a parallel ledger**: rather than a separate double-entry ledger duplicating data,
reports and cash-session variance are computed directly from source documents (Sale/Purchase
payments, approved Expenses) at read time. See *Known limitations* for the tradeoff.

---

## 2. Database schema

Defined in `apps/api/prisma/schema.prisma` (single source of truth; 9 migrations applied in
order under `apps/api/prisma/migrations/`). Grouped by the phase that introduced them:

| Area | Models |
|---|---|
| Tenancy & org | `Tenant`, `Branch`, `Warehouse`, `Counter` |
| Auth & RBAC | `User`, `UserBranch`, `Role`, `Permission`, `RolePermission`, `RefreshToken` |
| Cross-cutting | `AuditLog`, `Setting`, `Notification` |
| Product & inventory | `Manufacturer`, `ProductCategory`, `Unit`, `Supplier`, `Product`, `ProductBarcode`, `Batch`, `StockTransaction`, `StockTransfer`, `StockTransferItem` |
| Purchase | `InvoiceSequence`, `PurchaseOrder`, `PurchaseOrderItem`, `Purchase`, `PurchaseItem`, `PurchasePayment`, `PurchaseReturn`, `PurchaseReturnItem` |
| Sales / POS | `Doctor`, `Customer`, `Prescription`, `PrescriptionItem`, `Sale`, `SaleItem`, `SalePayment`, `SalesReturn`, `SalesReturnItem` |
| Money | `ExpenseCategory`, `Expense`, `Receipt`, `ReceiptAllocation`, `SupplierPayment`, `SupplierPaymentAllocation`, `CashSession` |

Foreign keys use `onDelete: Cascade` wherever a tenant (or a document like a Sale) fully owns a
child row, and `SetNull` for optional references to shared catalog data (e.g. deleting a
Manufacturer nulls it out on products rather than deleting them). This was tightened twice during
testing — a full tenant delete must cascade cleanly, which surfaced two rounds of relations left
at the implicit `RESTRICT` default (see migrations `fix_cascade_deletes` and
`fix_more_cascade_deletes`).

---

## 3. API

REST, mounted under `/api/*` in `apps/api/src/app.ts`. Every route requires a Bearer access
token (`authenticate` middleware) except `/health`, `/auth/register-business`, `/auth/login`,
`/auth/refresh`. Every mutating route also runs `requirePermission(module, action)` and, where
relevant, checks the target `branchId` against the caller's assigned branches.

| Base path | Covers |
|---|---|
| `/api/auth` | register-business, login, refresh, logout, me |
| `/api/branches`, `/api/counters` | branch & counter setup |
| `/api/users`, `/api/roles` | user management, custom roles, permission matrix |
| `/api/audit-logs` | append-only audit trail (no update/delete exposed) |
| `/api/manufacturers`, `/api/product-categories`, `/api/units` | product catalog lookups |
| `/api/products`, `/api/batches` | product master, batch entry |
| `/api/inventory` | stock view, low-stock, expiry, stock adjustment, ledger |
| `/api/stock-transfers` | request → approve → dispatch → receive |
| `/api/suppliers`, `/api/purchase-orders`, `/api/purchases`, `/api/purchase-returns`, `/api/supplier-payments` | purchase side |
| `/api/customers`, `/api/doctors`, `/api/prescriptions` | patient-side masters |
| `/api/sales`, `/api/sales-returns` | POS billing, invoice cancel, returns |
| `/api/expense-categories`, `/api/expenses`, `/api/receipts`, `/api/cash-sessions` | money |
| `/api/reports` | grouped sales/purchase reports, stock valuation, movement (CSV via `?format=csv`) |
| `/api/notifications` | in-app notification feed |
| `/api/settings` | business profile, generic key/value settings, branding, tenant data export |

No separate API reference document is generated; route files under `apps/api/src/modules/*/*.routes.ts`
are the source of truth, each with a `*.validation.ts` sibling defining the exact request shape (zod schemas).

---

## 4. Installation

Prerequisites: Node.js 20+, PostgreSQL (see section 8 for how this project set up its own local instance).

```powershell
npm install
npm run prisma:migrate --workspace=apps/api   # applies all migrations
npm run prisma:seed --workspace=apps/api      # demo tenant + data (dev only)
```

## 5. Environment variables

Copy `apps/api/.env.example` to `apps/api/.env`.

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Postgres connection string |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | ≥16-char signing secrets — generate with `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |
| `JWT_ACCESS_EXPIRES_IN` / `JWT_REFRESH_EXPIRES_IN` | Token lifetimes (default `15m` / `7d`) |
| `PORT` | API port (default 4000) |
| `NODE_ENV` | `development` \| `test` \| `production` |
| `CORS_ORIGIN` | Allowed frontend origin (default `http://localhost:5173`) |
| `PLATFORM_JWT_ACCESS_SECRET` | ≥16-char signing secret for Platform Admin tokens — **must differ** from `JWT_ACCESS_SECRET` so a tenant-user token can never be accepted by platform routes or vice versa |
| `PLATFORM_JWT_ACCESS_EXPIRES_IN` / `PLATFORM_JWT_REFRESH_EXPIRES_IN` | Platform Admin token lifetimes (default `30m` / `7d`) |

## 6. Admin setup

1. `POST /api/auth/register-business` (or the "Register a new business" link on the login page)
   creates a `Tenant`, a "Main Branch" with a warehouse and counter, all 12 default roles
   (pre-wired with sensible permission grants — see `DEFAULT_ROLE_PERMISSION_GRANTS` in
   `packages/shared/src/rbac.ts`), and the registering user as **Super Admin**.
2. From Settings, fill in GSTIN, PAN, drug license, address, invoice footer, and financial year
   start month.
3. Add branches under **Branches**, then warehouses/counters per branch as needed.
4. Add a manufacturer, category, and unit or two under **Catalog** before entering products.

### 6a. Platform Super Admin (managing many stores from one place)

Separate from the per-tenant "Super Admin" role above: a **Platform Admin** is a single
operator identity (you, the business running this CRM for 50+ pharmacy stores) that sits
outside every tenant entirely. It has its own login, its own JWT signing secret and payload
shape, and its own refresh-token table — a tenant user's token is never accepted by platform
routes, and a platform token is never accepted by the normal app, by construction (different
secrets, different payload).

**One-time setup** — there is no sign-up page for this, deliberately:

```powershell
cd apps/api
$env:PLATFORM_ADMIN_NAME="Your Name"
$env:PLATFORM_ADMIN_EMAIL="you@example.com"
$env:PLATFORM_ADMIN_PASSWORD="choose-a-strong-password"
npm run seed:platform-admin
```

Running it again once an admin exists is a no-op (prints a message and exits) — there is
intentionally no API endpoint that can create one.

**Using it**: sign in at `/platform/login` (separate from the normal `/login`). From
`/platform/stores` you can:

- **Create a store** — sets up the tenant, its Main Branch/Warehouse/Counter, all default
  roles, and the owner's first login, exactly like self-service registration does, plus a
  human-readable **Store Code** (`STORE-0001`, `STORE-0002`, ...).
- **Search/filter** stores by name, email, store code, or active/inactive status.
- **Edit store details**, **activate/deactivate** a store (deactivating immediately blocks
  that store's users — both new logins and any already-open session, checked on every
  request), **reset a store user's password** (shown once, forces re-login everywhere), and
  **"Access this store"** — a one-click, no-password hand-off into the normal app logged in as
  a chosen store user, for support. Every one of these actions is written to *that store's own*
  Audit Logs page (`module: "platform_admin"`) so it's never invisible to the store owner.

Every `/api/platform/*` route takes the target store's id from the URL and is gated solely by
platform-admin authentication — the existing per-request `tenantId` scoping used everywhere
else in the app is what every *tenant* route still relies on; this layer is the one place that
deliberately reaches across stores, and only an authenticated Platform Admin can reach it.

## 7. User / role setup

- **Users** page: create a user, assign one of the default roles (or a custom one), and tick the
  branches they may operate in. Leaving branches empty means no branch access at all.
- **Roles** page: view any role's granted permissions as a checkbox matrix and save changes
  immediately; default (system) roles can be edited but not deleted. Create a custom role from
  scratch with `POST /api/roles`.
- Discount limits are per-role (`Role.discountLimitPercent`), enforced server-side in the POS
  sale endpoint regardless of what the UI shows.

## 8. Backup instructions

This project's local dev database is a **project-local Postgres cluster** (not the Windows
service), because setting up the system Postgres install's password required Windows
Administrator/service-control rights this session didn't have. See the commands below to
start/stop it — no admin rights needed for any of them.

```powershell
# Start
& "C:\Program Files\PostgreSQL\17\bin\pg_ctl.exe" -D "D:\pharmacy-erp\.pgdata" -o "-p 5433" -l "D:\pharmacy-erp\.pgdata\server.log" start
# Stop
& "C:\Program Files\PostgreSQL\17\bin\pg_ctl.exe" -D "D:\pharmacy-erp\.pgdata" stop
# Status
& "C:\Program Files\PostgreSQL\17\bin\pg_ctl.exe" -D "D:\pharmacy-erp\.pgdata" status
```

**Full database backup** (all tenants, admin operation): standard `pg_dump`/`pg_restore` against
`DATABASE_URL` — nothing pharmacy-specific here, any Postgres backup tool works.

**Per-tenant backup** (in-app): Settings → "Download backup (JSON)", or `GET
/api/settings/export/data` (requires `settings.edit`). Exports exactly one tenant's own data —
a raw `pg_dump` would leak other tenants' rows since they share one database. **There is no
restore-from-this-export feature** — see Known limitations.

## 9. Deployment

Not deployed anywhere by this session — this was built and verified entirely in a local dev
environment. For a real deployment: run `apps/api` behind a process manager (pm2/systemd) or as a
container, point `DATABASE_URL` at a managed Postgres instance, serve `apps/web`'s Vite build
(`npm run build --workspace=apps/web`) as static files behind a reverse proxy that also proxies
`/api` to the API process, and set real (not dev) `JWT_*` secrets and `CORS_ORIGIN`.

## 10. Testing report

44 automated tests, all passing, run against a **real** local Postgres database — no mocks. Each
test creates its own tenant with a randomized email and deletes it in `afterAll` (cascading
delete cleans up everything under it).

| File | Tests | Covers |
|---|---|---|
| `auth.test.ts` | 6 | registration, login, `/me`, refresh rotation, bad-token rejection |
| `rbac-tenant-isolation.test.ts` | 3 | permission denial, cross-tenant read block, cross-tenant role assignment block |
| `inventory.test.ts` | 9 | batch creation ledger, FEFO ordering, expired-sale block, stock adjustment, low-stock, expiry, branch isolation, stock transfer workflow |
| `purchase.test.ts` | 5 | PO numbering, GST math, batch accumulation, payment FIFO/overpay rejection, purchase return |
| `sales.test.ts` | 9 | FEFO multi-batch allocation, over-sell rejection, expired-sale block, credit limit, discount limit by role, cancellation stock reversal, sales return approval workflow |
| `accounting.test.ts` | 4 | expense approval by role, customer receipt FIFO, supplier payment FIFO, cash session variance |
| `reports.test.ts` | 3 | sales grouping + CSV export, stock valuation, movement classification |
| `notifications.test.ts` | 2 | event-triggered notifications, mark-as-read |
| `settings.test.ts` | 3 | business profile update, generic setting read/write, tenant-scoped export isolation |

Run with `cd apps/api && npx vitest run`. **Run it with the dev servers stopped** — this
project's local Postgres is a fresh cluster with a low default `max_connections`, and the dev
servers plus every test file's own Prisma connection pool running concurrently was observed to
occasionally exhaust it (one flaky "can't reach database server" failure during development,
gone on retry with the servers stopped). Not a code bug, just a connection-count ceiling on this
particular local database.

No frontend test suite exists — every page was instead manually exercised end-to-end via curl
through the actual Vite dev-server proxy (the same path a browser uses) after each phase, since
this session had no browser-automation tool available. A human should still click through the UI
before considering this production-ready; automated API tests verify business logic, not that a
button is wired to the right handler.

## 11. Known limitations

Deliberate scope cuts, not oversights — flagged here rather than silently left half-built:

- **No file uploads.** `imageUrl`/`receiptUrl`/`signatureUrl`/prescription image fields exist in
  the schema but there is no upload endpoint or storage backend behind them.
- **No restore-from-backup.** Export works; re-importing a JSON export back into the database
  does not exist.
- **No PDF generation.** "Export" is CSV (opens fine in Excel); "print" uses the browser's native
  print via `window.print()` on purpose-built print layouts (invoice, barcode labels, reports) —
  there's no server-side PDF renderer.
- **No parallel double-entry ledger.** Day-book/cash-book-style figures are computed from source
  documents (payments, expenses) at read time rather than a `ledger_entries` table. Correct for
  everything currently built, but a real day-book report with opening/closing balances per
  account would want that table.
- **Purchase has no draft/confirm split.** Creating a purchase immediately books stock — there's
  no separate "goods received, not yet invoiced" state.
- **Approval rules are hardcoded per module**, not a generic configurable rules engine. An admin
  can't currently define "discounts over 10% need approval" through a UI; it's one fixed rule per
  workflow (sales returns, expenses) gated by a permission.
- **No automated frontend tests**, and no background job runner — notifications are created
  synchronously at the moment of the triggering action, not via a scheduled sweep (so a "product
  about to expire in 3 days" won't generate a notification on its own; the Expiry page still
  shows it correctly on demand).
- Prisma 5.22 is in use; a Prisma 8 major upgrade is available but not applied.

## 12. Future enhancement recommendations

In rough priority order for a real deployment:
1. File storage (product images, prescription scans, expense receipts, purchase invoice scans).
2. A scheduled job (cron or worker) for expiry/low-stock notification sweeps instead of only
   event-triggered ones.
3. PDF invoice generation for emailing/archiving, not just browser print.
4. A configurable approval-rules engine (spec section 29) instead of the current hardcoded gates.
5. WhatsApp/SMS/email delivery for invoices and notifications (architecture already isolates
   notification creation in `lib/notify.ts`, so a delivery channel can hook in there).
6. Payment gateway / UPI integration for online collection.
7. A proper day-book/ledger table if double-entry accounting reports become a hard requirement.
8. Multi-currency / multi-language if expanding beyond a single-currency, single-language market.
