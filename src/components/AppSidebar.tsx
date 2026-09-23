import {
  LayoutDashboard, Package, ShoppingCart, Factory, ArrowRightLeft,
  DollarSign, Receipt, Gift, Beaker, LogOut, Repeat, TrendingUp,
  Scale, FileText, Store, Truck, Users, Sparkles, Star, CreditCard, Landmark
} from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem,
  SidebarFooter, SidebarGroupLabel, SidebarHeader, useSidebar,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";

const logoSrc = `${import.meta.env.BASE_URL}brand-logo.png`;
type NavItem = { title: string; url: string; icon: any; adminOnly?: boolean };
type Section = { label: string; items: NavItem[] };

const sections: Section[] = [
  {
    label: "Overview",
    items: [
      { title: "Dashboard", url: "/", icon: LayoutDashboard },
      { title: "Profit & Loss", url: "/profit-loss", icon: TrendingUp, adminOnly: true },
    ],
  },
  {
    label: "Inventory",
    items: [
      { title: "Raw Materials", url: "/raw-materials", icon: Beaker, adminOnly: true },
      { title: "Products", url: "/products", icon: Package },
      { title: "Stock Adjust", url: "/stock-adjustments", icon: Scale },
    ],
  },
  {
    label: "Workflows",
    items: [
      { title: "Purchases", url: "/purchases", icon: ShoppingCart, adminOnly: true },
      { title: "Production", url: "/production", icon: Factory, adminOnly: true },
      { title: "Transfers", url: "/transfers", icon: ArrowRightLeft, adminOnly: true },
      { title: "Sales", url: "/sales", icon: DollarSign },
    ],
  },
  {
    label: "Money",
    items: [
      { title: "POS & Banks", url: "/pos-banks", icon: CreditCard, adminOnly: true },
      { title: "Expenses", url: "/expenses", icon: Receipt, adminOnly: true },
      { title: "Gifts", url: "/gifts", icon: Gift, adminOnly: true },
      { title: "Internal", url: "/internal", icon: Repeat, adminOnly: true },
    ],
  },
  {
    label: "Loyalty",
    items: [
      { title: "Loyalty Dashboard", url: "/loyalty", icon: Star },
      { title: "Customers", url: "/loyalty/customers", icon: Users },
      { title: "Rewards & Rules", url: "/loyalty/rewards", icon: Gift },
    ],
  },
  {
    label: "Vendors",
    items: [
      { title: "Vendors", url: "/vendors", icon: Store, adminOnly: true },
      { title: "Consignments", url: "/vendor-ops", icon: Truck, adminOnly: true },
    ],
  },
  {
    label: "Admin",
    items: [
      { title: "AI Drafts", url: "/ai-drafts", icon: Sparkles, adminOnly: true },
      { title: "Audit Log", url: "/audit-log", icon: FileText, adminOnly: true },
    ],
  },
];
const allNavItems = sections.flatMap((section) => section.items);

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();
  const { signOut, isSuperAdmin, isAdmin, userFullName } = useAuth();
  const isActive = (url: string) => url === "/" ? location.pathname === "/" : location.pathname.startsWith(url);
  const visibleSections = sections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => !item.adminOnly || isAdmin),
    }))
    .filter((section) => section.items.length > 0);
  const navItems = allNavItems.filter((item) => !item.adminOnly || isAdmin);

  if (collapsed) {
    return (
      <Sidebar collapsible="icon">
        <SidebarHeader className="px-2 py-3">
          <img
            src={logoSrc}
            alt="AL-KHAIR DRINKS & SNACKS"
            className="mx-auto h-8 w-8 rounded-md border border-sidebar-border bg-card object-cover"
          />
        </SidebarHeader>

        <SidebarContent className="px-2 py-1">
          <SidebarMenu className="gap-1.5">
            {navItems.map((item) => (
              <SidebarMenuItem key={item.title}>
                <SidebarMenuButton
                  asChild
                  tooltip={item.title}
                  isActive={isActive(item.url)}
                  className="mx-auto h-8 w-8 rounded-lg p-0 text-sidebar-foreground/70 data-[active=true]:bg-sidebar-primary data-[active=true]:text-sidebar-primary-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                >
                  <NavLink to={item.url} end={item.url === "/"} aria-label={item.title}>
                    <item.icon className="h-4 w-4" />
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
            {isSuperAdmin && (
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  tooltip="Users"
                  isActive={location.pathname === "/users"}
                  className="mx-auto h-8 w-8 rounded-lg p-0 text-sidebar-foreground/70 data-[active=true]:bg-sidebar-primary data-[active=true]:text-sidebar-primary-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                >
                  <NavLink to="/users" aria-label="Users">
                    <Users className="h-4 w-4" />
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
            )}
          </SidebarMenu>
        </SidebarContent>

        <SidebarFooter className="px-2 pb-3">
          <Button variant="ghost" size="icon" onClick={signOut} className="mx-auto h-8 w-8 text-sidebar-foreground/65 hover:text-sidebar-foreground hover:bg-sidebar-accent">
            <LogOut className="h-4 w-4" />
            <span className="sr-only">Sign Out</span>
          </Button>
        </SidebarFooter>
      </Sidebar>
    );
  }

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="px-3 py-4">
        <div className="flex items-center gap-3 rounded-lg border border-sidebar-border bg-sidebar-accent/70 p-2">
          <img
            src={logoSrc}
            alt="AL-KHAIR DRINKS & SNACKS"
            className="h-10 w-10 flex-shrink-0 rounded-lg border border-sidebar-border bg-card object-cover shadow-sm"
          />
          <div className="min-w-0">
            <span className="block truncate text-sm font-semibold text-sidebar-foreground">AL-KHAIR DRINKS & SNACKS</span>
            <span className="block truncate text-xs text-sidebar-foreground/55">Operations dashboard</span>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent className="px-2 pb-2 pt-1">
        {visibleSections.map((section) => (
          <SidebarGroup key={section.label} className="py-1">
            <SidebarGroupLabel>{section.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {section.items.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      asChild
                      tooltip={item.title}
                      isActive={item.url === "/" ? location.pathname === "/" : location.pathname.startsWith(item.url)}
                      className="h-9 rounded-lg text-sidebar-foreground/70 data-[active=true]:bg-sidebar-primary data-[active=true]:text-sidebar-primary-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                    >
                      <NavLink to={item.url} end={item.url === "/"}>
                        <item.icon className="mr-2 h-4 w-4" />
                        {!collapsed && <span>{item.title}</span>}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
        {isSuperAdmin && (
          <SidebarGroup className="py-1">
            <SidebarGroupLabel>Super Admin</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    tooltip="Users"
                    isActive={location.pathname === "/users"}
                    className="h-9 rounded-lg text-sidebar-foreground/70 data-[active=true]:bg-sidebar-primary data-[active=true]:text-sidebar-primary-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                  >
                    <NavLink to="/users">
                      <Users className="mr-2 h-4 w-4" />
                      {!collapsed && <span>Users</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter className="pb-4 px-2">
        <div className="border-t border-sidebar-border/40 pt-3 mt-1">
          {!collapsed && userFullName && (
            <p className="px-3 pb-2 text-xs text-sidebar-foreground/55 truncate">{userFullName}</p>
          )}
          <Button variant="ghost" size="sm" onClick={signOut} className="w-full justify-start text-sidebar-foreground/65 hover:text-sidebar-foreground hover:bg-sidebar-accent h-9">
            <LogOut className="mr-2 h-4 w-4" />
            {!collapsed && "Sign Out"}
          </Button>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
