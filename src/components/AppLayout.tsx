import { ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { LogOut } from "lucide-react";

const pageTitles: Record<string, string> = {
  "/": "Dashboard",
  "/raw-materials": "Raw materials",
  "/products": "Products",
  "/purchases": "Purchases",
  "/production": "Production",
  "/transfers": "Transfers",
  "/sales": "Sales",
  "/internal": "Internal transactions",
  "/expenses": "Expenses",
  "/gifts": "Gifts",
  "/profit-loss": "Profit and loss",
  "/vendors": "Vendors",
  "/vendor-ops": "Consignments",
  "/stock-adjustments": "Stock adjustments",
  "/audit-log": "Audit log",
  "/users": "Users",
};

export function AppLayout({ children }: { children: ReactNode }) {
  const location = useLocation();
  const { signOut } = useAuth();
  const pageTitle = pageTitles[location.pathname] ?? "Workspace";

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-16 flex items-center justify-between border-b border-border/70 bg-card/90 px-4 md:px-6 backdrop-blur sticky top-0 z-10">
            <div className="flex items-center gap-3 min-w-0">
              <SidebarTrigger className="h-9 w-9 rounded-lg border border-border bg-background hover:bg-muted" />
              <div className="min-w-0">
                <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground sm:text-[11px]">
                  AL-KHAIR DRINKS & SNACKS DASHBOARD
                </p>
                <h1 className="truncate text-base font-semibold text-foreground">{pageTitle}</h1>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="hidden sm:flex items-center gap-2 rounded-lg border border-border bg-background/80 px-3 py-2 text-xs text-muted-foreground">
                AL-KHAIR DRINKS & SNACKS
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={signOut}
                className="h-9 rounded-lg px-3"
              >
                <LogOut className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">Sign out</span>
                <span className="sr-only sm:hidden">Sign out</span>
              </Button>
            </div>
          </header>
          <main className="flex-1 overflow-auto p-3 md:p-6 lg:p-8 scrollbar-thin">
            {children}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
