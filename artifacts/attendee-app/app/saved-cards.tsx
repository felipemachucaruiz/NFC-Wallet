import { useColorScheme } from "@/hooks/useColorScheme";
import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  Image,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";
import { Card } from "@/components/ui/Card";
import { useSavedCards, useUpdateCardAlias, useDeleteCard, type SavedCard } from "@/hooks/useAttendeeApi";

type CardBrand = "visa" | "mastercard" | "amex" | null;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const CARD_LOGOS: Record<NonNullable<CardBrand>, any> = {
  visa: require("@/assets/images/card-visa.png"),
  mastercard: require("@/assets/images/card-mastercard.png"),
  amex: require("@/assets/images/card-amex.png"),
};

function detectBrand(brand: string): CardBrand {
  const b = brand.toLowerCase();
  if (b === "visa") return "visa";
  if (b === "mastercard") return "mastercard";
  if (b === "amex" || b === "american express") return "amex";
  return null;
}

function brandLabel(brand: string): string {
  switch (brand.toLowerCase()) {
    case "visa": return "Visa";
    case "mastercard": return "Mastercard";
    case "amex": return "American Express";
    default: return brand;
  }
}

function CardLogo({ brand }: { brand: string }) {
  const b = detectBrand(brand);
  if (!b) return <Feather name="credit-card" size={28} color="#888" />;
  return <Image source={CARD_LOGOS[b]} style={{ width: 44, height: 28 }} resizeMode="contain" />;
}

export default function SavedCardsScreen() {
  const scheme = useColorScheme();
  const C = scheme === "dark" ? Colors.dark : Colors.light;
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";

  const { data, isPending, isError, refetch } = useSavedCards();
  const cards = data?.cards ?? [];

  const updateAlias = useUpdateCardAlias();
  const deleteCard = useDeleteCard();

  const [editingCard, setEditingCard] = useState<SavedCard | null>(null);
  const [editAlias, setEditAlias] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const handleEditOpen = (card: SavedCard) => {
    setEditingCard(card);
    setEditAlias(card.alias ?? "");
  };

  const handleEditSave = async () => {
    if (!editingCard) return;
    await updateAlias.mutateAsync({
      id: editingCard.id,
      alias: editAlias.trim() || null,
    });
    setEditingCard(null);
  };

  const handleDelete = (card: SavedCard) => {
    if (Platform.OS === "web") {
      setConfirmDeleteId(card.id);
    } else {
      Alert.alert(
        "Eliminar tarjeta",
        `¿Eliminar ${brandLabel(card.brand)} •••• ${card.lastFour}?`,
        [
          { text: "Cancelar", style: "cancel" },
          {
            text: "Eliminar",
            style: "destructive",
            onPress: () => doDelete(card.id),
          },
        ],
      );
    }
  };

  const doDelete = async (id: string) => {
    setDeletingId(id);
    try {
      await deleteCard.mutateAsync(id);
    } finally {
      setDeletingId(null);
      setConfirmDeleteId(null);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: C.background, paddingTop: isWeb ? 67 : insets.top + 8 }]}>
      <View style={[styles.header, { paddingHorizontal: 20 }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color={C.text} />
        </Pressable>
        <Text style={[styles.title, { color: C.text }]}>Tarjetas guardadas</Text>
        <View style={{ width: 30 }} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 24 }]}
        keyboardShouldPersistTaps="handled"
      >
        {isPending ? (
          <ActivityIndicator color={C.primary} style={{ marginTop: 40 }} />
        ) : isError ? (
          <View style={[styles.emptyBox, { backgroundColor: C.card, borderColor: C.border }]}>
            <Feather name="alert-circle" size={24} color={C.danger} />
            <Text style={[styles.emptyText, { color: C.textMuted }]}>Error al cargar tarjetas</Text>
            <Pressable onPress={() => refetch()} style={[styles.retryBtn, { backgroundColor: C.primaryLight, borderColor: C.primary }]}>
              <Text style={[styles.retryText, { color: C.primary }]}>Reintentar</Text>
            </Pressable>
          </View>
        ) : cards.length === 0 ? (
          <View style={[styles.emptyBox, { backgroundColor: C.card, borderColor: C.border }]}>
            <Feather name="credit-card" size={28} color={C.textMuted} />
            <Text style={[styles.emptyText, { color: C.textMuted }]}>
              No tienes tarjetas guardadas
            </Text>
            <Text style={[styles.emptyHint, { color: C.textMuted }]}>
              Guarda una tarjeta al hacer un pago con tarjeta de crédito o débito.
            </Text>
          </View>
        ) : (
          <View style={{ gap: 12 }}>
            {cards.map((card) => (
              <Card key={card.id} style={{ gap: 12 }}>
                <View style={styles.cardRow}>
                  <CardLogo brand={card.brand} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.cardTitle, { color: C.text }]}>
                      {card.alias || brandLabel(card.brand)} •••• {card.lastFour}
                    </Text>
                    <Text style={[styles.cardSub, { color: C.textSecondary }]}>
                      {card.cardHolderName} · {card.expiryMonth}/{card.expiryYear}
                    </Text>
                  </View>
                </View>

                <View style={styles.cardActions}>
                  <Pressable
                    onPress={() => handleEditOpen(card)}
                    style={[styles.actionBtn, { backgroundColor: C.primaryLight, borderColor: C.primary }]}
                  >
                    <Feather name="edit-2" size={14} color={C.primary} />
                    <Text style={[styles.actionText, { color: C.primary }]}>Alias</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => handleDelete(card)}
                    disabled={deletingId === card.id}
                    style={[styles.actionBtn, { backgroundColor: C.dangerLight, borderColor: C.danger }]}
                  >
                    {deletingId === card.id ? (
                      <ActivityIndicator size="small" color={C.danger} />
                    ) : (
                      <>
                        <Feather name="trash-2" size={14} color={C.danger} />
                        <Text style={[styles.actionText, { color: C.danger }]}>Eliminar</Text>
                      </>
                    )}
                  </Pressable>
                </View>

                {confirmDeleteId === card.id && (
                  <View style={[styles.confirmBox, { backgroundColor: C.dangerLight, borderColor: C.danger }]}>
                    <Text style={[styles.confirmText, { color: C.danger }]}>
                      ¿Eliminar {brandLabel(card.brand)} •••• {card.lastFour}?
                    </Text>
                    <View style={styles.confirmBtns}>
                      <Pressable
                        onPress={() => setConfirmDeleteId(null)}
                        style={[styles.confirmCancelBtn, { backgroundColor: C.card, borderColor: C.border }]}
                      >
                        <Text style={[{ color: C.textSecondary, fontSize: 13, fontFamily: "Inter_600SemiBold" }]}>Cancelar</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => doDelete(card.id)}
                        disabled={deletingId === card.id}
                        style={[styles.confirmDeleteBtn, { backgroundColor: C.danger }]}
                      >
                        <Text style={{ color: "#fff", fontSize: 13, fontFamily: "Inter_600SemiBold" }}>Eliminar</Text>
                      </Pressable>
                    </View>
                  </View>
                )}
              </Card>
            ))}
          </View>
        )}
      </ScrollView>

      <Modal
        visible={editingCard !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setEditingCard(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalBox, { backgroundColor: C.card }]}>
            <Text style={[styles.modalTitle, { color: C.text }]}>Editar alias</Text>
            {editingCard && (
              <Text style={[styles.modalSub, { color: C.textSecondary }]}>
                {brandLabel(editingCard.brand)} •••• {editingCard.lastFour}
              </Text>
            )}
            <TextInput
              value={editAlias}
              onChangeText={setEditAlias}
              placeholder="Ej: Mi Visa personal"
              placeholderTextColor={C.textMuted}
              maxLength={100}
              style={[styles.aliasInput, { backgroundColor: C.inputBg, borderColor: C.border, color: C.text }]}
              autoFocus
            />
            <View style={styles.modalBtns}>
              <Pressable
                onPress={() => setEditingCard(null)}
                style={[styles.modalCancelBtn, { backgroundColor: C.card, borderColor: C.border }]}
              >
                <Text style={[{ color: C.textSecondary, fontFamily: "Inter_600SemiBold", fontSize: 14 }]}>Cancelar</Text>
              </Pressable>
              <Pressable
                onPress={handleEditSave}
                disabled={updateAlias.isPending}
                style={[styles.modalSaveBtn, { backgroundColor: C.primary, opacity: updateAlias.isPending ? 0.7 : 1 }]}
              >
                {updateAlias.isPending ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={{ color: "#fff", fontFamily: "Inter_600SemiBold", fontSize: 14 }}>Guardar</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: 12,
  },
  backBtn: { width: 30 },
  title: { fontSize: 18, fontFamily: "Inter_700Bold", textAlign: "center", flex: 1 },
  scroll: { paddingHorizontal: 20, paddingTop: 16, gap: 0 },
  emptyBox: {
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    padding: 32,
    borderRadius: 16,
    borderWidth: 1,
    marginTop: 24,
  },
  emptyText: { fontSize: 15, fontFamily: "Inter_600SemiBold", textAlign: "center" },
  emptyHint: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center" },
  retryBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    marginTop: 4,
  },
  retryText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  cardRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  cardTitle: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  cardSub: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  cardActions: { flexDirection: "row", gap: 10 },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    flex: 1,
    justifyContent: "center",
  },
  actionText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  confirmBox: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 12,
    gap: 10,
  },
  confirmText: { fontSize: 13, fontFamily: "Inter_600SemiBold", textAlign: "center" },
  confirmBtns: { flexDirection: "row", gap: 8 },
  confirmCancelBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: "center",
  },
  confirmDeleteBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: "center",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  modalBox: {
    width: "100%",
    maxWidth: 360,
    borderRadius: 16,
    padding: 24,
    gap: 14,
  },
  modalTitle: { fontSize: 17, fontFamily: "Inter_700Bold" },
  modalSub: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: -6 },
  aliasInput: {
    borderWidth: 1.5,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
  },
  modalBtns: { flexDirection: "row", gap: 10 },
  modalCancelBtn: {
    flex: 1,
    paddingVertical: 12,
    alignItems: "center",
    borderRadius: 12,
    borderWidth: 1,
  },
  modalSaveBtn: {
    flex: 1,
    paddingVertical: 12,
    alignItems: "center",
    borderRadius: 12,
  },
});
