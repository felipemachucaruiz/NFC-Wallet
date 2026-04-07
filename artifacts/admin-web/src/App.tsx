import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Layout } from "@/components/layout";
import { useGetCurrentAuthUser, setAuthTokenGetter, setBaseUrl } from "@workspace/api-client-react";
import { AUTH_TOKEN_KEY } from "@/pages/login";

setBaseUrl(`${import.meta.env.BASE_URL}_srv`);
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

import EventDashboard from "@/pages/event-dashboard";
import EventUsers from "@/pages/event-users";
import EventMerchants from "@/pages/event-merchants";
import EventBracelets from "@/pages/event-bracelets";
import EventAccessZones from "@/pages/event-access-zones";
import EventPayouts from "@/pages/event-payouts";
import EventReports from "@/pages/event-reports";
import EventProducts from "@/pages/event-products";
import EventLocations from "@/pages/event-locations";
import EventsMap from "@/pages/events-map";
import EventTransactions from "@/pages/event-transactions";
import EventInventory from "@/pages/event-inventory";
import EventRefundRequests from "@/pages/event-refund-requests";
import EventSettlement from "@/pages/event-settlement";

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
      <Route path="/events-map">
        <ProtectedRoute component={EventsMap} allowedRoles={["admin"]} />
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

      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
