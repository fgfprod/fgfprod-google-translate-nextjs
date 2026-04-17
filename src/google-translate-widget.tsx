import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./dropdown-menu";
import { cn } from "./cn";
import { setGoogleTranslatePageLanguage } from "./page-language";

type GoogleTranslateElementCtor = new (
  options: {
    pageLanguage: string;
    includedLanguages?: string;
    layout?: number;
  },
  element: string
) => void;

declare global {
  interface Window {
    googleTranslateElementInit?: () => void;
    google?: {
      translate?: {
        TranslateElement: GoogleTranslateElementCtor & {
          InlineLayout?: { SIMPLE: number };
        };
      };
    };
  }
}

export type GoogleTranslateLanguage = {
  code: string;
  shortLabel: string;
  ariaLabel: string;
};

export type GoogleTranslateWidgetProps = {
  pageLanguage: string;
  languages: GoogleTranslateLanguage[];
  translateElementDomId?: string;
  classNames?: {
    trigger?: string;
    menuContent?: string;
    menuItem?: string;
  };
};

function parseGoogtransTarget(
  raw: string,
  pageLang: string,
  knownCodes: Set<string>,
): string | null {
  const v = decodeURIComponent(raw.trim());
  if (!v) return null;
  const parts = v.split("/").filter(Boolean);
  if (parts.length < 2) return null;
  const target = parts[1];
  if (target === pageLang) return pageLang;
  if (knownCodes.has(target)) return target;
  return null;
}

function googtransDomainSuffixes(): string[] {
  const seen = new Set<string>();
  seen.add("");

  const host = window.location.hostname;
  if (!host || host === "localhost" || /^\d{1,3}(\.\d{1,3}){3}$/.test(host)) {
    return [...seen];
  }

  const addBoth = (h: string) => {
    seen.add(`;domain=${h}`);
    seen.add(`;domain=.${h}`);
  };

  addBoth(host);

  if (host.startsWith("www.")) {
    addBoth(host.slice(4));
  }

  const labels = host.split(".").filter(Boolean);
  if (labels.length >= 3) {
    addBoth(labels.slice(-2).join("."));
  }

  return [...seen];
}

function clearGoogtransCookies(): void {
  const expires = "Thu, 01 Jan 1970 00:00:00 GMT";
  const path = "/";
  const secure = window.location.protocol === "https:" ? ";Secure" : "";
  for (const dom of googtransDomainSuffixes()) {
    for (const sameSite of ["", ";SameSite=Lax"] as const) {
      document.cookie = `googtrans=;expires=${expires};path=${path};Max-Age=0${dom}${sameSite}${secure}`;
    }
  }
}

function setGoogtransForTargetOnAllScopes(
  pageLang: string,
  target: string,
): void {
  const path = "/";
  const secure = window.location.protocol === "https:" ? ";Secure" : "";
  const val = `/${pageLang}/${target}`;
  for (const dom of googtransDomainSuffixes()) {
    document.cookie = `googtrans=${val};path=${path};SameSite=Lax${dom}${secure}`;
  }
}

function readActiveLangFromCookie(
  pageLang: string,
  knownCodes: Set<string>,
): string {
  if (typeof document === "undefined") return pageLang;
  const re = /(?:^|;\s*)googtrans=([^;]*)/g;
  let m: RegExpExecArray | null;
  let lastTranslated: string | null = null;
  while ((m = re.exec(document.cookie)) !== null) {
    const parsed = parseGoogtransTarget(m[1] ?? "", pageLang, knownCodes);
    if (parsed && parsed !== pageLang) lastTranslated = parsed;
  }
  return lastTranslated ?? pageLang;
}

function setTranslationCookieAndReload(
  pageLang: string,
  target: string,
  knownCodes: Set<string>,
) {
  clearGoogtransCookies();
  if (target !== pageLang && knownCodes.has(target)) {
    setGoogtransForTargetOnAllScopes(pageLang, target);
  }
  window.location.reload();
}

function isGoogleTranslationCookieActive(
  pageLang: string,
  knownCodes: Set<string>,
): boolean {
  return readActiveLangFromCookie(pageLang, knownCodes) !== pageLang;
}

function measureGoogleTranslateBannerHeightPx(): number {
  const iframe = document.querySelector<HTMLIFrameElement>(
    "iframe.goog-te-banner-frame",
  );
  if (!iframe) return 0;

  const cs = getComputedStyle(iframe);
  if (cs.display === "none" || cs.visibility === "hidden") return 0;
  const op = parseFloat(cs.opacity);
  if (!Number.isNaN(op) && op < 0.05) return 0;

  const rect = iframe.getBoundingClientRect();
  let h = rect.height;
  if (h < 2) h = iframe.offsetHeight;
  if (h < 2 && iframe.parentElement) {
    h = iframe.parentElement.getBoundingClientRect().height;
  }

  return h >= 2 ? Math.ceil(h) : 0;
}

const GOOGLE_TRANSLATE_BANNER_MIN_PX = 40;

function getGoogleTranslateStickyOffsetPx(
  pageLang: string,
  knownCodes: Set<string>,
): number {
  if (!isGoogleTranslationCookieActive(pageLang, knownCodes)) return 0;

  const measured = measureGoogleTranslateBannerHeightPx();
  if (measured > 0) return measured;

  return GOOGLE_TRANSLATE_BANNER_MIN_PX;
}

function useFinePointerHover() {
  const [fineHover, setFineHover] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(hover: hover) and (pointer: fine)");
    const sync = () => setFineHover(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  return fineHover;
}

export function GoogleTranslateWidget({
  pageLanguage,
  languages,
  translateElementDomId = "google_translate_element",
  classNames,
}: GoogleTranslateWidgetProps) {
  const pageLang = pageLanguage.trim();
  const metaByCode = useMemo(() => {
    const m = new Map<string, GoogleTranslateLanguage>();
    for (const L of languages) {
      m.set(L.code.trim(), L);
    }
    return m;
  }, [languages]);

  const knownCodes = useMemo(() => new Set(metaByCode.keys()), [metaByCode]);

  const translationTargetCodes = useMemo(
    () => languages.map((l) => l.code.trim()).filter((c) => c !== pageLang),
    [languages, pageLang],
  );

  const includedLanguages = useMemo(
    () => [...new Set([pageLang, ...translationTargetCodes])].join(","),
    [pageLang, translationTargetCodes],
  );

  useEffect(() => {
    if (!knownCodes.has(pageLang)) {
      console.warn(
        "[GoogleTranslateWidget] pageLanguage doit correspondre à une entrée de languages.",
      );
    }
    setGoogleTranslatePageLanguage(pageLang);
  }, [pageLang, knownCodes]);

  const selectPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const closeMenuTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [active, setActive] = useState<string>(pageLang);
  const [menuOpen, setMenuOpen] = useState(false);
  const finePointerHover = useFinePointerHover();

  const cancelMenuCloseTimer = useCallback(() => {
    if (closeMenuTimerRef.current) {
      clearTimeout(closeMenuTimerRef.current);
      closeMenuTimerRef.current = null;
    }
  }, []);

  const scheduleMenuClose = useCallback(() => {
    cancelMenuCloseTimer();
    closeMenuTimerRef.current = setTimeout(() => {
      closeMenuTimerRef.current = null;
      setMenuOpen(false);
    }, 220);
  }, [cancelMenuCloseTimer]);

  const openMenuHover = useCallback(() => {
    cancelMenuCloseTimer();
    setMenuOpen(true);
  }, [cancelMenuCloseTimer]);

  useEffect(() => () => cancelMenuCloseTimer(), [cancelMenuCloseTimer]);

  useEffect(() => {
    queueMicrotask(() => {
      setActive(readActiveLangFromCookie(pageLang, knownCodes));
    });
  }, [pageLang, knownCodes]);

  useEffect(() => {
    window.googleTranslateElementInit = () => {
      if (!window.google?.translate?.TranslateElement) return;
      if (document.querySelector("select.goog-te-combo")) {
        return;
      }
      const TE = window.google.translate.TranslateElement;
      const layout = TE.InlineLayout?.SIMPLE;
      new TE(
        {
          pageLanguage: pageLang,
          includedLanguages,
          ...(layout !== undefined ? { layout } : {}),
        },
        translateElementDomId,
      );

      selectPollRef.current = setInterval(() => {
        const el = document.querySelector<HTMLSelectElement>(
          "select.goog-te-combo",
        );
        if (el) {
          if (selectPollRef.current) clearInterval(selectPollRef.current);
          selectPollRef.current = null;
        }
      }, 80);
    };

    if (!document.getElementById("google-translate-script")) {
      const script = document.createElement("script");
      script.id = "google-translate-script";
      script.src =
        "https://translate.google.com/translate_a/element.js?cb=googleTranslateElementInit";
      script.async = true;
      document.body.appendChild(script);
    } else if (typeof window.googleTranslateElementInit === "function") {
      window.googleTranslateElementInit();
    }

    const maxWait = window.setTimeout(() => {
      if (selectPollRef.current) {
        clearInterval(selectPollRef.current);
        selectPollRef.current = null;
      }
    }, 12000);

    return () => {
      window.clearTimeout(maxWait);
      if (selectPollRef.current) clearInterval(selectPollRef.current);
    };
  }, [pageLang, includedLanguages, translateElementDomId]);

  useEffect(() => {
    const root = document.documentElement;
    const setBannerHeight = (px: number) => {
      root.style.setProperty(
        "--google-translate-banner-height",
        `${Math.max(0, px)}px`,
      );
    };

    const measure = () => {
      setBannerHeight(
        getGoogleTranslateStickyOffsetPx(pageLang, knownCodes),
      );
    };

    let observedIframe: Element | null = null;
    let observedParent: Element | null = null;
    const ro = new ResizeObserver(() => measure());

    const tryObserveNodes = () => {
      const iframe = document.querySelector("iframe.goog-te-banner-frame");
      const parent = iframe?.parentElement ?? null;

      if (iframe && iframe !== observedIframe) {
        if (observedIframe) ro.unobserve(observedIframe);
        observedIframe = iframe;
        ro.observe(iframe);
      }
      if (parent && parent !== observedParent) {
        if (observedParent) ro.unobserve(observedParent);
        observedParent = parent;
        ro.observe(parent);
      }
      if (!iframe && observedIframe) {
        ro.unobserve(observedIframe);
        observedIframe = null;
      }
      if (!parent && observedParent) {
        ro.unobserve(observedParent);
        observedParent = null;
      }
      measure();
    };

    const mo = new MutationObserver(() => {
      requestAnimationFrame(() => {
        tryObserveNodes();
      });
    });
    mo.observe(document.body, { childList: true, subtree: true });

    let scrollRaf = 0;
    const onScroll = () => {
      if (scrollRaf) return;
      scrollRaf = requestAnimationFrame(() => {
        scrollRaf = 0;
        measure();
      });
    };

    tryObserveNodes();
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", onScroll, { passive: true });

    const poll = window.setInterval(() => {
      tryObserveNodes();
    }, 600);
    const stopPoll = window.setTimeout(() => window.clearInterval(poll), 20000);

    return () => {
      window.clearTimeout(stopPoll);
      window.clearInterval(poll);
      mo.disconnect();
      ro.disconnect();
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", onScroll);
      if (observedIframe) ro.unobserve(observedIframe);
      if (observedParent) ro.unobserve(observedParent);
      setBannerHeight(0);
    };
  }, [pageLang, knownCodes]);

  const pickLanguage = useCallback(
    (target: string) => {
      if (target === active) return;
      cancelMenuCloseTimer();
      setMenuOpen(false);
      setTranslationCookieAndReload(pageLang, target, knownCodes);
    },
    [active, cancelMenuCloseTimer, pageLang, knownCodes],
  );

  const activeMeta = metaByCode.get(active);
  const menuTargets: string[] =
    active === pageLang
      ? translationTargetCodes
      : languages.map((l) => l.code.trim()).filter((c) => c !== active);

  return (
    <div className="notranslate shrink-0">
      <div
        id={translateElementDomId}
        className="pointer-events-none absolute h-0 w-0 overflow-hidden opacity-0"
        aria-hidden
      />

      <DropdownMenu
        modal={false}
        open={menuOpen}
        onOpenChange={(next) => {
          cancelMenuCloseTimer();
          setMenuOpen(next);
        }}
      >
        <DropdownMenuTrigger
          className={cn(
            "notranslate flex size-8 items-center justify-center rounded-md border-0 bg-transparent text-white shadow-none outline-none transition",
            "hover:bg-white/15 focus-visible:bg-white/15 data-[state=open]:bg-[#1d9cd6]",
            classNames?.trigger,
          )}
          translate="no"
          aria-label={
            activeMeta
              ? `Langue affichée : ${activeMeta.ariaLabel}. Menu des langues au survol ou au clic.`
              : "Menu des langues"
          }
          onPointerEnter={() => {
            if (finePointerHover) openMenuHover();
          }}
          onPointerLeave={() => {
            if (finePointerHover) scheduleMenuClose();
          }}
        >
          <span
            className="notranslate text-xs font-semibold leading-none tracking-tight"
            translate="no"
            aria-hidden
          >
            {activeMeta?.shortLabel ?? "?"}
          </span>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          sideOffset={6}
          className={cn(
            "notranslate z-60 flex w-8! min-w-0! flex-col items-stretch gap-0 p-1",
            classNames?.menuContent,
          )}
          translate="no"
          onCloseAutoFocus={(e) => e.preventDefault()}
          onPointerEnter={() => {
            if (finePointerHover) cancelMenuCloseTimer();
          }}
          onPointerLeave={() => {
            if (finePointerHover) scheduleMenuClose();
          }}
        >
          {menuTargets.map((code) => {
            const row = metaByCode.get(code);
            if (!row) return null;
            const isOriginal = code === pageLang;
            return (
              <Fragment key={code}>
                <DropdownMenuItem
                  className={cn(
                    "notranslate flex h-9 w-full shrink-0 items-center justify-center px-0 py-0 text-xs font-semibold leading-none tracking-tight",
                    classNames?.menuItem,
                  )}
                  translate="no"
                  aria-label={row.ariaLabel}
                  onSelect={() => pickLanguage(code)}
                >
                  <span
                    className="notranslate flex w-full justify-center"
                    translate="no"
                    aria-hidden
                  >
                    {row.shortLabel}
                  </span>
                </DropdownMenuItem>
                {isOriginal && active !== pageLang ? (
                  <DropdownMenuSeparator />
                ) : null}
              </Fragment>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
