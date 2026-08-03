// Sozlamalar telefonda saqlanadi — har smena boshida qayta kiritish shart emas.
import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "stocker.config";

export const DEFAULT_CONFIG = {
  serverUrl: "https://uzum.fikrlovchi.uz/pack",
  token: "",
  operator: "",
  stationId: "",
};

export async function loadConfig() {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? { ...DEFAULT_CONFIG, ...JSON.parse(raw) } : { ...DEFAULT_CONFIG };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export async function saveConfig(cfg) {
  await AsyncStorage.setItem(KEY, JSON.stringify(cfg));
  return cfg;
}

export function isConfigured(cfg) {
  return Boolean(cfg?.serverUrl && cfg?.token && cfg?.operator);
}
