// Ekranlar oddiy holat bilan almashadi — uchta ekran uchun react-navigation
// ortiqcha bog'liqlik bo'lardi.
import { useEffect, useState } from "react";
import { View, ActivityIndicator, StyleSheet } from "react-native";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { loadConfig, saveConfig, isConfigured } from "./src/storage";
import { colors } from "./src/theme";
import SetupScreen from "./src/screens/SetupScreen";
import PairScreen from "./src/screens/PairScreen";
import ScanScreen from "./src/screens/ScanScreen";

export default function App() {
  const [config, setConfig] = useState(null);
  const [screen, setScreen] = useState("loading");

  useEffect(() => {
    (async () => {
      const cfg = await loadConfig();
      setConfig(cfg);
      if (!isConfigured(cfg)) setScreen("setup");
      else if (!cfg.stationId) setScreen("pair"); // ish joyisiz yorliq chiqmaydi
      else setScreen("scan");
    })();
  }, []);

  async function update(patch, next) {
    const cfg = { ...config, ...patch };
    setConfig(cfg);
    await saveConfig(cfg);
    if (next) setScreen(next);
  }

  if (screen === "loading" || !config) {
    return (
      <View style={s.center}>
        <ActivityIndicator color={colors.accent} size="large" />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      {screen === "setup" ? (
        <SetupScreen
          config={config}
          onSave={(cfg) => update(cfg, cfg.stationId ? "scan" : "pair")}
        />
      ) : screen === "pair" ? (
        <PairScreen
          config={config}
          onPaired={(patch) => update(patch, "scan")}
          onSkip={() => setScreen("scan")}
        />
      ) : (
        <ScanScreen
          config={config}
          onOpenSettings={() => setScreen("setup")}
          onOpenPair={() => setScreen("pair")}
        />
      )}
    </SafeAreaProvider>
  );
}

const s = StyleSheet.create({
  center: { flex: 1, backgroundColor: colors.bg, alignItems: "center", justifyContent: "center" },
});
