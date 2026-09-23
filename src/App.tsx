import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { AppLayout } from "@/components/AppLayout";
import Login from "./pages/Login";
import ResetPassword from "./pages/ResetPassword";
import Dashboard from "./pages/Dashboard";
import RawMaterials from "./pages/RawMaterials";
import Products from "./pages/Products";
import Purchases from "./pages/Purchases";
import Production from "./pages/Production";
import Transfers from "./pages/Transfers";
import Sales from "./pages/Sales";
import Expenses from "./pages/Expenses";
import Gifts from "./pages/Gifts";
import InternalTransactions from "./pages/InternalTransactions";
import ProfitLoss from "./pages/ProfitLoss";
import AuditLog from "./pages/AuditLog";
import StockAdjustments from "./pages/StockAdjustments";
import Vendors from "./pages/Vendors";
import VendorConsignments from "./pages/VendorConsignments";
import UserManagement from "./pages/UserManagement";
import AIDrafts from "./pages/AIDrafts";
import LoyaltyDashboard from "./pages/loyalty/Dashboard";
import LoyaltyCustomers from "./pages/loyalty/Customers";
import LoyaltyRewards from "./pages/loyalty/Rewards";
import PaymentChannels from "./pages/PaymentChannels";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

function RequireAdmin({ children }: { children: React.ReactNode }) {
  const { isAdmin, loading } = useAuth();
  if (loading) return null;
  if (!isAdmin) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function ProtectedRoutes() {
  const { user, loading, isSuperAdmin } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  return (
    <AppLayout>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/raw-materials" element={<RequireAdmin><RawMaterials /></RequireAdmin>} />
        <Route path="/products" element={<Products />} />
        <Route path="/purchases" element={<RequireAdmin><Purchases /></RequireAdmin>} />
        <Route path="/production" element={<RequireAdmin><Production /></RequireAdmin>} />
        <Route path="/transfers" element={<RequireAdmin><Transfers /></RequireAdmin>} />
        <Route path="/sales" element={<Sales />} />
        <Route path="/pos-banks" element={<RequireAdmin><PaymentChannels /></RequireAdmin>} />
        <Route path="/internal" element={<RequireAdmin><InternalTransactions /></RequireAdmin>} />
        <Route path="/expenses" element={<RequireAdmin><Expenses /></RequireAdmin>} />
        <Route path="/gifts" element={<RequireAdmin><Gifts /></RequireAdmin>} />
        <Route path="/profit-loss" element={<RequireAdmin><ProfitLoss /></RequireAdmin>} />
        <Route path="/stock-adjustments" element={<StockAdjustments />} />
        <Route path="/vendors" element={<RequireAdmin><Vendors /></RequireAdmin>} />
        <Route path="/vendor-ops" element={<RequireAdmin><VendorConsignments /></RequireAdmin>} />
        <Route path="/ai-drafts" element={<RequireAdmin><AIDrafts /></RequireAdmin>} />
        <Route path="/loyalty" element={<LoyaltyDashboard />} />
        <Route path="/loyalty/customers" element={<LoyaltyCustomers />} />
        <Route path="/loyalty/rewards" element={<LoyaltyRewards />} />
        <Route path="/audit-log" element={<RequireAdmin><AuditLog /></RequireAdmin>} />
        {isSuperAdmin && <Route path="/users" element={<UserManagement />} />}
        <Route path="*" element={<NotFound />} />
      </Routes>
    </AppLayout>
  );
}

function AuthGate() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (user) return <Navigate to="/" replace />;
  return <Login />;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <AuthProvider>
        <BrowserRouter basename={import.meta.env.BASE_URL}>
          <Routes>
            <Route path="/login" element={<AuthGate />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/*" element={<ProtectedRoutes />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
