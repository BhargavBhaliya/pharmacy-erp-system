import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./auth/AuthContext";
import { RequireAuth, RequirePermission } from "./auth/RequireAuth";
import { AppLayout } from "./layout/AppLayout";
import { LoginPage } from "./pages/LoginPage";
import { RegisterBusinessPage } from "./pages/RegisterBusinessPage";
import { DashboardPage } from "./pages/DashboardPage";
import { BranchesPage } from "./pages/BranchesPage";
import { UsersPage } from "./pages/UsersPage";
import { RolesPage } from "./pages/RolesPage";
import { AuditLogsPage } from "./pages/AuditLogsPage";
import { ProductsPage } from "./pages/ProductsPage";
import { CatalogPage } from "./pages/CatalogPage";
import { SuppliersPage } from "./pages/SuppliersPage";
import { InventoryPage } from "./pages/InventoryPage";
import { ExpiryPage } from "./pages/ExpiryPage";
import { StockTransfersPage } from "./pages/StockTransfersPage";

export function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterBusinessPage />} />

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
                path="/users"
                element={
                  <RequirePermission module="users" action="view">
                    <UsersPage />
                  </RequirePermission>
                }
              />
              <Route
                path="/roles"
                element={
                  <RequirePermission module="roles" action="view">
                    <RolesPage />
                  </RequirePermission>
                }
              />
              <Route
                path="/audit-logs"
                element={
                  <RequirePermission module="audit_logs" action="view">
                    <AuditLogsPage />
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
                path="/stock-transfers"
                element={
                  <RequirePermission module="stock_transfer" action="view">
                    <StockTransfersPage />
                  </RequirePermission>
                }
              />
            </Route>
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
