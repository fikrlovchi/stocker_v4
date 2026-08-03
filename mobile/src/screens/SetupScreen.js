// Sozlash: server, kalit, operator ismi.
// 8-fazada bu ekran login (foydalanuvchi nomi + parol) bilan almashadi —
// kalit o'rniga JWT olinadi. Ekranlar tuzilishi o'zgarmaydi.
import { useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView, ActivityIndicator } from "react-native";
import { colors } from "../theme";
import { api } from "../api";

export default function SetupScreen({ config, onSave }) {
  const [form, setForm] = useState({ ...config });
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState(null);

  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  async function save() {
    setError(null);
    if (!form.serverUrl.trim() || !form.token.trim() || !form.operator.trim()) {
      return setError("Uchala maydon ham to'ldirilishi kerak");
    }
    setChecking(true);
    try {
      // Saqlashdan oldin ulanishni tekshiramiz — noto'g'ri sozlama bilan
      // skan ekraniga o'tib, keyin har skanda xato ko'rgandan yaxshiroq.
      const cfg = {
        ...form,
        serverUrl: form.serverUrl.trim().replace(/\/$/, ""),
        token: form.token.trim(),
        operator: form.operator.trim(),
      };
      await api.health(cfg);
      await onSave(cfg);
    } catch (e) {
      setError(e.message);
    } finally {
      setChecking(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={s.wrap} keyboardShouldPersistTaps="handled">
      <Text style={s.title}>Stocker</Text>
      <Text style={s.sub}>Yig'ish ilovasi — sozlash</Text>

      <Text style={s.label}>Server manzili</Text>
      <TextInput
        style={s.input}
        value={form.serverUrl}
        onChangeText={set("serverUrl")}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        placeholder="https://uzum.fikrlovchi.uz/pack"
        placeholderTextColor={colors.muted}
      />

      <Text style={s.label}>Kalit</Text>
      <TextInput
        style={s.input}
        value={form.token}
        onChangeText={set("token")}
        autoCapitalize="none"
        autoCorrect={false}
        secureTextEntry
        placeholder="serverdagi SERVICE_TOKEN"
        placeholderTextColor={colors.muted}
      />

      <Text style={s.label}>Operator</Text>
      <TextInput
        style={s.input}
        value={form.operator}
        onChangeText={set("operator")}
        autoCapitalize="none"
        autoCorrect={false}
        placeholder="ismingiz (masalan: aziz)"
        placeholderTextColor={colors.muted}
      />

      {error ? <Text style={s.error}>{error}</Text> : null}

      <Pressable style={[s.btn, checking && s.btnDisabled]} onPress={save} disabled={checking}>
        {checking ? <ActivityIndicator color="#fff" /> : <Text style={s.btnText}>Tekshirish va saqlash</Text>}
      </Pressable>

      <Text style={s.hint}>
        Ish joyi (printer) keyingi ekranda QR orqali ulanadi. Ulanmasa yorliqlar
        navbatda kutib qoladi.
      </Text>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  wrap: { padding: 24, paddingTop: 64, backgroundColor: colors.bg, flexGrow: 1 },
  title: { color: colors.text, fontSize: 34, fontWeight: "700" },
  sub: { color: colors.muted, fontSize: 15, marginBottom: 28 },
  label: { color: colors.muted, fontSize: 13, marginBottom: 6, marginTop: 16 },
  input: {
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 10,
    color: colors.text,
    fontSize: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  error: { color: colors.err, marginTop: 18, fontSize: 15 },
  btn: {
    backgroundColor: colors.accent,
    borderRadius: 10,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 28,
  },
  btnDisabled: { opacity: 0.6 },
  btnText: { color: "#fff", fontSize: 17, fontWeight: "600" },
  hint: { color: colors.muted, fontSize: 13, marginTop: 24, lineHeight: 19 },
});
