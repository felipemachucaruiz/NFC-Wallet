import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useGetCurrentAuthUser } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search, ShoppingBag, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { formatCurrency } from "@/lib/currency";
import { useEventContext } from "@/contexts/event-context";
import { apiFetchTicketOrders } from "@/lib/api";

export default function EventOrders() {
  const { t } = useTranslation();
  const { data: auth } = useGetCurrentAuthUser();
  const { eventId } = useEventContext();
  const resolvedEventId = auth?.user?.role === "admin" ? eventId : (auth?.user?.eventId ?? "");

  const { data: orders = [], isLoading, isError, error: fetchError } = useQuery({
    queryKey: ["ticketOrders", resolvedEventId],
    queryFn: () => apiFetchTicketOrders(resolvedEventId),
    enabled: !!resolvedEventId,
  });

  const fmt = (n: number) => formatCurrency(n, "COP");

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const filtered = orders.filter((order) => {
    const matchesSearch = !search ||
      (order.buyerName ?? "").toLowerCase().includes(search.toLowerCase()) ||
      order.buyerEmail.toLowerCase().includes(search.toLowerCase()) ||
      order.id.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "all" || order.paymentStatus === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const statusBadgeVariant = (status: string) => {
    switch (status) {
      case "confirmed": return "default" as const;
      case "pending": return "secondary" as const;
      case "cancelled": return "destructive" as const;
      case "expired": return "outline" as const;
      default: return "secondary" as const;
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="text-center py-20 text-destructive">
        <p className="font-semibold">{t("common.error")}</p>
        <p className="text-sm text-muted-foreground mt-1">{(fetchError as Error)?.message || t("common.unknownError")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{t("orders.title")}</h1>
        <p className="text-muted-foreground mt-1">{t("orders.subtitle")}</p>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            data-testid="input-order-search"
            placeholder={t("orders.searchPlaceholder")}
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("orders.allStatuses")}</SelectItem>
            <SelectItem value="confirmed">{t("orders.confirmed")}</SelectItem>
            <SelectItem value="pending">{t("orders.pending")}</SelectItem>
            <SelectItem value="cancelled">{t("orders.cancelled")}</SelectItem>
            <SelectItem value="expired">{t("orders.expired") || "Expired"}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="pt-6">
          {filtered.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <ShoppingBag className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>{t("orders.noOrders")}</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("orders.colOrderId")}</TableHead>
                  <TableHead>{t("orders.colAttendee")}</TableHead>
                  <TableHead>{t("orders.colQty")}</TableHead>
                  <TableHead>{t("orders.colTotal")}</TableHead>
                  <TableHead>{t("orders.colDate")}</TableHead>
                  <TableHead>{t("common.status")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((order) => (
                  <TableRow key={order.id}>
                    <TableCell className="font-mono text-xs">{order.id.slice(0, 8)}</TableCell>
                    <TableCell>
                      <div>
                        <p className="font-medium text-sm">{order.buyerName || "—"}</p>
                        <p className="text-xs text-muted-foreground">{order.buyerEmail}</p>
                      </div>
                    </TableCell>
                    <TableCell>{order.ticketCount}</TableCell>
                    <TableCell className="font-mono">{fmt(order.totalAmount)}</TableCell>
                    <TableCell className="text-sm">
                      {new Date(order.createdAt).toLocaleDateString("es-CO", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusBadgeVariant(order.paymentStatus)}>
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
