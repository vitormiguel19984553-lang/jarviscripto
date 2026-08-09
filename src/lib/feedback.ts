/** Preferências de retorno sensorial (som + vibração) para alertas. */
const KEY = "jarvis-feedback";

export type FeedbackPrefs = { sound: boolean; haptics: boolean };

export const defaultFeedback: FeedbackPrefs = { sound: false, haptics: true };

export function loadFeedback(): FeedbackPrefs {
  if (typeof window === "undefined") return defaultFeedback;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return defaultFeedback;
    return { ...defaultFeedback, ...(JSON.parse(raw) as Partial<FeedbackPrefs>) };
  } catch {
    return defaultFeedback;
  }
}

export function saveFeedback(prefs: FeedbackPrefs) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    /* armazenamento indisponível */
  }
}

type AudioCtor = typeof AudioContext;

function beep(kind: "win" | "loss" | "alert") {
  if (typeof window === "undefined") return;
  const Ctor: AudioCtor | undefined =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: AudioCtor }).webkitAudioContext;
  if (!Ctor) return;
  try {
    const ctx = new Ctor();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const freq = kind === "win" ? 880 : kind === "loss" ? 240 : 560;
    osc.type = "sine";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.16, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.32);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.34);
    osc.onended = () => void ctx.close().catch(() => undefined);
  } catch {
    /* som bloqueado pelo browser */
  }
}

/** Dispara som e vibração conforme as preferências guardadas. */
export function pulseFeedback(kind: "win" | "loss" | "alert", prefs = loadFeedback()) {
  if (prefs.sound) beep(kind);
  if (prefs.haptics && typeof navigator !== "undefined" && "vibrate" in navigator) {
    const pattern = kind === "win" ? [18] : kind === "loss" ? [30, 60, 30] : [12, 40, 12];
    try {
      navigator.vibrate(pattern);
    } catch {
      /* vibração indisponível */
    }
  }
}
