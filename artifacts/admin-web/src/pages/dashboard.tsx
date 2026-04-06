import {
  useGetAnalyticsSummary,
  useGetFraudAlerts,
  useListEvents,
  useListPromoterCompanies,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calendar, Users, ShieldAlert, DollarSign, Building, TrendingUp } from "lucide-react";

export default function Dashboard() {
  const { data: summary, isLoading: summaryLoading } = useGetAnalyticsSummary();
  const { data: fraudData } = useGetFraudAlerts({ status: "open" });
  const { data: eventsData } = useListEvents();
  const { data: promotersData } = useListPromoterCompanies();

  const events = eventsData?.events ?? [];
  const activeEvents = events.filter((e) => e.active);
  const alerts = fraudData?.alerts ?? [];
  const companies = promotersData?.companies ?? [];

  const fmt = (n?: number | null) => (n ?? 0).toLocaleString();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Global Dashboard</h1>
        <p className="text-muted-foreground mt-1">Platform-wide operational overview.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <Card data-testid="card-events">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Calendar className="w-4 h-4" /> Events
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{events.length}</p>
            <p className="text-xs text-muted-foreground mt-1">{activeEvents.length} active</p>
          </CardContent>
        </Card>

        <Card data-testid="card-promoters">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Building className="w-4 h-4" /> Promoters
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{companies.length}</p>
            <p className="text-xs text-muted-foreground mt-1">companies registered</p>
          </CardContent>
        </Card>

        <Card data-testid="card-revenue" className={summaryLoading ? "opacity-60" : ""}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <DollarSign className="w-4 h-4" /> Revenue
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">${fmt(summary?.totalSalesCop)}</p>
            <p className="text-xs text-muted-foreground mt-1">total sales (COP)</p>
          </CardContent>
        </Card>

        <Card data-testid="card-fraud-alerts" className={alerts.length > 0 ? "border-destructive/50" : ""}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <ShieldAlert className={`w-4 h-4 ${alerts.length > 0 ? "text-destructive" : ""}`} /> Fraud Alerts
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className={`text-3xl font-bold ${alerts.length > 0 ? "text-destructive" : ""}`}>{alerts.length}</p>
            <p className="text-xs text-muted-foreground mt-1">open alerts</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {summary && (
          <Card data-testid="card-analytics">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <TrendingUp className="w-4 h-4" /> Analytics Snapshot
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Total Transactions</span>
                <span className="font-mono font-medium">{fmt(summary.transactionCount)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Top-Up Total (COP)</span>
                <span className="font-mono font-medium">${fmt(summary.totalTopUpsCop)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Pending Balance (COP)</span>
                <span className="font-mono font-medium">${fmt(summary.pendingBalanceCop)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Top-Up Count</span>
                <span className="font-mono font-medium">{fmt(summary.topUpCount)}</span>
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Calendar className="w-4 h-4" /> Recent Events
            </CardTitle>
          </CardHeader>
          <CardContent>
            {events.length === 0 ? (
              <p className="text-muted-foreground text-sm">No events yet.</p>
            ) : (
              <div className="space-y-2">
                {events.slice(0, 6).map((event) => (
                  <div key={event.id} className="flex items-center justify-between" data-testid={`text-event-${event.id}`}>
                    <div>
                      <p className="text-sm font-medium">{event.name}</p>
                      <p className="text-xs text-muted-foreground">{event.venueAddress ?? "No venue"}</p>
                    </div>
                    <Badge variant={event.active ? "default" : "secondary"} className="text-xs ml-2 flex-shrink-0">
                      {event.active ? "Active" : "Inactive"}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {alerts.length > 0 && (
        <Card className="border-destructive/50">
          <CardHeader>
            <CardTitle className="text-base text-destructive flex items-center gap-2">
              <ShieldAlert className="w-4 h-4" /> Open Fraud Alerts
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {alerts.slice(0, 5).map((alert) => (
                <div key={alert.id} className="flex items-center justify-between text-sm" data-testid={`text-alert-${alert.id}`}>
                  <div>
                    <span className="font-medium capitalize">{alert.type.replace(/_/g, " ")}</span>
                    <span className="text-muted-foreground ml-2 font-mono text-xs">{alert.entityId.slice(0, 12)}</span>
                  </div>
                  <Badge variant="destructive" className="text-xs capitalize">{alert.severity}</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
