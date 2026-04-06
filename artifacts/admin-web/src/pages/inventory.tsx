import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListEvents,
  useListWarehouses,
  useCreateWarehouse,
  useListStockMovements,
  useListLocations,
  useListProducts,
  useGetInventoryReport,
  getListWarehousesQueryKey,
  getListStockMovementsQueryKey,
} from "@workspace/api-client-react";
import type { Warehouse, StockMovement } from "@workspace/api-client-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Plus, Package, AlertTriangle } from "lucide-react";

export default function Inventory() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: eventsData } = useListEvents();
  const events = eventsData?.events ?? [];
  const [eventId, setEventId] = useState("");

  const { data: warehousesData, isLoading: whLoading } = useListWarehouses(eventId ? { eventId } : undefined);
  const warehouses = warehousesData?.warehouses ?? [];
  const { data: movementsData } = useListStockMovements();
  const movements = movementsData?.movements ?? [];
  const { data: locationsData } = useListLocations(eventId ? { eventId } : undefined);
  const locations = locationsData?.locations ?? [];
  const { data: productsData } = useListProducts();
  const products = productsData?.products ?? [];
  const { data: inventoryReport } = useGetInventoryReport(eventId ? { eventId } : undefined);
  const reportItems = inventoryReport?.items ?? [];

  const [createWhOpen, setCreateWhOpen] = useState(false);
  const [whForm, setWhForm] = useState({ name: "", notes: "" });

  const createWarehouse = useCreateWarehouse();

  const handleCreateWarehouse = () => {
    if (!eventId) return;
    createWarehouse.mutate(
      { data: { name: whForm.name, eventId, notes: whForm.notes || undefined } },
      {
        onSuccess: () => { toast({ title: "Warehouse created" }); setCreateWhOpen(false); setWhForm({ name: "", notes: "" }); queryClient.invalidateQueries({ queryKey: getListWarehousesQueryKey({ eventId }) }); },
        onError: (e: unknown) => toast({ title: "Error", description: (e as { message?: string }).message, variant: "destructive" }),
      }
    );
  };

  const productName = (id: string) => products.find((p) => p.id === id)?.name ?? id.slice(0, 8);
  const locationName = (id: string) => locations.find((l) => l.id === id)?.name ?? id.slice(0, 8);
  const warehouseName = (id: string) => warehouses.find((w) => w.id === id)?.name ?? id.slice(0, 8);

  const lowStockCount = reportItems.filter((item) => item.isLowStock).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Package className="w-7 h-7" /> Inventory
          </h1>
          <p className="text-muted-foreground mt-1">Warehouses, stock movements, and reports across events.</p>
        </div>
        <Button data-testid="button-create-warehouse" onClick={() => setCreateWhOpen(true)} disabled={!eventId}>
          <Plus className="w-4 h-4 mr-2" /> Add Warehouse
        </Button>
      </div>

      <div className="flex gap-3">
        <Select value={eventId || "none"} onValueChange={(v) => setEventId(v === "none" ? "" : v)}>
          <SelectTrigger className="w-56"><SelectValue placeholder="Select event" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Select event...</SelectItem>
            {events.map((e) => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {!eventId ? (
        <p className="text-muted-foreground text-center py-12">Select an event to view inventory.</p>
      ) : (
        <Tabs defaultValue="warehouses">
          <TabsList>
            <TabsTrigger value="warehouses">Warehouses</TabsTrigger>
            <TabsTrigger value="movements">Stock Movements</TabsTrigger>
            <TabsTrigger value="report">Report</TabsTrigger>
          </TabsList>

          <TabsContent value="warehouses" className="mt-4">
            <div className="border border-border rounded-lg bg-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Warehouse</TableHead>
                    <TableHead>Notes</TableHead>
                    <TableHead>Created</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {whLoading ? (
                    <TableRow><TableCell colSpan={3} className="text-center py-8">Loading...</TableCell></TableRow>
                  ) : warehouses.length === 0 ? (
                    <TableRow><TableCell colSpan={3} className="text-center py-8 text-muted-foreground">No warehouses.</TableCell></TableRow>
                  ) : (
                    warehouses.map((wh: Warehouse) => (
                      <TableRow key={wh.id}>
                        <TableCell className="font-medium">{wh.name}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{wh.notes ?? "—"}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{new Date(wh.createdAt).toLocaleDateString()}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          <TabsContent value="movements" className="mt-4">
            <div className="border border-border rounded-lg bg-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Time</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead className="text-right">Quantity</TableHead>
                    <TableHead>From</TableHead>
                    <TableHead>To</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {movements.length === 0 ? (
                    <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No stock movements.</TableCell></TableRow>
                  ) : (
                    movements.map((mv: StockMovement) => (
                      <TableRow key={mv.id}>
                        <TableCell className="text-sm text-muted-foreground whitespace-nowrap">{new Date(mv.createdAt).toLocaleString()}</TableCell>
                        <TableCell><Badge variant="outline" className="text-xs capitalize">{mv.movementType.replace(/_/g, " ")}</Badge></TableCell>
                        <TableCell className="text-sm">{productName(mv.productId)}</TableCell>
                        <TableCell className="text-right font-mono">{mv.quantity}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{mv.fromWarehouseId ? warehouseName(mv.fromWarehouseId) : mv.fromLocationId ? locationName(mv.fromLocationId) : "—"}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{mv.toLocationId ? locationName(mv.toLocationId) : mv.toWarehouseId ? warehouseName(mv.toWarehouseId) : "—"}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          <TabsContent value="report" className="mt-4">
            {reportItems.length > 0 ? (
              <div className="space-y-4">
                {lowStockCount > 0 && (
                  <div className="flex items-center gap-2 text-destructive text-sm font-medium">
                    <AlertTriangle className="w-4 h-4" /> {lowStockCount} low stock alert{lowStockCount > 1 ? "s" : ""}
                  </div>
                )}
                <div className="border border-border rounded-lg bg-card">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Location</TableHead>
                        <TableHead>Product</TableHead>
                        <TableHead className="text-right">On Hand</TableHead>
                        <TableHead className="text-right">Restock Trigger</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {reportItems.map((item, i) => (
                        <TableRow key={i}>
                          <TableCell className="text-sm">{item.locationName}</TableCell>
                          <TableCell className="text-sm">{item.productName}</TableCell>
                          <TableCell className="text-right font-mono">{item.quantityOnHand}</TableCell>
                          <TableCell className="text-right font-mono">{item.restockTrigger}</TableCell>
                          <TableCell>
                            <Badge variant={item.isLowStock ? "destructive" : "default"} className="text-xs">
                              {item.isLowStock ? "Low Stock" : "OK"}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            ) : (
              <p className="text-muted-foreground text-center py-8">No inventory data available.</p>
            )}
          </TabsContent>
        </Tabs>
      )}

      <Dialog open={createWhOpen} onOpenChange={setCreateWhOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Add Warehouse</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1"><Label>Name *</Label><Input value={whForm.name} onChange={(e) => setWhForm((f) => ({ ...f, name: e.target.value }))} /></div>
            <div className="space-y-1"><Label>Notes</Label><Input value={whForm.notes} onChange={(e) => setWhForm((f) => ({ ...f, notes: e.target.value }))} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateWhOpen(false)}>Cancel</Button>
            <Button onClick={handleCreateWarehouse} disabled={createWarehouse.isPending || !whForm.name}>{createWarehouse.isPending ? "Creating..." : "Create"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
