"use strict";
// Canonical lists of modules/actions. These seed the `permissions` table and are used for
// type-safe checks in route handlers (requirePermission(module, action)). Roles themselves
// are DB rows (not this enum) so admins can create custom roles per spec section 2.
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_ROLE_PERMISSION_GRANTS = exports.DEFAULT_DISCOUNT_LIMIT_PERCENT = exports.DEFAULT_ROLES = exports.MODULE_ACTIONS = exports.PERMISSION_ACTIONS = exports.PERMISSION_MODULES = void 0;
exports.expandPermissionGrants = expandPermissionGrants;
exports.PERMISSION_MODULES = [
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
];
exports.PERMISSION_ACTIONS = [
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
];
// Not every action makes sense on every module. This map drives seed-data generation so we
// don't create meaningless rows like purchase.refund.
exports.MODULE_ACTIONS = {
    dashboard: ["view"],
    pos: ["view", "add", "discount"],
    sales: ["view", "add", "edit", "cancel", "export", "print", "discount"],
    sales_return: ["view", "add", "approve", "refund"],
    purchase: ["view", "add", "edit", "delete", "approve", "cancel", "export", "print"],
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
exports.DEFAULT_ROLES = [
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
];
// Discount limits per default role, percentage. Admin/custom roles are configured via the
// discount_limit column on the role itself (see prisma schema) rather than this table, but
// this seeds a sane starting point in line with spec section 30.
exports.DEFAULT_DISCOUNT_LIMIT_PERCENT = {
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
exports.DEFAULT_ROLE_PERMISSION_GRANTS = {
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
function expandPermissionGrants(grants) {
    const codes = new Set();
    for (const grant of grants) {
        const [module, action] = grant.split(".");
        if (module === "*" && action === "*") {
            for (const m of exports.PERMISSION_MODULES) {
                for (const a of exports.MODULE_ACTIONS[m])
                    codes.add(`${m}.${a}`);
            }
        }
        else if (action === "*") {
            const m = module;
            for (const a of exports.MODULE_ACTIONS[m] ?? [])
                codes.add(`${m}.${a}`);
        }
        else {
            codes.add(grant);
        }
    }
    return Array.from(codes);
}
