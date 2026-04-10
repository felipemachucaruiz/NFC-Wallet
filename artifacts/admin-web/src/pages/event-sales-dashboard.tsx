import { useState } from "react";
import { useGetCurrentAuthUser, useGetEvent } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DollarSign, Ticket, TrendingUp, BarChart3 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { formatCurrency } from "@/lib/currency";

type SectionFill = {
  id: string;
  name: string;
  color: string;
  capacity: number;
  sold: number;
  revenue: number;
  x: number;
  y: number;
  width: number;
  height: number;
};

type RecentOrder = {
  id: string;
  attendeeName: string;
  ticketType: string;
  quantity: number;
  total: number;
  date: string;
  status: string;
};

const MOCK_SECTIONS: SectionFill[] = [
  { id: "1", name: "VIP", color: "#8b5cf6", capacity: 200, sold: 180, revenue: 54000000, x: 10, y: 10, width: 30, height: 35 },
  { id: "2", name: "General", color: "#3b82f6", capacity: 1000, sold: 650, revenue: 65000000, x: 45, y: 10, width: 45, height: 35 },
  { id: "3", name: "Palco", color: "#f59e0b", capacity: 50, sold: 48, revenue: 24000000, x: 10, y: 55, width: 25, height: 35 },
  { id: "4", name: "Platea", color: "#22c55e", capacity: 500, sold: 200, revenue: 30000000, x: 40, y: 55, width: 50, height: 35 },
];

const MOCK_ORDERS: RecentOrder[] = [
  { id: "ORD-001", attendeeName: "Carlos García", ticketType: "VIP", quantity: 2, total: 600000, date: "2026-04-10 14:30", status: "confirmed" },
  { id: "ORD-002", attendeeName: "María López", ticketType: "General", quantity: 4, total: 400000, date: "2026-04-10 14:15", status: "confirmed" },
  { id: "ORD-003", attendeeName: "Juan Pérez", ticketType: "Palco", quantity: 1, total: 500000, date: "2026-04-10 13:50", status: "pending" },
  { id: "ORD-004", attendeeName: "Ana Rodríguez", ticketType: "General", quantity: 3, total: 300000, date: "2026-04-10 13:30", status: "confirmed" },
  { id: "ORD-005", attendeeName: "Pedro Martínez", ticketType: "VIP", quantity: 1, total: 300000, date: "2026-04-10 13:10", status: "confirmed" },
];

const MOCK_DAYS = [
  { id: "all", label: "All Days" },
  { id: "day-1", label: "Day 1 - Friday" },
  { id: "day-2", label: "Day 2 - Saturday" },
  { id: "day-3", label: "Day 3 - Sunday" },
];

function getFillColor(pct: number): string {
  if (pct >= 90) return "#ef4444";
  if (pct >= 70) return "#f59e0b";
  return "#22c55e";
}

export default function EventSalesDashboard() {
  const { t } = useTranslation();
  const { data: auth } = useGetCurrentAuthUser();
  const eventId = auth?.user?.eventId ?? "";
  const { data: eventData } = useGetEvent(eventId || "");
  const currency = (eventData as Record<string, unknown> | undefined)?.currencyCode as string ?? "COP";
  const fmt = (n: number) => formatCurrency(n, currency);

  const [selectedDay, setSelectedDay] = useState("all");

  const totalSold = MOCK_SECTIONS.reduce((s, sec) => s + sec.sold, 0);
  const totalCapacity = MOCK_SECTIONS.reduce((s, sec) => s + sec.capacity, 0);
  const totalRevenue = MOCK_SECTIONS.reduce((s, sec) => s + sec.revenue, 0);
  const remaining = totalCapacity - totalSold;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t("salesDashboard.title")}</h1>
          <p className="text-muted-foreground mt-1">{t("salesDashboard.subtitle")}</p>
        </div>
        <Select value={selectedDay} onValueChange={setSelectedDay}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {MOCK_DAYS.map((d) => (
              <SelectItem key={d.id} value={d.id}>{d.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
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
              {MOCK_SECTIONS.map((section) => {
                const pct = (section.sold / section.capacity) * 100;
                const fillColor = getFillColor(pct);
                return (
                  <div
                    key={section.id}
                    className="absolute border-2 rounded-sm flex flex-col items-center justify-center cursor-default"
                    style={{
                      left: `${section.x}%`,
                      top: `${section.y}%`,
                      width: `${section.width}%`,
                      height: `${section.height}%`,
                      borderColor: fillColor,
                      backgroundColor: `${fillColor}22`,
                    }}
                    title={`${section.name}: ${section.sold}/${section.capacity} (${Math.round(pct)}%)`}
                  >
                    <span className="text-xs font-bold">{section.name}</span>
                    <span className="text-xs text-muted-foreground">{section.sold}/{section.capacity}</span>
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
              {MOCK_SECTIONS.map((section) => {
                const pct = (section.sold / section.capacity) * 100;
                return (
                  <div key={section.id}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium">{section.name}</span>
                      <span className="text-xs text-muted-foreground">{section.sold}/{section.capacity}</span>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${pct}%`, backgroundColor: getFillColor(pct) }}
                      />
                    </div>
                    <div className="flex items-center justify-between mt-0.5">
                      <span className="text-xs text-muted-foreground">{fmt(section.revenue)}</span>
                      <span className="text-xs font-medium" style={{ color: getFillColor(pct) }}>{Math.round(pct)}%</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("salesDashboard.recentOrders")}</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("salesDashboard.colOrderId")}</TableHead>
                <TableHead>{t("salesDashboard.colAttendee")}</TableHead>
                <TableHead>{t("salesDashboard.colTicketType")}</TableHead>
                <TableHead>{t("salesDashboard.colQty")}</TableHead>
                <TableHead>{t("salesDashboard.colTotal")}</TableHead>
                <TableHead>{t("salesDashboard.colDate")}</TableHead>
                <TableHead>{t("common.status")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {MOCK_ORDERS.map((order) => (
                <TableRow key={order.id}>
                  <TableCell className="font-mono text-xs">{order.id}</TableCell>
                  <TableCell>{order.attendeeName}</TableCell>
                  <TableCell>{order.ticketType}</TableCell>
                  <TableCell>{order.quantity}</TableCell>
                  <TableCell className="font-mono">{fmt(order.total)}</TableCell>
                  <TableCell className="text-sm">{order.date}</TableCell>
                  <TableCell>
                    <Badge variant={order.status === "confirmed" ? "default" : "secondary"}>
                      {order.status === "confirmed" ? t("salesDashboard.confirmed") : t("salesDashboard.pending")}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
