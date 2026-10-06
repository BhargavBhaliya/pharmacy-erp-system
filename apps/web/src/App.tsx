import { BrowserRouter, Routes, Route, Navigate, Outlet } from "react-router-dom";
import { AuthProvider } from "./auth/AuthContext";
import { RequireAuth, RequirePermission } from "./auth/RequireAuth";
import { AppLayout } from "./layout/AppLayout";
import { LoginPage } from "./pages/LoginPage";
import { RegisterBusinessPage } from "./pages/RegisterBusinessPage";
import { DashboardPage } from "./pages/DashboardPage";
import { BranchesPage } from "./pages/BranchesPage";
import { ProductsPage } from "./pages/ProductsPage";
import { CatalogPage } from "./pages/CatalogPage";
import { SuppliersPage } from "./pages/SuppliersPage";
import { InventoryPage } from "./pages/InventoryPage";
import { ExpiryPage } from "./pages/ExpiryPage";
import { PurchasesPage } from "./pages/PurchasesPage";
import { PurchaseReturnsPage } from "./pages/PurchaseReturnsPage";
import { CustomersPage } from "./pages/CustomersPage";
import { POSPage } from "./pages/POSPage";
import { SalesPage } from "./pages/SalesPage";
import { SalesReturnsPage } from "./pages/SalesReturnsPage";
import { ExpensesPage } from "./pages/ExpensesPage";
import { PaymentsPage } from "./pages/PaymentsPage";
import { CashSessionsPage } from "./pages/CashSessionsPage";
import { ReportsPage } from "./pages/ReportsPage";
import { SettingsPage } from "./pages/SettingsPage";
import { SaleInvoicePrintPage } from "./pages/SaleInvoicePrintPage";
import { ImpersonationLandingPage } from "./pages/ImpersonationLandingPage";
import { PlatformAuthProvider } from "./platform/auth/PlatformAuthContext";
import { RequirePlatformAuth } from "./platform/auth/RequirePlatformAuth";
import { PlatformLayout } from "./platform/layout/PlatformLayout";
import { PlatformLoginPage } from "./platform/pages/PlatformLoginPage";
import { StoreListPage } from "./platform/pages/StoreListPage";
import { CreateStorePage } from "./platform/pages/CreateStorePage";
import { StoreDetailPage } from "./platform/pages/StoreDetailPage";
import { BillingOverviewPage } from "./platform/pages/BillingOverviewPage";
import { NotificationsPage } from "./platform/pages/NotificationsPage";

export function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterBusinessPage />} />
          <Route path="/impersonate-landing" element={<ImpersonationLandingPage />} />

          <Route element={<RequireAuth />}>
            <Route element={<AppLayout />}>
              <Route path="/" element={<DashboardPage />} />
              <Route
                path="/branches"
                element={
                  <RequirePermission module="branches" action="view">
                    <BranchesPage />
                  </RequirePermission>
                }
              />
              <Route
                path="/products"
                element={
                  <RequirePermission module="products" action="view">
                    <ProductsPage />
                  </RequirePermission>
                }
              />
              <Route
                path="/catalog"
                element={
                  <RequirePermission module="products" action="view">
                    <CatalogPage />
                  </RequirePermission>
                }
              />
              <Route
                path="/suppliers"
                element={
                  <RequirePermission module="suppliers" action="view">
                    <SuppliersPage />
                  </RequirePermission>
                }
              />
              <Route
                path="/inventory"
                element={
                  <RequirePermission module="inventory" action="view">
                    <InventoryPage />
                  </RequirePermission>
                }
              />
              <Route
                path="/expiry"
                element={
                  <RequirePermission module="expiry" action="view">
                    <ExpiryPage />
                  </RequirePermission>
                }
              />
              <Route
                path="/purchases"
                element={
                  <RequirePermission module="purchase" action="view">
                    <PurchasesPage />
                  </RequirePermission>
                }
              />
              <Route
                path="/purchase-returns"
                element={
                  <RequirePermission module="purchase_return" action="view">
                    <PurchaseReturnsPage />
                  </RequirePermission>
                }
              />
              <Route
                path="/pos"
                element={
                  <RequirePermission module="pos" action="add">
                    <POSPage />
                  </RequirePermission>
                }
              />
              <Route
                path="/sales"
                element={
                  <RequirePermission module="sales" action="view">
                    <SalesPage />
                  </RequirePermission>
                }
              />
              <Route
                path="/sales-returns"
                element={
                  <RequirePermission module="sales_return" action="view">
                    <SalesReturnsPage />
                  </RequirePermission>
                }
              />
              <Route
                path="/customers"
                element={
                  <RequirePermission module="customers" action="view">
                    <CustomersPage />
                  </RequirePermission>
                }
              />
              <Route
                path="/expenses"
                element={
                  <RequirePermission module="expenses" action="view">
                    <ExpensesPage />
                  </RequirePermission>
                }
              />
              <Route path="/payments" element={<PaymentsPage />} />
              <Route path="/cash-sessions" element={<CashSessionsPage />} />
              <Route
                path="/reports"
                element={
                  <RequirePermission module="reports" action="view">
                    <ReportsPage />
                  </RequirePermission>
                }
              />
              <Route
                path="/settings"
                element={
                  <RequirePermission module="settings" action="view">
                    <SettingsPage />
                  </RequirePermission>
                }
              />
              <Route
                path="/sales/:id/print"
                element={
                  <RequirePermission module="sales" action="print">
                    <SaleInvoicePrintPage />
                  </RequirePermission>
                }
              />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Route>

          <Route
            path="/platform/*"
            element={
              <PlatformAuthProvider>
                <Outlet />
              </PlatformAuthProvider>
            }
          >
            <Route path="login" element={<PlatformLoginPage />} />
            <Route element={<RequirePlatformAuth />}>
              <Route element={<PlatformLayout />}>
                <Route index element={<Navigate to="/platform/stores" replace />} />
                <Route path="stores" element={<StoreListPage />} />
                <Route path="stores/new" element={<CreateStorePage />} />
                <Route path="stores/:id" element={<StoreDetailPage />} />
                <Route path="billing" element={<BillingOverviewPage />} />
                <Route path="notifications" element={<NotificationsPage />} />
              </Route>
            </Route>
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
