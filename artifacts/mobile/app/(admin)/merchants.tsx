import { useColorScheme } from "@/hooks/useColorScheme";
import { Feather } from "@expo/vector-icons";
import React, { useState } from "react";
import { Alert, FlatList, Modal, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import {
  useListMerchants,
  useCreateMerchant,
  useUpdateMerchant,
  useDeleteMerchant,
  useListEvents,
  useListLocations,
  useCreateLocation,
  useUpdateLocation,
  useAssignUserToLocation,
  useRemoveUserFromLocation,
  useGetLocationInventory,
} from "@workspace/api-client-react";
import Colors from "@/constants/colors";
import { CopAmount } from "@/components/CopAmount";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Empty } from "@/components/ui/Empty";
import { Input } from "@/components/ui/Input";
import { Loading } from "@/components/ui/Loading";
import { Badge } from "@/components/ui/Badge";

type Merchant = {
  id: string;
  name: string;
  contactEmail: string | null;
  commissionRatePercent: string;
  merchantType?: "event_managed" | "external";
  active?: boolean;
  locationCount?: number;
};

type Location = {
  id: string;
  name: string;
  merchantId: string;
  eventId: string;
  active: boolean;
};

export default function MerchantsScreen() {
  const { t } = useTranslation();
  const scheme = useColorScheme();
  const C = scheme === "dark" ? Colors.dark : Colors.light;
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";

  const [showCreate, setShowCreate] = useState(false);
  const [merchantName, setMerchantName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [commissionRate, setCommissionRate] = useState("15");
  const [selectedEventId, setSelectedEventId] = useState("");
  const [merchantType, setMerchantType] = useState<"event_managed" | "external">("event_managed");

  const [selectedMerchant, setSelectedMerchant] = useState<Merchant | null>(null);
  const [selectedLocation, setSelectedLocation] = useState<Location | null>(null);

  const { data, isLoading, refetch } = useListMerchants({});
  const { data: eventsData } = useListEvents();
  const merchants = (data as {
    merchants?: Merchant[];
  } | undefined)?.merchants ?? [];
  const events = (eventsData as { events?: { id: string; name: string }[] } | undefined)?.events ?? [];

  const createMerchant = useCreateMerchant();

  const handleCreate = async () => {
    if (!merchantName.trim()) { Alert.alert(t("common.error"), t("common.nameRequired")); return; }
    if (!selectedEventId) { Alert.alert(t("common.error"), t("admin.selectEvent")); return; }
    try {
      await createMerchant.mutateAsync({
        data: {
          name: merchantName.trim(),
          eventId: selectedEventId,
          commissionRatePercent: String(parseFloat(commissionRate) || 15),
          merchantType,
        },
      });
      setShowCreate(false);
      setMerchantName("");
      setContactEmail("");
      setCommissionRate("15");
      setSelectedEventId("");
      setMerchantType("event_managed");
      refetch();
    } catch {
      Alert.alert(t("common.error"), t("common.unknownError"));
    }
  };

  if (isLoading) return <Loading label={t("common.loading")} />;

  return (
    <View style={[styles.container, { backgroundColor: C.background }]}>
      <FlatList
        data={merchants}
        keyExtractor={(item) => item.id}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{
          paddingTop: isWeb ? 67 : insets.top + 16,
          paddingBottom: isWeb ? 34 : insets.bottom + 100,
          paddingHorizontal: 20,
          gap: 12,
        }}
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refetch} tintColor={C.primary} />}
        ListHeaderComponent={() => (
          <View style={styles.header}>
            <Text style={[styles.title, { color: C.text }]}>{t("admin.merchants")}</Text>
            <Button title={`+ ${t("admin.createMerchant")}`} onPress={() => setShowCreate(true)} variant="primary" size="sm" />
          </View>
        )}
        ListEmptyComponent={() => (
          <Empty
            icon="shopping-bag"
            title={t("admin.noMerchants")}
            actionLabel={t("admin.createMerchant")}
            onAction={() => setShowCreate(true)}
          />
        )}
        scrollEnabled={!!merchants.length}
        renderItem={({ item }) => (
          <Pressable onPress={() => setSelectedMerchant(item)}>
            <Card>
              <View style={styles.merchantRow}>
                <View style={[styles.merchantIcon, { backgroundColor: C.primaryLight }]}>
                  <Feather name="shopping-bag" size={20} color={C.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <Text style={[styles.merchantName, { color: C.text }]}>{item.name}</Text>
                    <View style={[
                      styles.typeBadge,
                      { backgroundColor: item.merchantType === "external" ? "#fef3c7" : C.primaryLight },
                    ]}>
                      <Text style={[styles.typeBadgeText, { color: item.merchantType === "external" ? "#92400e" : C.primary }]}>
                        {item.merchantType === "external" ? t("merchant_admin.typeExternal") : t("merchant_admin.typeEventManaged")}
                      </Text>
                    </View>
                  </View>
                  {item.contactEmail ? (
                    <Text style={[styles.merchantEmail, { color: C.textSecondary }]}>{item.contactEmail}</Text>
                  ) : null}
                </View>
                <View style={{ alignItems: "flex-end", gap: 4 }}>
                  <Text style={[styles.commRate, { color: C.primary }]}>{item.commissionRatePercent}%</Text>
                  <Text style={[styles.locCount, { color: C.textMuted }]}>{t("admin.locationCount", { count: item.locationCount ?? 0 })}</Text>
                </View>
                <Feather name="chevron-right" size={16} color={C.textMuted} />
              </View>
            </Card>
          </Pressable>
        )}
      />

      <Modal visible={showCreate} transparent animationType="slide">
        <View style={[styles.overlay, { backgroundColor: C.overlay }]}>
          <ScrollView style={[styles.sheet, { backgroundColor: C.card }]} contentContainerStyle={{ gap: 16, padding: 24 }}>
            <Text style={[styles.sheetTitle, { color: C.text }]}>{t("admin.createMerchant")}</Text>
            <Input label={t("common.name")} value={merchantName} onChangeText={setMerchantName} placeholder={t("admin.merchantNamePlaceholder")} />
            <Input label={t("admin.contactEmail")} value={contactEmail} onChangeText={setContactEmail} placeholder="contacto@email.com" keyboardType="email-address" />
            <Input label={t("admin.commissionRate")} value={commissionRate} onChangeText={setCommissionRate} keyboardType="decimal-pad" placeholder="15" />
            <View style={{ gap: 8 }}>
              <Text style={[styles.label, { color: C.textSecondary }]}>{t("merchant_admin.typeLabel")}</Text>
              <View style={{ flexDirection: "row", gap: 8 }}>
                {(["event_managed", "external"] as const).map((type) => (
                  <Pressable
                    key={type}
                    onPress={() => setMerchantType(type)}
                    style={[
                      styles.typeOption,
                      {
                        borderColor: merchantType === type ? C.primary : C.border,
                        backgroundColor: merchantType === type ? C.primaryLight : C.card,
                        flex: 1,
                      },
                    ]}
                  >
                    <Text style={[styles.typeOptionText, { color: merchantType === type ? C.primary : C.textSecondary }]}>
                      {type === "event_managed" ? t("merchant_admin.typeEventManaged") : t("merchant_admin.typeExternal")}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
            <View style={{ gap: 6 }}>
              <Text style={[styles.label, { color: C.textSecondary }]}>{t("admin.event")}</Text>
              <View style={{ gap: 6 }}>
                {events.map((ev) => (
                  <Pressable
                    key={ev.id}
                    onPress={() => setSelectedEventId(ev.id)}
                    style={[
                      styles.eventOption,
                      {
                        borderColor: selectedEventId === ev.id ? C.primary : C.border,
                        backgroundColor: selectedEventId === ev.id ? C.primaryLight : C.card,
                      },
                    ]}
                  >
                    <Text style={{ color: selectedEventId === ev.id ? C.primary : C.text, fontSize: 14 }}>{ev.name}</Text>
                    {selectedEventId === ev.id && <Feather name="check" size={14} color={C.primary} />}
                  </Pressable>
                ))}
                {events.length === 0 && (
                  <Text style={{ color: C.textMuted, fontSize: 13 }}>{t("admin.noEvents")}</Text>
                )}
              </View>
            </View>
            <View style={styles.sheetActions}>
              <Button title={t("common.cancel")} onPress={() => setShowCreate(false)} variant="secondary" />
              <Button title={t("admin.createMerchant")} onPress={handleCreate} variant="primary" loading={createMerchant.isPending} />
            </View>
          </ScrollView>
        </View>
      </Modal>

      {selectedMerchant && (
        <MerchantDetailModal
          merchant={selectedMerchant}
          onClose={() => setSelectedMerchant(null)}
          onSelectLocation={(loc) => setSelectedLocation(loc)}
          onMerchantUpdated={(updated) => { setSelectedMerchant(updated); refetch(); }}
          onMerchantDeleted={() => { setSelectedMerchant(null); refetch(); }}
          C={C}
        />
      )}

      {selectedLocation && (
        <LocationDetailModal
          location={selectedLocation}
          onClose={() => setSelectedLocation(null)}
          C={C}
        />
      )}
    </View>
  );
}

function MerchantDetailModal({
  merchant,
  onClose,
  onSelectLocation,
  onMerchantUpdated,
  onMerchantDeleted,
  C,
}: {
  merchant: Merchant;
  onClose: () => void;
  onSelectLocation: (loc: Location) => void;
  onMerchantUpdated: (updated: Merchant) => void;
  onMerchantDeleted: () => void;
  C: typeof Colors.light;
}) {
  const { t } = useTranslation();
  const [showAddLocation, setShowAddLocation] = useState(false);
  const [newLocationName, setNewLocationName] = useState("");
  const [newEventId, setNewEventId] = useState("");

  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(merchant.name);
  const [editCommission, setEditCommission] = useState(String(merchant.commissionRatePercent));
  const [editType, setEditType] = useState<"event_managed" | "external">(merchant.merchantType ?? "event_managed");
  const [editActive, setEditActive] = useState(merchant.active !== false);

  const updateMerchant = useUpdateMerchant();
  const deleteMerchant = useDeleteMerchant();

  const handleDelete = () => {
    Alert.alert(
      t("admin.deleteMerchant"),
      t("admin.deleteMerchantConfirm", { name: merchant.name }),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("common.delete"),
          style: "destructive",
          onPress: async () => {
            try {
              await deleteMerchant.mutateAsync({ merchantId: merchant.id });
              onMerchantDeleted();
            } catch (err: unknown) {
              const status = (err as { status?: number })?.status;
              if (status === 409) {
                Alert.alert(t("admin.cannotDelete"), t("admin.merchantHasTransactions"));
              } else {
                Alert.alert(t("common.error"), t("common.unknownError"));
              }
            }
          },
        },
      ]
    );
  };

  const handleSaveEdit = async () => {
    if (!editName.trim()) { Alert.alert(t("common.error"), t("common.nameRequired")); return; }
    try {
      const updated = await updateMerchant.mutateAsync({
        merchantId: merchant.id,
        data: {
          name: editName.trim(),
          commissionRatePercent: String(parseFloat(editCommission) || 0),
          merchantType: editType,
          active: editActive,
        },
      });
      setIsEditing(false);
      onMerchantUpdated({ ...merchant, ...updated });
    } catch {
      Alert.alert(t("common.error"), t("common.unknownError"));
    }
  };

  const { data: locData, isLoading, refetch } = useListLocations({ merchantId: merchant.id });
  const locations = (locData as { locations?: Location[] } | undefined)?.locations ?? [];

  const createLocation = useCreateLocation();
  const updateLocation = useUpdateLocation();

  const handleAddLocation = async () => {
    if (!newLocationName.trim()) { Alert.alert(t("common.error"), t("common.nameRequired")); return; }
    if (!newEventId.trim()) { Alert.alert(t("common.error"), t("admin.eventIdRequired")); return; }
    try {
      await createLocation.mutateAsync({
        data: {
          merchantId: merchant.id,
          eventId: newEventId.trim(),
          name: newLocationName.trim(),
        },
      });
      setShowAddLocation(false);
      setNewLocationName("");
      setNewEventId("");
      refetch();
    } catch {
      Alert.alert(t("common.error"), t("common.unknownError"));
    }
  };

  const handleDeactivate = (location: Location) => {
    Alert.alert(
      t("admin.deactivateLocation"),
      t("admin.deactivateLocationConfirm", { name: location.name }),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("admin.deactivate"),
          style: "destructive",
          onPress: async () => {
            try {
              await updateLocation.mutateAsync({
                locationId: location.id,
                data: { active: false },
              });
              refetch();
            } catch {
              Alert.alert(t("common.error"), t("common.unknownError"));
            }
          },
        },
      ]
    );
  };

  return (
    <Modal visible transparent animationType="slide">
      <View style={[styles.overlay, { backgroundColor: C.overlay }]}>
        <View style={[styles.largeSheet, { backgroundColor: C.card }]}>
          <View style={styles.sheetHeader}>
            <Pressable onPress={onClose} style={styles.backBtn}>
              <Feather name="arrow-left" size={20} color={C.text} />
            </Pressable>
            <View style={{ flex: 1 }}>
              <Text style={[styles.sheetTitle, { color: C.text }]} numberOfLines={1}>
                {isEditing ? editName : merchant.name}
              </Text>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Badge label={`${merchant.commissionRatePercent}%`} variant="info" size="sm" />
              <Pressable
                onPress={() => {
                  if (isEditing) {
                    setIsEditing(false);
                    setEditName(merchant.name);
                    setEditCommission(String(merchant.commissionRatePercent));
                    setEditType(merchant.merchantType ?? "event_managed");
                    setEditActive(merchant.active !== false);
                  } else {
                    setIsEditing(true);
                  }
                }}
                style={[styles.backBtn, { backgroundColor: isEditing ? C.inputBg : C.primaryLight }]}
              >
                <Feather name={isEditing ? "x" : "edit-2"} size={16} color={isEditing ? C.textSecondary : C.primary} />
              </Pressable>
            </View>
          </View>

          {isEditing && (
            <View style={[styles.addForm, { backgroundColor: C.inputBg, borderColor: C.border, gap: 12 }]}>
              <Text style={[styles.sectionLabel, { color: C.textSecondary }]}>{t("admin.editMerchant")}</Text>
              <Input
                label={t("admin.merchantName")}
                value={editName}
                onChangeText={setEditName}
                placeholder={t("admin.merchantNamePlaceholder")}
              />
              <Input
                label={t("admin.commissionRate")}
                value={editCommission}
                onChangeText={setEditCommission}
                keyboardType="decimal-pad"
                placeholder="0"
              />
              <View style={{ gap: 6 }}>
                <Text style={[styles.sectionLabel, { color: C.textSecondary }]}>{t("merchant_admin.typeLabel")}</Text>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  {(["event_managed", "external"] as const).map((type) => (
                    <Pressable
                      key={type}
                      onPress={() => setEditType(type)}
                      style={[
                        styles.typeOption,
                        {
                          borderColor: editType === type ? C.primary : C.border,
                          backgroundColor: editType === type ? C.primaryLight : C.card,
                          flex: 1,
                        },
                      ]}
                    >
                      <Text style={[styles.typeOptionText, { color: editType === type ? C.primary : C.textSecondary }]}>
                        {type === "event_managed" ? t("merchant_admin.typeEventManaged") : t("merchant_admin.typeExternal")}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
              <View style={{ flexDirection: "row", gap: 8 }}>
                <Pressable
                  onPress={() => setEditActive(!editActive)}
                  style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
                >
                  <View style={[
                    styles.backBtn,
                    { backgroundColor: editActive ? C.primaryLight : C.inputBg, borderRadius: 8 },
                  ]}>
                    <Feather name={editActive ? "check" : "x"} size={16} color={editActive ? C.primary : C.textMuted} />
                  </View>
                  <Text style={[{ fontFamily: "Inter_500Medium", fontSize: 14 }, { color: C.text }]}>
                    {editActive ? t("common.active") : t("common.inactive")}
                  </Text>
                </Pressable>
              </View>
              <Text style={{ fontSize: 11, fontFamily: "Inter_400Regular", color: C.textMuted }}>
                {t("admin.commissionChangeNote")}
              </Text>
              <View style={styles.sheetActions}>
                <Button
                  title={t("common.cancel")}
                  variant="secondary"
                  size="sm"
                  onPress={() => {
                    setIsEditing(false);
                    setEditName(merchant.name);
                    setEditCommission(String(merchant.commissionRatePercent));
                  }}
                />
                <Button
                  title={t("common.save")}
                  variant="primary"
                  size="sm"
                  loading={updateMerchant.isPending}
                  onPress={handleSaveEdit}
                />
              </View>
              <Button
                title={t("admin.deleteMerchant")}
                variant="danger"
                size="sm"
                loading={deleteMerchant.isPending}
                onPress={handleDelete}
              />
            </View>
          )}

          <View style={styles.sectionRow}>
            <Text style={[styles.sectionLabel, { color: C.textSecondary }]}>{t("admin.locations")}</Text>
            <Pressable onPress={() => setShowAddLocation(!showAddLocation)}>
              <Text style={[styles.addLink, { color: C.primary }]}>+ {t("admin.addLocation")}</Text>
            </Pressable>
          </View>

          {showAddLocation && (
            <View style={[styles.addForm, { backgroundColor: C.inputBg, borderColor: C.border }]}>
              <Input
                label={t("admin.locationName")}
                value={newLocationName}
                onChangeText={setNewLocationName}
                placeholder={t("admin.locationNamePlaceholder")}
              />
              <Input
                label={t("admin.eventId")}
                value={newEventId}
                onChangeText={setNewEventId}
                placeholder={t("admin.eventIdPlaceholder")}
              />
              <View style={styles.sheetActions}>
                <Button title={t("common.cancel")} onPress={() => { setShowAddLocation(false); setNewLocationName(""); setNewEventId(""); }} variant="secondary" size="sm" />
                <Button title={t("admin.addLocation")} onPress={handleAddLocation} variant="primary" size="sm" loading={createLocation.isPending} />
              </View>
            </View>
          )}

          {isLoading ? (
            <Loading label={t("common.loading")} />
          ) : locations.length === 0 ? (
            <Empty icon="map-pin" title={t("admin.noLocations")} />
          ) : (
            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ gap: 8 }}>
              {locations.map((loc) => (
                <Pressable key={loc.id} onPress={() => onSelectLocation(loc)}>
                  <Card padding={14}>
                    <View style={styles.locationRow}>
                      <View style={[styles.locationIcon, { backgroundColor: loc.active ? C.primaryLight : C.inputBg }]}>
                        <Feather name="map-pin" size={16} color={loc.active ? C.primary : C.textMuted} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.locationName, { color: C.text }]}>{loc.name}</Text>
                        <Text style={[styles.locationStatus, { color: loc.active ? C.success : C.textMuted }]}>
                          {loc.active ? t("common.active") : t("common.inactive")}
                        </Text>
                      </View>
                      {loc.active && (
                        <Pressable
                          onPress={(e) => { e.stopPropagation(); handleDeactivate(loc); }}
                          style={[styles.deactivateBtn, { borderColor: C.border }]}
                        >
                          <Feather name="x" size={14} color={C.danger} />
                        </Pressable>
                      )}
                      <Feather name="chevron-right" size={16} color={C.textMuted} />
                    </View>
                  </Card>
                </Pressable>
              ))}
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

function LocationDetailModal({
  location,
  onClose,
  C,
}: {
  location: Location;
  onClose: () => void;
  C: typeof Colors.light;
}) {
  const { t } = useTranslation();
  const [assignUserId, setAssignUserId] = useState("");
  const [showAssign, setShowAssign] = useState(false);

  const { data: invData, isLoading: invLoading } = useGetLocationInventory(location.id);
  const inventoryItems = (invData as { inventory?: Array<{ productId: string; product?: { id: string; name: string }; quantityOnHand: number; restockTrigger: number }> } | undefined)?.inventory ?? [];

  const assignUser = useAssignUserToLocation();
  const removeUser = useRemoveUserFromLocation();

  const handleAssign = async () => {
    if (!assignUserId.trim()) { Alert.alert(t("common.error"), t("admin.userIdRequired")); return; }
    try {
      await assignUser.mutateAsync({
        locationId: location.id,
        data: { userId: assignUserId.trim() },
      });
      setAssignUserId("");
      setShowAssign(false);
      Alert.alert(t("common.success"), t("admin.staffAssigned"));
    } catch {
      Alert.alert(t("common.error"), t("common.unknownError"));
    }
  };

  const handleRemove = (userId: string) => {
    Alert.alert(
      t("admin.removeStaff"),
      t("admin.removeStaffConfirm"),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("common.confirm"),
          style: "destructive",
          onPress: async () => {
            try {
              await removeUser.mutateAsync({
                locationId: location.id,
                data: { userId },
              });
              Alert.alert(t("common.success"), t("admin.staffRemoved"));
            } catch {
              Alert.alert(t("common.error"), t("common.unknownError"));
            }
          },
        },
      ]
    );
  };

  return (
    <Modal visible transparent animationType="slide">
      <View style={[styles.overlay, { backgroundColor: C.overlay }]}>
        <View style={[styles.largeSheet, { backgroundColor: C.card }]}>
          <View style={styles.sheetHeader}>
            <Pressable onPress={onClose} style={styles.backBtn}>
              <Feather name="arrow-left" size={20} color={C.text} />
            </Pressable>
            <View style={{ flex: 1 }}>
              <Text style={[styles.sheetTitle, { color: C.text }]}>{location.name}</Text>
              <Text style={[styles.locationStatus, { color: location.active ? C.success : C.textMuted }]}>
                {location.active ? t("common.active") : t("common.inactive")}
              </Text>
            </View>
          </View>

          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ gap: 16 }}>
            <View style={styles.sectionRow}>
              <Text style={[styles.sectionLabel, { color: C.textSecondary }]}>{t("admin.staffAssignment")}</Text>
              <Pressable onPress={() => setShowAssign(!showAssign)}>
                <Text style={[styles.addLink, { color: C.primary }]}>+ {t("admin.assignStaff")}</Text>
              </Pressable>
            </View>

            {showAssign && (
              <View style={[styles.addForm, { backgroundColor: C.inputBg, borderColor: C.border }]}>
                <Input
                  label={t("admin.userId")}
                  value={assignUserId}
                  onChangeText={setAssignUserId}
                  placeholder={t("admin.userIdPlaceholder")}
                />
                <View style={styles.sheetActions}>
                  <Button title={t("common.cancel")} onPress={() => { setShowAssign(false); setAssignUserId(""); }} variant="secondary" size="sm" />
                  <Button title={t("admin.assignStaff")} onPress={handleAssign} variant="primary" size="sm" loading={assignUser.isPending} />
                </View>
              </View>
            )}

            <Text style={[styles.sectionLabel, { color: C.textSecondary, marginTop: 8 }]}>{t("admin.currentInventory")}</Text>
            {invLoading ? (
              <Loading label={t("common.loading")} />
            ) : inventoryItems.length === 0 ? (
              <Text style={[styles.emptyText, { color: C.textMuted }]}>{t("admin.noInventory")}</Text>
            ) : (
              <View style={{ gap: 8 }}>
                {inventoryItems.map((item, idx) => (
                  <Card key={idx} padding={12}>
                    <View style={styles.invRow}>
                      <Text style={[styles.invProduct, { color: C.text, flex: 1 }]}>{item.product?.name ?? item.productId}</Text>
                      <View style={{ alignItems: "flex-end" }}>
                        <Text style={[styles.invQty, { color: item.quantityOnHand <= item.restockTrigger ? C.danger : C.text }]}>
                          {item.quantityOnHand} {t("warehouse.units")}
                        </Text>
                        {item.quantityOnHand <= item.restockTrigger && (
                          <Text style={[styles.lowStockLabel, { color: C.danger }]}>{t("warehouse.lowStockAlert")}</Text>
                        )}
                      </View>
                    </View>
                  </Card>
                ))}
              </View>
            )}

            <View style={[styles.staffNote, { backgroundColor: C.inputBg, borderRadius: 12 }]}>
              <Feather name="info" size={14} color={C.textMuted} />
              <Text style={[styles.staffNoteText, { color: C.textMuted }]}>{t("admin.staffAssignNote")}</Text>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 },
  title: { fontSize: 26, fontFamily: "Inter_700Bold" },
  merchantRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  merchantIcon: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  merchantName: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  merchantEmail: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  commRate: { fontSize: 16, fontFamily: "Inter_700Bold" },
  locCount: { fontSize: 12, fontFamily: "Inter_400Regular" },
  overlay: { flex: 1, justifyContent: "flex-end" },
  sheet: { maxHeight: "80%", borderTopLeftRadius: 24, borderTopRightRadius: 24 },
  largeSheet: { height: "90%", borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, gap: 16 },
  sheetTitle: { fontSize: 20, fontFamily: "Inter_700Bold" },
  sheetActions: { flexDirection: "row", gap: 12 },
  sheetHeader: { flexDirection: "row", alignItems: "center", gap: 12 },
  backBtn: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  sectionRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  sectionLabel: { fontSize: 12, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", letterSpacing: 0.8 },
  addLink: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  addForm: { borderRadius: 12, padding: 16, gap: 12, borderWidth: 1 },
  locationRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  locationIcon: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  locationName: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  locationStatus: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2 },
  deactivateBtn: { width: 28, height: 28, borderRadius: 8, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  invRow: { flexDirection: "row", alignItems: "center" },
  invProduct: { fontSize: 13, fontFamily: "Inter_500Medium" },
  invQty: { fontSize: 14, fontFamily: "Inter_700Bold" },
  lowStockLabel: { fontSize: 10, fontFamily: "Inter_500Medium" },
  staffNote: { flexDirection: "row", gap: 8, padding: 12, alignItems: "flex-start" },
  staffNoteText: { fontSize: 12, fontFamily: "Inter_400Regular", flex: 1 },
  emptyText: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center", paddingVertical: 16 },
  label: { fontSize: 12, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 4 },
  eventOption: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 12, borderRadius: 10, borderWidth: 1.5 },
  typeBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 100 },
  typeBadgeText: { fontSize: 11, fontFamily: "Inter_500Medium" },
  typeOption: { padding: 12, borderRadius: 10, borderWidth: 1.5, alignItems: "center" },
  typeOptionText: { fontSize: 13, fontFamily: "Inter_500Medium", textAlign: "center" },
});
