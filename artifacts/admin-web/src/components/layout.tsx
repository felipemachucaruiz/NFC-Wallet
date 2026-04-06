import { Link, useLocation } from "wouter";
import { useGetCurrentAuthUser, customFetch, setAuthTokenGetter } from "@workspace/api-client-react";
import { AUTH_TOKEN_KEY } from "@/pages/login";
import { Button } from "@/components/ui/button";
import {
  LayoutDashboard,
  Calendar,
  Users,
  ShieldAlert,
  CreditCard,
  FileText,
  LogOut,
  Building,
  Store,
  Ticket,
  MapPin,
  ShoppingBag,
  Receipt,
  Package,
  MapPinned,
  RefreshCcw,
  FileBarChart,
} from "lucide-react";
import { cn } from "@/lib/utils";

export function Layout({ children }: { children: React.ReactNode }) {
  const { data: user, isLoading } = useGetCurrentAuthUser();
  const [, setLocation] = useLocation();
  const handleLogout = async () => {
    try { await customFetch("/api/auth/logout", { method: "POST" }); } catch { /* ignore */ }
    localStorage.removeItem(AUTH_TOKEN_KEY);
    setAuthTokenGetter(null);
    setLocation("/login");
  };

  if (isLoading) {
    return <div className="min-h-screen flex items-center justify-center bg-background text-foreground">Loading...</div>;
  }

  if (!user?.user) {
    setLocation("/login");
    return null;
  }

  const role = user.user.role;
  const isGlobalAdmin = role === "admin";
  const isEventAdmin = role === "event_admin";

  return (
    <div className="min-h-screen flex bg-background text-foreground">
      <aside className="w-64 border-r border-border bg-sidebar flex flex-col">
        <div className="p-5 border-b border-border">
          <img src={`${import.meta.env.BASE_URL}tapee-logo.png`} alt="Tapee" className="h-8 mb-2" />
          <p className="text-xs text-primary/80 uppercase tracking-wider font-semibold">
            {isGlobalAdmin ? "Global Command" : "Event Control"}
          </p>
        </div>
        
        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          {isGlobalAdmin && (
            <>
              <NavItem href="/dashboard" icon={LayoutDashboard} label="Dashboard" />
              <NavItem href="/events" icon={Calendar} label="Events" />
              <NavItem href="/promoters" icon={Building} label="Promoters" />
              <NavItem href="/users" icon={Users} label="Users" />
              <NavItem href="/products" icon={ShoppingBag} label="Products" />
              <NavItem href="/transactions" icon={Receipt} label="Transactions" />
              <NavItem href="/inventory" icon={Package} label="Inventory" />
              <NavItem href="/fraud-alerts" icon={ShieldAlert} label="Fraud Alerts" />
              <NavItem href="/payouts" icon={CreditCard} label="Payouts" />
              <NavItem href="/reports" icon={FileText} label="Reports" />
            </>
          )}

          {isEventAdmin && (
            <>
              <NavItem href="/event-dashboard" icon={LayoutDashboard} label="Dashboard" />
              <NavItem href="/event-users" icon={Users} label="Staff & Users" />
              <NavItem href="/event-merchants" icon={Store} label="Merchants" />
              <NavItem href="/event-products" icon={ShoppingBag} label="Products" />
              <NavItem href="/event-locations" icon={MapPinned} label="Locations" />
              <NavItem href="/event-bracelets" icon={Ticket} label="Wristbands" />
              <NavItem href="/event-access-zones" icon={MapPin} label="Access Zones" />
              <NavItem href="/event-transactions" icon={Receipt} label="Transactions" />
              <NavItem href="/event-inventory" icon={Package} label="Inventory" />
              <NavItem href="/event-refund-requests" icon={RefreshCcw} label="Refunds" />
              <NavItem href="/event-payouts" icon={CreditCard} label="Payouts" />
              <NavItem href="/event-settlement" icon={FileBarChart} label="Settlement" />
              <NavItem href="/event-reports" icon={FileText} label="Reports" />
            </>
          )}
        </nav>

        <div className="p-4 border-t border-border">
          <div className="flex items-center gap-3 px-3 py-2 mb-4 rounded-md bg-sidebar-accent/50">
            <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold">
              {user.user.firstName?.charAt(0) || user.user.email?.charAt(0) || "U"}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate text-sidebar-foreground">
                {user.user.firstName} {user.user.lastName}
              </p>
              <p className="text-xs truncate text-sidebar-foreground/60">{user.user.email}</p>
            </div>
          </div>
          <Button 
            variant="ghost" 
            className="w-full justify-start text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground" 
            onClick={handleLogout}
            data-testid="button-logout"
          >
            <LogOut className="mr-2 h-4 w-4" />
            Sign Out
          </Button>
        </div>
      </aside>

      <main className="flex-1 flex flex-col h-screen overflow-hidden bg-background">
        <div className="flex-1 overflow-y-auto p-8">
          {children}
        </div>
      </main>
    </div>
  );
}

function NavItem({ href, icon: Icon, label }: { href: string; icon: React.ElementType; label: string }) {
  const [location] = useLocation();
  const isActive = location === href || location.startsWith(`${href}/`);

  return (
    <Link href={href} className={cn(
      "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors",
      isActive 
        ? "bg-sidebar-accent text-sidebar-accent-foreground" 
        : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
    )}>
      <Icon className="h-4 w-4" />
      {label}
    </Link>
  );
}
