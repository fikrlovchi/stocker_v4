// Asosiy ekran: skanerlash, buyurtma progressi, natija.
import { useCallback, useEffect, useRef, useState } from "react";
import {
  View, Text, Pressable, StyleSheet, ScrollView, Modal, TextInput, ActivityIndicator, Alert,
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useKeepAwake } from "expo-keep-awake";
import { colors, RESULT_STYLE } from "../theme";
import { buzz } from "../feedback";
import { api } from "../api";

// Kamera bir barcode'ni sekundiga o'nlab marta beradi — bir xil kodni shu
// muddat ichida takror hisoblamaymiz.
const SAME_CODE_COOLDOWN_MS = 2500;
const BANNER_MS = 3500;

const BARCODE_TYPES = ["ean13", "ean8", "upc_a", "upc_e", "code128", "code39", "code93", "itf14", "codabar"];

export default function ScanScreen({ config, onOpenSettings, onOpenPair }) {
  useKeepAwake(); // yig'ish paytida ekran o'chmasin

  const [permission, requestPermission] = useCameraPermissions();
  const [session, setSession] = useState(null);
  const [banner, setBanner] = useState(null);
  const [busy, setBusy] = useState(false);
  const [offline, setOffline] = useState(false);
  const [manual, setManual] = useState("");
  const [manualOpen, setManualOpen] = useState(false);
  const [reprintOpen, setReprintOpen] = useState(false);
  const [jobs, setJobs] = useState([]);

  const lastScan = useRef({ code: null, at: 0 });
  const bannerTimer = useRef(null);

  /* ---------- sessiyani tiklash ---------- */
  // Sessiya SERVERDA saqlanadi — ilova yopilib ochilsa yoki telefon
  // internetni yo'qotib qayta ulansa, yig'ish joyidan davom etadi.
  const refresh = useCallback(async () => {
    try {
      const s = await api.session(config);
      setSession(s.status === "active" ? s : { ...s, closed: true });
      setOffline(false);
    } catch (e) {
      if (e.status === 404) setSession(null);
      else setOffline(Boolean(e.offline));
    }
  }, [config]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => () => clearTimeout(bannerTimer.current), []);

  function showBanner(result, message) {
    const style = RESULT_STYLE[result] || { color: colors.muted, title: result, haptic: "warn" };
    buzz(style.haptic);
    setBanner({ ...style, message });
    clearTimeout(bannerTimer.current);
    bannerTimer.current = setTimeout(() => setBanner(null), BANNER_MS);
  }

  /* ---------- skan ---------- */

  const submit = useCallback(
    async (barcode) => {
      const code = String(barcode || "").trim();
      if (!code || busy) return;

      setBusy(true);
      try {
        const r = await api.scan(config, code);
        setOffline(false);
        showBanner(r.result, r.message);
        if (r.session) setSession(r.result === "order_complete" ? { ...r.session, closed: true } : r.session);
      } catch (e) {
        buzz("err");
        setOffline(Boolean(e.offline));
        setBanner({ color: colors.err, title: e.offline ? "ULANISH YO'Q" : "XATO", message: e.message });
        clearTimeout(bannerTimer.current);
        bannerTimer.current = setTimeout(() => setBanner(null), BANNER_MS);
      } finally {
        setBusy(false);
      }
    },
    [busy, config]
  );

  function onBarcodeScanned({ data }) {
    const code = String(data || "").trim();
    const now = Date.now();
    if (code === lastScan.current.code && now - lastScan.current.at < SAME_CODE_COOLDOWN_MS) return;
    lastScan.current = { code, at: now };
    submit(code);
  }

  /* ---------- amallar ---------- */

  async function cancel() {
    Alert.alert("Sessiyani bekor qilish", `${session?.orderId} yig'ishni to'xtatasizmi?`, [
      { text: "Yo'q", style: "cancel" },
      {
        text: "Ha, bekor qilish",
        style: "destructive",
        onPress: async () => {
          try {
            await api.cancelSession(config, "operator bekor qildi");
            setSession(null);
            setBanner(null);
          } catch (e) {
            Alert.alert("Xato", e.message);
          }
        },
      },
    ]);
  }

  async function openReprint() {
    if (!session?.id) return;
    try {
      const r = await api.jobs(config, session.id);
      setJobs(r.jobs || []);
      setReprintOpen(true);
    } catch (e) {
      Alert.alert("Xato", e.message);
    }
  }

  async function doReprint(jobId) {
    try {
      await api.reprint(config, jobId);
      setReprintOpen(false);
      buzz("ok");
      Alert.alert("Yuborildi", "Yorliq qayta chop etishga yuborildi.");
    } catch (e) {
      Alert.alert("Xato", e.message);
    }
  }

  /* ---------- kamera ruxsati ---------- */

  if (!permission?.granted) {
    return (
      <View style={s.center}>
        <Text style={s.bigTitle}>Kamera ruxsati kerak</Text>
        <Text style={s.sub}>Barcode skanerlash uchun.</Text>
        <Pressable style={s.btn} onPress={requestPermission}>
          <Text style={s.btnText}>Ruxsat berish</Text>
        </Pressable>
        <Pressable style={s.ghost} onPress={() => setManualOpen(true)}>
          <Text style={s.ghostText}>Qo'lda kiritish</Text>
        </Pressable>
      </View>
    );
  }

  const progress = session?.progress;
  const pct = progress?.total ? Math.round((progress.scanned / progress.total) * 100) : 0;

  return (
    <View style={s.wrap}>
      {/* Sarlavha */}
      <View style={s.header}>
        <View>
          <Text style={s.operator}>{config.operator}</Text>
          <Text style={s.station}>
            {config.stationId ? `📍 ${config.stationId}` : "⚠ ish joyi ulanmagan"}
          </Text>
        </View>
        <View style={s.headerBtns}>
          <Pressable style={s.iconBtn} onPress={onOpenPair}>
            <Text style={s.iconText}>QR</Text>
          </Pressable>
          <Pressable style={s.iconBtn} onPress={onOpenSettings}>
            <Text style={s.iconText}>⚙</Text>
          </Pressable>
        </View>
      </View>

      {offline ? <Text style={s.offline}>Serverga ulanib bo'lmayapti — qayta urinilmoqda</Text> : null}

      {/* Kamera */}
      <View style={s.cameraBox}>
        <CameraView
          style={StyleSheet.absoluteFill}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: BARCODE_TYPES }}
          onBarcodeScanned={busy ? undefined : onBarcodeScanned}
        />
        <View style={s.reticle} pointerEvents="none" />
        {busy ? (
          <View style={s.busy}>
            <ActivityIndicator color="#fff" size="large" />
          </View>
        ) : null}
      </View>

      {/* Natija banneri */}
      {banner ? (
        <View style={[s.banner, { backgroundColor: banner.color }]}>
          <Text style={s.bannerTitle}>{banner.title}</Text>
          <Text style={s.bannerMsg}>{banner.message}</Text>
        </View>
      ) : null}

      {/* Sessiya */}
      <ScrollView style={s.body} contentContainerStyle={{ paddingBottom: 24 }}>
        {session ? (
          <View style={s.card}>
            <View style={s.cardHead}>
              <Text style={s.orderId}>{session.orderId}</Text>
              <Text style={[s.progressText, session.closed && { color: colors.done }]}>
                {progress.scanned} / {progress.total}
              </Text>
            </View>

            <View style={s.barTrack}>
              <View
                style={[s.barFill, { width: `${pct}%`, backgroundColor: session.closed ? colors.done : colors.ok }]}
              />
            </View>

            {session.items.map((it) => (
              <View key={it.itemId} style={s.item}>
                <View style={{ flex: 1 }}>
                  <Text style={s.itemName}>{it.mcName || it.skuTitle}</Text>
                  {it.mcName ? <Text style={s.itemSku}>{it.skuTitle}</Text> : null}
                </View>
                <Text style={[s.itemCount, it.remaining === 0 && { color: colors.ok }]}>
                  {it.scanned}/{it.needed}
                </Text>
              </View>
            ))}

            <View style={s.actions}>
              <Pressable style={s.ghostBtn} onPress={openReprint}>
                <Text style={s.ghostBtnText}>Qayta chiqarish</Text>
              </Pressable>
              {!session.closed ? (
                <Pressable style={[s.ghostBtn, s.danger]} onPress={cancel}>
                  <Text style={[s.ghostBtnText, { color: colors.err }]}>Bekor qilish</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        ) : (
          <View style={s.empty}>
            <Text style={s.emptyTitle}>Tovarni skanerlang</Text>
            <Text style={s.emptySub}>Buyurtma avtomatik topiladi</Text>
          </View>
        )}

        <Pressable style={s.manualBtn} onPress={() => setManualOpen(true)}>
          <Text style={s.manualBtnText}>Barcode'ni qo'lda kiritish</Text>
        </Pressable>
      </ScrollView>

      {/* Qo'lda kiritish */}
      <Modal visible={manualOpen} animationType="slide" transparent onRequestClose={() => setManualOpen(false)}>
        <View style={s.modalWrap}>
          <View style={s.modal}>
            <Text style={s.modalTitle}>Barcode</Text>
            <TextInput
              style={s.input}
              value={manual}
              onChangeText={setManual}
              keyboardType="numeric"
              autoFocus
              placeholder="1000076067784"
              placeholderTextColor={colors.muted}
              onSubmitEditing={() => {
                const v = manual;
                setManual("");
                setManualOpen(false);
                submit(v);
              }}
            />
            <View style={s.modalActions}>
              <Pressable style={s.ghostBtn} onPress={() => setManualOpen(false)}>
                <Text style={s.ghostBtnText}>Yopish</Text>
              </Pressable>
              <Pressable
                style={s.btnSmall}
                onPress={() => {
                  const v = manual;
                  setManual("");
                  setManualOpen(false);
                  submit(v);
                }}
              >
                <Text style={s.btnText}>Yuborish</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Qayta chiqarish */}
      <Modal visible={reprintOpen} animationType="slide" transparent onRequestClose={() => setReprintOpen(false)}>
        <View style={s.modalWrap}>
          <View style={s.modal}>
            <Text style={s.modalTitle}>Qaysi yorliq qayta chiqsin?</Text>
            <ScrollView style={{ maxHeight: 320 }}>
              {jobs.length === 0 ? <Text style={s.sub}>Bu sessiyada yorliq yo'q</Text> : null}
              {jobs.map((j) => (
                <Pressable key={j.id} style={s.jobRow} onPress={() => doReprint(j.id)}>
                  <Text style={s.jobText}>
                    {j.target === "big" ? "BIG" : "ShK"}
                    {j.copies > 1 ? ` ×${j.copies}` : ""} · {j.orderId}
                  </Text>
                  <Text style={s.jobStatus}>{j.status}</Text>
                </Pressable>
              ))}
            </ScrollView>
            <Pressable style={s.ghostBtn} onPress={() => setReprintOpen(false)}>
              <Text style={s.ghostBtnText}>Yopish</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, backgroundColor: colors.bg, alignItems: "center", justifyContent: "center", padding: 28 },

  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 18,
    paddingTop: 52,
    paddingBottom: 12,
  },
  operator: { color: colors.text, fontSize: 18, fontWeight: "600" },
  station: { color: colors.muted, fontSize: 13, marginTop: 2 },
  headerBtns: { flexDirection: "row", gap: 8 },
  iconBtn: {
    backgroundColor: colors.panel,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderWidth: 1,
    borderColor: colors.line,
  },
  iconText: { color: colors.text, fontSize: 15 },

  offline: {
    backgroundColor: colors.warn,
    color: "#fff",
    textAlign: "center",
    paddingVertical: 7,
    fontSize: 13,
    fontWeight: "600",
  },

  cameraBox: { height: 230, backgroundColor: "#000", overflow: "hidden" },
  reticle: {
    position: "absolute",
    alignSelf: "center",
    top: 30,
    width: 220,
    height: 170,
    borderWidth: 3,
    borderColor: "rgba(255,255,255,0.75)",
    borderRadius: 14,
  },
  busy: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.45)", alignItems: "center", justifyContent: "center" },

  banner: { paddingVertical: 16, paddingHorizontal: 18 },
  bannerTitle: { color: "#fff", fontSize: 22, fontWeight: "800", letterSpacing: 0.5 },
  bannerMsg: { color: "rgba(255,255,255,0.92)", fontSize: 15, marginTop: 4 },

  body: { flex: 1 },
  card: { margin: 16, backgroundColor: colors.panel, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: colors.line },
  cardHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" },
  orderId: { color: colors.text, fontSize: 26, fontWeight: "700" },
  progressText: { color: colors.text, fontSize: 22, fontWeight: "700" },
  barTrack: { height: 8, backgroundColor: colors.line, borderRadius: 4, marginTop: 12, overflow: "hidden" },
  barFill: { height: 8, borderRadius: 4 },

  item: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  itemName: { color: colors.text, fontSize: 16 },
  itemSku: { color: colors.muted, fontSize: 12, marginTop: 2 },
  itemCount: { color: colors.muted, fontSize: 17, fontWeight: "700", marginLeft: 12 },

  actions: { flexDirection: "row", gap: 10, marginTop: 16 },
  ghostBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: "center",
  },
  ghostBtnText: { color: colors.text, fontSize: 15, fontWeight: "600" },
  danger: { borderColor: colors.err },

  empty: { alignItems: "center", paddingVertical: 44 },
  emptyTitle: { color: colors.text, fontSize: 21, fontWeight: "600" },
  emptySub: { color: colors.muted, fontSize: 15, marginTop: 6 },

  manualBtn: { alignItems: "center", paddingVertical: 14 },
  manualBtnText: { color: colors.muted, fontSize: 15, textDecorationLine: "underline" },

  modalWrap: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  modal: { backgroundColor: colors.panel, borderTopLeftRadius: 18, borderTopRightRadius: 18, padding: 20, paddingBottom: 34 },
  modalTitle: { color: colors.text, fontSize: 19, fontWeight: "700", marginBottom: 14 },
  modalActions: { flexDirection: "row", gap: 10, marginTop: 14 },
  input: {
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 10,
    color: colors.text,
    fontSize: 20,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },

  jobRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  jobText: { color: colors.text, fontSize: 16 },
  jobStatus: { color: colors.muted, fontSize: 13 },

  bigTitle: { color: colors.text, fontSize: 24, fontWeight: "700", textAlign: "center" },
  sub: { color: colors.muted, fontSize: 15, textAlign: "center", marginTop: 8 },
  btn: { backgroundColor: colors.accent, borderRadius: 10, paddingVertical: 15, paddingHorizontal: 32, marginTop: 24 },
  btnSmall: { flex: 1, backgroundColor: colors.accent, borderRadius: 10, paddingVertical: 13, alignItems: "center" },
  btnText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  ghost: { marginTop: 18, paddingVertical: 12 },
  ghostText: { color: colors.muted, fontSize: 15, textDecorationLine: "underline" },
});
