import { useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { LayoutDashboard, Package, DollarSign, Users, QrCode } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { QrScanner } from "@/components/QrScanner";
import { resolveCustomer, searchCustomers } from "@/lib/loyalty";
import { useToast } from "@/hooks/use-toast";

export function CashierBottomNav() {
  const { roles } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [qrOpen, setQrOpen] = useState(false);

  const isSalesRole =
    roles.includes("cashier") ||
    roles.includes("branch_manager") ||
    roles.includes("staff");

  if (!isSalesRole) return null;

  const isActive = (url: string) =>
    url === "/" ? location.pathname === "/" : location.pathname.startsWith(url);

  const handleScanned = async (text: string) => {
    const token = text.trim();
    if (!token) return;
    try {
      let found = null;
      try {
        found = await resolveCustomer({ token: token.toUpperCase() });
      } catch {}
      if (!found) {
        try {
          found = await resolveCustomer({ token });
        } catch {}
      }
      if (!found) {
        const results = await searchCustomers(token, 5);
        if (results[0]) found = results[0];
      }
      if (!found) {
        toast({
          title: "QR not recognized",
          description: "No active loyalty customer for this QR code.",
          variant: "destructive",
        });
        return;
      }
      toast({
        title: `Customer: ${found.full_name}`,
        description: `${found.phone} — opening sale…`,
      });
      navigate("/sales", {
        state: { loyaltyToken: token.toUpperCase(), openDialog: true },
      });
    } catch (e: any) {
      toast({
        title: "QR lookup failed",
        description: e.message || "Could not resolve customer",
        variant: "destructive",
      });
    }
  };

  const linkBase =
    "flex flex-col items-center justify-center gap-0.5 rounded-lg px-2 py-1 text-[10px] font-medium leading-none transition-colors";
  const idle = "text-muted-foreground hover:text-foreground";
  const active = "text-primary bg-primary/10";

  return (
    <>
      <nav
        className="fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/90 md:hidden pb-[env(safe-area-inset-bottom)]"
        aria-label="Salesperson quick navigation"
      >
        <div className="mx-auto flex h-[68px] max-w-lg items-end justify-around px-1 pb-1">
          <NavLink
            to="/"
            end
            className={`${linkBase} min-w-[56px] ${isActive("/") ? active : idle}`}
          >
            <LayoutDashboard className="h-5 w-5" />
            <span>Home</span>
          </NavLink>

          <NavLink
            to="/products"
            className={`${linkBase} min-w-[56px] ${isActive("/products") ? active : idle}`}
          >
            <Package className="h-5 w-5" />
            <span>Products</span>
          </NavLink>

          <div className="relative flex flex-col items-center">
            <button
              type="button"
              aria-label="Scan loyalty QR"
              onClick={() => setQrOpen(true)}
              className="flex h-14 w-14 -translate-y-3 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/20 ring-4 ring-background transition hover:bg-primary/90 active:scale-95"
            >
              <QrCode className="h-6 w-6" />
            </button>
            <span className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 whitespace-nowrap text-[10px] font-semibold tracking-wide text-foreground">
              Scan
            </span>
          </div>

          <NavLink
            to="/sales"
            className={`${linkBase} min-w-[56px] ${isActive("/sales") ? active : idle}`}
          >
            <DollarSign className="h-5 w-5" />
            <span>Sales</span>
          </NavLink>

          <NavLink
            to="/loyalty/customers"
            className={`${linkBase} min-w-[56px] ${isActive("/loyalty/customers") ? active : idle}`}
          >
            <Users className="h-5 w-5" />
            <span>Customers</span>
          </NavLink>
        </div>
      </nav>

      <QrScanner open={qrOpen} onOpenChange={setQrOpen} onScanned={handleScanned} />
    </>
  );
}
