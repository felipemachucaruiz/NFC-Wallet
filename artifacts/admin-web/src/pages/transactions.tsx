import { useState } from "react";
import {
  useListEvents,
  useListEventTransactions,
  useListMerchants,
  getListEventTransactionsQueryKey,
} from "@workspace/api-client-react";
import type { EventTransaction } from "@workspace/api-client-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Search, Eye, Receipt } from "lucide-react";
import { useTranslation } from "react-i18next";

export default function Transactions() {
  const { t } = useTranslation();
  const { data: eventsData } = useListEvents();
  const events = eventsData?.events ?? [];
  const { data: merchantsData } = useListMerchants();
  const merchants = merchantsData?.merchants ?? [];

  const [eventId, setEventId] = useState("");
  const [page, setPage] = useState(1);
  const [searchParam, setSearchParam] = useState("");
  const txParams = { page, limit: 50, search: searchParam || undefined };
  const { data, isLoading } = useListEventTransactions(eventId, txParams, { query: { enabled: !!eventId, queryKey: getListEventTransactionsQueryKey(eventId, txParams) } });
  const transactions = data?.transactions ?? [];

  const [search, setSearch] = useState("");
  const [detailOpen, setDetailOpen] = useState(false);
  const [selected, setSelected] = useState<EventTransaction | null>(null);

  const handleSearch = () => {
    setSearchParam(search);
    setPage(1);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <Receipt className="w-7 h-7" /> {t("transactions.title")}
        </h1>
        <p className="text-muted-foreground mt-1">{t("transactions.subtitle")}</p>
      </div>

      <div className="flex gap-3">
        <Select value={eventId || "none"} onValueChange={(v) => { setEventId(v === "none" ? "" : v); setPage(1); }}>
          <SelectTrigger className="w-56"><SelectValue placeholder={t("transactions.selectEventPlaceholder")} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">{t("transactions.selectEventPlaceholder")}</SelectItem>
            {events.map((e) => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="relative flex-1">
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
              <TableHead>{t("transactions.colTime")}</TableHead>
              <TableHead>{t("transactions.colBracelet")}</TableHead>
              <TableHead>{t("transactions.colLocation")}</TableHead>
              <TableHead>{t("transactions.colMerchant")}</TableHead>
              <TableHead className="text-right">{t("transactions.colGross")}</TableHead>
              <TableHead className="text-right">{t("transactions.colNet")}</TableHead>
              <TableHead>{t("transactions.colItems")}</TableHead>
              <TableHead className="w-12"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {!eventId ? (
              <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">{t("transactions.selectEventPrompt")}</TableCell></TableRow>
            ) : isLoading ? (
              <TableRow><TableCell colSpan={8} className="text-center py-8">{t("common.loading")}</TableCell></TableRow>
            ) : transactions.length === 0 ? (
              <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">{t("transactions.noTransactions")}</TableCell></TableRow>
            ) : (
              transactions.map((tx) => (
                <TableRow key={tx.id}>
                  <TableCell className="text-sm text-muted-foreground whitespace-nowrap">{new Date(tx.createdAt).toLocaleString()}</TableCell>
                  <TableCell className="font-mono text-xs">{tx.braceletUid}</TableCell>
                  <TableCell className="text-sm">{tx.locationName ?? tx.locationId.slice(0, 8)}</TableCell>
                  <TableCell className="text-sm">{tx.merchantName ?? merchants.find((m) => m.id === tx.merchantId)?.name ?? tx.merchantId.slice(0, 8)}</TableCell>
                  <TableCell className="text-right font-mono">${tx.grossAmountCop.toLocaleString()}</TableCell>
                  <TableCell className="text-right font-mono">${tx.netAmountCop.toLocaleString()}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{tx.itemCount}</TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon" onClick={() => { setSelected(tx); setDetailOpen(true); }}><Eye className="w-4 h-4" /></Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        {data && eventId && (
          <div className="px-4 py-2 text-xs text-muted-foreground border-t border-border flex justify-between items-center">
            <span>{t("transactions.pageInfo", { page: data.page, showing: transactions.length, total: data.total })}</span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>{t("common.prev")}</Button>
              <Button variant="outline" size="sm" disabled={transactions.length < 50} onClick={() => setPage((p) => p + 1)}>{t("common.next")}</Button>
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
                <div><p className="text-muted-foreground text-xs uppercase mb-1">{t("transactions.labelGross")}</p><p className="font-mono font-bold">${selected.grossAmountCop.toLocaleString()}</p></div>
                <div><p className="text-muted-foreground text-xs uppercase mb-1">{t("transactions.labelCommission")}</p><p className="font-mono">${selected.commissionAmountCop.toLocaleString()}</p></div>
                <div><p className="text-muted-foreground text-xs uppercase mb-1">{t("transactions.labelNet")}</p><p className="font-mono font-bold">${selected.netAmountCop.toLocaleString()}</p></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><p className="text-muted-foreground text-xs uppercase mb-1">{t("transactions.labelLocation")}</p><p>{selected.locationName ?? selected.locationId.slice(0, 8)}</p></div>
                <div><p className="text-muted-foreground text-xs uppercase mb-1">{t("transactions.labelCreated")}</p><p>{new Date(selected.createdAt).toLocaleString()}</p></div>
              </div>
              {selected.items && selected.items.length > 0 && (
                <div>
                  <p className="text-muted-foreground text-xs uppercase mb-2">{t("transactions.labelLineItems")}</p>
                  <div className="space-y-1 border border-border rounded p-2">
                    {selected.items.map((item, i) => (
                      <div key={i} className="flex justify-between text-sm">
                        <span>{item.productName ?? item.productId ?? t("transactions.unknown")} x{item.quantity}</span>
                        <span className="font-mono">${(item.unitPrice * item.quantity).toLocaleString()}</span>
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
    </div>
  );
}
