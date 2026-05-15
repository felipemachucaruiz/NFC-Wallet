import { useState, createContext, useContext } from "react";
import { Link, useLocation } from "wouter";
import TapeeLogo from "@/components/TapeeLogo";
import { useGetCurrentAuthUser, useGetEvent, customFetch, setAuthTokenGetter } from "@workspace/api-client-react";
import { AUTH_TOKEN_KEY } from "@/pages/login";
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
  MessageCircle,
  Contact,
  Tablet,
  AlertCircle,
  FlaskConical,
  Megaphone,
  HandCoins,
  ChevronDown,
  Wallet,
  Bell,
  Search,
  LifeBuoy,
  BellOff,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useTranslation } from "react-i18next";
import { LANGUAGE_KEY } from "@/i18n";
import { useEventContext } from "@/contexts/event-context";
import { AiChat } from "@/components/ai-chat";
import { setDateLocale } from "@/lib/date";

const NavSearchContext = createContext("");

export function Layout({ children }: { children: React.ReactNode }) {
  const { t, i18n } = useTranslation();
  const { data: user, isLoading } = useGetCurrentAuthUser();
  const [, setLocation] = useLocation();

  const [navSearch, setNavSearch] = useState("");
  const { eventId: ctxEventId, setEventId } = useEventContext();
  const role = user?.user?.role;
  const eventId = role === "admin" ? ctxEventId : (user?.user?.eventId ?? "");
  const { data: eventData } = useGetEvent(eventId || "", { query: { enabled: !!eventId } });
  const eventRecord = eventData as Record<string, unknown> | undefined;
  const isExternalTicketing = typeof eventRecord?.externalTicketingUrl === "string" && (eventRecord?.externalTicketingUrl as string).length > 0;
  const ticketingEnabled = eventRecord?.ticketingEnabled === true && !isExternalTicketing;
  const nfcBraceletsEnabled = eventRecord?.nfcBraceletsEnabled !== false && !isExternalTicketing;
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
    setDateLocale(next);
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
  const isTicketingAuditor = role === "ticketing_auditor";

  const userInitial = user.user.firstName?.charAt(0) || user.user.email?.charAt(0) || "U";
  const userName = [user.user.firstName, user.user.lastName].filter(Boolean).join(" ") || user.user.email || "";

  return (
    <div className="h-screen overflow-hidden flex bg-background text-foreground">
      {/* ── Sidebar ── */}
      <aside className="w-60 border-r border-border bg-sidebar flex flex-col shrink-0">
        {/* Logo */}
        <div className="px-5 py-4 border-b border-border">
          <TapeeLogo className="h-7 mb-1.5" />
          <p className="text-[10px] text-primary/70 uppercase tracking-widest font-semibold">
            {isGlobalAdmin ? t("nav.globalCommand") : isTicketingAuditor ? "Auditoría" : t("nav.eventControl")}
          </p>
        </div>

        {/* Search */}
        <div className="px-3 py-2.5 border-b border-border">
          <div className="flex items-center gap-2 bg-muted/60 rounded-md px-2.5 py-1.5">
            <Search className="h-3 w-3 text-muted-foreground shrink-0" />
            <input
              type="text"
              value={navSearch}
              onChange={(e) => setNavSearch(e.target.value)}
              placeholder={t("common.search")}
              className="bg-transparent text-[11px] outline-none w-full text-foreground placeholder:text-muted-foreground/60 min-w-0"
            />
            {navSearch && (
              <button onClick={() => setNavSearch("")} className="text-muted-foreground hover:text-foreground transition-colors shrink-0">
                <span className="text-xs leading-none">✕</span>
              </button>
            )}
          </div>
        </div>

        {/* Nav */}
        <NavSearchContext.Provider value={navSearch}>
        <nav className="flex-1 px-3 py-3 space-y-0.5 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
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
              <NavItem href="/whatsapp-templates" icon={MessageCircle} label={t("nav.whatsappTemplates", "WhatsApp")} />
              <NavItem href="/ads" icon={Megaphone} label="Anuncios" />
              <NavItem href="/cities" icon={MapPin} label="Ciudades" />
              <NavItem href="/devices" icon={Tablet} label={t("nav.devices")} />
              <NavItem href="/sync-issues" icon={AlertCircle} label="Sync Issues POS" />
              <NavItem href="/load-test" icon={FlaskConical} label="Simulador Pre-Evento" />
            </>
          )}

          {isGlobalAdmin && managingEvent && (
            <>
              <button
                onClick={() => { setEventId(""); setLocation("/events"); }}
                className="flex items-center gap-2 px-3 py-1.5 rounded-md text-[10px] font-semibold text-primary hover:bg-sidebar-accent/50 w-full text-left mb-1 uppercase tracking-wider"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                {t("nav.backToEvents")}
              </button>
              <p className="text-[10px] px-3 py-1 text-sidebar-foreground/50 truncate mb-1">
                {(eventRecord?.name as string) || "..."}
              </p>

              {!isExternalTicketing && <NavItem href={nfcBraceletsEnabled ? "/event-dashboard" : "/event-sales-dashboard"} icon={LayoutDashboard} label={t("nav.dashboard")} />}
              <NavItem href="/event-users" icon={Users} label={t("nav.staffUsers")} />

              {ticketingEnabled && (
                <NavSection
                  label={t("nav.ticketingSection")}
                  icon={TicketCheck}
                  activeHrefs={["/event-days", "/event-venue-map", "/event-ticket-types", "/event-sales-config", "/event-sales-dashboard", "/event-orders", "/event-attendees", "/event-liquidacion", "/event-checkins", "/event-guest-lists"]}
                >
                  <NavItem href="/event-days" icon={CalendarDays} label={t("nav.eventDays")} />
                  <NavItem href="/event-venue-map" icon={Map} label={t("nav.venueMap")} />
                  <NavItem href="/event-ticket-types" icon={Ticket} label={t("nav.ticketTypes")} />
                  <NavItem href="/event-sales-config" icon={ShoppingCart} label={t("nav.salesConfig")} />
                  <NavItem href="/event-sales-dashboard" icon={BarChart3} label={t("nav.salesDashboard")} />
                  <NavItem href="/event-orders" icon={ClipboardList} label={t("nav.orders")} />
                  <NavItem href="/event-attendees" icon={Contact} label={t("nav.attendees", "Asistentes")} />
                  <NavItem href="/event-liquidacion" icon={HandCoins} label="Liquidación" />
                  <NavItem href="/event-checkins" icon={UserCheck} label={t("nav.checkins")} />
                  <NavItem href="/event-guest-lists" icon={ListChecks} label={t("nav.guestLists")} />
                </NavSection>
              )}

              {nfcBraceletsEnabled && (
                <NavSection
                  label={t("nav.cashlessSection")}
                  icon={Wallet}
                  activeHrefs={["/event-merchants", "/event-products", "/event-locations", "/event-bracelets", "/event-access-zones", "/event-transactions", "/event-split-sessions", "/event-inventory", "/event-refund-requests", "/event-payouts", "/sync-issues", "/event-settlement"]}
                >
                  <NavItem href="/event-merchants" icon={Store} label={t("nav.merchants")} />
                  <NavItem href="/event-products" icon={ShoppingBag} label={t("nav.products")} />
                  <NavItem href="/event-locations" icon={MapPinned} label={t("nav.locations")} />
                  <NavItem href="/event-bracelets" icon={Ticket} label={t("nav.wristbands")} />
                  <NavItem href="/event-access-zones" icon={MapPin} label={t("nav.accessZones")} />
                  <NavItem href="/event-transactions" icon={Receipt} label={t("nav.transactions")} />
                  <NavItem href="/event-split-sessions" icon={Users} label={t("nav.splitSessions", "Pagos divididos")} />
                  <NavItem href="/event-inventory" icon={Package} label={t("nav.inventory")} />
                  <NavItem href="/event-refund-requests" icon={RefreshCcw} label={t("nav.refunds")} />
                  <NavItem href="/event-payouts" icon={CreditCard} label={t("nav.payouts")} />
                  <NavItem href="/sync-issues" icon={AlertCircle} label="Sync Issues POS" />
                  <NavItem href="/event-settlement" icon={FileBarChart} label={t("nav.settlement")} />
                </NavSection>
              )}

              <NavItem href="/event-analytics" icon={BarChart3} label={t("nav.analytics", "Analytics")} />
              <NavItem href="/event-settings" icon={Settings} label={t("nav.settings")} />
              <NavItem href="/event-reports" icon={FileText} label={t("nav.reports")} />
            </>
          )}

          {isTicketingAuditor && (
            <NavItem href="/auditor-ticket-sales" icon={TicketCheck} label="Ventas de Boletas" />
          )}

          {isEventAdmin && (
            <>
              {!isExternalTicketing && <NavItem href={nfcBraceletsEnabled ? "/event-dashboard" : "/event-sales-dashboard"} icon={LayoutDashboard} label={t("nav.dashboard")} />}
              <NavItem href="/event-users" icon={Users} label={t("nav.staffUsers")} />

              {ticketingEnabled && (
                <NavSection
                  label={t("nav.ticketingSection")}
                  icon={TicketCheck}
                  activeHrefs={["/event-days", "/event-venue-map", "/event-ticket-types", "/event-sales-config", "/event-sales-dashboard", "/event-orders", "/event-attendees", "/event-liquidacion", "/event-checkins", "/event-guest-lists"]}
                >
                  <NavItem href="/event-days" icon={CalendarDays} label={t("nav.eventDays")} />
                  <NavItem href="/event-venue-map" icon={Map} label={t("nav.venueMap")} />
                  <NavItem href="/event-ticket-types" icon={Ticket} label={t("nav.ticketTypes")} />
                  <NavItem href="/event-sales-config" icon={ShoppingCart} label={t("nav.salesConfig")} />
                  <NavItem href="/event-sales-dashboard" icon={BarChart3} label={t("nav.salesDashboard")} />
                  <NavItem href="/event-orders" icon={ClipboardList} label={t("nav.orders")} />
                  <NavItem href="/event-attendees" icon={Contact} label={t("nav.attendees", "Asistentes")} />
                  <NavItem href="/event-liquidacion" icon={HandCoins} label="Liquidación" />
                  <NavItem href="/event-checkins" icon={UserCheck} label={t("nav.checkins")} />
                  <NavItem href="/event-guest-lists" icon={ListChecks} label={t("nav.guestLists")} />
                </NavSection>
              )}

              {nfcBraceletsEnabled && (
                <NavSection
                  label={t("nav.cashlessSection")}
                  icon={Wallet}
                  activeHrefs={["/event-merchants", "/event-products", "/event-locations", "/event-bracelets", "/event-access-zones", "/event-transactions", "/event-split-sessions", "/event-inventory", "/event-refund-requests", "/event-payouts", "/sync-issues", "/event-settlement"]}
                >
                  <NavItem href="/event-merchants" icon={Store} label={t("nav.merchants")} />
                  <NavItem href="/event-products" icon={ShoppingBag} label={t("nav.products")} />
                  <NavItem href="/event-locations" icon={MapPinned} label={t("nav.locations")} />
                  <NavItem href="/event-bracelets" icon={Ticket} label={t("nav.wristbands")} />
                  <NavItem href="/event-access-zones" icon={MapPin} label={t("nav.accessZones")} />
                  <NavItem href="/event-transactions" icon={Receipt} label={t("nav.transactions")} />
                  <NavItem href="/event-split-sessions" icon={Users} label={t("nav.splitSessions", "Pagos divididos")} />
                  <NavItem href="/event-inventory" icon={Package} label={t("nav.inventory")} />
                  <NavItem href="/event-refund-requests" icon={RefreshCcw} label={t("nav.refunds")} />
                  <NavItem href="/event-payouts" icon={CreditCard} label={t("nav.payouts")} />
                  <NavItem href="/sync-issues" icon={AlertCircle} label="Sync Issues POS" />
                  <NavItem href="/event-settlement" icon={FileBarChart} label={t("nav.settlement")} />
                </NavSection>
              )}

              <NavItem href="/event-analytics" icon={BarChart3} label={t("nav.analytics", "Analytics")} />
              <NavItem href="/event-settings" icon={Settings} label={t("nav.settings")} />
              <NavItem href="/event-reports" icon={FileText} label={t("nav.reports")} />
            </>
          )}
        </nav>
        </NavSearchContext.Provider>

        {/* Help card + actions */}
        <div className="p-3 border-t border-border space-y-2">
          <div className="rounded-lg bg-primary/10 border border-primary/20 p-3">
            <div className="flex items-center gap-2 mb-1">
              <LifeBuoy className="h-3.5 w-3.5 text-primary" />
              <span className="text-[11px] font-semibold text-foreground">{t("nav.helpSupport")}</span>
            </div>
            <p className="text-[10px] text-muted-foreground leading-relaxed">
              {t("nav.helpText")}
            </p>
          </div>
          <button
            onClick={toggleLanguage}
            data-testid="button-toggle-language"
            className="flex items-center gap-2 w-full px-2.5 py-1.5 rounded-md text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent/50 transition-colors"
          >
            <Languages className="h-3.5 w-3.5 shrink-0" />
            {i18n.language === "es" ? t("nav.switchToEn") : t("nav.switchToEs")}
          </button>
        </div>
      </aside>

      {/* ── Main area ── */}
      <main className="flex-1 flex flex-col h-screen overflow-hidden bg-background">
        {/* Top header */}
        <header className="h-13 border-b border-border bg-background shrink-0 flex items-center justify-between px-6">
          <div className="flex items-center gap-2">
            {managingEvent && eventRecord?.name && (
              <span className="text-xs text-muted-foreground font-medium truncate max-w-xs">
                {eventRecord.name as string}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {/* Notification bell */}
            <Popover>
              <PopoverTrigger asChild>
                <button className="p-2 rounded-md hover:bg-muted transition-colors">
                  <Bell className="h-4 w-4 text-muted-foreground" />
                </button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-72 p-0">
                <div className="px-4 py-3 border-b border-border">
                  <p className="text-sm font-semibold">{t("nav.notifications")}</p>
                </div>
                <div className="flex flex-col items-center justify-center py-10 gap-2 text-center">
                  <BellOff className="h-8 w-8 text-muted-foreground/40" />
                  <p className="text-sm text-muted-foreground">{t("nav.noNotifications")}</p>
                  <p className="text-xs text-muted-foreground/60">{t("nav.upToDate")}</p>
                </div>
              </PopoverContent>
            </Popover>

            {/* Divider */}
            <div className="w-px h-5 bg-border mx-1" />

            {/* User info */}
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold text-xs shrink-0">
                {userInitial}
              </div>
              <div className="hidden sm:block leading-none">
                <p className="text-xs font-semibold text-foreground">{userName}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5 uppercase tracking-wider">{user.user.role}</p>
              </div>
            </div>

            {/* Divider */}
            <div className="w-px h-5 bg-border mx-1" />

            {/* Logout */}
            <button
              onClick={handleLogout}
              data-testid="button-logout"
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[10px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{t("nav.signOut")}</span>
            </button>
          </div>
        </header>

        {/* Page content */}
        <div className="flex-1 overflow-y-auto p-6">
          {children}
        </div>
      </main>

      <AiChat />
    </div>
  );
}

function NavSection({
  label,
  icon: Icon,
  children,
  activeHrefs,
}: {
  label: string;
  icon: React.ElementType;
  children: React.ReactNode;
  activeHrefs: string[];
}) {
  const [location] = useLocation();
  const isChildActive = activeHrefs.some((h) => location === h || location.startsWith(`${h}/`));
  const [open, setOpen] = useState(isChildActive);

  return (
    <div className="mt-1">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 w-full px-3 py-1.5 rounded-md text-[10px] uppercase tracking-wider font-semibold text-sidebar-foreground/50 hover:text-sidebar-foreground hover:bg-sidebar-accent/30 transition-colors"
      >
        <Icon className="h-3.5 w-3.5 shrink-0" />
        <span className="flex-1 text-left">{label}</span>
        <ChevronDown className={cn("h-3 w-3 transition-transform duration-200", open && "rotate-180")} />
      </button>
      {open && <div className="mt-0.5 pl-1">{children}</div>}
    </div>
  );
}

function NavItem({ href, icon: Icon, label }: { href: string; icon: React.ElementType; label: string }) {
  const [location] = useLocation();
  const search = useContext(NavSearchContext);
  const isActive = location === href || location.startsWith(`${href}/`);

  if (search && !label.toLowerCase().includes(search.toLowerCase())) return null;

  return (
    <Link href={href} className={cn(
      "flex items-center gap-2.5 px-3 py-1.5 rounded-md text-[10px] font-semibold transition-colors uppercase tracking-wider",
      isActive
        ? "bg-primary text-black"
        : "text-sidebar-foreground/60 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
    )}>
      <Icon className="h-3.5 w-3.5 shrink-0" />
      {label}
    </Link>
  );
}
