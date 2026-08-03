// Ish joyini ulash: desktop client ko'rsatgan QR skanerlanadi.
// QR ichida {"srv": "<server>", "station": "<id>"} bo'ladi (desktop/src/main.js).
import { useState } from "react";
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { colors } from "../theme";
import { buzz } from "../feedback";

export default function PairScreen({ config, onPaired, onSkip }) {
  const [permission, requestPermission] = useCameraPermissions();
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  function handleScan({ data }) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const parsed = JSON.parse(String(data));
      if (!parsed.station) throw new Error("QR ichida ish joyi kodi yo'q");
      buzz("ok");
      // Server manzili QR'dan kelsa uni ham qabul qilamiz — desktop client
      // va telefon bir xil manzilga qarashi kerak.
      onPaired({ stationId: String(parsed.station), serverUrl: parsed.srv || config.serverUrl });
    } catch (e) {
      buzz("err");
      setError("Bu QR ish joyiniki emas. Desktop ilovadagi 'Telefonni ulash' QR'ini skanerlang.");
      setTimeout(() => setBusy(false), 1200);
    }
  }

  if (!permission) {
    return (
      <View style={s.center}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={s.center}>
        <Text style={s.title}>Kamera ruxsati kerak</Text>
        <Text style={s.sub}>QR va barcode skanerlash uchun.</Text>
        <Pressable style={s.btn} onPress={requestPermission}>
          <Text style={s.btnText}>Ruxsat berish</Text>
        </Pressable>
        <Pressable style={s.ghost} onPress={onSkip}>
          <Text style={s.ghostText}>Keyinroq</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={s.wrap}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
        onBarcodeScanned={handleScan}
      />
      <View style={s.overlay} pointerEvents="box-none">
        <Text style={s.title}>Ish joyini ulash</Text>
        <Text style={s.sub}>
          Kompyuterdagi Stocker Print ilovasida "Telefonni ulash" tabini oching
          va QR'ni skanerlang.
        </Text>
        <View style={s.frame} />
        {error ? <Text style={s.error}>{error}</Text> : null}
        <Pressable style={s.ghost} onPress={onSkip}>
          <Text style={s.ghostText}>Ish joyisiz davom etish</Text>
        </Pressable>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: "#000" },
  center: { flex: 1, backgroundColor: colors.bg, alignItems: "center", justifyContent: "center", padding: 28 },
  overlay: { flex: 1, padding: 24, paddingTop: 64, justifyContent: "flex-start" },
  title: { color: "#fff", fontSize: 26, fontWeight: "700", textAlign: "center" },
  sub: { color: "#cbd5e1", fontSize: 15, textAlign: "center", marginTop: 10, lineHeight: 21 },
  frame: {
    alignSelf: "center",
    width: 250,
    height: 250,
    borderWidth: 3,
    borderColor: colors.accent,
    borderRadius: 18,
    marginTop: 40,
  },
  error: { color: "#fca5a5", fontSize: 15, textAlign: "center", marginTop: 24, lineHeight: 21 },
  btn: { backgroundColor: colors.accent, borderRadius: 10, paddingVertical: 15, paddingHorizontal: 32, marginTop: 24 },
  btnText: { color: "#fff", fontSize: 17, fontWeight: "600" },
  ghost: { marginTop: "auto", alignItems: "center", paddingVertical: 18 },
  ghostText: { color: "#cbd5e1", fontSize: 16, textDecorationLine: "underline" },
});
