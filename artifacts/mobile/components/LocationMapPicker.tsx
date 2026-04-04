import React, { useRef, useState, useCallback, useEffect } from "react";
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import MapView, { Marker, Region } from "react-native-maps";
import { GooglePlacesAutocomplete } from "react-native-google-places-autocomplete";
import { Feather } from "@expo/vector-icons";
import * as Location from "expo-location";
import Constants from "expo-constants";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useColorScheme } from "@/hooks/useColorScheme";
import Colors from "@/constants/colors";

const GOOGLE_MAPS_API_KEY: string =
  (Constants.expoConfig?.extra?.googleMapsApiKey as string) ?? "";

export type LocationResult = {
  address: string;
  latitude: number;
  longitude: number;
};

type Props = {
  visible: boolean;
  initialLatitude?: number | null;
  initialLongitude?: number | null;
  onConfirm: (result: LocationResult) => void;
  onClose: () => void;
};

const DEFAULT_LAT = 4.711;
const DEFAULT_LNG = -74.0721;

export function LocationMapPicker({ visible, initialLatitude, initialLongitude, onConfirm, onClose }: Props) {
  const { t } = useTranslation();
  const scheme = useColorScheme();
  const C = scheme === "dark" ? Colors.dark : Colors.light;
  const insets = useSafeAreaInsets();

  const mapRef = useRef<MapView>(null);

  const [pin, setPin] = useState<{ lat: number; lng: number }>({
    lat: initialLatitude ?? DEFAULT_LAT,
    lng: initialLongitude ?? DEFAULT_LNG,
  });
  const [address, setAddress] = useState<string>("");
  const [locating, setLocating] = useState(false);

  // Sync state from props every time the modal opens so editing a different
  // event always starts at its current location instead of stale state.
  useEffect(() => {
    if (visible) {
      const lat = initialLatitude ?? DEFAULT_LAT;
      const lng = initialLongitude ?? DEFAULT_LNG;
      setPin({ lat, lng });
      setAddress("");
      mapRef.current?.animateToRegion(
        { latitude: lat, longitude: lng, latitudeDelta: 0.05, longitudeDelta: 0.05 },
        0
      );
    }
  }, [visible, initialLatitude, initialLongitude]);

  const moveMapTo = useCallback((lat: number, lng: number) => {
    mapRef.current?.animateToRegion(
      { latitude: lat, longitude: lng, latitudeDelta: 0.005, longitudeDelta: 0.005 },
      500
    );
    setPin({ lat, lng });
  }, []);

  const handleUseCurrentLocation = useCallback(async () => {
    setLocating(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        Alert.alert(t("common.error"), t("admin.locationPermissionDenied"));
        setLocating(false);
        return;
      }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      moveMapTo(loc.coords.latitude, loc.coords.longitude);
      setAddress("");
    } catch {
      Alert.alert(t("common.error"), t("admin.locationError"));
    }
    setLocating(false);
  }, [moveMapTo, t]);

  const handleConfirm = useCallback(() => {
    onConfirm({ address, latitude: pin.lat, longitude: pin.lng });
  }, [address, pin, onConfirm]);

  const initialRegion: Region = {
    latitude: initialLatitude ?? DEFAULT_LAT,
    longitude: initialLongitude ?? DEFAULT_LNG,
    latitudeDelta: 0.05,
    longitudeDelta: 0.05,
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[styles.container, { backgroundColor: C.background }]}>
        {/* Header */}
        <View style={[styles.header, { backgroundColor: C.card, paddingTop: insets.top + 8 }]}>
          <Pressable onPress={onClose} style={styles.closeBtn} hitSlop={12}>
            <Feather name="x" size={22} color={C.textSecondary} />
          </Pressable>
          <Text style={[styles.headerTitle, { color: C.text }]}>{t("admin.locationPickerTitle")}</Text>
          <View style={{ width: 34 }} />
        </View>

        {/* Search bar */}
        <View style={[styles.searchWrapper, { backgroundColor: C.card, borderBottomColor: C.border }]}>
          <GooglePlacesAutocomplete
            placeholder={t("admin.searchVenuePlaceholder")}
            fetchDetails
            onPress={(data, details) => {
              const loc = details?.geometry?.location;
              if (loc) {
                moveMapTo(loc.lat, loc.lng);
                setAddress(data.description);
              }
            }}
            query={{
              key: GOOGLE_MAPS_API_KEY,
              language: "en",
            }}
            styles={{
              container: { flex: 0 },
              textInputContainer: {
                backgroundColor: "transparent",
                borderTopWidth: 0,
                borderBottomWidth: 0,
                paddingHorizontal: 4,
              },
              textInput: {
                backgroundColor: C.inputBg,
                color: C.text,
                borderRadius: 10,
                borderWidth: 1,
                borderColor: C.border,
                height: 44,
                fontSize: 14,
                fontFamily: "Inter_400Regular",
                paddingHorizontal: 12,
              },
              listView: {
                backgroundColor: C.card,
                borderColor: C.border,
                borderWidth: 1,
                borderRadius: 10,
                marginHorizontal: 4,
              },
              row: {
                backgroundColor: C.card,
                paddingVertical: 10,
                paddingHorizontal: 12,
              },
              description: {
                color: C.text,
                fontFamily: "Inter_400Regular",
                fontSize: 13,
              },
              separator: {
                backgroundColor: C.border,
                height: StyleSheet.hairlineWidth,
              },
            }}
            enablePoweredByContainer={false}
            keyboardShouldPersistTaps="handled"
          />
        </View>

        {/* Map */}
        <View style={styles.mapContainer}>
          <MapView
            ref={mapRef}
            style={StyleSheet.absoluteFillObject}
            provider="google"
            initialRegion={initialRegion}
            onPress={(e) => {
              const { latitude, longitude } = e.nativeEvent.coordinate;
              setPin({ lat: latitude, lng: longitude });
              setAddress("");
              Keyboard.dismiss();
            }}
          >
            <Marker
              coordinate={{ latitude: pin.lat, longitude: pin.lng }}
              draggable
              onDragEnd={(e) => {
                const { latitude, longitude } = e.nativeEvent.coordinate;
                setPin({ lat: latitude, lng: longitude });
                setAddress("");
              }}
              pinColor="#00C2FF"
            />
          </MapView>

          {/* Current location button */}
          <TouchableOpacity
            style={[styles.locationBtn, { backgroundColor: C.card, borderColor: C.border }]}
            onPress={handleUseCurrentLocation}
            disabled={locating}
          >
            {locating ? (
              <ActivityIndicator size="small" color={C.primary} />
            ) : (
              <Feather name="navigation" size={18} color={C.primary} />
            )}
          </TouchableOpacity>
        </View>

        {/* Coordinates display */}
        <View style={[styles.coordsBar, { backgroundColor: C.card, borderTopColor: C.border }]}>
          <Feather name="map-pin" size={14} color={C.textMuted} />
          <Text style={[styles.coordsText, { color: C.textMuted }]} numberOfLines={1}>
            {pin.lat.toFixed(6)}, {pin.lng.toFixed(6)}
            {address ? `  ·  ${address}` : ""}
          </Text>
        </View>

        {/* Confirm button */}
        <View style={[styles.footer, { backgroundColor: C.card, paddingBottom: insets.bottom + 16, borderTopColor: C.border }]}>
          <TouchableOpacity
            style={[styles.confirmBtn, { backgroundColor: C.primary }]}
            onPress={handleConfirm}
            activeOpacity={0.85}
          >
            <Feather name="check" size={18} color="#0a0a0a" />
            <Text style={styles.confirmText}>{t("admin.confirmLocation")}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  closeBtn: { width: 34, height: 34, alignItems: "center", justifyContent: "center" },
  searchWrapper: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    zIndex: 10,
  },
  mapContainer: { flex: 1 },
  locationBtn: {
    position: "absolute",
    bottom: 16,
    right: 16,
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  coordsBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  coordsText: { fontSize: 12, fontFamily: "Inter_400Regular", flex: 1 },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  confirmBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
  },
  confirmText: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: "#0a0a0a" },
});
