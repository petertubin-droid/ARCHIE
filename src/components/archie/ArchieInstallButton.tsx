// =========================================================
// FRELUX ARCHIE STAGE 1, PWA INSTALL PROMPT
//
// Captures the browser's beforeinstallprompt event while the
// Owner is inside /archie and offers a one-tap "Install ARCHIE"
// action. On iOS Safari the event never fires; those clients
// get an honest "Add to Home Screen" hint instead. The install
// option only appears when the browser actually supports it —
// no fake buttons.
// =========================================================
import { useEffect, useState } from "react";
import { Download, Info } from "lucide-react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export default function ArchieInstallButton() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(
    null,
  );
  const [installed, setInstalled] = useState(
    typeof window !== "undefined" &&
      window.matchMedia?.("(display-mode: standalone)").matches,
  );
  const [iosHint, setIosHint] = useState(false);

  const isIos =
    typeof navigator !== "undefined" &&
    /iphone|ipad|ipod/i.test(navigator.userAgent) &&
    !/crios|fxios/i.test(navigator.userAgent);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setDeferred(null);
      setIosHint(false);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (installed) return null;

  async function install() {
    if (!deferred) return;
    await deferred.prompt();
    const choice = await deferred.userChoice;
    if (choice.outcome === "dismissed") setDeferred(null);
  }

  if (deferred) {
    return (
      <button
        type="button"
        onClick={install}
        className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
      >
        <Download className="h-3.5 w-3.5" aria-hidden="true" />
        Install
      </button>
    );
  }

  // iOS Safari: no beforeinstallprompt. Honest instructions, dismissible.
  if (isIos) {
    return (
      <div className="relative">
        {iosHint && (
          <div
            role="tooltip"
            className="absolute right-0 top-9 z-50 w-56 rounded-lg border border-border bg-popover p-3 text-xs leading-relaxed text-popover-foreground shadow-lg"
          >
            To install ARCHIE, tap the Share button in the Safari toolbar, then
            choose <strong>Add to Home Screen</strong>.
          </div>
        )}
        <button
          type="button"
          aria-expanded={iosHint}
          onClick={() => setIosHint((v) => !v)}
          onBlur={() => setIosHint(false)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <Info className="h-3.5 w-3.5" aria-hidden="true" />
          Install
        </button>
      </div>
    );
  }

  return null;
}
