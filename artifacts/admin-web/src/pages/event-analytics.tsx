import { useMemo } from "react";
import { useQueries } from "@tanstack/react-query";
import { useGetCurrentAuthUser, useGetEvent } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import {
  TrendingUp, Users, Ticket, DollarSign, Activity, Store,
  ShoppingBag, AlertTriangle, Zap, BarChart3,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { formatCurrency } from "@/lib/currency";
import { useEventContext } from "@/contexts/event-context";
import {
  apiFetchTicketTypes,
  apiFetchTicketOrders,
  apiFetchTickets,
  apiFetchCheckinStats,
  apiFetchAnalyticsSummary,
  apiFetchAnalyticsSalesByHour,
  apiFetchAnalyticsTopProducts,
  apiFetchAnalyticsTopMerchants,
  apiFetchAnalyticsHeatmap,
  apiFetchAnalyticsStockAlerts,
} from "@/lib/api";

const CHART_COLORS = ["#6366f1", "#22c55e", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4", "#f97316", "#ec4899", "#14b8a6", "#84cc16"];
const DAYS_ORDER = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const currency = "COP";
const fmt = (n: number) => formatCurrency(n, currency);
const fmtK = (n: number) => n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1_000 ? `${(n / 1_000).toFixed(0)}K` : String(Math.round(n));

function StatCard({ icon: Icon, label, value, sub, color = "text-primary" }: { icon: React.ElementType; label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
          <Icon className="w-4 h-4" /> {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className={`text-2xl font-bold ${color}`}>{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
      </CardContent>
    </Card>
  );
}

function ChartSkeleton({ h = 280 }: { h?: number }) {
  return <Skeleton className="w-full rounded-lg" style={{ height: h }} />;
}

// ── Sales Velocity ────────────────────────────────────────────────────────────

function SalesVelocityChart({ orders }: { orders: Array<{ createdAt: string; totalAmount: number; ticketCount: number; paymentStatus: string }> }) {
  const confirmed = orders.filter((o) => o.paymentStatus === "confirmed" || o.paymentStatus === "paid");
  const byDate = new Map<string, { tickets: number; revenue: number }>();
  for (const o of confirmed) {
    const d = o.createdAt.slice(0, 10);
    const cur = byDate.get(d) ?? { tickets: 0, revenue: 0 };
    byDate.set(d, { tickets: cur.tickets + o.ticketCount, revenue: cur.revenue + o.totalAmount });
  }
  const sorted = [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b));
  let cumulative = 0;
  const data = sorted.map(([date, v]) => {
    cumulative += v.tickets;
    return { date: date.slice(5), tickets: v.tickets, revenue: v.revenue, cumulative };
  });

  if (data.length === 0) {
    return <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">No sales data yet</div>;
  }

  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={data} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
        <XAxis dataKey="date" tick={{ fontSize: 11 }} />
        <YAxis yAxisId="left" tick={{ fontSize: 11 }} />
        <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} tickFormatter={fmtK} />
        <Tooltip formatter={(val, name) => name === "revenue" ? fmt(Number(val)) : val} />
        <Legend />
        <Line yAxisId="left" type="monotone" dataKey="tickets" stroke={CHART_COLORS[0]} dot={false} name="Tickets/day" strokeWidth={2} />
        <Line yAxisId="left" type="monotone" dataKey="cumulative" stroke={CHART_COLORS[2]} dot={false} name="Cumulative" strokeWidth={1} strokeDasharray="5 3" />
        <Line yAxisId="right" type="monotone" dataKey="revenue" stroke={CHART_COLORS[1]} dot={false} name="Revenue" strokeWidth={1.5} />
      </LineChart>
    </ResponsiveContainer>
  );
}

// ── Revenue by ticket type ────────────────────────────────────────────────────

function RevenueByTypeChart({ ticketTypes }: { ticketTypes: Array<{ id: string; name: string; price: number; soldCount: number; sectionName?: string | null }> }) {
  const data = ticketTypes
    .filter((tt) => tt.soldCount > 0)
    .map((tt) => ({ name: tt.name.length > 20 ? tt.name.slice(0, 18) + "…" : tt.name, units: tt.soldCount, revenue: tt.soldCount * tt.price }))
    .sort((a, b) => b.revenue - a.revenue);

  if (data.length === 0) return <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">No ticket type data</div>;

  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 60, left: 8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" horizontal={false} className="stroke-border" />
        <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={fmtK} />
        <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={110} />
        <Tooltip formatter={(val, name) => name === "revenue" ? fmt(Number(val)) : val} />
        <Legend />
        <Bar dataKey="units" name="Units sold" fill={CHART_COLORS[0]} radius={[0, 3, 3, 0]} />
        <Bar dataKey="revenue" name="Revenue" fill={CHART_COLORS[1]} radius={[0, 3, 3, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

// ── Check-in progress ─────────────────────────────────────────────────────────

function CheckinProgressSection({ stats, t }: { stats: Awaited<ReturnType<typeof apiFetchCheckinStats>>; t: (key: string, opts?: Record<string, string>) => string }) {
  const total = stats.totalTickets ?? 0;
  const totalCheckedIn = stats.days?.reduce((s, d) => s + d.totalCheckins, 0) ?? 0;
  const overallPct = total > 0 ? (totalCheckedIn / total) * 100 : 0;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{t("analytics.checkins.totalCheckedIn")}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{totalCheckedIn.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground mt-1">{t("analytics.checkins.totalCheckedInSub", { total: total.toLocaleString() })}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{t("analytics.checkins.overallRate")}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{overallPct.toFixed(1)}%</p>
            <Progress value={overallPct} className="mt-2 h-2" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{t("analytics.checkins.noShows")}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{(total - totalCheckedIn).toLocaleString()}</p>
            <p className="text-xs text-muted-foreground mt-1">{t("analytics.checkins.noShowsSub", { pct: (100 - overallPct).toFixed(1) })}</p>
          </CardContent>
        </Card>
      </div>

      {stats.days && stats.days.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">{t("analytics.checkins.byDay")}</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={stats.days.map((d) => ({ label: d.dayLabel || d.date, checkins: d.totalCheckins, total: d.totalTickets }))} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="checkins" name="Checked in" fill={CHART_COLORS[0]} radius={[3, 3, 0, 0]} />
                <Bar dataKey="total" name="Total tickets" fill={CHART_COLORS[2]} radius={[3, 3, 0, 0]} opacity={0.4} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {stats.sections && stats.sections.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">{t("analytics.checkins.bySection")}</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-3">
              {stats.sections.map((sec) => {
                const pct = sec.totalTickets > 0 ? (sec.totalCheckins / sec.totalTickets) * 100 : 0;
                return (
                  <div key={sec.sectionId}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium">{sec.sectionName}</span>
                      <span className="text-xs text-muted-foreground">{sec.totalCheckins}/{sec.totalTickets}</span>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: sec.color || CHART_COLORS[0] }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ── NFC Heatmap ───────────────────────────────────────────────────────────────

function NfcHeatmap({ rows }: { rows: Array<{ hour: number; day: string; dayNum: number; txCount: number; total: number }> }) {
  if (rows.length === 0) return <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">No transaction data</div>;

  const maxTx = Math.max(...rows.map((r) => r.txCount), 1);
  const grid: Record<string, Record<number, { txCount: number; total: number }>> = {};
  for (const r of rows) {
    if (!grid[r.day]) grid[r.day] = {};
    grid[r.day]![r.hour] = { txCount: r.txCount, total: r.total };
  }
  const days = DAYS_ORDER.filter((d) => grid[d]);
  const hours = Array.from({ length: 24 }, (_, i) => i);

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[640px]">
        <div className="flex">
          <div className="w-10 shrink-0" />
          {hours.map((h) => (
            <div key={h} className="flex-1 text-center text-[10px] text-muted-foreground pb-1">{h % 3 === 0 ? `${h}h` : ""}</div>
          ))}
        </div>
        {days.map((day) => (
          <div key={day} className="flex items-center mb-0.5">
            <div className="w-10 shrink-0 text-xs text-muted-foreground text-right pr-2">{day}</div>
            {hours.map((h) => {
              const cell = grid[day]?.[h];
              const intensity = cell ? cell.txCount / maxTx : 0;
              return (
                <div
                  key={h}
                  className="flex-1 aspect-square rounded-[2px] mx-[1px] cursor-default"
                  style={{ backgroundColor: intensity > 0 ? `rgba(99,102,241,${0.1 + intensity * 0.9})` : "transparent", border: "1px solid hsl(var(--border))" }}
                  title={cell ? `${day} ${h}:00 — ${cell.txCount} txns · ${fmt(cell.total)}` : `${day} ${h}:00 — no data`}
                />
              );
            })}
          </div>
        ))}
        <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
          <span>Low</span>
          {[0.1, 0.35, 0.6, 0.85].map((v) => (
            <div key={v} className="w-4 h-4 rounded-[2px]" style={{ backgroundColor: `rgba(99,102,241,${v})` }} />
          ))}
          <span>High</span>
        </div>
      </div>
    </div>
  );
}

// ── Sales by Hour ─────────────────────────────────────────────────────────────

function SalesByHourChart({ rows }: { rows: Array<{ hour: number; total: number; txCount: number }> }) {
  const byHour = new Map<number, { total: number; txCount: number }>();
  for (const r of rows) {
    const cur = byHour.get(r.hour) ?? { total: 0, txCount: 0 };
    byHour.set(r.hour, { total: cur.total + r.total, txCount: cur.txCount + r.txCount });
  }
  const data = Array.from({ length: 24 }, (_, h) => ({ hour: `${h}h`, total: byHour.get(h)?.total ?? 0, txCount: byHour.get(h)?.txCount ?? 0 }));

  if (!rows.length) return <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">No transaction data</div>;

  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
        <XAxis dataKey="hour" tick={{ fontSize: 10 }} interval={2} />
        <YAxis tick={{ fontSize: 11 }} tickFormatter={fmtK} />
        <Tooltip formatter={(val, name) => name === "total" ? fmt(Number(val)) : val} />
        <Legend />
        <Bar dataKey="txCount" name="Transactions" fill={CHART_COLORS[0]} radius={[3, 3, 0, 0]} />
        <Bar dataKey="total" name="Revenue" fill={CHART_COLORS[1]} radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

// ── Top Products bar ──────────────────────────────────────────────────────────

function TopProductsChart({ products }: { products: Array<{ productName: string; totalUnits: number; totalRevenue: number; grossProfit: number; profitMarginPercent: number }> }) {
  if (!products.length) return <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">No product data</div>;
  const data = products.slice(0, 10).map((p) => ({
    name: p.productName.length > 22 ? p.productName.slice(0, 20) + "…" : p.productName,
    units: p.totalUnits,
    revenue: p.totalRevenue,
    margin: p.profitMarginPercent,
  }));

  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 60, left: 8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" horizontal={false} className="stroke-border" />
        <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={fmtK} />
        <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={120} />
        <Tooltip formatter={(val, name) => name === "revenue" ? fmt(Number(val)) : val} />
        <Legend />
        <Bar dataKey="units" name="Units sold" fill={CHART_COLORS[0]} radius={[0, 3, 3, 0]} />
        <Bar dataKey="revenue" name="Revenue" fill={CHART_COLORS[1]} radius={[0, 3, 3, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

// ── Top Merchants bar ─────────────────────────────────────────────────────────

function TopMerchantsChart({ merchants }: { merchants: Array<{ merchantName: string; totalSales: number; txCount: number; profitMarginPercent: number }> }) {
  if (!merchants.length) return <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">No merchant data</div>;
  const data = merchants.slice(0, 10).map((m) => ({
    name: m.merchantName.length > 22 ? m.merchantName.slice(0, 20) + "…" : m.merchantName,
    sales: m.totalSales,
    txCount: m.txCount,
  }));

  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 60, left: 8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" horizontal={false} className="stroke-border" />
        <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={fmtK} />
        <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={120} />
        <Tooltip formatter={(val, name) => name === "sales" ? fmt(Number(val)) : val} />
        <Legend />
        <Bar dataKey="sales" name="Sales" fill={CHART_COLORS[2]} radius={[0, 3, 3, 0]} />
        <Bar dataKey="txCount" name="Transactions" fill={CHART_COLORS[0]} radius={[0, 3, 3, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

// ── Demographics ──────────────────────────────────────────────────────────────

function DemographicsSection({ tickets, t }: { tickets: Array<{ attendeeSex: string | null; attendeeDateOfBirth: string | null }>; t: (key: string) => string }) {
  const sexCounts = useMemo(() => {
    const map: Record<string, number> = { male: 0, female: 0, non_binary: 0, unknown: 0 };
    for (const t of tickets) {
      const s = t.attendeeSex ?? "unknown";
      map[s in map ? s : "unknown"]!++;
    }
    return [
      { name: "Male", value: map["male"]!, color: "#6366f1" },
      { name: "Female", value: map["female"]!, color: "#ec4899" },
      { name: "Non-binary", value: map["non_binary"]!, color: "#8b5cf6" },
      { name: "Unknown", value: map["unknown"]!, color: "#94a3b8" },
    ].filter((e) => e.value > 0);
  }, [tickets]);

  const ageData = useMemo(() => {
    const buckets: Record<string, number> = { "< 18": 0, "18-24": 0, "25-34": 0, "35-44": 0, "45-54": 0, "55+": 0, "N/A": 0 };
    const now = new Date();
    for (const t of tickets) {
      if (!t.attendeeDateOfBirth) { buckets["N/A"]!++; continue; }
      const age = Math.floor((now.getTime() - new Date(t.attendeeDateOfBirth).getTime()) / (365.25 * 24 * 3600 * 1000));
      if (age < 18) buckets["< 18"]!++;
      else if (age <= 24) buckets["18-24"]!++;
      else if (age <= 34) buckets["25-34"]!++;
      else if (age <= 44) buckets["35-44"]!++;
      else if (age <= 54) buckets["45-54"]!++;
      else buckets["55+"]!++;
    }
    return Object.entries(buckets).filter(([, v]) => v > 0).map(([name, count]) => ({ name, count }));
  }, [tickets]);

  if (tickets.length === 0) {
    return <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">{t("analytics.demographics.noData")}</div>;
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <Card>
        <CardHeader><CardTitle className="text-base">{t("analytics.demographics.sexDistribution")}</CardTitle></CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie data={sexCounts} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                {sexCounts.map((entry, i) => <Cell key={i} fill={entry.color} />)}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">{t("analytics.demographics.ageDistribution")}</CardTitle></CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={ageData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="count" name="Attendees" fill={CHART_COLORS[4]} radius={[3, 3, 0, 0]}>
                {ageData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}

// ── Top Ticket Sales Product ──────────────────────────────────────────────────

function TopTicketTypesTable({ ticketTypes, t }: { ticketTypes: Array<{ id: string; name: string; price: number; serviceFee: number; quantity: number; soldCount: number; sectionName?: string | null }>; t: (key: string) => string }) {
  const sorted = [...ticketTypes].sort((a, b) => b.soldCount - a.soldCount);
  if (!sorted.length) return <div className="text-muted-foreground text-sm py-4 text-center">{t("analytics.tickets.noTypeData")}</div>;
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t("analytics.tickets.columns.rank")}</TableHead>
          <TableHead>{t("analytics.tickets.columns.ticketType")}</TableHead>
          <TableHead>{t("analytics.tickets.columns.section")}</TableHead>
          <TableHead className="text-right">{t("analytics.tickets.columns.price")}</TableHead>
          <TableHead className="text-right">{t("analytics.tickets.columns.sold")}</TableHead>
          <TableHead className="text-right">{t("analytics.tickets.columns.capacity")}</TableHead>
          <TableHead className="text-right">{t("analytics.tickets.columns.revenue")}</TableHead>
          <TableHead className="text-right">{t("analytics.tickets.columns.fill")}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {sorted.map((tt, i) => {
          const pct = tt.quantity > 0 ? (tt.soldCount / tt.quantity) * 100 : 0;
          const revenue = tt.soldCount * tt.price;
          return (
            <TableRow key={tt.id} className={i === 0 ? "font-medium bg-primary/5" : ""}>
              <TableCell className="text-muted-foreground">{i + 1}</TableCell>
              <TableCell>
                {tt.name}
                {i === 0 && <Badge className="ml-2 text-xs" variant="default">Top</Badge>}
              </TableCell>
              <TableCell className="text-muted-foreground">{tt.sectionName ?? "—"}</TableCell>
              <TableCell className="text-right font-mono">{fmt(tt.price)}</TableCell>
              <TableCell className="text-right font-mono">{tt.soldCount.toLocaleString()}</TableCell>
              <TableCell className="text-right text-muted-foreground">{tt.quantity.toLocaleString()}</TableCell>
              <TableCell className="text-right font-mono">{fmt(revenue)}</TableCell>
              <TableCell className="text-right">
                <span className={pct >= 90 ? "text-red-500" : pct >= 70 ? "text-yellow-500" : "text-green-500"}>
                  {pct.toFixed(0)}%
                </span>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

// ── Stock Alerts Table ────────────────────────────────────────────────────────

function StockAlertsTable({ alerts, t }: { alerts: Array<{ inventoryId: string; locationName: string; productName: string; quantityOnHand: number; restockTrigger: number; deficit: number }>; t: (key: string) => string }) {
  if (!alerts.length) return <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">{t("analytics.stock.noAlerts")}</div>;
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t("analytics.stock.columns.product")}</TableHead>
          <TableHead>{t("analytics.stock.columns.location")}</TableHead>
          <TableHead className="text-right">{t("analytics.stock.columns.onHand")}</TableHead>
          <TableHead className="text-right">{t("analytics.stock.columns.restockAt")}</TableHead>
          <TableHead className="text-right">{t("analytics.stock.columns.deficit")}</TableHead>
          <TableHead>{t("analytics.stock.columns.status")}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {alerts.map((a) => (
          <TableRow key={a.inventoryId}>
            <TableCell className="font-medium">{a.productName}</TableCell>
            <TableCell className="text-muted-foreground">{a.locationName}</TableCell>
            <TableCell className="text-right font-mono">{a.quantityOnHand}</TableCell>
            <TableCell className="text-right font-mono">{a.restockTrigger}</TableCell>
            <TableCell className="text-right font-mono text-red-500">{a.deficit}</TableCell>
            <TableCell>
              <Badge variant={a.quantityOnHand <= 0 ? "destructive" : "secondary"}>
                {a.quantityOnHand <= 0 ? t("analytics.stock.outOfStock") : t("analytics.stock.lowStock")}
              </Badge>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function EventAnalytics() {
  const { t } = useTranslation();
  const { data: auth } = useGetCurrentAuthUser();
  const { eventId: ctxEventId } = useEventContext();
  const eventId = auth?.user?.role === "admin" ? ctxEventId : (auth?.user?.eventId ?? "");

  const enabled = !!eventId;

  const { data: eventData } = useGetEvent(eventId || "", { query: { enabled } });
  const eventRecord = eventData as Record<string, unknown> | undefined;
  const ticketingEnabled = eventRecord?.ticketingEnabled === true;
  const nfcBraceletsEnabled = eventRecord?.nfcBraceletsEnabled !== false;
  const defaultTab = ticketingEnabled ? "tickets" : "cashless";

  const [
    summaryQ,
    ticketTypesQ,
    ordersQ,
    ticketsQ,
    checkinsQ,
    salesByHourQ,
    topProductsQ,
    topMerchantsQ,
    heatmapQ,
    stockAlertsQ,
  ] = useQueries({
    queries: [
      { queryKey: ["analyticsSummary", eventId], queryFn: () => apiFetchAnalyticsSummary(eventId), enabled },
      { queryKey: ["ticketTypes", eventId], queryFn: () => apiFetchTicketTypes(eventId), enabled },
      { queryKey: ["ticketOrders", eventId], queryFn: () => apiFetchTicketOrders(eventId), enabled },
      { queryKey: ["tickets", eventId], queryFn: () => apiFetchTickets(eventId), enabled },
      { queryKey: ["checkinStats", eventId], queryFn: () => apiFetchCheckinStats(eventId), enabled },
      { queryKey: ["analyticsSalesByHour", eventId], queryFn: () => apiFetchAnalyticsSalesByHour(eventId), enabled },
      { queryKey: ["analyticsTopProducts", eventId], queryFn: () => apiFetchAnalyticsTopProducts(eventId), enabled },
      { queryKey: ["analyticsTopMerchants", eventId], queryFn: () => apiFetchAnalyticsTopMerchants(eventId), enabled },
      { queryKey: ["analyticsHeatmap", eventId], queryFn: () => apiFetchAnalyticsHeatmap(eventId), enabled },
      { queryKey: ["analyticsStockAlerts", eventId], queryFn: () => apiFetchAnalyticsStockAlerts(eventId), enabled },
    ],
  });

  const summary = summaryQ.data;
  const ticketTypes = ticketTypesQ.data ?? [];
  const orders = ordersQ.data ?? [];
  const tickets = ticketsQ.data ?? [];
  const checkins = checkinsQ.data;
  const salesByHour = salesByHourQ.data ?? [];
  const topProducts = topProductsQ.data ?? [];
  const topMerchants = topMerchantsQ.data ?? [];
  const heatmap = heatmapQ.data ?? [];
  const stockAlerts = stockAlertsQ.data ?? [];

  const totalTicketSold = ticketTypes.reduce((s, tt) => s + tt.soldCount, 0);
  const totalTicketRevenue = ticketTypes.reduce((s, tt) => s + tt.soldCount * tt.price, 0);
  const totalCapacity = ticketTypes.reduce((s, tt) => s + tt.quantity, 0);

  if (!eventId) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        <p>{t("analytics.selectEvent", "Select an event to view analytics.")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <BarChart3 className="w-7 h-7" />
          {t("analytics.title")}
        </h1>
        <p className="text-muted-foreground mt-1">{t("analytics.subtitle")}</p>
      </div>

      <Tabs defaultValue={defaultTab}>
        <TabsList className="flex flex-wrap h-auto gap-1">
          {ticketingEnabled && <TabsTrigger value="tickets"><Ticket className="w-4 h-4 mr-1" />{t("analytics.tabs.tickets")}</TabsTrigger>}
          {ticketingEnabled && <TabsTrigger value="checkins"><Users className="w-4 h-4 mr-1" />{t("analytics.tabs.checkins")}</TabsTrigger>}
          {nfcBraceletsEnabled && <TabsTrigger value="cashless"><Zap className="w-4 h-4 mr-1" />{t("analytics.tabs.cashless")}</TabsTrigger>}
          {nfcBraceletsEnabled && <TabsTrigger value="products"><ShoppingBag className="w-4 h-4 mr-1" />{t("analytics.tabs.products")}</TabsTrigger>}
          {nfcBraceletsEnabled && <TabsTrigger value="merchants"><Store className="w-4 h-4 mr-1" />{t("analytics.tabs.merchants")}</TabsTrigger>}
          {ticketingEnabled && <TabsTrigger value="demographics"><Activity className="w-4 h-4 mr-1" />{t("analytics.tabs.demographics")}</TabsTrigger>}
          {nfcBraceletsEnabled && <TabsTrigger value="stock"><AlertTriangle className="w-4 h-4 mr-1" />{t("analytics.tabs.stock")}</TabsTrigger>}
        </TabsList>

        {/* ── TICKETS TAB ─────────────────────────────────────────────────── */}
        {ticketingEnabled && (
          <TabsContent value="tickets" className="space-y-6 mt-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <StatCard icon={Ticket} label={t("analytics.tickets.sold")} value={ticketTypes.length ? totalTicketSold.toLocaleString() : "—"} sub={t("analytics.tickets.soldSub", { total: totalCapacity.toLocaleString() })} />
              <StatCard icon={DollarSign} label={t("analytics.tickets.revenue")} value={ticketTypes.length ? fmt(totalTicketRevenue) : "—"} sub={t("analytics.tickets.revenueSub")} />
              <StatCard icon={TrendingUp} label={t("analytics.tickets.fillRate")} value={totalCapacity > 0 ? `${((totalTicketSold / totalCapacity) * 100).toFixed(1)}%` : "—"} sub={t("analytics.tickets.fillRateSub")} />
              <StatCard icon={Activity} label={t("analytics.tickets.orders")} value={orders.filter((o) => o.paymentStatus === "confirmed" || o.paymentStatus === "paid").length.toLocaleString()} sub={t("analytics.tickets.ordersSub")} />
            </div>

            <Card>
              <CardHeader><CardTitle className="text-base flex items-center gap-2"><TrendingUp className="w-4 h-4" /> {t("analytics.tickets.salesVelocity")}</CardTitle></CardHeader>
              <CardContent>
                {ordersQ.isLoading ? <ChartSkeleton h={260} /> : <SalesVelocityChart orders={orders} />}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base flex items-center gap-2"><BarChart3 className="w-4 h-4" /> {t("analytics.tickets.revenueByType")}</CardTitle></CardHeader>
              <CardContent>
                {ticketTypesQ.isLoading ? <ChartSkeleton h={260} /> : <RevenueByTypeChart ticketTypes={ticketTypes} />}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base flex items-center gap-2"><Ticket className="w-4 h-4" /> {t("analytics.tickets.topProduct")}</CardTitle></CardHeader>
              <CardContent className="p-0">
                {ticketTypesQ.isLoading ? <div className="p-4"><ChartSkeleton h={120} /></div> : <TopTicketTypesTable ticketTypes={ticketTypes} t={t} />}
              </CardContent>
            </Card>
          </TabsContent>
        )}

        {/* ── CHECK-INS TAB ────────────────────────────────────────────────── */}
        {ticketingEnabled && (
          <TabsContent value="checkins" className="mt-4">
            {checkinsQ.isLoading ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                {[1, 2, 3].map((i) => <ChartSkeleton key={i} h={100} />)}
              </div>
            ) : checkins ? (
              <CheckinProgressSection stats={checkins} t={t} />
            ) : (
              <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">{t("analytics.checkins.noData")}</div>
            )}
          </TabsContent>
        )}

        {/* ── CASHLESS NFC TAB ─────────────────────────────────────────────── */}
        {nfcBraceletsEnabled && (
          <TabsContent value="cashless" className="space-y-6 mt-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <StatCard icon={Zap} label={t("analytics.cashless.totalSales")} value={summary ? fmt(summary.totalSales) : "—"} sub={t("analytics.cashless.totalSalesSub", { count: summary?.transactionCount?.toLocaleString() ?? "—" })} />
              <StatCard icon={DollarSign} label={t("analytics.cashless.totalTopups")} value={summary ? fmt(summary.totalTopUps) : "—"} sub={t("analytics.cashless.totalTopupsSub", { count: summary?.topUpCount?.toLocaleString() ?? "—" })} />
              <StatCard icon={Activity} label={t("analytics.cashless.pendingBalance")} value={summary ? fmt(summary.pendingBalance) : "—"} sub={t("analytics.cashless.pendingBalanceSub", { count: summary?.braceletCount?.toLocaleString() ?? "—" })} />
              <StatCard icon={Ticket} label={t("analytics.cashless.bracelets")} value={summary?.braceletCount?.toLocaleString() ?? "—"} sub={t("analytics.cashless.braceletsSub")} />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader><CardTitle className="text-base flex items-center gap-2"><Activity className="w-4 h-4" /> {t("analytics.cashless.byHour")}</CardTitle></CardHeader>
                <CardContent>
                  {salesByHourQ.isLoading ? <ChartSkeleton h={240} /> : <SalesByHourChart rows={salesByHour} />}
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle className="text-base">{t("analytics.cashless.heatmap")}</CardTitle></CardHeader>
                <CardContent>
                  {heatmapQ.isLoading ? <ChartSkeleton h={180} /> : <NfcHeatmap rows={heatmap} />}
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        )}

        {/* ── PRODUCTS TAB ─────────────────────────────────────────────────── */}
        {nfcBraceletsEnabled && (
          <TabsContent value="products" className="space-y-6 mt-4">
            <Card>
              <CardHeader><CardTitle className="text-base flex items-center gap-2"><ShoppingBag className="w-4 h-4" /> {t("analytics.products.topChart")}</CardTitle></CardHeader>
              <CardContent>
                {topProductsQ.isLoading ? <ChartSkeleton h={300} /> : <TopProductsChart products={topProducts} />}
              </CardContent>
            </Card>

            {topProducts.length > 0 && (
              <Card>
                <CardHeader><CardTitle className="text-base">{t("analytics.products.detail")}</CardTitle></CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("analytics.products.columns.rank")}</TableHead>
                        <TableHead>{t("analytics.products.columns.product")}</TableHead>
                        <TableHead className="text-right">{t("analytics.products.columns.units")}</TableHead>
                        <TableHead className="text-right">{t("analytics.products.columns.revenue")}</TableHead>
                        <TableHead className="text-right">{t("analytics.products.columns.cogs")}</TableHead>
                        <TableHead className="text-right">{t("analytics.products.columns.grossProfit")}</TableHead>
                        <TableHead className="text-right">{t("analytics.products.columns.margin")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {topProducts.map((p, i) => (
                        <TableRow key={p.productId} className={i === 0 ? "font-medium bg-primary/5" : ""}>
                          <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                          <TableCell>
                            {p.productName}
                            {i === 0 && <Badge className="ml-2 text-xs" variant="default">Top</Badge>}
                          </TableCell>
                          <TableCell className="text-right font-mono">{p.totalUnits.toLocaleString()}</TableCell>
                          <TableCell className="text-right font-mono">{fmt(p.totalRevenue)}</TableCell>
                          <TableCell className="text-right font-mono text-muted-foreground">{fmt(p.totalCogs)}</TableCell>
                          <TableCell className="text-right font-mono text-green-600">{fmt(p.grossProfit)}</TableCell>
                          <TableCell className="text-right">
                            <span className={p.profitMarginPercent >= 50 ? "text-green-500" : p.profitMarginPercent >= 25 ? "text-yellow-500" : "text-red-500"}>
                              {p.profitMarginPercent.toFixed(1)}%
                            </span>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        )}

        {/* ── MERCHANTS TAB ────────────────────────────────────────────────── */}
        {nfcBraceletsEnabled && (
          <TabsContent value="merchants" className="space-y-6 mt-4">
            <Card>
              <CardHeader><CardTitle className="text-base flex items-center gap-2"><Store className="w-4 h-4" /> {t("analytics.merchants.topChart")}</CardTitle></CardHeader>
              <CardContent>
                {topMerchantsQ.isLoading ? <ChartSkeleton h={300} /> : <TopMerchantsChart merchants={topMerchants} />}
              </CardContent>
            </Card>

            {topMerchants.length > 0 && (
              <Card>
                <CardHeader><CardTitle className="text-base">{t("analytics.merchants.detail")}</CardTitle></CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("analytics.merchants.columns.rank")}</TableHead>
                        <TableHead>{t("analytics.merchants.columns.merchant")}</TableHead>
                        <TableHead className="text-right">{t("analytics.merchants.columns.sales")}</TableHead>
                        <TableHead className="text-right">{t("analytics.merchants.columns.commission")}</TableHead>
                        <TableHead className="text-right">{t("analytics.merchants.columns.net")}</TableHead>
                        <TableHead className="text-right">{t("analytics.merchants.columns.transactions")}</TableHead>
                        <TableHead className="text-right">{t("analytics.merchants.columns.margin")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {topMerchants.map((m, i) => (
                        <TableRow key={m.merchantId} className={i === 0 ? "font-medium bg-primary/5" : ""}>
                          <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                          <TableCell>
                            {m.merchantName}
                            {i === 0 && <Badge className="ml-2 text-xs" variant="default">Top</Badge>}
                          </TableCell>
                          <TableCell className="text-right font-mono">{fmt(m.totalSales)}</TableCell>
                          <TableCell className="text-right font-mono text-muted-foreground">{fmt(m.totalCommission)}</TableCell>
                          <TableCell className="text-right font-mono">{fmt(m.totalNet)}</TableCell>
                          <TableCell className="text-right">{m.txCount.toLocaleString()}</TableCell>
                          <TableCell className="text-right">
                            <span className={m.profitMarginPercent >= 50 ? "text-green-500" : m.profitMarginPercent >= 25 ? "text-yellow-500" : "text-red-500"}>
                              {m.profitMarginPercent.toFixed(1)}%
                            </span>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        )}

        {/* ── DEMOGRAPHICS TAB ─────────────────────────────────────────────── */}
        {ticketingEnabled && (
          <TabsContent value="demographics" className="mt-4">
            {ticketsQ.isLoading ? (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <ChartSkeleton h={260} />
                <ChartSkeleton h={260} />
              </div>
            ) : (
              <DemographicsSection tickets={tickets} t={t} />
            )}
          </TabsContent>
        )}

        {/* ── STOCK ALERTS TAB ─────────────────────────────────────────────── */}
        {nfcBraceletsEnabled && (
          <TabsContent value="stock" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-yellow-500" />
                  {t("analytics.stock.alerts")}
                  {stockAlerts.length > 0 && <Badge variant="destructive">{stockAlerts.length}</Badge>}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {stockAlertsQ.isLoading ? <div className="p-4"><ChartSkeleton h={120} /></div> : <StockAlertsTable alerts={stockAlerts} t={t} />}
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
