/**
 * Synchronisation du widget Google Translate après contenu injecté côté client.
 */

import { getGoogleTranslatePageLanguage } from "./page-language";

const INDICATOR_ID = "google-translate-rescan-indicator";
const POINTER_TRACKER_KEY = "__fgfGtLastPointer";
const POINTER_SEEN_KEY = "__fgfGtPointerSeen";

type LastPointer = { x: number; y: number };

function pageLang(
  override?: string,
): string {
  return (override ?? getGoogleTranslatePageLanguage()).trim();
}

function getLastPointer(): LastPointer {
  if (typeof window === "undefined") return { x: 0, y: 0 };
  const w = window as unknown as {
    [POINTER_TRACKER_KEY]?: LastPointer;
    [POINTER_SEEN_KEY]?: boolean;
  };
  if (w[POINTER_SEEN_KEY] && w[POINTER_TRACKER_KEY]) {
    return w[POINTER_TRACKER_KEY];
  }
  return { x: Math.floor(window.innerWidth / 2), y: 100 };
}

function ensureGlobalPointerTracking(): void {
  if (typeof window === "undefined") return;
  const w = window as unknown as {
    __fgfGtPointerHook?: boolean;
    [POINTER_TRACKER_KEY]?: LastPointer;
    [POINTER_SEEN_KEY]?: boolean;
  };
  if (w.__fgfGtPointerHook) return;
  w.__fgfGtPointerHook = true;
  const save = (e: MouseEvent) => {
    w[POINTER_SEEN_KEY] = true;
    w[POINTER_TRACKER_KEY] = { x: e.clientX, y: e.clientY };
  };
  window.addEventListener("mousemove", save, { passive: true });
}

export function isGoogleTranslationActive(pageLanguageOverride?: string): boolean {
  if (typeof document === "undefined") return false;
  const pl = pageLang(pageLanguageOverride);
  const m = document.cookie.match(/(?:^|;\s*)googtrans=([^;]*)/);
  if (!m?.[1]) return false;
  const raw = decodeURIComponent(m[1].trim());
  if (!raw) return false;
  const parts = raw.split("/").filter(Boolean);
  if (parts.length < 2) return false;
  const target = parts[1];
  return Boolean(target && target !== pl);
}

function targetLangFromGoogtransCookie(
  pageLanguageOverride?: string,
): string | null {
  if (typeof document === "undefined") return null;
  const pl = pageLang(pageLanguageOverride);
  const m = document.cookie.match(/(?:^|;\s*)googtrans=([^;]*)/);
  if (!m?.[1]) return null;
  const raw = decodeURIComponent(m[1].trim());
  const parts = raw.split("/").filter(Boolean);
  if (parts.length < 2) return null;
  const t = parts[1];
  return t && t !== pl ? t : null;
}

function nudgeReflowAndResize(): void {
  if (typeof document === "undefined") return;
  void document.documentElement.offsetHeight;
  if (document.body) void document.body.offsetHeight;
  window.dispatchEvent(new Event("resize"));
}

function nudgeReflowResizeRafChain(): void {
  nudgeReflowAndResize();
  window.requestAnimationFrame(() => {
    nudgeReflowAndResize();
    window.requestAnimationFrame(() => {
      window.dispatchEvent(new Event("resize"));
    });
  });
}

function cycleGoogleTranslateCombo(pageLanguageOverride?: string): void {
  if (!isGoogleTranslationActive(pageLanguageOverride)) return;

  const sel = document.querySelector<HTMLSelectElement>("select.goog-te-combo");
  const fromCookie = targetLangFromGoogtransCookie(pageLanguageOverride);

  if (!sel) {
    nudgeReflowAndResize();
    window.requestAnimationFrame(() => {
      window.dispatchEvent(new Event("resize"));
    });
    return;
  }

  const saved =
    (sel.value && sel.value.length > 0 ? sel.value : null) ?? fromCookie;
  if (!saved) {
    nudgeReflowAndResize();
    return;
  }

  const fire = () => {
    sel.dispatchEvent(new Event("change", { bubbles: true }));
  };

  sel.value = "";
  fire();

  window.requestAnimationFrame(() => {
    sel.value = saved;
    fire();
    sel.dispatchEvent(new Event("input", { bubbles: true }));
    window.requestAnimationFrame(() => {
      window.dispatchEvent(new Event("resize"));
    });
  });
}

let indicatorHideTimer: number | null = null;
let indicatorMoveHook: ((e: MouseEvent) => void) | null = null;

function removeRescanIndicator(): void {
  if (indicatorMoveHook) {
    window.removeEventListener("mousemove", indicatorMoveHook);
    indicatorMoveHook = null;
  }
  document.getElementById(INDICATOR_ID)?.remove();
}

function positionIndicator(el: HTMLElement, x: number, y: number): void {
  const pad = 16;
  const fallback = getLastPointer();
  const vx = Number.isFinite(x) ? x : fallback.x;
  const vy = Number.isFinite(y) ? y : fallback.y;
  el.style.left = `${Math.min(window.innerWidth - 48, Math.max(8, vx + pad))}px`;
  el.style.top = `${Math.min(window.innerHeight - 48, Math.max(8, vy + pad))}px`;
}

function showRescanIndicatorNearPointer(): void {
  if (typeof document === "undefined") return;
  removeRescanIndicator();

  const wrap = document.createElement("div");
  wrap.id = INDICATOR_ID;
  wrap.setAttribute("role", "status");
  wrap.setAttribute("aria-live", "polite");
  wrap.style.cssText = [
    "position:fixed",
    "z-index:2147483646",
    "pointer-events:none",
    "display:flex",
    "align-items:center",
    "gap:6px",
    "padding:6px 10px",
    "border-radius:9999px",
    "font:600 11px/1.25 system-ui,sans-serif",
    "box-shadow:0 4px 18px rgba(0,0,0,.14)",
    "color:var(--foreground)",
    "background:color-mix(in oklab, var(--card) 90%, transparent)",
    "border:1px solid color-mix(in oklab, var(--border) 70%, transparent)",
  ].join(";");

  const spin = document.createElement("span");
  spin.className = "gt-rescan-indicator__spinner shrink-0";
  spin.setAttribute("aria-hidden", "true");

  const label = document.createElement("span");
  label.textContent = "Traduction…";

  wrap.append(spin, label);
  document.body.appendChild(wrap);

  const p = getLastPointer();
  positionIndicator(wrap, p.x, p.y);

  indicatorMoveHook = (e: MouseEvent) => {
    positionIndicator(wrap, e.clientX, e.clientY);
  };
  window.addEventListener("mousemove", indicatorMoveHook, { passive: true });
}

function armIndicatorAutoHide(ms: number): void {
  if (indicatorHideTimer !== null) {
    window.clearTimeout(indicatorHideTimer);
    indicatorHideTimer = null;
  }
  indicatorHideTimer = window.setTimeout(() => {
    indicatorHideTimer = null;
    removeRescanIndicator();
  }, ms);
}

let rescanSeq = 0;

export function requestGoogleTranslateRescan(
  pageLanguageOverride?: string,
): void {
  if (typeof window === "undefined") return;
  if (!isGoogleTranslationActive(pageLanguageOverride)) return;

  ensureGlobalPointerTracking();

  const seq = ++rescanSeq;
  showRescanIndicatorNearPointer();
  armIndicatorAutoHide(1700);

  const alive = () => seq === rescanSeq;

  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => {
      if (!alive()) return;
      nudgeReflowResizeRafChain();
    });
  });

  window.setTimeout(() => {
    if (!alive()) return;
    nudgeReflowAndResize();
  }, 72);

  window.setTimeout(() => {
    if (!alive()) return;
    nudgeReflowAndResize();
  }, 200);

  window.setTimeout(() => {
    if (!alive()) return;
    cycleGoogleTranslateCombo(pageLanguageOverride);
  }, 380);

  window.setTimeout(() => {
    if (!alive()) return;
    nudgeReflowAndResize();
  }, 620);

  window.setTimeout(() => {
    if (!alive()) return;
    cycleGoogleTranslateCombo(pageLanguageOverride);
  }, 1050);
}

export function requestGoogleTranslateRescanStaggered(
  pageLanguageOverride?: string,
): void {
  if (typeof window === "undefined") return;
  if (!isGoogleTranslationActive(pageLanguageOverride)) return;

  ensureGlobalPointerTracking();

  const seq = ++rescanSeq;
  const alive = () => seq === rescanSeq;

  showRescanIndicatorNearPointer();
  armIndicatorAutoHide(2400);

  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => {
      if (!alive()) return;
      nudgeReflowResizeRafChain();
    });
  });

  const later = (ms: number, fn: () => void) => {
    window.setTimeout(() => {
      if (!alive()) return;
      fn();
    }, ms);
  };

  later(90, () => nudgeReflowAndResize());
  later(260, () => nudgeReflowAndResize());
  later(400, () => cycleGoogleTranslateCombo(pageLanguageOverride));
  later(620, () => nudgeReflowAndResize());
  later(880, () => cycleGoogleTranslateCombo(pageLanguageOverride));
  later(1280, () => cycleGoogleTranslateCombo(pageLanguageOverride));
  later(1680, () => nudgeReflowAndResize());
}
