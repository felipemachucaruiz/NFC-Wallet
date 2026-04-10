import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/context/AuthContext";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import Home from "@/pages/home";
import EventDetail from "@/pages/event-detail";
import Login from "@/pages/login";
import Register from "@/pages/register";
import Checkout from "@/pages/checkout";
import PaymentStatus from "@/pages/payment-status";
import MyTickets from "@/pages/my-tickets";
import Account from "@/pages/account";
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient();

function Router() {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1">
        <Switch>
          <Route path="/" component={Home} />
          <Route path="/event/:id" component={EventDetail} />
          <Route path="/login" component={Login} />
          <Route path="/register" component={Register} />
          <Route path="/checkout" component={Checkout} />
          <Route path="/payment-status" component={PaymentStatus} />
          <Route path="/my-tickets" component={MyTickets} />
          <Route path="/account" component={Account} />
          <Route component={NotFound} />
        </Switch>
      </main>
      <Footer />
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <Router />
          </WouterRouter>
          <Toaster />
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
