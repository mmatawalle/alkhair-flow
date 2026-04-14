import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { AppLayout } from "@/components/AppLayout";
import Login from "./pages/Login";
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
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

function ProtectedRoutes() {
  const { user, loading } = useAuth();

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
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<AuthGate />} />
            <Route path="/*" element={<ProtectedRoutes />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
