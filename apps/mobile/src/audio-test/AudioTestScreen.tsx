import * as Sharing from "expo-sharing";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { AppState, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { LoadTestRun, type LoadSummary } from "./loadTest";
import { AudioTestRun, type RunSummary } from "./scenario";
import type { LoopFormat } from "./sounds";
import type { TestLog } from "./testLog";

// The screen of the step 1 test: start a run, lock the phone, listen, and read on return what the
// journal saw. Throwaway UI; the engine and the scenario under it are what step 5 will build on.

const DURATIONS_MIN = [5, 15, 30, 60, 120] as const;
const LOOP_FORMATS: LoopFormat[] = ["alac", "aac"];
const MODES = ["doNotMix", "mixWithOthers"] as const;
type Mode = (typeof MODES)[number];

const REFRESH_MS = 1000;

export function AudioTestScreen({ onClose }: { onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const [durationMin, setDurationMin] = useState<number>(60);
  const [loopFormat, setLoopFormat] = useState<LoopFormat>("alac");
  const [mode, setMode] = useState<Mode>("doNotMix");
  const [lockScreenCard, setLockScreenCard] = useState(true);
  const [loopOnly, setLoopOnly] = useState(false);
  const [summary, setSummary] = useState<RunSummary | null>(null);
  const [loadSummary, setLoadSummary] = useState<LoadSummary | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const runRef = useRef<AudioTestRun | null>(null);
  const loadRef = useRef<LoadTestRun | null>(null);
  /** The journal of whichever test started last: the one the Share button sends. */
  const lastLogRef = useRef<TestLog | null>(null);

  const refresh = useCallback(() => {
    if (runRef.current) setSummary(runRef.current.getSummary());
    if (loadRef.current) setLoadSummary(loadRef.current.getSummary());
  }, []);

  // The screen is redrawn once a second, and only while it is visible: with the phone locked, the
  // JS has better things to do. Coming back to the app refreshes at once.
  useEffect(() => {
    const timer = setInterval(() => {
      if (AppState.currentState === "active") refresh();
    }, REFRESH_MS);
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") refresh();
    });
    return () => {
      clearInterval(timer);
      subscription.remove();
    };
  }, [refresh]);

  // Leaving the screen frees the players and stops the timers.
  useEffect(
    () => () => {
      runRef.current?.dispose();
      runRef.current = null;
      loadRef.current?.stop();
      loadRef.current = null;
    },
    [],
  );

  const running = summary !== null && summary.phase !== "done";
  const loadRunning = loadSummary?.running ?? false;
  const busy = running || loadRunning;
  const cardPossible = mode !== "mixWithOthers";

  const start = () => {
    if (busy) return;
    runRef.current?.dispose();
    setNotice(null);
    const run = new AudioTestRun({
      durationMs: durationMin * 60_000,
      loopFormat,
      loopOnly,
      interruptionMode: mode,
      lockScreenCard: lockScreenCard && cardPossible && !loopOnly,
      lockScreenTitle: t("audioTest.lockScreen.title"),
      lockScreenSubtitle: t("audioTest.lockScreen.subtitle"),
    });
    runRef.current = run;
    lastLogRef.current = run.log;
    setSummary(run.getSummary());
    void run.start().then(refresh);
  };

  const stop = () => {
    runRef.current?.stop("user");
    refresh();
  };

  const resume = () => {
    runRef.current?.resume();
    refresh();
  };

  const toggleLoadTest = () => {
    if (loadRunning) {
      loadRef.current?.stop();
      refresh();
      return;
    }
    if (busy) return;
    setNotice(null);
    const load = new LoadTestRun();
    loadRef.current = load;
    lastLogRef.current = load.log;
    setLoadSummary(load.getSummary());
    void load.start().then(refresh);
  };

  const share = async () => {
    const log = lastLogRef.current;
    if (!log?.uri) {
      setNotice(t("audioTest.noLog"));
      return;
    }
    try {
      await log.flush();
      if (!(await Sharing.isAvailableAsync())) {
        setNotice(t("audioTest.shareUnavailable"));
        return;
      }
      await Sharing.shareAsync(log.uri, { mimeType: "text/plain", UTI: "public.plain-text" });
    } catch {
      setNotice(t("audioTest.shareFailed"));
    }
  };

  const seconds = (ms: number) =>
    t("audioTest.seconds", {
      value: (ms / 1000).toLocaleString(i18n.language, { maximumFractionDigits: 1 }),
    });
  const percent = (level: number | null) =>
    level === null ? t("audioTest.unknown") : t("audioTest.percent", { value: Math.round(level * 100) });

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.title}>{t("audioTest.title")}</Text>
        <Pressable onPress={onClose} hitSlop={12}>
          <Text style={styles.link}>{t("audioTest.back")}</Text>
        </Pressable>
      </View>
      <Text style={styles.intro}>{t("audioTest.intro")}</Text>

      <Options label={t("audioTest.duration")}>
        {DURATIONS_MIN.map((minutes) => (
          <Chip
            key={minutes}
            label={t("audioTest.minutes", { count: minutes })}
            selected={durationMin === minutes}
            disabled={busy}
            onPress={() => setDurationMin(minutes)}
          />
        ))}
      </Options>
      <Options label={t("audioTest.scenario")}>
        <Chip
          label={t("audioTest.scenarioKind.full")}
          selected={!loopOnly}
          disabled={busy}
          onPress={() => setLoopOnly(false)}
        />
        <Chip
          label={t("audioTest.scenarioKind.loopOnly")}
          selected={loopOnly}
          disabled={busy}
          onPress={() => setLoopOnly(true)}
        />
      </Options>
      {loopOnly && <Text style={styles.hint}>{t("audioTest.loopOnlyHint")}</Text>}
      <Options label={t("audioTest.loop")}>
        {LOOP_FORMATS.map((format) => (
          <Chip
            key={format}
            label={t(`audioTest.loopFormat.${format}`)}
            selected={loopFormat === format}
            disabled={busy}
            onPress={() => setLoopFormat(format)}
          />
        ))}
      </Options>
      <Options label={t("audioTest.otherApps")}>
        {MODES.map((value) => (
          <Chip
            key={value}
            label={t(`audioTest.mode.${value}`)}
            selected={mode === value}
            disabled={busy}
            onPress={() => setMode(value)}
          />
        ))}
      </Options>
      <Options label={t("audioTest.lockScreenCard")}>
        <Chip
          label={t("audioTest.yes")}
          selected={lockScreenCard && cardPossible}
          disabled={busy || !cardPossible}
          onPress={() => setLockScreenCard(true)}
        />
        <Chip
          label={t("audioTest.no")}
          selected={!lockScreenCard || !cardPossible}
          disabled={busy || !cardPossible}
          onPress={() => setLockScreenCard(false)}
        />
      </Options>
      {!cardPossible && <Text style={styles.hint}>{t("audioTest.cardNeedsExclusive")}</Text>}

      <View style={styles.actions}>
        {running ? (
          <Button label={t("audioTest.stop")} onPress={stop} primary />
        ) : (
          <Button label={t("audioTest.start")} onPress={start} disabled={busy} primary />
        )}
        <Button
          label={loadRunning ? t("audioTest.stopLoadTest") : t("audioTest.loadTest")}
          onPress={toggleLoadTest}
          disabled={running}
        />
        <Button label={t("audioTest.share")} onPress={() => void share()} />
      </View>
      {notice && <Text style={styles.warning}>{notice}</Text>}

      {summary && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>
            {t(`audioTest.phase.${summary.phase}`)}
            {summary.endReason ? ` (${t(`audioTest.endReason.${summary.endReason}`)})` : ""}
          </Text>
          {summary.paused && (
            <View>
              <Text style={styles.warning}>{t("audioTest.paused")}</Text>
              <Button label={t("audioTest.resume")} onPress={resume} />
            </View>
          )}
          <Row
            label={t("audioTest.elapsed")}
            value={`${clock(summary.elapsedMs)} / ${clock(summary.durationMs)}`}
          />
          {summary.loopDuration > 0 && (
            <Row
              label={t("audioTest.loopPosition")}
              value={`${seconds(summary.loopTime)} / ${seconds(summary.loopDuration)}`}
            />
          )}
          <Row label={t("audioTest.scene")} value={t(`audioTest.sceneKind.${summary.scene}`)} />
          <Row
            label={t("audioTest.maxBeatGap")}
            value={`${seconds(summary.maxBeatGapMs)} ${t("audioTest.expectedBeat")}`}
            alert={summary.maxBeatGapMs > 15_000}
          />
          <Row label={t("audioTest.stalls")} value={String(summary.stalls)} alert={summary.stalls > 0} />
          <Row
            label={t("audioTest.scenes")}
            value={t("audioTest.startedOfAsked", summary.scenes)}
            alert={summary.scenes.started < summary.scenes.asked - 1}
          />
          <Row label={t("audioTest.sceneChanges")} value={String(summary.sceneChanges)} />
          <Row
            label={t("audioTest.oneShots")}
            value={t("audioTest.startedOfAsked", summary.oneShots)}
            alert={summary.oneShots.started < summary.oneShots.asked - 3}
          />
          <Row label={t("audioTest.questDings")} value={String(summary.questDings)} />
          <Row label={t("audioTest.interruptions")} value={String(summary.interruptions)} />
          <Row
            label={t("audioTest.problems")}
            value={String(summary.problemCount)}
            alert={summary.problemCount > 0}
          />
          <Row
            label={t("audioTest.battery")}
            value={`${percent(summary.batteryStart)} → ${
              summary.phase === "done" ? percent(summary.batteryEnd) : "…"
            }`}
          />
          {summary.phase === "done" && (
            <Row label={t("audioTest.postEndBeatGap")} value={seconds(summary.postEndMaxBeatGapMs)} />
          )}
          {summary.lastProblems.map((problem, index) => (
            <Text key={index} style={styles.problem}>
              {problem}
            </Text>
          ))}
        </View>
      )}

      {loadSummary && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>
            {t("audioTest.load.title")} ·{" "}
            {t(loadSummary.running ? "audioTest.phase.playing" : "audioTest.phase.done")}
          </Text>
          <Row
            label={t("audioTest.elapsed")}
            value={`${clock(loadSummary.elapsedMs)} / ${clock(loadSummary.durationMs)}`}
          />
          <Row label={t("audioTest.load.playing")} value={String(loadSummary.playing)} />
          <Row label={t("audioTest.load.replaces")} value={String(loadSummary.replaces)} />
          <Row
            label={t("audioTest.load.maxTickGap")}
            value={seconds(loadSummary.maxTickGapMs)}
            alert={loadSummary.maxTickGapMs > 2000}
          />
          <Row
            label={t("audioTest.problems")}
            value={String(loadSummary.problemCount)}
            alert={loadSummary.problemCount > 0}
          />
          {loadSummary.lastProblems.map((problem, index) => (
            <Text key={index} style={styles.problem}>
              {problem}
            </Text>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

function clock(ms: number): string {
  const total = Math.floor(ms / 1000);
  const minutes = Math.floor(total / 60);
  return `${minutes}:${String(total % 60).padStart(2, "0")}`;
}

function Options({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={styles.options}>
      <Text style={styles.optionsLabel}>{label}</Text>
      <View style={styles.chips}>{children}</View>
    </View>
  );
}

function Chip(props: { label: string; selected: boolean; disabled?: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={props.onPress}
      disabled={props.disabled}
      style={[styles.chip, props.selected && styles.chipSelected, props.disabled && styles.disabled]}
    >
      <Text style={[styles.chipText, props.selected && styles.chipTextSelected]}>{props.label}</Text>
    </Pressable>
  );
}

function Button(props: { label: string; onPress: () => void; disabled?: boolean; primary?: boolean }) {
  return (
    <Pressable
      onPress={props.onPress}
      disabled={props.disabled}
      style={[styles.button, props.primary && styles.buttonPrimary, props.disabled && styles.disabled]}
    >
      <Text style={[styles.buttonText, props.primary && styles.buttonTextPrimary]}>{props.label}</Text>
    </Pressable>
  );
}

function Row({ label, value, alert }: { label: string; value: string; alert?: boolean }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, alert && styles.rowAlert]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#15110d" },
  content: { padding: 20, paddingTop: 64, paddingBottom: 48 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" },
  title: { color: "#f1d9a7", fontSize: 26, fontWeight: "700" },
  link: { color: "#c8913a", fontSize: 16 },
  intro: { color: "#b8a88a", marginTop: 8, marginBottom: 8, lineHeight: 20 },
  options: { marginTop: 14 },
  optionsLabel: { color: "#b8a88a", marginBottom: 6 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#5a4d3a",
  },
  chipSelected: { backgroundColor: "#c8913a", borderColor: "#c8913a" },
  chipText: { color: "#d9c9a8" },
  chipTextSelected: { color: "#15110d", fontWeight: "700" },
  disabled: { opacity: 0.45 },
  hint: { color: "#7d705c", marginTop: 6 },
  actions: { marginTop: 24, gap: 10 },
  button: {
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#5a4d3a",
    alignItems: "center",
  },
  buttonPrimary: { backgroundColor: "#c8913a", borderColor: "#c8913a" },
  buttonText: { color: "#d9c9a8", fontSize: 16 },
  buttonTextPrimary: { color: "#15110d", fontWeight: "700", fontSize: 18 },
  warning: { color: "#e8a35c", marginTop: 10, marginBottom: 8 },
  card: { marginTop: 24, padding: 16, borderRadius: 12, backgroundColor: "#1f1913" },
  cardTitle: { color: "#f1d9a7", fontSize: 18, fontWeight: "700", marginBottom: 8 },
  row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 5, gap: 12 },
  rowLabel: { color: "#b8a88a", flexShrink: 1 },
  rowValue: { color: "#f1e6cf", fontVariant: ["tabular-nums"], textAlign: "right" },
  rowAlert: { color: "#ff7a6b", fontWeight: "700" },
  problem: { color: "#ff7a6b", fontSize: 12, marginTop: 6 },
});
