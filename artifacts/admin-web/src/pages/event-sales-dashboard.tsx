import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useGetCurrentAuthUser } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DollarSign, Ticket, TrendingUp, BarChart3, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { formatCurrency } from "@/lib/currency";
import { useEventContext } from "@/contexts/event-context";
import {
  apiFetchTicketTypes,
  apiFetchTicketOrders,
  apiFetchVenues,
  apiFetchSections,
  apiFetchEventDays,
} from "@/lib/api";

function getFillColor(pct: number): string {
  if (pct >= 90) return "#ef4444";
  if (pct >= 70) return "#f59e0b";
  return "#22c55e";
}

export default function EventSalesDashboard() {
  const { t } = useTranslation();
  const { data: auth } = useGetCurrentAuthUser();
  const { eventId: ctxEventId } = useEventContext();
  const resolvedEventId = auth?.user?.role === "admin" ? ctxEventId : (auth?.user?.eventId ?? "");
  const currency = "COP";
  const fmt = (n: number) => formatCurrency(n, currency);

  const [selectedDay, setSelectedDay] = useState("all");

  const { data: ticketTypes = [], isLoading: ttLoading } = useQuery({
    queryKey: ["ticketTypes", resolvedEventId],
    queryFn: () => apiFetchTicketTypes(resolvedEventId),
    enabled: !!resolvedEventId,
  });

  const { data: orders = [], isLoading: ordersLoading } = useQuery({
    queryKey: ["ticketOrders", resolvedEventId],
    queryFn: () => apiFetchTicketOrders(resolvedEventId),
    enabled: !!resolvedEventId,
  });

  const { data: venues = [] } = useQuery({
    queryKey: ["venues", resolvedEventId],
    queryFn: () => apiFetchVenues(resolvedEventId),
    enabled: !!resolvedEventId,
  });

  const firstVenueId = venues[0]?.id ?? "";
  const { data: sections = [] } = useQuery({
    queryKey: ["sections", resolvedEventId, firstVenueId],
    queryFn: () => apiFetchSections(resolvedEventId, firstVenueId),
    enabled: !!resolvedEventId && !!firstVenueId,
  });

  const { data: days = [] } = useQuery({
    queryKey: ["eventDays", resolvedEventId],
    queryFn: () => apiFetchEventDays(resolvedEventId),
    enabled: !!resolvedEventId,
  });

  const isLoading = ttLoading || ordersLoading;

  const totalSold = ticketTypes.reduce((s, tt) => s + tt.soldCount, 0);
  const totalCapacity = ticketTypes.reduce((s, tt) => s + tt.quantity, 0);
  const totalRevenue = ticketTypes.reduce((s, tt) => s + tt.soldCount * tt.price, 0);
  const remaining = totalCapacity - totalSold;

  const sectionStats = sections.map((sec, idx) => {
    const sectionTTs = ticketTypes.filter((tt) => tt.sectionId === sec.id);
    const sold = sectionTTs.reduce((s, tt) => s + tt.soldCount, 0);
    const capacity = sectionTTs.reduce((s, tt) => s + tt.quantity, 0) || sec.capacity || 0;
    const revenue = sectionTTs.reduce((s, tt) => s + tt.soldCount * tt.price, 0);
    return { ...sec, sold, capacity, revenue, idx };
  });

  const unassignedTTs = ticketTypes.filter((tt) => !tt.sectionId || !sections.find((s) => s.id === tt.sectionId));
  const hasUnassigned = unassignedTTs.length > 0;

  const allDisplayItems = [
    ...sectionStats.map((s) => ({ id: s.id, name: s.name, sold: s.sold, capacity: s.capacity, revenue: s.revenue })),
    ...(hasUnassigned
      ? [{
          id: "_general",
          name: t("salesDashboard.generalAdmission", "General"),
          sold: unassignedTTs.reduce((s, tt) => s + tt.soldCount, 0),
          capacity: unassignedTTs.reduce((s, tt) => s + tt.quantity, 0),
          revenue: unassignedTTs.reduce((s, tt) => s + tt.soldCount * tt.price, 0),
        }]
      : []),
  ];

  const dayOptions = [
    { id: "all", label: t("salesDashboard.allDays", "All Days") },
    ...days.map((d) => ({ id: d.id, label: d.label || d.date })),
  ];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t("salesDashboard.title")}</h1>
          <p className="text-muted-foreground mt-1">{t("salesDashboard.subtitle")}</p>
        </div>
        {days.length > 0 && (
          <Select value={selectedDay} onValueChange={setSelectedDay}>
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {dayOptions.map((d) => (
                <SelectItem key={d.id} value={d.id}>{d.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Ticket className="w-4 h-4" /> {t("salesDashboard.totalSold")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{totalSold.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground mt-1">
              {t("salesDashboard.ofCapacity", { capacity: totalCapacity.toLocaleString() })}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <DollarSign className="w-4 h-4" /> {t("salesDashboard.totalRevenue")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{fmt(totalRevenue)}</p>
            <p className="text-xs text-muted-foreground mt-1">{t("salesDashboard.ticketSales")}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <TrendingUp className="w-4 h-4" /> {t("salesDashboard.remaining")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{remaining.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground mt-1">{t("salesDashboard.ticketsLeft")}</p>
          </CardContent>
        </Card>
      </div>

      {allDisplayItems.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <BarChart3 className="w-4 h-4" />
                {t("salesDashboard.venueMapTitle")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="relative w-full aspect-[16/10] bg-muted/30 rounded-lg border">
                {allDisplayItems.map((item, idx) => {
                  const pct = item.capacity > 0 ? (item.sold / item.capacity) * 100 : 0;
                  const fillColor = getFillColor(pct);
                  const cols = Math.min(allDisplayItems.length, 3);
                  const row = Math.floor(idx / cols);
                  const col = idx % cols;
                  const cellW = 90 / cols;
                  const rows = Math.ceil(allDisplayItems.length / cols);
                  const cellH = 85 / rows;
                  return (
                    <div
                      key={item.id}
                      className="absolute border-2 rounded-sm flex flex-col items-center justify-center cursor-default"
                      style={{
                        left: `${5 + col * cellW}%`,
                        top: `${5 + row * cellH}%`,
                        width: `${cellW - 2}%`,
                        height: `${cellH - 3}%`,
                        borderColor: fillColor,
                        backgroundColor: `${fillColor}22`,
                      }}
                      title={`${item.name}: ${item.sold}/${item.capacity} (${Math.round(pct)}%)`}
                    >
                      <span className="text-xs font-bold">{item.name}</span>
                      <span className="text-xs text-muted-foreground">{item.sold}/{item.capacity}</span>
                      <span className="text-xs font-mono" style={{ color: fillColor }}>{Math.round(pct)}%</span>
                    </div>
                  );
                })}
              </div>
              <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-green-500" /> &lt;70%</span>
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-yellow-500" /> 70-90%</span>
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-red-500" /> &gt;90%</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("salesDashboard.sectionBreakdown")}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {allDisplayItems.map((item) => {
                  const pct = item.capacity > 0 ? (item.sold / item.capacity) * 100 : 0;
                  return (
                    <div key={item.id}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium">{item.name}</span>
                        <span className="text-xs text-muted-foreground">{item.sold}/{item.capacity}</span>
                      </div>
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{ width: `${pct}%`, backgroundColor: getFillColor(pct) }}
                        />
                      </div>
                      <div className="flex items-center justify-between mt-0.5">
                        <span className="text-xs text-muted-foreground">{fmt(item.revenue)}</span>
                        <span className="text-xs font-medium" style={{ color: getFillColor(pct) }}>{Math.round(pct)}%</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("salesDashboard.recentOrders")}</CardTitle>
        </CardHeader>
        <CardContent>
          {orders.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Ticket className="w-10 h-10 mx-auto mb-2 opacity-30" />
              <p>{t("salesDashboard.noOrders", "No orders yet")}</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("salesDashboard.colOrderId")}</TableHead>
                  <TableHead>{t("salesDashboard.colAttendee")}</TableHead>
                  <TableHead>{t("salesDashboard.colQty")}</TableHead>
                  <TableHead>{t("salesDashboard.colTotal")}</TableHead>
                  <TableHead>{t("salesDashboard.colDate")}</TableHead>
                  <TableHead>{t("common.status")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.slice(0, 20).map((order) => (
                  <TableRow key={order.id}>
                    <TableCell className="font-mono text-xs">{order.id.slice(0, 8)}</TableCell>
                    <TableCell>{order.buyerName || order.buyerEmail}</TableCell>
                    <TableCell>{order.ticketCount}</TableCell>
                    <TableCell className="font-mono">{fmt(order.totalAmount)}</TableCell>
                    <TableCell className="text-sm">{new Date(order.createdAt).toLocaleString()}</TableCell>
                    <TableCell>
                      <Badge variant={order.paymentStatus === "paid" ? "default" : "secondary"}>
                        {order.paymentStatus}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
