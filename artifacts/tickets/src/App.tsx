import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider, MutationCache, QueryCache } from "@tanstack/react-query";
import * as Sentry from "@sentry/react";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/context/AuthContext";
import { SocialAuthProvider } from "@/context/SocialAuthProvider";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { AuthModal } from "@/components/AuthModal";
import Home from "@/pages/home";
import EventDetail from "@/pages/event-detail";
import Checkout from "@/pages/checkout";
import PaymentStatus from "@/pages/payment-status";
import PaymentReturn from "@/pages/payment-return";
import MyTickets from "@/pages/my-tickets";
import MyOrders from "@/pages/my-orders";
import Account from "@/pages/account";
import NotFound from "@/pages/not-found";
import GuestListPage from "@/pages/guest-list";
import Terms from "@/pages/terms";
import Privacy from "@/pages/privacy";
import Returns from "@/pages/returns";

const EXPECTED_ERRORS = /AbortError|NetworkError|cancelled|user denied/i;

function reportToSentry(error: unknown, context?: Record<string, unknown>) {
  if (!error) return;
  const msg = error instanceof Error ? error.message : String(error);
  if (EXPECTED_ERRORS.test(msg)) return;
  Sentry.captureException(error instanceof Error ? error : new Error(msg), {
    extra: context,
  });
}

const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error, query) => {
      reportToSentry(error, { queryKey: JSON.stringify(query.queryKey) });
    },
  }),
  mutationCache: new MutationCache({
    onError: (error, _variables, _context, mutation) => {
      reportToSentry(error, {
        mutationKey: mutation.options.mutationKey
          ? JSON.stringify(mutation.options.mutationKey)
          : undefined,
      });
    },
  }),
});

function Router() {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1">
        <Switch>
          <Route path="/" component={Home} />
          <Route path="/event/:id" component={EventDetail} />
          <Route path="/checkout" component={Checkout} />
          <Route path="/payment-status" component={PaymentStatus} />
          <Route path="/payment-return" component={PaymentReturn} />
          <Route path="/my-tickets" component={MyTickets} />
          <Route path="/my-orders" component={MyOrders} />
          <Route path="/account" component={Account} />
          <Route path="/guest-list/:slug" component={GuestListPage} />
          <Route path="/terminos" component={Terms} />
          <Route path="/privacidad" component={Privacy} />
          <Route path="/devoluciones" component={Returns} />
          <Route component={NotFound} />
        </Switch>
      </main>
      <Footer />
      <AuthModal />
    </div>
  );
}

function App() {
  return (
    <Sentry.ErrorBoundary
      fallback={({ error, resetError }) => (
        <div className="min-h-screen flex items-center justify-center p-8 text-center">
          <div className="space-y-4 max-w-md">
            <h1 className="text-2xl font-bold text-red-600">Algo salió mal</h1>
            <p className="text-muted-foreground text-sm">{String((error as Error)?.message ?? "")}</p>
            <button
              className="px-4 py-2 bg-primary text-primary-foreground rounded"
              onClick={resetError}
            >
              Reintentar
            </button>
          </div>
        </div>
      )}
    >
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <SocialAuthProvider>
            <TooltipProvider>
              <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
                <Router />
              </WouterRouter>
              <Toaster />
            </TooltipProvider>
          </SocialAuthProvider>
        </AuthProvider>
      </QueryClientProvider>
    </Sentry.ErrorBoundary>
  );
}

export default App;
