import "./src/i18n";
import { StatusBar } from "expo-status-bar";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { AudioTestScreen } from "./src/audio-test/AudioTestScreen";

// A placeholder home screen: the real one (adventure, playback, morning summary) comes later.
// No router yet: the audio test of step 1 is the only other screen.
export default function App() {
  const { t } = useTranslation();
  const [audioTestOpen, setAudioTestOpen] = useState(false);

  if (audioTestOpen) {
    return (
      <>
        <AudioTestScreen onClose={() => setAudioTestOpen(false)} />
        <StatusBar style="light" />
      </>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{t("home.title")}</Text>
      <Text style={styles.subtitle}>{t("home.subtitle")}</Text>
      <Pressable style={styles.button} disabled>
        <Text style={styles.buttonText}>{t("home.adventure")}</Text>
      </Pressable>
      <Text style={styles.hint}>{t("home.comingSoon")}</Text>
      <Pressable style={styles.secondaryButton} onPress={() => setAudioTestOpen(true)}>
        <Text style={styles.secondaryButtonText}>{t("home.audioTest")}</Text>
      </Pressable>
      <StatusBar style="light" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#15110d",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  title: { color: "#f1d9a7", fontSize: 32, fontWeight: "700" },
  subtitle: { color: "#b8a88a", fontSize: 16, marginTop: 8, textAlign: "center" },
  button: {
    marginTop: 48,
    paddingVertical: 18,
    paddingHorizontal: 56,
    borderRadius: 999,
    backgroundColor: "#c8913a",
    opacity: 0.5,
  },
  buttonText: { color: "#15110d", fontSize: 20, fontWeight: "700" },
  hint: { color: "#7d705c", marginTop: 12 },
  secondaryButton: {
    marginTop: 40,
    paddingVertical: 12,
    paddingHorizontal: 32,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#5a4d3a",
  },
  secondaryButtonText: { color: "#d9c9a8", fontSize: 16 },
});
