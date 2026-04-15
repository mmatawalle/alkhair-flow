import {
  LayoutDashboard, Package, ShoppingCart, Factory, ArrowRightLeft,
  DollarSign, Receipt, Gift, Beaker, LogOut, Repeat, TrendingUp,
  Scale, FileText, Store, Truck, Users
} from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem,
  SidebarFooter, SidebarHeader, useSidebar,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";

const items = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard },
  { title: "Raw Materials", url: "/raw-materials", icon: Beaker },
  { title: "Products", url: "/products", icon: Package },
  { title: "Purchases", url: "/purchases", icon: ShoppingCart },
  { title: "Production", url: "/production", icon: Factory },
  { title: "Transfers", url: "/transfers", icon: ArrowRightLeft },
  { title: "Sales", url: "/sales", icon: DollarSign },
  { title: "Internal", url: "/internal", icon: Repeat },
  { title: "Expenses", url: "/expenses", icon: Receipt },
  { title: "Gifts", url: "/gifts", icon: Gift },
  { title: "Profit & Loss", url: "/profit-loss", icon: TrendingUp },
  { title: "Vendors", url: "/vendors", icon: Store },
  { title: "Consignments", url: "/vendor-ops", icon: Truck },
  { title: "Stock Adjust", url: "/stock-adjustments", icon: Scale },
  { title: "Audit Log", url: "/audit-log", icon: FileText },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();
  const { signOut, isSuperAdmin, userFullName } = useAuth();

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="py-5 px-4">
        {!collapsed ? (
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-sidebar-primary/15 flex items-center justify-center flex-shrink-0">
              <span className="text-sidebar-primary font-bold text-sm">AK</span>
            </div>
            <span className="text-sidebar-foreground font-semibold text-sm tracking-tight">Al-Khair</span>
          </div>
        ) : (
          <div className="w-8 h-8 rounded-lg bg-sidebar-primary/15 flex items-center justify-center mx-auto">
            <span className="text-sidebar-primary font-bold text-sm">A</span>
          </div>
        )}
      </SidebarHeader>

      <SidebarContent className="pt-1 px-2">
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild isActive={
                    item.url === "/" ? location.pathname === "/" : location.pathname.startsWith(item.url)
                  }>
                    <NavLink to={item.url} end={item.url === "/"}>
                      <item.icon className="mr-2 h-4 w-4" />
                      {!collapsed && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
              {isSuperAdmin && (
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={location.pathname === "/users"}>
                    <NavLink to="/users">
                      <Users className="mr-2 h-4 w-4" />
                      {!collapsed && <span>Users</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="pb-4 px-2">
        <div className="border-t border-sidebar-border/40 pt-3 mt-1">
          {!collapsed && userFullName && (
            <p className="px-3 pb-2 text-xs text-sidebar-foreground/40 truncate">{userFullName}</p>
          )}
          <Button variant="ghost" size="sm" onClick={signOut} className="w-full justify-start text-sidebar-foreground/50 hover:text-sidebar-foreground hover:bg-sidebar-accent/60 h-9">
            <LogOut className="mr-2 h-4 w-4" />
            {!collapsed && "Sign Out"}
          </Button>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
