// =========================================================
// FRELUX ARCHIE STAGE 1 — INDEPENDENT OWNER PWA SHELL
//
// The ARCHIE application shell: its own identity, its own
// navigation, its own PWA manifest (swapped in while the
// Owner is inside /archie). It does NOT wrap the public
// FRELUX layout and requires no FRELUX screen first.
//
// Navigation (spec §14): CHAT / CONTROL / KNOWLEDGE /
// LEARNING / DEVICES / SECURITY / SYSTEM — mobile-first
// bottom nav, desktop sidebar.
// =========================================================

import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, Link } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import "@/styles/archie-premium.css";
import ArchieInstallButton from "./ArchieInstallButton";

type NavItem = { to: string; label: string; icon: string };

// Organized navigation (owner directive 2026-09-14: organize
// ARCHIE's dashboard) — grouped by purpose so the owner can find
// the right section at a glance instead of scanning one flat
// list of 18 items.
const NAV: NavItem[] = [
  // Main
  { to: "/archie/chat", label: "Chat", icon: "chat" },
  { to: "/archie/coding", label: "Coding", icon: "control" },
  // Capabilities
  { to: "/archie/control", label: "Control", icon: "control" },
  { to: "/archie/execution", label: "Execution", icon: "control" },
  { to: "/archie/trading", label: "Trading", icon: "control" },
  { to: "/archie/exchange-access", label: "Exchange Access", icon: "security" },
  { to: "/archie/wallet-recovery", label: "Wallet Recovery", icon: "security" },
  { to: "/archie/offensive", label: "Offensive", icon: "security" },
  { to: "/archie/voice", label: "Voice", icon: "chat" },
  { to: "/archie/evolution", label: "Evolution", icon: "control" },
  // Knowledge
  { to: "/archie/knowledge", label: "Knowledge", icon: "knowledge" },
  { to: "/archie/learning", label: "Learning", icon: "learning" },
  { to: "/archie/training", label: "Training", icon: "knowledge" },
  { to: "/archie/terminology", label: "TerminoBook", icon: "learning" },
  { to: "/archie/shared", label: "Shared", icon: "knowledge" },
  // People & Access
  { to: "/archie/people", label: "People", icon: "devices" },
  { to: "/archie/devices", label: "Devices", icon: "devices" },
  // System
  { to: "/archie/system", label: "System", icon: "system" },
  { to: "/archie/anatomy", label: "Anatomy", icon: "system" },
  { to: "/archie/engines", label: "Engines", icon: "system" },
  { to: "/archie/security", label: "Security", icon: "security" },
  { to: "/archie/ops", label: "Ops", icon: "control" },
  { to: "/archie/migration", label: "Migration", icon: "migration" },
];

const NAV_SECTIONS: Array<{ title: string; items: NavItem[] }> = [
  { title: "Main", items: NAV.filter((_, i) => i < 2) },
  {
    title: "Capabilities",
    items: NAV.filter((_, i) => i >= 2 && i < 6),
  },
  {
    title: "Knowledge",
    items: NAV.filter((_, i) => i >= 6 && i < 11),
  },
  {
    title: "People & Access",
    items: NAV.filter((_, i) => i >= 11 && i < 13),
  },
  {
    title: "System",
    items: NAV.filter((_, i) => i >= 13),
  },
];

function NavIcon({ name }: { name: string }) {
  const common = "h-5 w-5";
  switch (name) {
    case "chat":
      return (
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          className={common}
        >
          <path
            d="M21 12a8 8 0 0 1-8 8H5l-2 2V12a8 8 0 0 1 8-8h2a8 8 0 0 1 8 8Z"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "control":
      return (
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          className={common}
        >
          <rect x="3" y="3" width="7" height="7" rx="1" />
          <rect x="14" y="3" width="7" height="7" rx="1" />
          <rect x="3" y="14" width="7" height="7" rx="1" />
          <rect x="14" y="14" width="7" height="7" rx="1" />
        </svg>
      );
    case "knowledge":
      return (
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          className={common}
        >
          <path
            d="M4 19V5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2Zm0 0a2 2 0 0 0 2 2h13"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "learning":
      return (
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          className={common}
        >
          <path
            d="m12 3 10 5-10 5L2 8l10-5Zm0 10 6-3m-6 8-6-3m6 3 6-3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "devices":
      return (
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          className={common}
        >
          <rect x="6" y="2" width="12" height="20" rx="2" />
          <path d="M11 18h2" strokeLinecap="round" />
        </svg>
      );
    case "migration":
      return (
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          className={common}
        >
          <path d="M3 12h12" strokeLinecap="round" />
          <path
            d="m11 8 4 4-4 4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path d="M17 4v16" strokeLinecap="round" />
          <path d="M21 8v8" strokeLinecap="round" />
        </svg>
      );
    case "security":
      return (
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          className={common}
        >
          <path
            d="M12 2 4 5v6c0 5 3.4 9.4 8 11 4.6-1.6 8-6 8-11V5l-8-3Z"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    default:
      return (
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          className={common}
        >
          <circle cx="12" cy="12" r="3" />
          <path
            d="M12 2v4m0 12v4M2 12h4m12 0h4M5 5l2.5 2.5m9 9L19 19M19 5l-2.5 2.5m-9 9L5 19"
            strokeLinecap="round"
          />
        </svg>
      );
  }
}

export default function ArchieLayout() {
  const { user } = useAuth();
  const location = useLocation();
  // AI transparency (AI Disclosure doc): one-time notice,
  // permanently discoverable in the footer links.
  const [disclosureAck, setDisclosureAck] = useState(true);
  const [online, setOnline] = useState(true);
  const [updateReady, setUpdateReady] = useState(false);
  useEffect(() => {
    setDisclosureAck(localStorage.getItem("archie-ai-disclosure-ack") === "1");
    setOnline(navigator.onLine);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  // Swap in the ARCHIE PWA manifest while inside /archie; the
  // FRELUX manifest is restored on unmount.
  useEffect(() => {
    const link = document.querySelector<HTMLLinkElement>(
      'link[rel="manifest"]',
    );
    const original = link?.getAttribute("href") ?? null;
    if (link) link.setAttribute("href", "/assets/archie/manifest.webmanifest");
    // Swap the site favicon + apple-touch-icon to the ARCHIE mark while
    // inside /archie; restored on unmount (same contract as the manifest).
    const iconLinks = Array.from(
      document.querySelectorAll<HTMLLinkElement>(
        'link[rel="icon"], link[rel="apple-touch-icon"]',
      ),
    );
    const originalIcons = iconLinks.map((el) => el.getAttribute("href"));
    iconLinks.forEach((el) => {
      if (el.getAttribute("rel") === "apple-touch-icon") {
        el.setAttribute("href", "/assets/archie/archie-apple-touch-180.png");
      } else if (el.getAttribute("sizes")?.includes("32")) {
        el.setAttribute("href", "/assets/archie/archie-favicon-32.png");
      } else {
        el.setAttribute("href", "/assets/archie/archie-favicon-16.png");
      }
    });
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", "#0B0F14");
    // Register the ARCHIE service worker (scoped to /archie) —
    // required by browsers to offer the PWA install option.
    let registration: ServiceWorkerRegistration | undefined;
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/archie-sw.js", { scope: "/archie/" })
        .then((reg) => {
          registration = reg;
          // PWA update flow: when a new ARCHIE shell version is
          // deployed, let the user reload on purpose — no
          // silent swaps mid-session.
          reg.addEventListener("updatefound", () => {
            const sw = reg.installing;
            sw?.addEventListener("statechange", () => {
              if (
                sw.state === "installed" &&
                navigator.serviceWorker.controller
              ) {
                setUpdateReady(true);
              }
            });
          });
        })
        .catch(() => {
          /* offline shell unavailable; the app still works online */
        });
    }

    return () => {
      if (link) link.setAttribute("href", original ?? "/manifest.json");
      iconLinks.forEach((el, i) => {
        const prev = originalIcons[i];
        if (prev) el.setAttribute("href", prev);
      });
      document
        .querySelector('meta[name="theme-color"]')
        ?.setAttribute("content", "#6D28D9");
      registration?.unregister().catch(() => undefined);
    };
  }, []);

  return (
    <div className="archie-root flex min-h-screen flex-col text-slate-100">
      {/* ARCHIE header */}
      <header className="sticky top-0 z-20 border-b border-white/5 bg-[#0B0F14]/80 backdrop-blur-xl after:absolute after:inset-x-0 after:bottom-0 after:h-px after:bg-gradient-to-r after:from-transparent after:via-amber-400/30 after:to-transparent">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
          <img
            src="/assets/archie/archie-icon-512.png"
            alt=""
            className="archie-mascot h-9 w-9 rounded-xl"
            aria-hidden
          />
          <div className="flex flex-col leading-tight">
            <span className="text-sm font-semibold tracking-[0.2em] text-amber-200/90">
              ARCHIE
            </span>
            <span className="text-[10px] text-slate-400">
              Personal Intelligence
            </span>
          </div>
          <div className="ml-auto flex items-center gap-2">
            {!online && (
              <span className="rounded-full border border-amber-400/40 bg-amber-400/10 px-2 py-0.5 text-[10px] font-semibold text-amber-300">
                OFFLINE — cached screens only; chat needs a connection
              </span>
            )}
            {updateReady && (
              <button
                onClick={() => {
                  navigator.serviceWorker?.controller?.postMessage({
                    type: "SKIP_WAITING",
                  });
                  window.location.reload();
                }}
                className="rounded-full border border-amber-400/40 bg-amber-400/10 px-2.5 py-0.5 text-[10px] font-semibold text-amber-300 hover:bg-amber-400/20"
              >
                UPDATE READY — RELOAD
              </button>
            )}
            <ArchieInstallButton />
            <div className="text-[11px] text-slate-400">
              {user?.email ? user.email : "Owner"}
            </div>
          </div>
        </div>
      </header>

      {/* AI transparency disclosure (one-time, dismissible;
          the truth it states is permanent on the Legal page). */}
      {!disclosureAck && (
        <div className="border-b border-amber-400/20 bg-amber-400/[0.06] px-4 py-2.5 text-center text-xs text-amber-100/80">
          <span className="font-semibold text-amber-200">ARCHIE is an AI.</span>{" "}
          It can make mistakes and important information may need your
          verification. Memory and learned information are confidence-scored,
          not automatically true. Production changes always require Owner
          authorization.{" "}
          <Link
            to="/archie/legal"
            className="font-semibold text-amber-200 underline underline-offset-2"
          >
            Read the AI Disclosure
          </Link>
          <button
            onClick={() => {
              localStorage.setItem("archie-ai-disclosure-ack", "1");
              setDisclosureAck(true);
            }}
            className="ml-2 rounded border border-amber-400/30 px-1.5 py-0.5 text-[10px] font-semibold text-amber-200"
          >
            GOT IT
          </button>
        </div>
      )}

      {/* desktop sidebar + mobile bottom nav */}
      <div className="mx-auto flex w-full max-w-6xl flex-1 gap-0 md:gap-6">
        <nav
          aria-label="ARCHIE sections"
          className="sticky top-[57px] hidden h-[calc(100vh-57px)] w-48 shrink-0 flex-col gap-1 border-r border-white/5 py-4 md:flex"
        >
          {NAV_SECTIONS.map((section) => (
            <div key={section.title} className="mt-1">
              <p className="px-3 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-wider text-slate-600">
                {section.title}
              </p>
              {section.items.map((n) => (
                <NavLink
                  key={n.to}
                  to={n.to}
                  className={({ isActive }) =>
                    `group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-all ${
                      isActive
                        ? "archie-nav-active bg-amber-400/10 text-amber-200"
                        : "text-slate-400 hover:bg-white/[0.04] hover:text-slate-200"
                    }`
                  }
                >
                  <NavIcon name={n.icon} />
                  {n.label}
                </NavLink>
              ))}
            </div>
          ))}
          <a
            href="/"
            className="mt-auto flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-slate-500 transition-colors hover:text-slate-300"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              className="h-5 w-5"
            >
              <path
                d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            FRELUX
          </a>
        </nav>

        <main
          className="relative z-10 min-w-0 flex-1 pb-16 md:pb-0"
          key={location.pathname}
        >
          <Outlet />
        </main>
      </div>

      <nav
        aria-label="ARCHIE sections"
        className="fixed inset-x-0 bottom-0 z-20 flex overflow-x-auto border-t border-white/10 bg-[#0B0F14]/85 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden"
      >
        {NAV.map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            aria-label={n.label}
            className={({ isActive }) =>
              `flex min-w-[68px] shrink-0 flex-col items-center gap-1 px-1 py-2 text-[10px] transition-colors ${
                isActive
                  ? "text-amber-200 drop-shadow-[0_0_8px_rgba(251,191,36,0.45)]"
                  : "text-slate-500"
              }`
            }
          >
            <NavIcon name={n.icon} />
            {n.label}
          </NavLink>
        ))}
      </nav>

      {/* Legal & governance links — §12 access without
          cluttering the primary interface. */}
      <footer className="border-t border-white/5 px-4 pb-20 pt-4 text-center text-[11px] text-slate-500 md:pb-4">
        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
          <Link to="/archie/legal" className="hover:text-slate-300">
            Legal &amp; Governance
          </Link>
          <span aria-hidden>·</span>
          <Link to="/archie/privacy" className="hover:text-slate-300">
            Privacy &amp; Memory Rights
          </Link>
        </div>
        <p className="mt-1.5">© 2026 FRENZY. All rights reserved.</p>
      </footer>
    </div>
  );
}
