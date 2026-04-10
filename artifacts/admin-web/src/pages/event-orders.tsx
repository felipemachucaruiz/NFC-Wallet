import { useState } from "react";
import { useGetCurrentAuthUser, useGetEvent } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search, Eye, ShoppingBag, QrCode } from "lucide-react";
import { useTranslation } from "react-i18next";
import { formatCurrency } from "@/lib/currency";

type Order = {
  id: string;
  attendeeName: string;
  attendeeEmail: string;
  ticketType: string;
  section: string;
  quantity: number;
  total: number;
  date: string;
  status: "confirmed" | "pending" | "cancelled" | "refunded";
  dayLabel: string;
  paymentStatus: "paid" | "pending" | "failed";
  qrCode: string;
};

const MOCK_ORDERS: Order[] = [
  { id: "ORD-001", attendeeName: "Carlos García", attendeeEmail: "carlos@email.com", ticketType: "VIP", section: "VIP", quantity: 2, total: 600000, date: "2026-04-10 14:30", status: "confirmed", dayLabel: "Day 1", paymentStatus: "paid", qrCode: "QR-001-ABC" },
  { id: "ORD-002", attendeeName: "María López", attendeeEmail: "maria@email.com", ticketType: "General", section: "General", quantity: 4, total: 400000, date: "2026-04-10 14:15", status: "confirmed", dayLabel: "Full Pass", paymentStatus: "paid", qrCode: "QR-002-DEF" },
  { id: "ORD-003", attendeeName: "Juan Pérez", attendeeEmail: "juan@email.com", ticketType: "Palco", section: "Palco", quantity: 1, total: 500000, date: "2026-04-10 13:50", status: "pending", dayLabel: "Day 2", paymentStatus: "pending", qrCode: "QR-003-GHI" },
  { id: "ORD-004", attendeeName: "Ana Rodríguez", attendeeEmail: "ana@email.com", ticketType: "General", section: "General", quantity: 3, total: 300000, date: "2026-04-10 13:30", status: "confirmed", dayLabel: "Full Pass", paymentStatus: "paid", qrCode: "QR-004-JKL" },
  { id: "ORD-005", attendeeName: "Pedro Martínez", attendeeEmail: "pedro@email.com", ticketType: "VIP", section: "VIP", quantity: 1, total: 300000, date: "2026-04-10 13:10", status: "cancelled", dayLabel: "Day 1", paymentStatus: "failed", qrCode: "QR-005-MNO" },
  { id: "ORD-006", attendeeName: "Laura Sánchez", attendeeEmail: "laura@email.com", ticketType: "General", section: "General", quantity: 2, total: 200000, date: "2026-04-10 12:45", status: "refunded", dayLabel: "Day 3", paymentStatus: "paid", qrCode: "QR-006-PQR" },
];

export default function EventOrders() {
  const { t } = useTranslation();
  const { data: auth } = useGetCurrentAuthUser();
  const eventId = auth?.user?.eventId ?? "";
  const { data: eventData } = useGetEvent(eventId || "");
  const currency = (eventData as Record<string, unknown> | undefined)?.currencyCode as string ?? "COP";
  const fmt = (n: number) => formatCurrency(n, currency);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);

  const filtered = MOCK_ORDERS.filter((order) => {
    const matchesSearch = !search ||
      order.attendeeName.toLowerCase().includes(search.toLowerCase()) ||
      order.attendeeEmail.toLowerCase().includes(search.toLowerCase()) ||
      order.id.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "all" || order.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const statusBadgeVariant = (status: Order["status"]) => {
    switch (status) {
      case "confirmed": return "default" as const;
      case "pending": return "secondary" as const;
      case "cancelled": return "destructive" as const;
      case "refunded": return "outline" as const;
      default: return "secondary" as const;
    }
  };

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
            <SelectItem value="refunded">{t("orders.refunded")}</SelectItem>
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
                  <TableHead>{t("orders.colTicketType")}</TableHead>
                  <TableHead>{t("orders.colSection")}</TableHead>
                  <TableHead>{t("orders.colQty")}</TableHead>
                  <TableHead>{t("orders.colTotal")}</TableHead>
                  <TableHead>{t("orders.colDay")}</TableHead>
                  <TableHead>{t("common.status")}</TableHead>
                  <TableHead className="w-16">{t("common.actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((order) => (
                  <TableRow key={order.id} data-testid={`row-order-${order.id}`}>
                    <TableCell className="font-mono text-xs">{order.id}</TableCell>
                    <TableCell>
                      <div>
                        <p className="font-medium text-sm">{order.attendeeName}</p>
                        <p className="text-xs text-muted-foreground">{order.attendeeEmail}</p>
                      </div>
                    </TableCell>
                    <TableCell>{order.ticketType}</TableCell>
                    <TableCell>{order.section}</TableCell>
                    <TableCell>{order.quantity}</TableCell>
                    <TableCell className="font-mono">{fmt(order.total)}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">{order.dayLabel}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusBadgeVariant(order.status)}>
                        {t(`orders.${order.status}`)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" onClick={() => setSelectedOrder(order)}>
                        <Eye className="w-4 h-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!selectedOrder} onOpenChange={(open) => !open && setSelectedOrder(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("orders.orderDetail")}</DialogTitle>
          </DialogHeader>
          {selectedOrder && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-muted-foreground">{t("orders.colOrderId")}</p>
                  <p className="font-mono font-medium">{selectedOrder.id}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">{t("common.status")}</p>
                  <Badge variant={statusBadgeVariant(selectedOrder.status)}>
                    {t(`orders.${selectedOrder.status}`)}
                  </Badge>
                </div>
                <div>
                  <p className="text-muted-foreground">{t("orders.colAttendee")}</p>
                  <p className="font-medium">{selectedOrder.attendeeName}</p>
                  <p className="text-xs text-muted-foreground">{selectedOrder.attendeeEmail}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">{t("orders.colDay")}</p>
                  <p className="font-medium">{selectedOrder.dayLabel}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">{t("orders.colTicketType")}</p>
                  <p className="font-medium">{selectedOrder.ticketType}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">{t("orders.colSection")}</p>
                  <p className="font-medium">{selectedOrder.section}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">{t("orders.colQty")}</p>
                  <p className="font-medium">{selectedOrder.quantity}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">{t("orders.colTotal")}</p>
                  <p className="font-mono font-medium">{fmt(selectedOrder.total)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">{t("orders.paymentStatus")}</p>
                  <Badge variant={selectedOrder.paymentStatus === "paid" ? "default" : "secondary"}>
                    {t(`orders.payment_${selectedOrder.paymentStatus}`)}
                  </Badge>
                </div>
                <div>
                  <p className="text-muted-foreground">{t("orders.colDate")}</p>
                  <p className="text-sm">{selectedOrder.date}</p>
                </div>
              </div>

              <div className="border-t pt-3">
                <p className="text-sm text-muted-foreground mb-2 flex items-center gap-1">
                  <QrCode className="w-3.5 h-3.5" /> {t("orders.qrCode")}
                </p>
                <div className="bg-muted p-3 rounded text-center">
                  <div className="w-24 h-24 mx-auto bg-white rounded flex items-center justify-center border">
                    <QrCode className="w-16 h-16 text-foreground" />
                  </div>
                  <p className="text-xs font-mono mt-2 text-muted-foreground">{selectedOrder.qrCode}</p>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedOrder(null)}>{t("common.close")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
