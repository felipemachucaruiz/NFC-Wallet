import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import { RouteGuard, PublicRouteGuard } from "@/components/RouteGuard";
import { AppShell } from "@/components/AppShell";
import LoginPage from "@/pages/LoginPage";
import ForgotPasswordPage from "@/pages/ForgotPasswordPage";
import ResetPasswordPage from "@/pages/ResetPasswordPage";
import AdminDashboard from "@/pages/admin/AdminDashboard";
import EventAdminDashboard from "@/pages/event-admin/EventAdminDashboard";
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 30_000 },
  },
});

function Router() {
  return (
    <Switch>
      <Route path="/">
        <Redirect to="/login" />
      </Route>

      <Route path="/login">
        <PublicRouteGuard>
          <LoginPage />
        </PublicRouteGuard>
      </Route>

      <Route path="/forgot-password">
        <PublicRouteGuard>
          <ForgotPasswordPage />
        </PublicRouteGuard>
      </Route>

      <Route path="/reset-password">
        <ResetPasswordPage />
      </Route>

      <Route path="/admin">
        <RouteGuard allowedRoles={["admin"]}>
          <AppShell>
            <AdminDashboard />
          </AppShell>
        </RouteGuard>
      </Route>

      <Route path="/admin/:rest*">
        <RouteGuard allowedRoles={["admin"]}>
          <AppShell>
            <AdminDashboard />
          </AppShell>
        </RouteGuard>
      </Route>

      <Route path="/event-admin">
        <RouteGuard allowedRoles={["event_admin"]}>
          <AppShell>
            <EventAdminDashboard />
          </AppShell>
        </RouteGuard>
      </Route>

      <Route path="/event-admin/:rest*">
        <RouteGuard allowedRoles={["event_admin"]}>
          <AppShell>
            <EventAdminDashboard />
          </AppShell>
        </RouteGuard>
      </Route>

      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <Router />
          </WouterRouter>
        </AuthProvider>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
