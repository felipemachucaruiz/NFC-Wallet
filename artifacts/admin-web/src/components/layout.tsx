import { Link, useLocation } from "wouter";
import { useGetCurrentAuthUser, useGetEvent, customFetch, setAuthTokenGetter } from "@workspace/api-client-react";
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
  TicketCheck,
  RefreshCcw,
  FileBarChart,
  Languages,
  Settings,
  BadgePercent,
  CalendarDays,
  Map,
  ShoppingCart,
  BarChart3,
  ClipboardList,
  UserCheck,
  ArrowLeft,
  ListChecks,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";
import { LANGUAGE_KEY } from "@/i18n";
import { useEventContext } from "@/contexts/event-context";

export function Layout({ children }: { children: React.ReactNode }) {
  const { t, i18n } = useTranslation();
  const { data: user, isLoading } = useGetCurrentAuthUser();
  const [, setLocation] = useLocation();

  const { eventId: ctxEventId, setEventId } = useEventContext();
  const role = user?.user?.role;
  const eventId = role === "admin" ? ctxEventId : (user?.user?.eventId ?? "");
  const { data: eventData } = useGetEvent(eventId || "skip");
  const eventRecord = eventData as Record<string, unknown> | undefined;
  const ticketingEnabled = eventRecord?.ticketingEnabled === true;
  const nfcBraceletsEnabled = eventRecord?.nfcBraceletsEnabled !== false;
  const managingEvent = role === "admin" && eventId;

  const handleLogout = async () => {
    try { await customFetch("/api/auth/logout", { method: "POST" }); } catch { }
    localStorage.removeItem(AUTH_TOKEN_KEY);
    setAuthTokenGetter(null);
    setLocation("/login");
  };

  const toggleLanguage = () => {
    const next = i18n.language === "es" ? "en" : "es";
    i18n.changeLanguage(next);
    localStorage.setItem(LANGUAGE_KEY, next);
  };

  if (isLoading) {
    return <div className="min-h-screen flex items-center justify-center bg-background text-foreground">{t("common.loading")}</div>;
  }

  if (!user?.user) {
    setLocation("/login");
    return null;
  }

  const isGlobalAdmin = role === "admin";
  const isEventAdmin = role === "event_admin";

  return (
    <div className="min-h-screen flex bg-background text-foreground">
      <aside className="w-64 border-r border-border bg-sidebar flex flex-col">
        <div className="p-5 border-b border-border">
          <img src={`${import.meta.env.BASE_URL}tapee-logo.png`} alt="Tapee" className="h-8 mb-2" />
          <p className="text-xs text-primary/80 uppercase tracking-wider font-semibold">
            {isGlobalAdmin ? t("nav.globalCommand") : t("nav.eventControl")}
          </p>
        </div>

        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          {isGlobalAdmin && !managingEvent && (
            <>
              <NavItem href="/dashboard" icon={LayoutDashboard} label={t("nav.dashboard")} />
              <NavItem href="/events" icon={Calendar} label={t("nav.events")} />
              <NavItem href="/ticketing" icon={TicketCheck} label={t("nav.ticketing", "Boletería")} />
              <NavItem href="/bracelets" icon={Ticket} label={t("nav.wristbands")} />
              <NavItem href="/promoters" icon={Building} label={t("nav.promoters")} />
              <NavItem href="/users" icon={Users} label={t("nav.users")} />
              <NavItem href="/products" icon={ShoppingBag} label={t("nav.products")} />
              <NavItem href="/transactions" icon={Receipt} label={t("nav.transactions")} />
              <NavItem href="/fraud-alerts" icon={ShieldAlert} label={t("nav.fraudAlerts")} />
              <NavItem href="/payouts" icon={CreditCard} label={t("nav.payouts")} />
              <NavItem href="/commissions" icon={BadgePercent} label={t("nav.commissions")} />
              <NavItem href="/event-refund-requests" icon={RefreshCcw} label={t("nav.refunds")} />
              <NavItem href="/reports" icon={FileText} label={t("nav.reports")} />
            </>
          )}

          {isGlobalAdmin && managingEvent && (
            <>
              <button
                onClick={() => { setEventId(""); setLocation("/events"); }}
                className="flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium text-primary hover:bg-sidebar-accent/50 w-full text-left mb-1"
              >
                <ArrowLeft className="h-4 w-4" />
                {t("nav.backToEvents")}
              </button>
              <p className="text-xs px-3 py-1 text-sidebar-foreground/60 truncate mb-2">
                {(eventRecord?.name as string) || "..."}
              </p>

              {ticketingEnabled && (
                <>
                  <NavSectionLabel label={t("nav.ticketingSection")} />
                  <NavItem href="/event-days" icon={CalendarDays} label={t("nav.eventDays")} />
                  <NavItem href="/event-venue-map" icon={Map} label={t("nav.venueMap")} />
                  <NavItem href="/event-ticket-types" icon={Ticket} label={t("nav.ticketTypes")} />
                  <NavItem href="/event-sales-config" icon={ShoppingCart} label={t("nav.salesConfig")} />
                  <NavItem href="/event-sales-dashboard" icon={BarChart3} label={t("nav.salesDashboard")} />
                  <NavItem href="/event-orders" icon={ClipboardList} label={t("nav.orders")} />
                  <NavItem href="/event-checkins" icon={UserCheck} label={t("nav.checkins")} />
                  <NavItem href="/event-guest-lists" icon={ListChecks} label={t("nav.guestLists")} />
                </>
              )}
            </>
          )}

          {isEventAdmin && (
            <>
              <NavItem href="/event-dashboard" icon={LayoutDashboard} label={t("nav.dashboard")} />
              <NavItem href="/event-users" icon={Users} label={t("nav.staffUsers")} />

              {ticketingEnabled && (
                <>
                  <NavSectionLabel label={t("nav.ticketingSection")} />
                  <NavItem href="/event-days" icon={CalendarDays} label={t("nav.eventDays")} />
                  <NavItem href="/event-venue-map" icon={Map} label={t("nav.venueMap")} />
                  <NavItem href="/event-ticket-types" icon={Ticket} label={t("nav.ticketTypes")} />
                  <NavItem href="/event-sales-config" icon={ShoppingCart} label={t("nav.salesConfig")} />
                  <NavItem href="/event-sales-dashboard" icon={BarChart3} label={t("nav.salesDashboard")} />
                  <NavItem href="/event-orders" icon={ClipboardList} label={t("nav.orders")} />
                  <NavItem href="/event-checkins" icon={UserCheck} label={t("nav.checkins")} />
                  <NavItem href="/event-guest-lists" icon={ListChecks} label={t("nav.guestLists")} />
                </>
              )}

              {nfcBraceletsEnabled && (
                <>
                  <NavSectionLabel label={t("nav.cashlessSection")} />
                  <NavItem href="/event-merchants" icon={Store} label={t("nav.merchants")} />
                  <NavItem href="/event-products" icon={ShoppingBag} label={t("nav.products")} />
                  <NavItem href="/event-locations" icon={MapPinned} label={t("nav.locations")} />
                  <NavItem href="/event-bracelets" icon={Ticket} label={t("nav.wristbands")} />
                  <NavItem href="/event-access-zones" icon={MapPin} label={t("nav.accessZones")} />
                  <NavItem href="/event-transactions" icon={Receipt} label={t("nav.transactions")} />
                  <NavItem href="/event-inventory" icon={Package} label={t("nav.inventory")} />
                  <NavItem href="/event-refund-requests" icon={RefreshCcw} label={t("nav.refunds")} />
                  <NavItem href="/event-payouts" icon={CreditCard} label={t("nav.payouts")} />
                </>
              )}

              <NavItem href="/event-settlement" icon={FileBarChart} label={t("nav.settlement")} />
              <NavItem href="/event-settings" icon={Settings} label={t("nav.settings")} />
              <NavItem href="/event-reports" icon={FileText} label={t("nav.reports")} />
            </>
          )}
        </nav>

        <div className="p-4 border-t border-border">
          <div className="flex items-center gap-3 px-3 py-2 mb-3 rounded-md bg-sidebar-accent/50">
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
            size="sm"
            className="w-full justify-start text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground mb-1"
            onClick={toggleLanguage}
            data-testid="button-toggle-language"
          >
            <Languages className="mr-2 h-4 w-4" />
            {i18n.language === "es" ? "EN" : "ES"}
          </Button>
          <Button
            variant="ghost"
            className="w-full justify-start text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            onClick={handleLogout}
            data-testid="button-logout"
          >
            <LogOut className="mr-2 h-4 w-4" />
            {t("nav.signOut")}
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

function NavSectionLabel({ label }: { label: string }) {
  return (
    <p className="text-xs uppercase tracking-wider text-sidebar-foreground/50 font-semibold pt-3 pb-1 px-3">
      {label}
    </p>
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
