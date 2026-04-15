import { lazy, Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { AppLayout } from "@/components/AppLayout";

const Login = lazy(() => import("./pages/Login"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const RawMaterials = lazy(() => import("./pages/RawMaterials"));
const Products = lazy(() => import("./pages/Products"));
const Purchases = lazy(() => import("./pages/Purchases"));
const Production = lazy(() => import("./pages/Production"));
const Transfers = lazy(() => import("./pages/Transfers"));
const Sales = lazy(() => import("./pages/Sales"));
const Expenses = lazy(() => import("./pages/Expenses"));
const Gifts = lazy(() => import("./pages/Gifts"));
const InternalTransactions = lazy(() => import("./pages/InternalTransactions"));
const ProfitLoss = lazy(() => import("./pages/ProfitLoss"));
const AuditLog = lazy(() => import("./pages/AuditLog"));
const StockAdjustments = lazy(() => import("./pages/StockAdjustments"));
const Vendors = lazy(() => import("./pages/Vendors"));
const VendorConsignments = lazy(() => import("./pages/VendorConsignments"));
const UserManagement = lazy(() => import("./pages/UserManagement"));
const NotFound = lazy(() => import("./pages/NotFound"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      staleTime: 60_000,
    },
  },
});

function LoadingScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <p className="text-muted-foreground">Loading...</p>
    </div>
  );
}

function ProtectedRoutes() {
  const { user, loading } = useAuth();

  if (loading) {
    return <LoadingScreen />;
  }

  if (!user) return <Navigate to="/login" replace />;

  return (
    <AppLayout>
      <Suspense fallback={<LoadingScreen />}>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/raw-materials" element={<RawMaterials />} />
          <Route path="/products" element={<Products />} />
          <Route path="/purchases" element={<Purchases />} />
          <Route path="/production" element={<Production />} />
          <Route path="/transfers" element={<Transfers />} />
          <Route path="/sales" element={<Sales />} />
          <Route path="/internal" element={<InternalTransactions />} />
          <Route path="/expenses" element={<Expenses />} />
          <Route path="/gifts" element={<Gifts />} />
          <Route path="/profit-loss" element={<ProfitLoss />} />
          <Route path="/stock-adjustments" element={<StockAdjustments />} />
          <Route path="/vendors" element={<Vendors />} />
          <Route path="/vendor-ops" element={<VendorConsignments />} />
          <Route path="/audit-log" element={<AuditLog />} />
          <Route path="/users" element={<UserManagement />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </AppLayout>
  );
}

function AuthGate() {
  const { user, loading } = useAuth();

  if (loading) {
    return <LoadingScreen />;
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
          <Suspense fallback={<LoadingScreen />}>
            <Routes>
              <Route path="/login" element={<AuthGate />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/*" element={<ProtectedRoutes />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
