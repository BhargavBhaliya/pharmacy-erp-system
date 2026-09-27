// Canonical lists of modules/actions. These seed the `permissions` table and are used for
// type-safe checks in route handlers (requirePermission(module, action)). Roles themselves
// are DB rows (not this enum) so admins can create custom roles per spec section 2.

export const PERMISSION_MODULES = [
  "dashboard",
  "pos",
  "sales",
  "sales_return",
  "purchase",
  "purchase_return",
  "products",
  "batches",
  "inventory",
  "stock_transfer",
  "expiry",
  "customers",
  "doctors",
  "suppliers",
  "prescriptions",
  "expenses",
  "payments",
  "accounting",
  "reports",
  "branches",
  "users",
  "roles",
  "notifications",
  "settings",
  "audit_logs",
] as const;

export type PermissionModule = (typeof PERMISSION_MODULES)[number];

export const PERMISSION_ACTIONS = [
  "view",
  "add",
  "edit",
  "delete",
  "approve",
  "cancel",
  "export",
  "print",
  "discount",
  "refund",
  "stock_adjustment",
] as const;

export type PermissionAction = (typeof PERMISSION_ACTIONS)[number];

// Not every action makes sense on every module. This map drives seed-data generation so we
// don't create meaningless rows like purchase.refund.
export const MODULE_ACTIONS: Record<PermissionModule, PermissionAction[]> = {
  dashboard: ["view"],
  pos: ["view", "add", "discount"],
  sales: ["view", "add", "edit", "cancel", "export", "print", "discount"],
  sales_return: ["view", "add", "approve", "refund"],
  purchase: ["view", "add", "edit", "delete", "approve", "export", "print"],
  purchase_return: ["view", "add", "approve"],
  products: ["view", "add", "edit", "delete", "export"],
  batches: ["view", "add", "edit"],
  inventory: ["view", "stock_adjustment", "export"],
  stock_transfer: ["view", "add", "approve"],
  expiry: ["view", "export"],
  customers: ["view", "add", "edit", "delete", "export"],
  doctors: ["view", "add", "edit", "delete"],
  suppliers: ["view", "add", "edit", "delete", "export"],
  prescriptions: ["view", "add", "edit"],
  expenses: ["view", "add", "edit", "approve", "export"],
  payments: ["view", "add", "edit"],
  accounting: ["view", "export"],
  reports: ["view", "export", "print"],
  branches: ["view", "add", "edit", "delete"],
  users: ["view", "add", "edit", "delete"],
  roles: ["view", "add", "edit", "delete"],
  notifications: ["view"],
  settings: ["view", "edit"],
  audit_logs: ["view", "export"],
};

export const DEFAULT_ROLES = [
  "Super Admin",
  "Business Owner",
  "Branch Manager",
  "Pharmacist",
  "Sales Executive",
  "Billing/Cashier",
  "Purchase Manager",
  "Inventory Manager",
  "Accountant",
  "Store Manager",
  "Delivery Staff",
  "Auditor",
] as const;

export type DefaultRoleName = (typeof DEFAULT_ROLES)[number];

// Discount limits per default role, percentage. Admin/custom roles are configured via the
// discount_limit column on the role itself (see prisma schema) rather than this table, but
// this seeds a sane starting point in line with spec section 30.
export const DEFAULT_DISCOUNT_LIMIT_PERCENT: Partial<Record<DefaultRoleName, number>> = {
  "Billing/Cashier": 5,
  "Sales Executive": 5,
  "Branch Manager": 15,
  "Store Manager": 15,
  "Business Owner": 100,
  "Super Admin": 100,
};

// Starting permission grants per default role. Entries are "module.action" or "module.*"
// (expanded against MODULE_ACTIONS at seed time). These are editable afterwards by an admin
// via the roles UI/API — this is only the day-one default, not a hardcoded restriction.
export const DEFAULT_ROLE_PERMISSION_GRANTS: Record<DefaultRoleName, string[]> = {
  "Super Admin": ["*.*"],
  "Business Owner": ["*.*"],
  "Branch Manager": [
    "dashboard.*", "pos.*", "sales.*", "sales_return.*", "purchase.*", "purchase_return.*",
    "products.*", "batches.*", "inventory.*", "stock_transfer.*", "expiry.*", "customers.*",
    "doctors.*", "suppliers.*", "prescriptions.*", "expenses.*", "payments.*", "accounting.view",
    "reports.*", "branches.view", "users.view", "users.add", "users.edit", "notifications.view",
  ],
  "Pharmacist": [
    "dashboard.view", "pos.view", "pos.add", "pos.discount", "sales.view", "sales.add", "sales.print",
    "sales_return.view", "sales_return.add", "products.view", "batches.view", "batches.add",
    "batches.edit", "inventory.view", "expiry.view", "customers.view", "customers.add",
    "customers.edit", "doctors.view", "doctors.add", "prescriptions.*", "reports.view",
  ],
  "Sales Executive": [
    "dashboard.view", "pos.view", "pos.add", "pos.discount", "sales.view", "sales.add", "sales.print",
    "customers.view", "customers.add", "customers.edit", "doctors.view", "reports.view",
  ],
  "Billing/Cashier": [
    "dashboard.view", "pos.view", "pos.add", "pos.discount", "sales.view", "sales.add", "sales.print",
    "payments.view", "payments.add", "customers.view",
  ],
  "Purchase Manager": [
    "dashboard.view", "purchase.*", "purchase_return.*", "suppliers.*", "products.view",
    "products.add", "products.edit", "batches.view", "batches.add", "batches.edit",
    "inventory.view", "reports.view", "reports.export",
  ],
  "Inventory Manager": [
    "dashboard.view", "inventory.*", "stock_transfer.*", "batches.*", "products.view",
    "products.add", "products.edit", "expiry.*", "reports.view", "reports.export",
  ],
  "Accountant": [
    "dashboard.view", "accounting.*", "payments.*", "expenses.*", "reports.*", "customers.view",
    "suppliers.view",
  ],
  "Store Manager": [
    "dashboard.*", "pos.*", "sales.*", "sales_return.*", "purchase.*", "purchase_return.*",
    "products.*", "batches.*", "inventory.*", "stock_transfer.*", "expiry.*", "customers.*",
    "doctors.*", "suppliers.*", "prescriptions.*", "reports.*", "notifications.view",
  ],
  "Delivery Staff": ["dashboard.view", "sales.view", "customers.view"],
  "Auditor": [
    "dashboard.view", "sales.view", "sales.export", "purchase.view", "purchase.export",
    "inventory.view", "inventory.export", "accounting.view", "accounting.export",
    "reports.*", "audit_logs.view", "audit_logs.export", "customers.view", "suppliers.view",
  ],
};

export function expandPermissionGrants(grants: string[]): string[] {
  const codes = new Set<string>();
  for (const grant of grants) {
    const [module, action] = grant.split(".");
    if (module === "*" && action === "*") {
      for (const m of PERMISSION_MODULES) {
        for (const a of MODULE_ACTIONS[m]) codes.add(`${m}.${a}`);
      }
    } else if (action === "*") {
      const m = module as PermissionModule;
      for (const a of MODULE_ACTIONS[m] ?? []) codes.add(`${m}.${a}`);
    } else {
      codes.add(grant);
    }
  }
  return Array.from(codes);
}
