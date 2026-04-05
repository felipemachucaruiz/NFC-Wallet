import { useColorScheme } from "@/hooks/useColorScheme";
import { Feather } from "@expo/vector-icons";
import React, { useState } from "react";
import { Dimensions, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import {
  useGetAnalyticsSummary,
  useGetAnalyticsSalesByHour,
  useGetAnalyticsTopProducts,
  useGetAnalyticsTopMerchants,
  useGetAnalyticsStockAlerts,
  useGetAnalyticsHeatmap,
  useListEvents,
  useCreateRestockOrder,
  useListRefundRequests,
  useApproveRefundRequest,
  useRejectRefundRequest,
  type AttendeeRefundRequest,
} from "@workspace/api-client-react";
import Colors from "@/constants/colors";
import { useAlert } from "@/components/CustomAlert";
import { CopAmount } from "@/components/CopAmount";
import { Card } from "@/components/ui/Card";
import { BarChart } from "react-native-chart-kit";

const REFETCH_INTERVAL = 60_000;
const DAYS_ORDER = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const SCREEN_WIDTH = Dimensions.get("window").width;

type AnalyticsTab = "summary" | "sales" | "products" | "merchants" | "stock" | "heatmap" | "refunds";

function ChartSkeleton({ height = 160 }: { height?: number }) {
  const scheme = useColorScheme();
  const C = scheme === "dark" ? Colors.dark : Colors.light;
  const bars = Array.from({ length: 8 }, (_, i) => i);
  return (
    <View style={[styles.skeletonContainer, { height, backgroundColor: C.inputBg }]}>
      <View style={styles.skeletonBars}>
        {bars.map((i) => (
          <View
            key={i}
            style={[
              styles.skeletonBar,
              {
                height: `${30 + ((i * 17) % 55)}%`,
                backgroundColor: C.shimmer2,
              },
            ]}
          />
        ))}
      </View>
    </View>
  );
}

function HeatmapSkeleton() {
  const scheme = useColorScheme();
  const C = scheme === "dark" ? Colors.dark : Colors.light;
  return (
    <View style={[styles.skeletonContainer, { height: 120, backgroundColor: C.inputBg }]}>
      {DAYS_ORDER.map((d) => (
        <View key={d} style={styles.skeletonRow}>
          {Array.from({ length: 12 }, (_, i) => (
            <View key={i} style={[styles.skeletonCell, { backgroundColor: C.shimmer2 }]} />
          ))}
        </View>
      ))}
    </View>
  );
}

function SummaryPanel({
  data,
  isLoading,
}: {
  data: {
    totalTopUpsCop?: number;
    totalSalesCop?: number;
    pendingBalanceCop?: number;
    transactionCount?: number;
    topUpCount?: number;
  } | undefined;
  isLoading: boolean;
}) {
  const { t } = useTranslation();
  const scheme = useColorScheme();
  const C = scheme === "dark" ? Colors.dark : Colors.light;

  const cards = [
    { label: t("analytics.totalTopUps"), value: data?.totalTopUpsCop, isCop: true, color: C.primary, icon: "arrow-up-circle" as const },
    { label: t("analytics.totalSales"), value: data?.totalSalesCop, isCop: true, color: C.success, icon: "shopping-bag" as const },
    { label: t("analytics.pendingBalance"), value: data?.pendingBalanceCop, isCop: true, color: C.warning, icon: "credit-card" as const },
    { label: t("analytics.transactions"), value: data?.transactionCount, isCop: false, color: C.textSecondary, icon: "activity" as const },
    { label: t("analytics.topUpCount"), value: data?.topUpCount, isCop: false, color: C.textSecondary, icon: "plus-circle" as const },
  ];

  return (
    <View style={{ gap: 10 }}>
      {cards.map((c) => (
        <Card key={c.label} padding={16}>
          <View style={styles.summaryRow}>
            <View style={styles.summaryLeft}>
              <Feather name={c.icon} size={20} color={isLoading ? C.textMuted : c.color} />
              <Text style={[styles.summaryLabel, { color: C.textSecondary }]}>{c.label}</Text>
            </View>
            {isLoading ? (
              <View style={[styles.skeletonValue, { backgroundColor: C.inputBg }]} />
            ) : c.isCop ? (
              <CopAmount amount={c.value as number | undefined} size={18} color={c.color} />
            ) : (
              <Text style={[styles.summaryCount, { color: C.text }]}>{c.value ?? "—"}</Text>
            )}
          </View>
        </Card>
      ))}
    </View>
  );
}

function HourlySalesChart({
  data,
  isLoading,
}: {
  data: { salesByHour: { hour: number; day: string; totalCop: number; txCount: number }[] } | undefined;
  isLoading: boolean;
}) {
  const { t } = useTranslation();
  const scheme = useColorScheme();
  const C = scheme === "dark" ? Colors.dark : Colors.light;

  if (isLoading) {
    return (
      <Card padding={16}>
        <Text style={[styles.panelTitle, { color: C.text }]}>{t("analytics.salesByHour")}</Text>
        <Text style={[styles.panelSubtitle, { color: C.textMuted }]}>{t("analytics.salesByHourSubtitle")}</Text>
        <View style={{ marginTop: 12 }}>
          <ChartSkeleton height={160} />
        </View>
      </Card>
    );
  }

  const salesByHour = data?.salesByHour ?? [];
  const hourTotals: Record<number, number> = {};
  for (const row of salesByHour) {
    hourTotals[row.hour] = (hourTotals[row.hour] ?? 0) + row.totalCop;
  }

  if (salesByHour.length === 0) {
    return (
      <Card padding={24}>
        <Text style={[styles.panelTitle, { color: C.text, marginBottom: 6 }]}>{t("analytics.salesByHour")}</Text>
        <View style={styles.emptyState}>
          <Feather name="bar-chart-2" size={32} color={C.textMuted} />
          <Text style={[styles.emptyText, { color: C.textMuted, marginTop: 8 }]}>{t("analytics.noData")}</Text>
        </View>
      </Card>
    );
  }

  const hours24 = Array.from({ length: 24 }, (_, i) => i);
  const rawValues = hours24.map((h) => hourTotals[h] ?? 0);
  const maxRaw = Math.max(...rawValues, 1);

  const divisor = maxRaw >= 1_000_000 ? 1_000_000 : maxRaw >= 1_000 ? 1_000 : 1;
  const suffix = divisor === 1_000_000 ? "M" : divisor === 1_000 ? "k" : "";
  const decimalPlaces = divisor === 1 ? 0 : 1;

  const values = rawValues.map((v) => parseFloat((v / divisor).toFixed(decimalPlaces)));
  const labels = hours24.map((h) => (h % 6 === 0 ? `${h}h` : ""));

  const chartWidth = Math.max(SCREEN_WIDTH - 40, 480);
  const chartConfig = {
    backgroundGradientFrom: C.card,
    backgroundGradientTo: C.card,
    decimalPlaces,
    color: () => C.primary,
    labelColor: () => C.textMuted,
    barPercentage: 0.7,
    fillShadowGradient: C.primary,
    fillShadowGradientOpacity: 1,
    propsForBackgroundLines: {
      stroke: C.border,
      strokeDasharray: "4 4",
    },
  };

  const unitLabel = divisor === 1_000_000
    ? t("analytics.salesInMillions")
    : divisor === 1_000
    ? t("analytics.salesInThousands")
    : t("analytics.salesInCop");

  return (
    <Card padding={16}>
      <Text style={[styles.panelTitle, { color: C.text }]}>{t("analytics.salesByHour")}</Text>
      <Text style={[styles.panelSubtitle, { color: C.textMuted }]}>{t("analytics.salesByHourSubtitle")}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 12, marginHorizontal: -16 }}>
        <BarChart
          data={{ labels, datasets: [{ data: values }] }}
          width={chartWidth}
          height={180}
          chartConfig={chartConfig}
          style={{ borderRadius: 8 }}
          showValuesOnTopOfBars={false}
          withInnerLines
          fromZero
          yAxisLabel=""
          yAxisSuffix={suffix}
          flatColor
        />
      </ScrollView>
      <Text style={[styles.chartNote, { color: C.textMuted }]}>{t("analytics.hourAxis")} · {unitLabel}</Text>
    </Card>
  );
}

function HeatmapChart({
  data,
  isLoading,
}: {
  data: { heatmap: { hour: number; day: string; dayNum: number; txCount: number; totalCop: number }[] } | undefined;
  isLoading: boolean;
}) {
  const { t } = useTranslation();
  const scheme = useColorScheme();
  const C = scheme === "dark" ? Colors.dark : Colors.light;

  if (isLoading) {
    return (
      <Card padding={16}>
        <Text style={[styles.panelTitle, { color: C.text }]}>{t("analytics.heatmap")}</Text>
        <Text style={[styles.panelSubtitle, { color: C.textMuted }]}>{t("analytics.heatmapSubtitle")}</Text>
        <View style={{ marginTop: 12 }}>
          <HeatmapSkeleton />
        </View>
      </Card>
    );
  }

  const heatmap = data?.heatmap ?? [];
  if (heatmap.length === 0) {
    return (
      <Card padding={24}>
        <Text style={[styles.panelTitle, { color: C.text, marginBottom: 6 }]}>{t("analytics.heatmap")}</Text>
        <View style={styles.emptyState}>
          <Feather name="grid" size={32} color={C.textMuted} />
          <Text style={[styles.emptyText, { color: C.textMuted, marginTop: 8 }]}>{t("analytics.noData")}</Text>
        </View>
      </Card>
    );
  }

  const cellMap = new Map<string, { cop: number; tx: number }>();
  let maxCop = 1;
  for (const row of heatmap) {
    const key = `${row.dayNum}-${row.hour}`;
    const existing = cellMap.get(key) ?? { cop: 0, tx: 0 };
    const merged = { cop: existing.cop + row.totalCop, tx: existing.tx + row.txCount };
    cellMap.set(key, merged);
    if (merged.cop > maxCop) maxCop = merged.cop;
  }

  const hours = Array.from({ length: 24 }, (_, i) => i);
  const primaryRgb = scheme === "dark" ? "0,241,255" : "26,86,219";

  return (
    <Card padding={16}>
      <Text style={[styles.panelTitle, { color: C.text }]}>{t("analytics.heatmap")}</Text>
      <Text style={[styles.panelSubtitle, { color: C.textMuted }]}>{t("analytics.heatmapSubtitle")}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 12 }}>
        <View>
          <View style={styles.heatmapRow}>
            <View style={styles.heatmapDayLabelBox} />
            {hours.map((h) => (
              <Text key={h} style={[styles.heatmapHourLabel, { color: C.textMuted }]}>
                {h % 6 === 0 ? `${h}h` : ""}
              </Text>
            ))}
          </View>
          {DAYS_ORDER.map((dayName, dayNum) => (
            <View key={dayName} style={styles.heatmapRow}>
              <Text style={[styles.heatmapDayLabel, { color: C.textMuted }]}>{dayName}</Text>
              {hours.map((h) => {
                const cell = cellMap.get(`${dayNum}-${h}`);
                const cop = cell?.cop ?? 0;
                const intensity = cop / maxCop;
                const hasData = cop > 0;
                return (
                  <View
                    key={h}
                    style={[
                      styles.heatmapCell,
                      {
                        backgroundColor: hasData
                          ? `rgba(${primaryRgb}, ${(0.12 + intensity * 0.88).toFixed(2)})`
                          : C.inputBg,
                        borderColor: hasData ? "transparent" : C.border,
                      },
                    ]}
                  />
                );
              })}
            </View>
          ))}
        </View>
      </ScrollView>
      <View style={[styles.legendRow, { marginTop: 10 }]}>
        <Text style={[styles.legendLabel, { color: C.textMuted }]}>{t("analytics.low")}</Text>
        {[0.12, 0.3, 0.5, 0.7, 0.88].map((v) => (
          <View key={v} style={[styles.legendCell, { backgroundColor: `rgba(${primaryRgb}, ${v})` }]} />
        ))}
        <Text style={[styles.legendLabel, { color: C.textMuted }]}>{t("analytics.high")}</Text>
      </View>
    </Card>
  );
}

function SalesByHourPanel({
  data,
  isLoading,
}: {
  data: { salesByHour: { hour: number; day: string; totalCop: number; txCount: number }[] } | undefined;
  isLoading: boolean;
}) {
  return <HourlySalesChart data={data} isLoading={isLoading} />;
}

function TopProductsPanel({
  data,
  isLoading,
}: {
  data: {
    topProducts: {
      productId: string | null;
      productName: string;
      totalUnits: number;
      totalRevenueCop: number;
      grossProfitCop: number;
      profitMarginPercent: number;
    }[];
  } | undefined;
  isLoading: boolean;
}) {
  const { t } = useTranslation();
  const scheme = useColorScheme();
  const C = scheme === "dark" ? Colors.dark : Colors.light;

  const products = data?.topProducts ?? [];

  if (isLoading) {
    return (
      <Card padding={16}>
        <Text style={[styles.panelTitle, { color: C.text }]}>{t("analytics.topProducts")}</Text>
        <View style={{ marginTop: 12, gap: 12 }}>
          {[1, 2, 3].map((i) => (
            <View key={i} style={{ gap: 6 }}>
              <View style={[styles.skeletonValue, { backgroundColor: C.inputBg, width: "70%", height: 14 }]} />
              <View style={[styles.progressBg, { backgroundColor: C.inputBg }]}>
                <View style={[styles.progressFill, { width: `${40 + i * 15}%`, backgroundColor: C.shimmer2 }]} />
              </View>
            </View>
          ))}
        </View>
      </Card>
    );
  }

  if (products.length === 0) {
    return (
      <Card padding={24}>
        <View style={styles.emptyState}>
          <Feather name="package" size={32} color={C.textMuted} />
          <Text style={[styles.emptyText, { color: C.textMuted, marginTop: 8 }]}>{t("analytics.noData")}</Text>
        </View>
      </Card>
    );
  }

  const maxUnits = Math.max(...products.map((p) => p.totalUnits), 1);

  return (
    <Card padding={16}>
      <Text style={[styles.panelTitle, { color: C.text }]}>{t("analytics.topProducts")}</Text>
      <Text style={[styles.panelSubtitle, { color: C.textMuted }]}>{t("analytics.topProductsSubtitle")}</Text>
      <View style={{ marginTop: 12, gap: 12 }}>
        {products.map((p, idx) => (
          <View key={p.productId ?? p.productName} style={{ gap: 6 }}>
            <View style={styles.rankRow}>
              <Text style={[styles.rankNum, { color: C.textMuted }]}>#{idx + 1}</Text>
              <Text style={[styles.productName, { color: C.text }]} numberOfLines={1}>{p.productName}</Text>
              <Text style={[styles.unitCount, { color: C.primary }]}>{p.totalUnits} {t("analytics.units")}</Text>
            </View>
            <View style={[styles.progressBg, { backgroundColor: C.inputBg }]}>
              <View style={[styles.progressFill, { width: `${(p.totalUnits / maxUnits) * 100}%`, backgroundColor: C.primary }]} />
            </View>
            <View style={styles.productMeta}>
              <CopAmount amount={p.totalRevenueCop} size={13} />
              <Text style={[styles.marginBadge, { color: C.success, backgroundColor: C.successLight }]}>
                {p.profitMarginPercent.toFixed(1)}% {t("analytics.margin")}
              </Text>
            </View>
          </View>
        ))}
      </View>
    </Card>
  );
}

function TopMerchantsPanel({
  data,
  isLoading,
}: {
  data: {
    topMerchants: {
      merchantId: string;
      merchantName: string;
      totalSalesCop: number;
      grossProfitCop: number;
      profitMarginPercent: number;
      txCount: number;
    }[];
  } | undefined;
  isLoading: boolean;
}) {
  const { t } = useTranslation();
  const scheme = useColorScheme();
  const C = scheme === "dark" ? Colors.dark : Colors.light;

  const merchants = data?.topMerchants ?? [];

  if (isLoading) {
    return (
      <Card padding={16}>
        <Text style={[styles.panelTitle, { color: C.text }]}>{t("analytics.topMerchants")}</Text>
        <View style={{ marginTop: 12, gap: 12 }}>
          {[1, 2, 3].map((i) => (
            <View key={i} style={{ gap: 6 }}>
              <View style={[styles.skeletonValue, { backgroundColor: C.inputBg, width: "65%", height: 14 }]} />
              <View style={[styles.progressBg, { backgroundColor: C.inputBg }]}>
                <View style={[styles.progressFill, { width: `${50 + i * 10}%`, backgroundColor: C.shimmer2 }]} />
              </View>
            </View>
          ))}
        </View>
      </Card>
    );
  }

  if (merchants.length === 0) {
    return (
      <Card padding={24}>
        <View style={styles.emptyState}>
          <Feather name="users" size={32} color={C.textMuted} />
          <Text style={[styles.emptyText, { color: C.textMuted, marginTop: 8 }]}>{t("analytics.noData")}</Text>
        </View>
      </Card>
    );
  }

  const maxSales = Math.max(...merchants.map((m) => m.totalSalesCop), 1);

  return (
    <Card padding={16}>
      <Text style={[styles.panelTitle, { color: C.text }]}>{t("analytics.topMerchants")}</Text>
      <Text style={[styles.panelSubtitle, { color: C.textMuted }]}>{t("analytics.topMerchantsSubtitle")}</Text>
      <View style={{ marginTop: 12, gap: 12 }}>
        {merchants.map((m, idx) => (
          <View key={m.merchantId} style={{ gap: 6 }}>
            <View style={styles.rankRow}>
              <Text style={[styles.rankNum, { color: C.textMuted }]}>#{idx + 1}</Text>
              <Text style={[styles.productName, { color: C.text }]} numberOfLines={1}>{m.merchantName}</Text>
              <Text style={[styles.unitCount, { color: C.textSecondary }]}>{m.txCount} {t("analytics.txns")}</Text>
            </View>
            <View style={[styles.progressBg, { backgroundColor: C.inputBg }]}>
              <View style={[styles.progressFill, { width: `${(m.totalSalesCop / maxSales) * 100}%`, backgroundColor: C.success }]} />
            </View>
            <View style={styles.productMeta}>
              <CopAmount amount={m.totalSalesCop} size={13} />
              <Text style={[styles.marginBadge, { color: C.success, backgroundColor: C.successLight }]}>
                {m.profitMarginPercent.toFixed(1)}% {t("analytics.margin")}
              </Text>
            </View>
          </View>
        ))}
      </View>
    </Card>
  );
}

function StockAlertsPanel({
  data,
  isLoading,
  onRequestRestock,
}: {
  data: {
    alerts: {
      inventoryId: string;
      locationId: string;
      locationName: string;
      productId: string;
      productName: string;
      quantityOnHand: number;
      restockTrigger: number;
      restockTargetQty: number;
      deficit: number;
    }[];
  } | undefined;
  isLoading: boolean;
  onRequestRestock?: (locationId: string, productId: string) => void;
}) {
  const { t } = useTranslation();
  const scheme = useColorScheme();
  const C = scheme === "dark" ? Colors.dark : Colors.light;

  if (isLoading) {
    return (
      <Card padding={16}>
        <View style={{ gap: 12 }}>
          {[1, 2].map((i) => (
            <View key={i} style={{ gap: 8 }}>
              <View style={[styles.skeletonValue, { backgroundColor: C.inputBg, width: "60%", height: 14 }]} />
              <View style={[styles.stockBar, { backgroundColor: C.inputBg }]}>
                <View style={[styles.stockBarFill, { width: `${30 + i * 20}%`, backgroundColor: C.shimmer2 }]} />
              </View>
            </View>
          ))}
        </View>
      </Card>
    );
  }

  const alerts = data?.alerts ?? [];

  if (alerts.length === 0) {
    return (
      <Card padding={24}>
        <View style={styles.emptyState}>
          <Feather name="check-circle" size={32} color={C.success} />
          <Text style={[styles.emptyText, { color: C.textSecondary, marginTop: 8 }]}>{t("analytics.noStockAlerts")}</Text>
        </View>
      </Card>
    );
  }

  return (
    <View style={{ gap: 10 }}>
      <Card padding={16}>
        <View style={styles.alertsHeader}>
          <Feather name="alert-triangle" size={18} color={C.warning} />
          <Text style={[styles.panelTitle, { color: C.text, marginBottom: 0 }]}>
            {alerts.length} {t("analytics.stockAlerts")}
          </Text>
        </View>
      </Card>
      {alerts.map((alert) => {
        const criticalLevel = alert.quantityOnHand === 0;
        return (
          <Card key={alert.inventoryId} padding={14}>
            <View style={styles.alertRow}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.alertProduct, { color: C.text }]} numberOfLines={1}>{alert.productName}</Text>
                <Text style={[styles.alertLocation, { color: C.textMuted }]} numberOfLines={1}>{alert.locationName}</Text>
              </View>
              <View style={styles.alertRight}>
                <Text style={[styles.alertQty, { color: criticalLevel ? C.danger : C.warning }]}>
                  {alert.quantityOnHand}
                  <Text style={[styles.alertTrigger, { color: C.textMuted }]}> / {alert.restockTrigger}</Text>
                </Text>
                <Text style={[styles.alertLabel, { color: C.textMuted }]}>{t("analytics.units")}</Text>
              </View>
            </View>
            <View style={[styles.stockBar, { backgroundColor: C.inputBg, marginTop: 8 }]}>
              <View
                style={[
                  styles.stockBarFill,
                  {
                    width: alert.restockTrigger > 0 ? `${Math.min((alert.quantityOnHand / (alert.restockTrigger * 2)) * 100, 100)}%` : "0%",
                    backgroundColor: criticalLevel ? C.danger : C.warning,
                  },
                ]}
              />
            </View>
            {onRequestRestock && (
              <Pressable
                onPress={() => onRequestRestock(alert.locationId, alert.productId)}
                style={[styles.restockBtn, { backgroundColor: C.primaryLight, borderColor: C.primary }]}
              >
                <Feather name="plus-circle" size={14} color={C.primary} />
                <Text style={[styles.restockBtnText, { color: C.primary }]}>
                  {t("analytics.requestRestock")} ({alert.deficit} {t("analytics.units")})
                </Text>
              </Pressable>
            )}
          </Card>
        );
      })}
    </View>
  );
}

function HeatmapPanel({
  data,
  isLoading,
}: {
  data: { heatmap: { hour: number; day: string; dayNum: number; txCount: number; totalCop: number }[] } | undefined;
  isLoading: boolean;
}) {
  return <HeatmapChart data={data} isLoading={isLoading} />;
}

const REFUND_METHOD_LABELS: Record<string, string> = {
  cash: "Efectivo",
  nequi: "Nequi",
  bancolombia: "Bancolombia",
  other: "Otro",
};

function RefundRequestsPanel({
  eventId,
  onApprove,
  onReject,
}: {
  eventId: string | undefined;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
}) {
  const scheme = useColorScheme();
  const C = scheme === "dark" ? Colors.dark : Colors.light;
  const [statusFilter, setStatusFilter] = useState<"pending" | "approved" | "rejected">("pending");
  const { data, isLoading } = useListRefundRequests(eventId ?? null, statusFilter);
  const requests: AttendeeRefundRequest[] = (data as { refundRequests?: AttendeeRefundRequest[] })?.refundRequests ?? [];

  if (!eventId) {
    return (
      <Card padding={24}>
        <Text style={[styles.emptyText, { color: C.textMuted }]}>Selecciona un evento para ver las solicitudes de reembolso.</Text>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <Card padding={16}>
        <View style={{ gap: 12 }}>
          {[1, 2].map((i) => (
            <View key={i} style={[styles.skeletonValue, { backgroundColor: C.inputBg, height: 70, borderRadius: 8, width: "100%" }]} />
          ))}
        </View>
      </Card>
    );
  }

  const filterButtons: { key: "pending" | "approved" | "rejected"; label: string; color: string }[] = [
    { key: "pending", label: "Pendientes", color: C.warning },
    { key: "approved", label: "Aprobadas", color: C.success },
    { key: "rejected", label: "Rechazadas", color: C.danger },
  ];

  return (
    <View style={{ gap: 10 }}>
      <View style={{ flexDirection: "row", gap: 8 }}>
        {filterButtons.map((btn) => (
          <Pressable
            key={btn.key}
            onPress={() => setStatusFilter(btn.key)}
            style={{
              paddingHorizontal: 12,
              paddingVertical: 6,
              borderRadius: 8,
              backgroundColor: statusFilter === btn.key ? btn.color : C.inputBg,
              borderWidth: 1,
              borderColor: statusFilter === btn.key ? btn.color : C.border,
            }}
          >
            <Text style={{ fontSize: 12, fontFamily: "Inter_600SemiBold", color: statusFilter === btn.key ? "#fff" : C.textSecondary }}>
              {btn.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {requests.length === 0 ? (
        <Card padding={24}>
          <Text style={[styles.emptyText, { color: C.textMuted }]}>No hay solicitudes {statusFilter === "pending" ? "pendientes" : statusFilter === "approved" ? "aprobadas" : "rechazadas"}.</Text>
        </Card>
      ) : (
        requests.map((req) => (
          <Card key={req.id} padding={16}>
            <View style={{ gap: 6 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: C.text }}>
                  Pulsera: {req.braceletUid.slice(0, 8)}...
                </Text>
                <CopAmount amount={req.amountCop} size={16} color={C.primary} />
              </View>
              <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: C.textMuted }}>
                Método: {REFUND_METHOD_LABELS[req.refundMethod] ?? req.refundMethod}
              </Text>
              {req.accountDetails && (
                <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: C.textMuted }}>
                  Cuenta: {req.accountDetails}
                </Text>
              )}
              {req.notes && (
                <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: C.textMuted }} numberOfLines={2}>
                  Nota: {req.notes}
                </Text>
              )}
              <Text style={{ fontSize: 11, fontFamily: "Inter_400Regular", color: C.textMuted }}>
                {new Date(req.createdAt).toLocaleDateString("es-CO")}
              </Text>
              {req.status === "pending" && (
                <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
                  <Pressable
                    onPress={() => onApprove(req.id)}
                    style={{ flex: 1, backgroundColor: C.success, borderRadius: 8, padding: 10, alignItems: "center" }}
                  >
                    <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: "#fff" }}>Aprobar</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => onReject(req.id)}
                    style={{ flex: 1, backgroundColor: C.danger, borderRadius: 8, padding: 10, alignItems: "center" }}
                  >
                    <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: "#fff" }}>Rechazar</Text>
                  </Pressable>
                </View>
              )}
              {req.status !== "pending" && (
                <View style={{
                  paddingHorizontal: 10,
                  paddingVertical: 4,
                  borderRadius: 6,
                  backgroundColor: req.status === "approved" ? C.success + "22" : C.danger + "22",
                  alignSelf: "flex-start",
                  marginTop: 4,
                }}>
                  <Text style={{ fontSize: 12, fontFamily: "Inter_600SemiBold", color: req.status === "approved" ? C.success : C.danger }}>
                    {req.status === "approved" ? "Aprobada" : "Rechazada"}
                  </Text>
                </View>
              )}
            </View>
          </Card>
        ))
      )}
    </View>
  );
}

type EventOption = { id: string; name: string };
type RestockTarget = { locationId: string; locationName: string; productId: string; productName: string; deficit: number };

export default function AdminAnalyticsScreen() {
  const { t } = useTranslation();
  const { show: showAlert } = useAlert();
  const scheme = useColorScheme();
  const C = scheme === "dark" ? Colors.dark : Colors.light;
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";

  const [activeTab, setActiveTab] = useState<AnalyticsTab>("summary");
  const [selectedEventId, setSelectedEventId] = useState<string | undefined>(undefined);
  const [showEventPicker, setShowEventPicker] = useState(false);
  const [restockTarget, setRestockTarget] = useState<RestockTarget | null>(null);
  const [restockQty, setRestockQty] = useState("");
  const [restockNote, setRestockNote] = useState("");

  const createRestock = useCreateRestockOrder();
  const approveRefund = useApproveRefundRequest();
  const rejectRefund = useRejectRefundRequest();
  const [rejectTarget, setRejectTarget] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const { data: eventsData } = useListEvents({}, { query: { staleTime: 30_000, queryKey: ["events-list"] } });
  const events: EventOption[] = ((eventsData as { events?: EventOption[] })?.events ?? []);

  const queryParams = selectedEventId ? { eventId: selectedEventId } : {};
  const refetchInterval = REFETCH_INTERVAL;

  const { data: summaryData, isLoading: summaryLoading } = useGetAnalyticsSummary(queryParams, {
    query: { refetchInterval, queryKey: ["analytics-summary", queryParams] },
  });
  const { data: salesByHourData, isLoading: salesLoading } = useGetAnalyticsSalesByHour(queryParams, {
    query: {
      refetchInterval,
      enabled: activeTab === "sales" || activeTab === "summary",
      queryKey: ["analytics-sales-by-hour", queryParams],
    },
  });
  const { data: topProductsData, isLoading: productsLoading } = useGetAnalyticsTopProducts(
    { ...queryParams, limit: 10 },
    { query: { refetchInterval, enabled: activeTab === "products", queryKey: ["analytics-top-products", queryParams] } },
  );
  const { data: topMerchantsData, isLoading: merchantsLoading } = useGetAnalyticsTopMerchants(
    { ...queryParams, limit: 10 },
    { query: { refetchInterval, enabled: activeTab === "merchants", queryKey: ["analytics-top-merchants", queryParams] } },
  );
  const { data: stockAlertsData, isLoading: stockLoading } = useGetAnalyticsStockAlerts(queryParams, {
    query: { refetchInterval, enabled: activeTab === "stock", queryKey: ["analytics-stock-alerts", queryParams] },
  });
  const { data: heatmapData, isLoading: heatmapLoading } = useGetAnalyticsHeatmap(queryParams, {
    query: {
      refetchInterval,
      enabled: activeTab === "heatmap" || activeTab === "summary",
      queryKey: ["analytics-heatmap", queryParams],
    },
  });

  const selectedEvent = events.find((e) => e.id === selectedEventId);

  const tabs: { key: AnalyticsTab; label: string; icon: React.ComponentProps<typeof Feather>["name"] }[] = [
    { key: "summary", label: t("analytics.tabSummary"), icon: "pie-chart" },
    { key: "sales", label: t("analytics.tabSales"), icon: "bar-chart-2" },
    { key: "products", label: t("analytics.tabProducts"), icon: "package" },
    { key: "merchants", label: t("analytics.tabMerchants"), icon: "users" },
    { key: "stock", label: t("analytics.tabStock"), icon: "alert-triangle" },
    { key: "heatmap", label: t("analytics.tabHeatmap"), icon: "grid" },
    { key: "refunds", label: "Reembolsos", icon: "rotate-ccw" },
  ];

  function handleSubmitRestock() {
    if (!restockTarget) return;
    const qty = parseInt(restockQty, 10);
    if (isNaN(qty) || qty <= 0) {
      showAlert(t("common.error"), t("analytics.restockQtyRequired"));
      return;
    }
    createRestock.mutate(
      { data: { locationId: restockTarget.locationId, productId: restockTarget.productId, requestedQty: qty, notes: restockNote || undefined } },
      {
        onSuccess: () => {
          showAlert(t("common.success"), t("analytics.restockCreated"));
          setRestockTarget(null);
          setRestockQty("");
          setRestockNote("");
        },
        onError: (err: unknown) => {
          showAlert(t("common.error"), String((err as { message?: string })?.message ?? err));
        },
      },
    );
  }

  function handleApproveRefund(id: string) {
    approveRefund.mutate(id, {
      onSuccess: () => showAlert("Éxito", "Solicitud de reembolso aprobada."),
      onError: (err: unknown) => showAlert("Error", String((err as { message?: string })?.message ?? err)),
    });
  }

  function handleRejectRefund() {
    if (!rejectTarget) return;
    rejectRefund.mutate(
      { id: rejectTarget, reason: rejectReason || undefined },
      {
        onSuccess: () => {
          showAlert("Éxito", "Solicitud de reembolso rechazada.");
          setRejectTarget(null);
          setRejectReason("");
        },
        onError: (err: unknown) => showAlert("Error", String((err as { message?: string })?.message ?? err)),
      },
    );
  }

  return (
    <>
      <Modal
        visible={rejectTarget !== null}
        animationType="slide"
        transparent
        onRequestClose={() => { setRejectTarget(null); setRejectReason(""); }}
      >
        <View style={[styles.modalOverlay]}>
          <View style={[styles.modalCard, { backgroundColor: C.card }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: C.text }]}>Rechazar solicitud</Text>
              <Pressable onPress={() => { setRejectTarget(null); setRejectReason(""); }}>
                <Feather name="x" size={20} color={C.textMuted} />
              </Pressable>
            </View>
            <Text style={[styles.modalLabel, { color: C.textSecondary }]}>Motivo (opcional)</Text>
            <TextInput
              style={[styles.modalInput, { backgroundColor: C.inputBg, color: C.text, borderColor: C.border }]}
              value={rejectReason}
              onChangeText={setRejectReason}
              placeholder="Escribe el motivo del rechazo..."
              placeholderTextColor={C.textMuted}
              multiline
            />
            <View style={styles.modalActions}>
              <Pressable
                style={[styles.modalCancelBtn, { borderColor: C.border }]}
                onPress={() => { setRejectTarget(null); setRejectReason(""); }}
              >
                <Text style={[styles.modalCancelText, { color: C.textSecondary }]}>Cancelar</Text>
              </Pressable>
              <Pressable
                style={[styles.modalSubmitBtn, { backgroundColor: C.danger }, rejectRefund.isPending && { opacity: 0.6 }]}
                onPress={handleRejectRefund}
                disabled={rejectRefund.isPending}
              >
                <Text style={[styles.modalSubmitText, { color: "#fff" }]}>{rejectRefund.isPending ? "..." : "Rechazar"}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={restockTarget !== null}
        animationType="slide"
        transparent
        onRequestClose={() => setRestockTarget(null)}
      >
        <View style={[styles.modalOverlay]}>
          <View style={[styles.modalCard, { backgroundColor: C.card }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: C.text }]}>{t("analytics.createRestockOrder")}</Text>
              <Pressable onPress={() => setRestockTarget(null)}>
                <Feather name="x" size={20} color={C.textMuted} />
              </Pressable>
            </View>
            {restockTarget && (
              <>
                <View style={[styles.modalInfoRow, { backgroundColor: C.inputBg }]}>
                  <Text style={[styles.modalInfoLabel, { color: C.textMuted }]}>{t("analytics.product")}</Text>
                  <Text style={[styles.modalInfoValue, { color: C.text }]} numberOfLines={1}>{restockTarget.productName}</Text>
                </View>
                <View style={[styles.modalInfoRow, { backgroundColor: C.inputBg }]}>
                  <Text style={[styles.modalInfoLabel, { color: C.textMuted }]}>{t("analytics.location")}</Text>
                  <Text style={[styles.modalInfoValue, { color: C.text }]} numberOfLines={1}>{restockTarget.locationName}</Text>
                </View>
                <View style={[styles.modalInfoRow, { backgroundColor: C.inputBg }]}>
                  <Text style={[styles.modalInfoLabel, { color: C.textMuted }]}>{t("analytics.deficit")}</Text>
                  <Text style={[styles.modalInfoValue, { color: C.warning }]}>{restockTarget.deficit} {t("analytics.units")}</Text>
                </View>
                <Text style={[styles.modalLabel, { color: C.textSecondary }]}>{t("analytics.requestedQty")}</Text>
                <TextInput
                  style={[styles.modalInput, { backgroundColor: C.inputBg, color: C.text, borderColor: C.border }]}
                  value={restockQty}
                  onChangeText={setRestockQty}
                  keyboardType="numeric"
                  placeholder={String(restockTarget.deficit)}
                  placeholderTextColor={C.textMuted}
                />
                <Text style={[styles.modalLabel, { color: C.textSecondary }]}>{t("analytics.notes")}</Text>
                <TextInput
                  style={[styles.modalInput, { backgroundColor: C.inputBg, color: C.text, borderColor: C.border, minHeight: 60 }]}
                  value={restockNote}
                  onChangeText={setRestockNote}
                  placeholder={t("analytics.notesPlaceholder")}
                  placeholderTextColor={C.textMuted}
                  multiline
                />
                <View style={styles.modalActions}>
                  <Pressable
                    style={[styles.modalCancelBtn, { borderColor: C.border }]}
                    onPress={() => setRestockTarget(null)}
                  >
                    <Text style={[styles.modalCancelText, { color: C.textSecondary }]}>{t("common.cancel")}</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.modalSubmitBtn, { backgroundColor: C.primary }, createRestock.isPending && { opacity: 0.6 }]}
                    onPress={handleSubmitRestock}
                    disabled={createRestock.isPending}
                  >
                    <Text style={styles.modalSubmitText}>{createRestock.isPending ? t("common.loading") : t("analytics.submitRestock")}</Text>
                  </Pressable>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>

      <ScrollView
        style={{ flex: 1, backgroundColor: C.background }}
        contentContainerStyle={{
          paddingTop: isWeb ? 67 : insets.top + 16,
          paddingBottom: isWeb ? 34 : insets.bottom + 100,
          paddingHorizontal: 20,
          gap: 16,
        }}
        contentInsetAdjustmentBehavior="automatic"
      >
        <Text style={[styles.title, { color: C.text }]}>{t("analytics.title")}</Text>

        <Pressable
          onPress={() => setShowEventPicker((v) => !v)}
          style={[styles.eventPicker, { backgroundColor: C.card, borderColor: C.border }]}
        >
          <Feather name="calendar" size={16} color={C.textSecondary} />
          <Text style={[styles.eventPickerText, { color: C.text }]} numberOfLines={1}>
            {selectedEvent ? selectedEvent.name : t("analytics.allEvents")}
          </Text>
          <Feather name={showEventPicker ? "chevron-up" : "chevron-down"} size={16} color={C.textMuted} />
        </Pressable>

        {showEventPicker && (
          <Card padding={8}>
            <Pressable
              onPress={() => { setSelectedEventId(undefined); setShowEventPicker(false); }}
              style={[styles.eventOption, !selectedEventId && { backgroundColor: C.primaryLight }]}
            >
              <Text style={[styles.eventOptionText, { color: !selectedEventId ? C.primary : C.text }]}>
                {t("analytics.allEvents")}
              </Text>
            </Pressable>
            {events.map((e) => (
              <Pressable
                key={e.id}
                onPress={() => { setSelectedEventId(e.id); setShowEventPicker(false); }}
                style={[styles.eventOption, selectedEventId === e.id && { backgroundColor: C.primaryLight }]}
              >
                <Text style={[styles.eventOptionText, { color: selectedEventId === e.id ? C.primary : C.text }]} numberOfLines={1}>
                  {e.name}
                </Text>
              </Pressable>
            ))}
          </Card>
        )}

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabScroll}>
          <View style={[styles.tabRow, { backgroundColor: C.inputBg }]}>
            {tabs.map((tab) => (
              <Pressable
                key={tab.key}
                onPress={() => setActiveTab(tab.key)}
                style={[
                  styles.tabBtn,
                  activeTab === tab.key && {
                    backgroundColor: C.card,
                    borderRadius: 10,
                    shadowColor: "#000",
                    shadowOpacity: 0.06,
                    shadowRadius: 4,
                    elevation: 2,
                  },
                ]}
              >
                <Feather name={tab.icon} size={15} color={activeTab === tab.key ? C.primary : C.textMuted} />
                <Text style={[styles.tabLabel, { color: activeTab === tab.key ? C.primary : C.textMuted }]}>
                  {tab.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </ScrollView>

        {activeTab === "summary" && (
          <>
            <SummaryPanel data={summaryData} isLoading={summaryLoading} />
            <HourlySalesChart data={salesByHourData} isLoading={salesLoading} />
            <HeatmapChart data={heatmapData} isLoading={heatmapLoading} />
          </>
        )}
        {activeTab === "sales" && <SalesByHourPanel data={salesByHourData} isLoading={salesLoading} />}
        {activeTab === "products" && <TopProductsPanel data={topProductsData} isLoading={productsLoading} />}
        {activeTab === "merchants" && <TopMerchantsPanel data={topMerchantsData} isLoading={merchantsLoading} />}
        {activeTab === "stock" && (
          <StockAlertsPanel
            data={stockAlertsData}
            isLoading={stockLoading}
            onRequestRestock={(locationId, productId) => {
              const alerts = (stockAlertsData as { alerts?: { locationId: string; locationName: string; productId: string; productName: string; deficit: number }[] } | undefined)?.alerts ?? [];
              const alert = alerts.find((a) => a.locationId === locationId && a.productId === productId);
              if (alert) {
                setRestockTarget({ locationId, locationName: alert.locationName, productId, productName: alert.productName, deficit: alert.deficit });
                setRestockQty(String(alert.deficit));
                setRestockNote("");
              }
            }}
          />
        )}
        {activeTab === "heatmap" && <HeatmapPanel data={heatmapData} isLoading={heatmapLoading} />}
        {activeTab === "refunds" && (
          <RefundRequestsPanel
            eventId={selectedEventId}
            onApprove={handleApproveRefund}
            onReject={(id) => { setRejectTarget(id); setRejectReason(""); }}
          />
        )}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 26, fontFamily: "Inter_700Bold" },
  eventPicker: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderRadius: 12, borderWidth: 1 },
  eventPickerText: { flex: 1, fontSize: 14, fontFamily: "Inter_500Medium" },
  eventOption: { paddingHorizontal: 12, paddingVertical: 10, borderRadius: 8 },
  eventOptionText: { fontSize: 14, fontFamily: "Inter_400Regular" },
  tabScroll: { flexGrow: 0 },
  tabRow: { flexDirection: "row", borderRadius: 12, padding: 4, gap: 2 },
  tabBtn: { alignItems: "center", paddingVertical: 8, paddingHorizontal: 10, gap: 3, minWidth: 60 },
  tabLabel: { fontSize: 10, fontFamily: "Inter_500Medium", textAlign: "center" },
  summaryRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  summaryLeft: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1 },
  summaryLabel: { fontSize: 14, fontFamily: "Inter_500Medium" },
  summaryCount: { fontSize: 18, fontFamily: "Inter_700Bold" },
  panelTitle: { fontSize: 16, fontFamily: "Inter_700Bold", marginBottom: 2 },
  panelSubtitle: { fontSize: 12, fontFamily: "Inter_400Regular" },
  chartNote: { fontSize: 10, fontFamily: "Inter_400Regular", marginTop: 6, textAlign: "center" },
  rankRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  rankNum: { fontSize: 12, fontFamily: "Inter_600SemiBold", width: 20 },
  productName: { flex: 1, fontSize: 14, fontFamily: "Inter_500Medium" },
  unitCount: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  progressBg: { height: 6, borderRadius: 3, overflow: "hidden" },
  progressFill: { height: 6, borderRadius: 3 },
  productMeta: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  marginBadge: { fontSize: 11, fontFamily: "Inter_600SemiBold", paddingHorizontal: 8, paddingVertical: 2, borderRadius: 100 },
  alertsHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  alertRow: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  alertProduct: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  alertLocation: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  alertRight: { alignItems: "flex-end" },
  alertQty: { fontSize: 20, fontFamily: "Inter_700Bold" },
  alertTrigger: { fontSize: 14, fontFamily: "Inter_400Regular" },
  alertLabel: { fontSize: 11, fontFamily: "Inter_400Regular" },
  stockBar: { height: 4, borderRadius: 2, overflow: "hidden" },
  stockBarFill: { height: 4, borderRadius: 2 },
  heatmapRow: { flexDirection: "row", alignItems: "center", marginBottom: 2 },
  heatmapDayLabelBox: { width: 32 },
  heatmapDayLabel: { width: 32, fontSize: 10, fontFamily: "Inter_400Regular" },
  heatmapHourLabel: { width: 16, fontSize: 8, fontFamily: "Inter_400Regular", textAlign: "center" },
  heatmapCell: { width: 14, height: 14, borderRadius: 2, marginHorizontal: 1, borderWidth: 1 },
  legendRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  legendLabel: { fontSize: 10, fontFamily: "Inter_400Regular" },
  legendCell: { width: 14, height: 14, borderRadius: 2 },
  emptyState: { alignItems: "center", paddingVertical: 16 },
  emptyText: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center" },
  restockBtn: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 10, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8, borderWidth: 1 },
  restockBtnText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  skeletonContainer: { borderRadius: 8, overflow: "hidden", justifyContent: "flex-end", padding: 8 },
  skeletonBars: { flexDirection: "row", alignItems: "flex-end", gap: 6, height: "100%" },
  skeletonBar: { flex: 1, borderRadius: 3 },
  skeletonRow: { flexDirection: "row", gap: 2, marginBottom: 2 },
  skeletonCell: { width: 14, height: 14, borderRadius: 2 },
  skeletonValue: { borderRadius: 4, height: 18 },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  modalCard: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, gap: 12 },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  modalTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  modalInfoRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 10, borderRadius: 8 },
  modalInfoLabel: { fontSize: 13, fontFamily: "Inter_500Medium" },
  modalInfoValue: { fontSize: 13, fontFamily: "Inter_600SemiBold", maxWidth: "60%" },
  modalLabel: { fontSize: 13, fontFamily: "Inter_500Medium", marginTop: 4 },
  modalInput: { borderWidth: 1, borderRadius: 10, padding: 12, fontSize: 15, fontFamily: "Inter_400Regular" },
  modalActions: { flexDirection: "row", gap: 10, marginTop: 8 },
  modalCancelBtn: { flex: 1, borderWidth: 1, borderRadius: 10, padding: 14, alignItems: "center" },
  modalCancelText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  modalSubmitBtn: { flex: 2, borderRadius: 10, padding: 14, alignItems: "center" },
  modalSubmitText: { fontSize: 14, fontFamily: "Inter_700Bold", color: "#0a0a0a" },
});
