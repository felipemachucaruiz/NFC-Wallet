import {
  useGetAnalyticsSummary,
  useGetFraudAlerts,
  useListEvents,
  useListPromoterCompanies,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calendar, Users, ShieldAlert, DollarSign, Building, TrendingUp } from "lucide-react";
import { useTranslation } from "react-i18next";

export default function Dashboard() {
  const { t } = useTranslation();
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
        <h1 className="text-3xl font-bold tracking-tight">{t("dashboard.title")}</h1>
        <p className="text-muted-foreground mt-1">{t("dashboard.subtitle")}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <Card data-testid="card-events">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Calendar className="w-4 h-4" /> {t("dashboard.events")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{events.length}</p>
            <p className="text-xs text-muted-foreground mt-1">{t("dashboard.activeEvents", { count: activeEvents.length })}</p>
          </CardContent>
        </Card>

        <Card data-testid="card-promoters">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Building className="w-4 h-4" /> {t("dashboard.promoters")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{companies.length}</p>
            <p className="text-xs text-muted-foreground mt-1">{t("dashboard.companiesRegistered")}</p>
          </CardContent>
        </Card>

        <Card data-testid="card-revenue" className={summaryLoading ? "opacity-60" : ""}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <DollarSign className="w-4 h-4" /> {t("dashboard.revenue")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">${fmt(summary?.totalSalesCop)}</p>
            <p className="text-xs text-muted-foreground mt-1">{t("dashboard.totalSalesCop")}</p>
          </CardContent>
        </Card>

        <Card data-testid="card-fraud-alerts" className={alerts.length > 0 ? "border-destructive/50" : ""}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <ShieldAlert className={`w-4 h-4 ${alerts.length > 0 ? "text-destructive" : ""}`} /> {t("dashboard.fraudAlerts")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className={`text-3xl font-bold ${alerts.length > 0 ? "text-destructive" : ""}`}>{alerts.length}</p>
            <p className="text-xs text-muted-foreground mt-1">{t("dashboard.openAlerts")}</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {summary && (
          <Card data-testid="card-analytics">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <TrendingUp className="w-4 h-4" /> {t("dashboard.analyticsSnapshot")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">{t("dashboard.totalTransactions")}</span>
                <span className="font-mono font-medium">{fmt(summary.transactionCount)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">{t("dashboard.topUpTotal")}</span>
                <span className="font-mono font-medium">${fmt(summary.totalTopUpsCop)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">{t("dashboard.pendingBalance")}</span>
                <span className="font-mono font-medium">${fmt(summary.pendingBalanceCop)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">{t("dashboard.topUpCount")}</span>
                <span className="font-mono font-medium">{fmt(summary.topUpCount)}</span>
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Calendar className="w-4 h-4" /> {t("dashboard.recentEvents")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {events.length === 0 ? (
              <p className="text-muted-foreground text-sm">{t("dashboard.noEvents")}</p>
            ) : (
              <div className="space-y-2">
                {events.slice(0, 6).map((event) => (
                  <div key={event.id} className="flex items-center justify-between" data-testid={`text-event-${event.id}`}>
                    <div>
                      <p className="text-sm font-medium">{event.name}</p>
                      <p className="text-xs text-muted-foreground">{event.venueAddress ?? t("dashboard.noVenue")}</p>
                    </div>
                    <Badge variant={event.active ? "default" : "secondary"} className="text-xs ml-2 flex-shrink-0">
                      {event.active ? t("common.active") : t("common.inactive")}
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
              <ShieldAlert className="w-4 h-4" /> {t("dashboard.openFraudAlerts")}
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
