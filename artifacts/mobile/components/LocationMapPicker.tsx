import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  ActivityIndicator,
  Keyboard,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import * as Location from "expo-location";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useColorScheme } from "@/hooks/useColorScheme";
import Colors from "@/constants/colors";
import Constants from "expo-constants";
import MapView, { Marker, Region } from "react-native-maps";
import { GooglePlacesAutocomplete } from "react-native-google-places-autocomplete";

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
const DELTA = 0.01;

const GOOGLE_MAPS_API_KEY: string =
  (Constants.expoConfig?.extra as { googleMapsApiKey?: string } | undefined)
    ?.googleMapsApiKey ?? "";

export function LocationMapPicker({
  visible,
  initialLatitude,
  initialLongitude,
  onConfirm,
  onClose,
}: Props) {
  const { t } = useTranslation();
  const scheme = useColorScheme();
  const C = scheme === "dark" ? Colors.dark : Colors.light;
  const insets = useSafeAreaInsets();

  const initLat = initialLatitude ?? DEFAULT_LAT;
  const initLng = initialLongitude ?? DEFAULT_LNG;

  const [region, setRegion] = useState<Region>({
    latitude: initLat,
    longitude: initLng,
    latitudeDelta: DELTA,
    longitudeDelta: DELTA,
  });
  const [pinCoord, setPinCoord] = useState({ latitude: initLat, longitude: initLng });
  const [address, setAddress] = useState("");
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState("");

  const mapRef = useRef<MapView>(null);

  useEffect(() => {
    if (visible) {
      const lat = initialLatitude ?? DEFAULT_LAT;
      const lng = initialLongitude ?? DEFAULT_LNG;
      setRegion({ latitude: lat, longitude: lng, latitudeDelta: DELTA, longitudeDelta: DELTA });
      setPinCoord({ latitude: lat, longitude: lng });
      setAddress("");
      setError("");
    }
  }, [visible, initialLatitude, initialLongitude]);

  const animateTo = useCallback((lat: number, lng: number) => {
    const newRegion: Region = { latitude: lat, longitude: lng, latitudeDelta: DELTA, longitudeDelta: DELTA };
    setRegion(newRegion);
    setPinCoord({ latitude: lat, longitude: lng });
    mapRef.current?.animateToRegion(newRegion, 400);
  }, []);

  const handleUseCurrentLocation = useCallback(async () => {
    setLocating(true);
    setError("");
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        setError(t("admin.locationPermissionDenied"));
        setLocating(false);
        return;
      }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      animateTo(loc.coords.latitude, loc.coords.longitude);
      setAddress("");
    } catch {
      setError(t("admin.locationError"));
    }
    setLocating(false);
  }, [t, animateTo]);

  const handleConfirm = useCallback(() => {
    Keyboard.dismiss();
    onConfirm({
      address: address.trim() || `${pinCoord.latitude.toFixed(6)}, ${pinCoord.longitude.toFixed(6)}`,
      latitude: pinCoord.latitude,
      longitude: pinCoord.longitude,
    });
  }, [pinCoord, address, onConfirm]);

  if (!GOOGLE_MAPS_API_KEY) {
    return (
      <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
        <View style={[styles.container, { backgroundColor: C.background }]}>
          <View style={[styles.header, { backgroundColor: C.card, paddingTop: insets.top + 8, borderBottomColor: C.border }]}>
            <Pressable onPress={onClose} style={styles.closeBtn} hitSlop={12}>
              <Feather name="x" size={22} color={C.textSecondary} />
            </Pressable>
            <Text style={[styles.headerTitle, { color: C.text }]}>{t("admin.locationPickerTitle")}</Text>
            <View style={{ width: 34 }} />
          </View>
          <View style={styles.missingKeyContainer}>
            <Feather name="alert-triangle" size={32} color={C.warning} />
            <Text style={[styles.missingKeyTitle, { color: C.text }]}>
              {t("admin.mapsApiKeyMissingTitle")}
            </Text>
            <Text style={[styles.missingKeyText, { color: C.textSecondary }]}>
              {t("admin.mapsApiKeyMissingBody")}
            </Text>
          </View>
        </View>
      </Modal>
    );
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[styles.container, { backgroundColor: C.background }]}>

        {/* Header */}
        <View style={[styles.header, { backgroundColor: C.card, paddingTop: insets.top + 8, borderBottomColor: C.border }]}>
          <Pressable onPress={onClose} style={styles.closeBtn} hitSlop={12}>
            <Feather name="x" size={22} color={C.textSecondary} />
          </Pressable>
          <Text style={[styles.headerTitle, { color: C.text }]}>{t("admin.locationPickerTitle")}</Text>
          <View style={{ width: 34 }} />
        </View>

        {/* Places autocomplete search */}
        <View style={[styles.searchContainer, { backgroundColor: C.card, borderBottomColor: C.border }]}>
          <GooglePlacesAutocomplete
            placeholder={t("admin.searchVenuePlaceholder") || "Search for a venue or address…"}
            onPress={(data, details) => {
              if (!details?.geometry?.location) return;
              const { lat, lng } = details.geometry.location;
              animateTo(lat, lng);
              setAddress(data.description);
            }}
            query={{
              key: GOOGLE_MAPS_API_KEY,
              language: "es",
            }}
            fetchDetails
            enablePoweredByContainer={false}
            keepResultsAfterBlur={false}
            keyboardShouldPersistTaps="handled"
            styles={{
              container: { flex: 0 },
              textInputContainer: {
                backgroundColor: "transparent",
                paddingHorizontal: 0,
              },
              textInput: {
                height: 44,
                borderRadius: 10,
                borderWidth: 1,
                borderColor: C.border,
                backgroundColor: C.inputBg,
                color: C.text,
                paddingHorizontal: 14,
                fontSize: 14,
                fontFamily: "Inter_400Regular",
                marginBottom: 0,
              },
              listView: {
                backgroundColor: C.card,
                borderRadius: 10,
                borderWidth: 1,
                borderColor: C.border,
                marginTop: 4,
                zIndex: 9999,
              },
              row: {
                backgroundColor: C.card,
                padding: 12,
              },
              description: {
                color: C.text,
                fontSize: 13,
                fontFamily: "Inter_400Regular",
              },
              separator: {
                backgroundColor: C.border,
                height: StyleSheet.hairlineWidth,
              },
            }}
          />
        </View>

        {/* Map */}
        <MapView
          ref={mapRef}
          style={styles.map}
          provider="google"
          region={region}
          onRegionChangeComplete={setRegion}
          showsUserLocation={false}
          showsMyLocationButton={false}
          toolbarEnabled={false}
        >
          <Marker
            coordinate={pinCoord}
            draggable
            onDragEnd={(e) => {
              const { latitude, longitude } = e.nativeEvent.coordinate;
              setPinCoord({ latitude, longitude });
              setRegion((r) => ({ ...r, latitude, longitude }));
            }}
            pinColor={C.primary}
          />
        </MapView>

        {/* GPS button over map */}
        <TouchableOpacity
          style={[styles.gpsButton, { backgroundColor: C.card, borderColor: C.border }]}
          onPress={handleUseCurrentLocation}
          disabled={locating}
          activeOpacity={0.8}
        >
          {locating ? (
            <ActivityIndicator size="small" color={C.primary} />
          ) : (
            <Feather name="navigation" size={20} color={C.primary} />
          )}
        </TouchableOpacity>

        {/* Coords display + error */}
        <View style={[styles.coordsBar, { backgroundColor: C.card, borderTopColor: C.border }]}>
          {!!error && (
            <View style={[styles.errorRow, { backgroundColor: C.dangerLight, borderColor: C.danger }]}>
              <Feather name="alert-circle" size={13} color={C.danger} />
              <Text style={[styles.errorText, { color: C.danger }]}>{error}</Text>
            </View>
          )}
          <View style={styles.coordsRow}>
            <View style={styles.coordItem}>
              <Text style={[styles.coordLabel, { color: C.textMuted }]}>LAT</Text>
              <Text style={[styles.coordValue, { color: C.text }]}>{pinCoord.latitude.toFixed(6)}</Text>
            </View>
            <View style={[styles.coordDivider, { backgroundColor: C.border }]} />
            <View style={styles.coordItem}>
              <Text style={[styles.coordLabel, { color: C.textMuted }]}>LNG</Text>
              <Text style={[styles.coordValue, { color: C.text }]}>{pinCoord.longitude.toFixed(6)}</Text>
            </View>
          </View>
        </View>

        {/* Confirm footer */}
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
  searchContainer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    zIndex: 100,
  },
  map: { flex: 1 },
  gpsButton: {
    position: "absolute",
    bottom: 180,
    right: 16,
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
  },
  coordsBar: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  coordsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
  },
  coordItem: {
    flex: 1,
    alignItems: "center",
    gap: 2,
  },
  coordLabel: {
    fontSize: 10,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  coordValue: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
  coordDivider: {
    width: StyleSheet.hairlineWidth,
    height: 28,
  },
  errorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 8,
  },
  errorText: { flex: 1, fontSize: 12, fontFamily: "Inter_400Regular" },
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
  missingKeyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
    gap: 16,
  },
  missingKeyTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold", textAlign: "center" },
  missingKeyText: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 22 },
});
