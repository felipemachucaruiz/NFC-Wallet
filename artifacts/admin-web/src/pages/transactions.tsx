import { fmtDateTime } from "@/lib/date";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  useListEvents,
  useListEventTransactions,
  useListMerchants,
  getListEventTransactionsQueryKey,
  useListEventTopUps,
} from "@workspace/api-client-react";
import type { EventTransaction, EventTopUp } from "@workspace/api-client-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Search, Eye, Receipt } from "lucide-react";
import { useTranslation } from "react-i18next";
import { formatCurrency } from "@/lib/currency";

const API_BASE = import.meta.env.PROD
  ? (import.meta.env.VITE_API_URL || "https://prod.tapee.app").replace(/\/+$/, "")
  : `${import.meta.env.BASE_URL}_srv`;

function getToken() {
  return localStorage.getItem("tapee_admin_token") ?? "";
}

async function fetchAllTransactions(params: { page: number; limit: number; search?: string }) {
  const qs = new URLSearchParams({ page: String(params.page), limit: String(params.limit) });
  if (params.search) qs.set("search", params.search);
  const res = await fetch(`${API_BASE}/api/all-transactions?${qs}`, {
    headers: { Authorization: `Bearer ${getToken()}` },
  });
  if (!res.ok) throw new Error("Failed to fetch transactions");
  return res.json();
}

async function fetchAllTopUps(params: { page: number; limit: number; search?: string }) {
  const qs = new URLSearchParams({ page: String(params.page), limit: String(params.limit) });
  if (params.search) qs.set("search", params.search);
  const res = await fetch(`${API_BASE}/api/all-top-ups?${qs}`, {
    headers: { Authorization: `Bearer ${getToken()}` },
  });
  if (!res.ok) throw new Error("Failed to fetch top-ups");
  return res.json();
}

type TxType = "sale" | "topup" | "all";

export default function Transactions() {
  const { t } = useTranslation();
  const { data: eventsData } = useListEvents();
  const events = eventsData?.events ?? [];
  const { data: merchantsData } = useListMerchants();
  const merchants = merchantsData?.merchants ?? [];

  const [eventId, setEventId] = useState("__all__");
  const [page, setPage] = useState(1);
  const [searchParam, setSearchParam] = useState("");
  const [txType, setTxType] = useState<TxType>("all");

  const isAllEvents = eventId === "__all__";
  const txParams = { page, limit: 50, search: searchParam || undefined };
  const showSales = txType === "sale" || txType === "all";
  const showTopUps = txType === "topup" || txType === "all";

  const { data: salesData, isLoading: salesLoading } = useListEventTransactions(
    eventId, txParams,
    { query: { enabled: !isAllEvents && !!eventId && showSales, queryKey: getListEventTransactionsQueryKey(eventId, txParams) } }
  );
  const { data: topUpsData, isLoading: topUpsLoading } = useListEventTopUps(
    !isAllEvents && !!eventId && showTopUps ? eventId : "",
    txParams
  );

  const { data: allSalesData, isLoading: allSalesLoading } = useQuery({
    queryKey: ["all-transactions", page, searchParam],
    queryFn: () => fetchAllTransactions({ page, limit: 50, search: searchParam || undefined }),
    enabled: isAllEvents && showSales,
  });
  const { data: allTopUpsData, isLoading: allTopUpsLoading } = useQuery({
    queryKey: ["all-top-ups", page, searchParam],
    queryFn: () => fetchAllTopUps({ page, limit: 50, search: searchParam || undefined }),
    enabled: isAllEvents && showTopUps,
  });

  const transactions = showSales
    ? (isAllEvents ? (allSalesData?.transactions ?? []) : (salesData?.transactions ?? []))
    : [];
  const topUps = showTopUps
    ? (isAllEvents ? (allTopUpsData?.topUps ?? []) : (topUpsData?.topUps ?? []))
    : [];
  const isLoading = isAllEvents
    ? (showSales && allSalesLoading) || (showTopUps && allTopUpsLoading)
    : (showSales && salesLoading) || (showTopUps && topUpsLoading);

  const currency = isAllEvents
    ? "COP"
    : (events.find((e) => e.id === eventId) as Record<string, unknown> | undefined)?.currencyCode as string ?? "COP";
  const fmt = (n: number) => formatCurrency(n, currency);

  const [search, setSearch] = useState("");
  const [detailOpen, setDetailOpen] = useState(false);
  const [selected, setSelected] = useState<EventTransaction | null>(null);
  const [topUpDetailOpen, setTopUpDetailOpen] = useState(false);
  const [selectedTopUp, setSelectedTopUp] = useState<EventTopUp | null>(null);

  const handleSearch = () => {
    setSearchParam(search);
    setPage(1);
  };

  type UnifiedRow = {
    kind: "sale" | "topup";
    id: string;
    braceletUid: string;
    amount: number;
    createdAt: string;
    eventName?: string;
    sale?: EventTransaction;
    topUp?: EventTopUp;
  };

  const unified: UnifiedRow[] = [];
  if (txType === "sale" || txType === "all") {
    for (const tx of transactions) {
      unified.push({
        kind: "sale",
        id: tx.id,
        braceletUid: tx.braceletUid,
        amount: tx.grossAmount,
        createdAt: tx.createdAt,
        eventName: (tx as any).eventName,
        sale: tx,
      });
    }
  }
  if (txType === "topup" || txType === "all") {
    for (const tu of topUps) {
      unified.push({
        kind: "topup",
        id: tu.id,
        braceletUid: tu.braceletUid,
        amount: tu.amount,
        createdAt: tu.createdAt,
        eventName: (tu as any).eventName,
        topUp: tu,
      });
    }
  }
  unified.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const totalRecords = txType === "sale"
    ? (isAllEvents ? (allSalesData?.total ?? 0) : (salesData?.total ?? 0))
    : txType === "topup"
    ? (isAllEvents ? (allTopUpsData?.total ?? 0) : (topUpsData?.total ?? 0))
    : (isAllEvents ? (allSalesData?.total ?? 0) + (allTopUpsData?.total ?? 0) : (salesData?.total ?? 0) + (topUpsData?.total ?? 0));

  const paymentMethodLabel = (method: string) => {
    const map: Record<string, string> = {
      cash: t("transactions.methodCash"),
      card_external: t("transactions.methodCard"),
      nequi_transfer: "Nequi",
      bancolombia_transfer: "Transferencia",
      nequi: "Nequi",
      pse: "PSE",
      other: t("transactions.methodOther"),
    };
    return map[method] ?? method;
  };

  const hasData = isAllEvents || !!eventId;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <Receipt className="w-7 h-7" /> {t("transactions.title")}
        </h1>
        <p className="text-muted-foreground mt-1">{t("transactions.subtitle")}</p>
      </div>

      <div className="flex gap-3 flex-wrap">
        <Select value={eventId || "__all__"} onValueChange={(v) => { setEventId(v); setPage(1); }}>
          <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">{t("transactions.allEvents")}</SelectItem>
            {events.map((e) => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
          </SelectContent>
        </Select>

        <Select value={txType} onValueChange={(v) => { setTxType(v as TxType); setPage(1); }}>
          <SelectTrigger className="w-40" data-testid="select-tx-type">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("transactions.typeAll")}</SelectItem>
            <SelectItem value="sale">{t("transactions.typeSale")}</SelectItem>
            <SelectItem value="topup">{t("transactions.typeTopUp")}</SelectItem>
          </SelectContent>
        </Select>

        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={t("transactions.searchPlaceholder")}
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          />
        </div>
        <Button variant="outline" onClick={handleSearch}>{t("transactions.search")}</Button>
      </div>

      <div className="border border-border rounded-lg bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("transactions.colType")}</TableHead>
              {isAllEvents && <TableHead>{t("transactions.colEvent")}</TableHead>}
              <TableHead>{t("transactions.colTime")}</TableHead>
              <TableHead>{t("transactions.colBracelet")}</TableHead>
              <TableHead>{t("transactions.colDetail")}</TableHead>
              <TableHead className="text-right">{t("transactions.colAmount")}</TableHead>
              <TableHead className="w-12"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={isAllEvents ? 7 : 6} className="text-center py-8">{t("common.loading")}</TableCell></TableRow>
            ) : unified.length === 0 ? (
              <TableRow><TableCell colSpan={isAllEvents ? 7 : 6} className="text-center py-8 text-muted-foreground">{t("transactions.noTransactions")}</TableCell></TableRow>
            ) : (
              unified.map((row) => (
                <TableRow key={`${row.kind}-${row.id}`}>
                  <TableCell>
                    {row.kind === "sale" ? (
                      <Badge variant="outline" className="text-xs">{t("transactions.typeSale")}</Badge>
                    ) : (
                      <Badge variant="default" className="text-xs bg-green-600">{t("transactions.typeTopUp")}</Badge>
                    )}
                  </TableCell>
                  {isAllEvents && (
                    <TableCell className="text-sm max-w-[150px] truncate">{row.eventName ?? "—"}</TableCell>
                  )}
                  <TableCell className="text-sm text-muted-foreground whitespace-nowrap">{fmtDateTime(row.createdAt)}</TableCell>
                  <TableCell className="font-mono text-xs">{row.braceletUid}</TableCell>
                  <TableCell className="text-sm">
                    {row.kind === "sale" && row.sale ? (
                      <span>{row.sale.merchantName ?? merchants.find((m) => m.id === row.sale!.merchantId)?.name ?? "—"} · {row.sale.locationName ?? "—"}</span>
                    ) : row.topUp ? (
                      <span>{paymentMethodLabel(row.topUp.paymentMethod)}{row.topUp.performedByName ? ` · ${row.topUp.performedByName}` : ""}</span>
                    ) : "—"}
                  </TableCell>
                  <TableCell className={`text-right font-mono ${row.kind === "topup" ? "text-green-500" : ""}`}>
                    {row.kind === "topup" ? "+" : "-"}{fmt(row.amount)}
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon" onClick={() => {
                      if (row.kind === "sale" && row.sale) { setSelected(row.sale); setDetailOpen(true); }
                      else if (row.kind === "topup" && row.topUp) { setSelectedTopUp(row.topUp); setTopUpDetailOpen(true); }
                    }}><Eye className="w-4 h-4" /></Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        {hasData && (
          <div className="px-4 py-2 text-xs text-muted-foreground border-t border-border flex justify-between items-center">
            <span>{t("transactions.pageInfo", { page, showing: unified.length, total: totalRecords })}</span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>{t("common.prev")}</Button>
              <Button variant="outline" size="sm" disabled={unified.length < 50} onClick={() => setPage((p) => p + 1)}>{t("common.next")}</Button>
            </div>
          </div>
        )}
      </div>

      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{t("transactions.detailTitle")}</DialogTitle></DialogHeader>
          {selected && (
            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div><p className="text-muted-foreground text-xs uppercase mb-1">{t("transactions.labelId")}</p><p className="font-mono text-xs break-all">{selected.id}</p></div>
                <div><p className="text-muted-foreground text-xs uppercase mb-1">{t("transactions.labelBracelet")}</p><p className="font-mono">{selected.braceletUid}</p></div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div><p className="text-muted-foreground text-xs uppercase mb-1">{t("transactions.labelGross")}</p><p className="font-mono font-bold">{fmt(selected.grossAmount)}</p></div>
                <div><p className="text-muted-foreground text-xs uppercase mb-1">{t("transactions.labelCommission")}</p><p className="font-mono">{fmt(selected.commissionAmount)}</p></div>
                <div><p className="text-muted-foreground text-xs uppercase mb-1">{t("transactions.labelNet")}</p><p className="font-mono font-bold">{fmt(selected.netAmount)}</p></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><p className="text-muted-foreground text-xs uppercase mb-1">{t("transactions.labelLocation")}</p><p>{selected.locationName ?? selected.locationId.slice(0, 8)}</p></div>
                <div><p className="text-muted-foreground text-xs uppercase mb-1">{t("transactions.labelCreated")}</p><p>{fmtDateTime(selected.createdAt)}</p></div>
              </div>
              {selected.items && selected.items.length > 0 && (
                <div>
                  <p className="text-muted-foreground text-xs uppercase mb-2">{t("transactions.labelLineItems")}</p>
                  <div className="space-y-1 border border-border rounded p-2">
                    {selected.items.map((item, i) => (
                      <div key={i} className="flex justify-between text-sm">
                        <span>{item.productName ?? item.productId ?? t("transactions.unknown")} x{item.quantity}</span>
                        <span className="font-mono">{fmt(item.unitPrice * item.quantity)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
          <DialogFooter><Button onClick={() => setDetailOpen(false)}>{t("transactions.close")}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={topUpDetailOpen} onOpenChange={setTopUpDetailOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{t("transactions.topUpDetailTitle")}</DialogTitle></DialogHeader>
          {selectedTopUp && (
            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div><p className="text-muted-foreground text-xs uppercase mb-1">ID</p><p className="font-mono text-xs break-all">{selectedTopUp.id}</p></div>
                <div><p className="text-muted-foreground text-xs uppercase mb-1">{t("transactions.labelBracelet")}</p><p className="font-mono">{selectedTopUp.braceletUid}</p></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><p className="text-muted-foreground text-xs uppercase mb-1">{t("transactions.colAmount")}</p><p className="font-mono font-bold text-green-500">+{fmt(selectedTopUp.amount)}</p></div>
                <div><p className="text-muted-foreground text-xs uppercase mb-1">{t("transactions.topUpNewBalance")}</p><p className="font-mono">{fmt(selectedTopUp.newBalance)}</p></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><p className="text-muted-foreground text-xs uppercase mb-1">{t("transactions.topUpMethod")}</p><p>{paymentMethodLabel(selectedTopUp.paymentMethod)}</p></div>
                <div><p className="text-muted-foreground text-xs uppercase mb-1">{t("transactions.topUpStatus")}</p>
                  <Badge variant={selectedTopUp.status === "completed" ? "default" : selectedTopUp.status === "failed" ? "destructive" : "outline"} className="text-xs">
                    {selectedTopUp.status}
                  </Badge>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {selectedTopUp.performedByName && (
                  <div><p className="text-muted-foreground text-xs uppercase mb-1">{t("transactions.topUpPerformedBy")}</p><p>{selectedTopUp.performedByName}</p></div>
                )}
                <div><p className="text-muted-foreground text-xs uppercase mb-1">{t("transactions.labelCreated")}</p><p>{fmtDateTime(selectedTopUp.createdAt)}</p></div>
              </div>
            </div>
          )}
          <DialogFooter><Button onClick={() => setTopUpDetailOpen(false)}>{t("transactions.close")}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
