import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Layout } from "@/components/layout";
import { useGetCurrentAuthUser, useGetEvent, setAuthTokenGetter, setBaseUrl } from "@workspace/api-client-react";
import { AUTH_TOKEN_KEY } from "@/pages/login";
import { EventProvider, useEventContext } from "@/contexts/event-context";
import React from "react";

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("ErrorBoundary caught:", error, info.componentStack);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-background text-foreground p-8">
          <div className="max-w-md text-center space-y-4">
            <h1 className="text-2xl font-bold text-destructive">Something went wrong</h1>
            <p className="text-muted-foreground text-sm">{String(this.state.error?.message ?? "")}</p>
            <pre className="text-xs text-left bg-muted p-3 rounded overflow-auto max-h-40">{String(this.state.error?.stack ?? "")}</pre>
            <button
              className="px-4 py-2 bg-primary text-primary-foreground rounded"
              onClick={() => { this.setState({ hasError: false, error: null }); window.location.reload(); }}
            >
              Reload
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

setBaseUrl(
  import.meta.env.PROD
    ? (import.meta.env.VITE_API_URL || "https://prod.tapee.app")
    : `${import.meta.env.BASE_URL}_srv`,
);
setAuthTokenGetter(() => localStorage.getItem(AUTH_TOKEN_KEY));

import NotFound from "@/pages/not-found";
import Login from "@/pages/login";
import ForgotPassword from "@/pages/forgot-password";
import ResetPassword from "@/pages/reset-password";
import Dashboard from "@/pages/dashboard";
import Events from "@/pages/events";
import Bracelets from "@/pages/bracelets";
import Promoters from "@/pages/promoters";
import Users from "@/pages/users";
import FraudAlerts from "@/pages/fraud-alerts";
import Payouts from "@/pages/payouts";
import Reports from "@/pages/reports";
import Products from "@/pages/products";
import Transactions from "@/pages/transactions";
import Inventory from "@/pages/inventory";
import Commissions from "@/pages/commissions";
import Ticketing from "@/pages/ticketing";

import EventDashboard from "@/pages/event-dashboard";
import EventUsers from "@/pages/event-users";
import EventMerchants from "@/pages/event-merchants";
import EventBracelets from "@/pages/event-bracelets";
import EventAccessZones from "@/pages/event-access-zones";
import EventPayouts from "@/pages/event-payouts";
import EventReports from "@/pages/event-reports";
import EventProducts from "@/pages/event-products";
import EventLocations from "@/pages/event-locations";
import EventTransactions from "@/pages/event-transactions";
import EventInventory from "@/pages/event-inventory";
import EventRefundRequests from "@/pages/event-refund-requests";
import EventSettlement from "@/pages/event-settlement";
import EventSettings from "@/pages/event-settings";
import EventDays from "@/pages/event-days";
import EventVenueMap from "@/pages/event-venue-map";
import EventTicketTypes from "@/pages/event-ticket-types";
import EventSalesConfig from "@/pages/event-sales-config";
import EventSalesDashboard from "@/pages/event-sales-dashboard";
import EventOrders from "@/pages/event-orders";
import EventCheckins from "@/pages/event-checkins";
import EventGuestLists from "@/pages/event-guest-lists";

const queryClient = new QueryClient();

function ProtectedRoute({ component: Component, allowedRoles }: { component: React.ElementType, allowedRoles: string[] }) {
  const { data: user, isLoading } = useGetCurrentAuthUser();

  if (isLoading) {
    return <div className="min-h-screen flex items-center justify-center bg-background text-foreground">Loading...</div>;
  }

  if (!user?.user) {
    return <Redirect to="/login" />;
  }

  if (!allowedRoles.includes(user.user.role)) {
    return <Redirect to={user.user.role === "admin" ? "/dashboard" : "/event-dashboard"} />;
  }

  return (
    <Layout>
      <Component />
    </Layout>
  );
}

function ModuleGatedRoute({ component: Component, allowedRoles, requiredModule }: { component: React.ElementType, allowedRoles: string[], requiredModule: "ticketing" | "nfc" }) {
  const { data: user, isLoading } = useGetCurrentAuthUser();
  const { eventId: ctxEventId } = useEventContext();
  const eventId = user?.user?.role === "admin" ? ctxEventId : (user?.user?.eventId ?? "");
  const { data: eventData, isLoading: eventLoading } = useGetEvent(eventId || "skip");

  if (isLoading || (eventId && eventLoading)) {
    return <div className="min-h-screen flex items-center justify-center bg-background text-foreground">Loading...</div>;
  }

  if (!user?.user) {
    return <Redirect to="/login" />;
  }

  if (!allowedRoles.includes(user.user.role)) {
    return <Redirect to={user.user.role === "admin" ? "/dashboard" : "/event-dashboard"} />;
  }

  if (user.user.role === "admin" && !eventId) {
    return <Redirect to="/events" />;
  }

  const event = eventData as Record<string, unknown> | undefined;
  const moduleEnabled = requiredModule === "ticketing"
    ? event?.ticketingEnabled === true
    : event?.nfcBraceletsEnabled !== false;

  if (event && !moduleEnabled) {
    return <Redirect to={user.user.role === "admin" ? "/events" : "/event-dashboard"} />;
  }

  return (
    <Layout>
      <Component />
    </Layout>
  );
}

function Router() {
  const { data: user, isLoading } = useGetCurrentAuthUser();

  return (
    <Switch>
      <Route path="/login" component={Login} />
      <Route path="/forgot-password" component={ForgotPassword} />
      <Route path="/reset-password" component={ResetPassword} />
      
      <Route path="/">
        {isLoading ? null : user?.user ? <Redirect to={user.user.role === "admin" ? "/dashboard" : "/event-dashboard"} /> : <Redirect to="/login" />}
      </Route>

      <Route path="/dashboard">
        <ProtectedRoute component={Dashboard} allowedRoles={["admin"]} />
      </Route>
      <Route path="/events">
        <ProtectedRoute component={Events} allowedRoles={["admin"]} />
      </Route>
      <Route path="/bracelets">
        <ProtectedRoute component={Bracelets} allowedRoles={["admin"]} />
      </Route>
      <Route path="/promoters">
        <ProtectedRoute component={Promoters} allowedRoles={["admin"]} />
      </Route>
      <Route path="/users">
        <ProtectedRoute component={Users} allowedRoles={["admin"]} />
      </Route>
      <Route path="/fraud-alerts">
        <ProtectedRoute component={FraudAlerts} allowedRoles={["admin", "event_admin"]} />
      </Route>
      <Route path="/payouts">
        <ProtectedRoute component={Payouts} allowedRoles={["admin"]} />
      </Route>
      <Route path="/reports">
        <ProtectedRoute component={Reports} allowedRoles={["admin"]} />
      </Route>
      <Route path="/products">
        <ProtectedRoute component={Products} allowedRoles={["admin"]} />
      </Route>
      <Route path="/transactions">
        <ProtectedRoute component={Transactions} allowedRoles={["admin"]} />
      </Route>
      <Route path="/inventory">
        <ProtectedRoute component={Inventory} allowedRoles={["admin"]} />
      </Route>
      <Route path="/commissions">
        <ProtectedRoute component={Commissions} allowedRoles={["admin"]} />
      </Route>
      <Route path="/ticketing">
        <ProtectedRoute component={Ticketing} allowedRoles={["admin"]} />
      </Route>

      {/* Event Admin Routes */}
      <Route path="/event-dashboard">
        <ProtectedRoute component={EventDashboard} allowedRoles={["event_admin"]} />
      </Route>
      <Route path="/event-users">
        <ProtectedRoute component={EventUsers} allowedRoles={["event_admin"]} />
      </Route>
      <Route path="/event-merchants">
        <ProtectedRoute component={EventMerchants} allowedRoles={["event_admin"]} />
      </Route>
      <Route path="/event-bracelets">
        <ProtectedRoute component={EventBracelets} allowedRoles={["event_admin"]} />
      </Route>
      <Route path="/event-access-zones">
        <ProtectedRoute component={EventAccessZones} allowedRoles={["event_admin"]} />
      </Route>
      <Route path="/event-payouts">
        <ProtectedRoute component={EventPayouts} allowedRoles={["event_admin"]} />
      </Route>
      <Route path="/event-reports">
        <ProtectedRoute component={EventReports} allowedRoles={["event_admin"]} />
      </Route>
      <Route path="/event-products">
        <ProtectedRoute component={EventProducts} allowedRoles={["event_admin"]} />
      </Route>
      <Route path="/event-locations">
        <ProtectedRoute component={EventLocations} allowedRoles={["event_admin"]} />
      </Route>
      <Route path="/event-transactions">
        <ProtectedRoute component={EventTransactions} allowedRoles={["event_admin"]} />
      </Route>
      <Route path="/event-inventory">
        <ProtectedRoute component={EventInventory} allowedRoles={["event_admin"]} />
      </Route>
      <Route path="/event-refund-requests">
        <ProtectedRoute component={EventRefundRequests} allowedRoles={["admin", "event_admin"]} />
      </Route>
      <Route path="/event-settlement">
        <ProtectedRoute component={EventSettlement} allowedRoles={["event_admin"]} />
      </Route>
      <Route path="/event-settings">
        <ProtectedRoute component={EventSettings} allowedRoles={["event_admin"]} />
      </Route>

      {/* Ticketing Routes (module-gated) */}
      <Route path="/event-days">
        <ModuleGatedRoute component={EventDays} allowedRoles={["admin", "event_admin"]} requiredModule="ticketing" />
      </Route>
      <Route path="/event-venue-map">
        <ModuleGatedRoute component={EventVenueMap} allowedRoles={["admin", "event_admin"]} requiredModule="ticketing" />
      </Route>
      <Route path="/event-ticket-types">
        <ModuleGatedRoute component={EventTicketTypes} allowedRoles={["admin", "event_admin"]} requiredModule="ticketing" />
      </Route>
      <Route path="/event-sales-config">
        <ModuleGatedRoute component={EventSalesConfig} allowedRoles={["admin", "event_admin"]} requiredModule="ticketing" />
      </Route>
      <Route path="/event-sales-dashboard">
        <ModuleGatedRoute component={EventSalesDashboard} allowedRoles={["admin", "event_admin"]} requiredModule="ticketing" />
      </Route>
      <Route path="/event-orders">
        <ModuleGatedRoute component={EventOrders} allowedRoles={["admin", "event_admin"]} requiredModule="ticketing" />
      </Route>
      <Route path="/event-checkins">
        <ModuleGatedRoute component={EventCheckins} allowedRoles={["admin", "event_admin"]} requiredModule="ticketing" />
      </Route>
      <Route path="/event-guest-lists">
        <ModuleGatedRoute component={EventGuestLists} allowedRoles={["admin", "event_admin"]} requiredModule="ticketing" />
      </Route>

      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <EventProvider>
              <Router />
            </EventProvider>
          </WouterRouter>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
