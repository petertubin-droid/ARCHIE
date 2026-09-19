// =========================================================
// FRELUX ARCHIE — SITE ASSISTANT + FAMILY PWA
//
// One page, two honest access tiers:
//   * EVERY visitor (even signed-out) gets the CHAT: real
//     answers from ARCHIE's own native engine via the
//     archie-chat edge function. Signed-out and external
//     users run in the function's isolated, rate-limited
//     visitor mode — site guidance about FRELUX only,
//     zero owner memory, zero device access.
//   * The FULL PWA (voice, camera, vault, device security,
//     owner authorization) is exclusively for the FRELUX
//     Owner and the Owner-registered family network
//     (an ACTIVE row in frelux_archie_people — the Owner
//     approves every member explicitly).
// No feature tabs, no capability buttons and no device
// surfaces exist at all for external users — not hidden
// behind a toggle: not rendered.
// =========================================================
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Brain,
  Mic,
  Camera,
  Image as ImageIcon,
  FileText,
  MapPin,
  Bell,
  Clipboard,
  ExternalLink,
  Calculator,
  Shield,
  Lock,
  AlertTriangle,
  Check,
  Loader2,
  Smartphone,
  History,
  KeyRound,
  Sparkles,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { classNames } from "@/lib/utils";
import { supabase, getFunctionErrorMessage } from "@/lib/supabase";
import {
  MOBILE_CAPABILITIES,
  FREE_CAPABILITY_KEYS,
  checkCapabilityConsent,
  isCapabilitySupported,
  isSafeLink,
} from "@/lib/archie/mobile/capabilities";
import {
  fetchConsents,
  loadCachedConsents,
  grantCapability,
  revokeCapability,
} from "@/lib/archie/mobile/consent";
import {
  PAID_CAPABILITIES,
  PAID_CAPABILITY_KEYS,
  fetchPaidActivations,
  activatePaidCapability,
  deactivatePaidCapability,
} from "@/lib/archie/mobile/paid-services";
import { speakArchie, stopArchieVoice } from "@/lib/archie/mobile/voice";
import ChatComposer from "@/components/archie/ChatComposer";
import {
  type ArchieChatAttachment,
  type ArchieConversation,
  archiveConversation,
  createConversation,
  listConversations,
  listMessages,
  renameConversation,
  searchConversations,
  sendMessage,
} from "@/lib/archie/chat-client";
import { assertAuthority, selectTool } from "@/lib/archie/tool-router";
import {
  registerCurrentSession,
  fetchSessions,
  revokeSession,
  revokeAllOtherSessions,
  validateCurrentSession,
} from "@/lib/archie/mobile/device-sessions";
import {
  fetchSecurityEvents,
  markSecurityEventsRead,
  requestNotificationPermission,
  notifyUserDevice,
} from "@/lib/archie/mobile/security-events";
import {
  protectItem,
  listProtectedItems,
  recoverProtectedItem,
  clearLocalProtectedCache,
} from "@/lib/archie/mobile/vault";
import {
  checkOwnerCredential,
  setOwnerSecret,
  authorizeOwnerChange,
  listOwnerAuthorizations,
  purgeTranscriptsForAuthorization,
} from "@/lib/archie/mobile/owner-authorization";
import {
  OWNER_CHANGE_POLICY,
  HIGH_RISK_CHANGE_KINDS,
} from "@/lib/archie/mobile/owner-policy";
import type {
  ArchieMobileCapability,
  ArchiePaidCapability,
  ArchieConsent,
  ProtectedItem,
  SecurityEvent,
  ArchieSession,
  OwnerChangeKind,
  OwnerAuthorizationRecord,
} from "@/lib/archie/mobile/types";

type Tab = "assistant" | "capabilities" | "vault" | "security";

const TABS: { key: Tab; label: string; icon: typeof Brain }[] = [
  { key: "assistant", label: "Assistant", icon: Brain },
  { key: "capabilities", label: "Capabilities", icon: Check },
  { key: "vault", label: "Vault", icon: Lock },
  { key: "security", label: "Security", icon: Shield },
];

function deviceLabel(): string {
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "Device";
  if (/android/i.test(ua)) return "Android phone";
  if (/iphone|ipad/i.test(ua)) return "iPhone / iPad";
  return "Web browser";
}

interface Msg {
  role: "user" | "archie" | "system";
  text: string;
}

/** Stable per-browser id for the visitor-mode rate limiter
 *  on the edge function. Not a tracker: a random local label
 *  so anonymous visitors get fair shared limits. */
function archieClientId(): string {
  try {
    let id = localStorage.getItem("frelux-archie-client-id");
    if (!id) {
      id = `web-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
      localStorage.setItem("frelux-archie-client-id", id);
    }
    return id;
  } catch {
    return "web";
  }
}

type FamilyStatus = "checking" | "active" | "none";

const GREETING =
  "Hi, I'm ARCHIE — FRELUX's own assistant. Ask me anything about FRELUX: calculators, pricing plans, colors, projects, the marketplace, or any building and estimation question.";

export default function Assistant() {
  const { user, isAdmin } = useAuth();
  const [tab, setTab] = useState<Tab>("assistant");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [messages, setMessages] = useState<Msg[]>([
    { role: "archie", text: GREETING },
  ]);
  const [input, setInput] = useState("");
  // Privileged chat: persistent Owner conversations through the
  // real chat-client (frelux_archie_conversations, RLS-scoped
  // per account). Visitors keep the plain ephemeral input.
  const [voiceDraft, setVoiceDraft] = useState("");
  const [conversations, setConversations] = useState<ArchieConversation[]>([]);
  const [activeConv, setActiveConv] = useState<ArchieConversation | null>(null);
  const [convSearch, setConvSearch] = useState("");
  const [convOpen, setConvOpen] = useState(false);
  const [listening, setListening] = useState(false);
  const voiceBufferRef = useRef<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const photoInputRef = useRef<HTMLInputElement | null>(null);

  const [consents, setConsents] = useState<Record<
    ArchieMobileCapability,
    ArchieConsent
  > | null>(null);
  const [paidActivations, setPaidActivations] = useState<
    Partial<Record<ArchiePaidCapability, boolean>>
  >({});
  const [sessions, setSessions] = useState<ArchieSession[]>([]);
  const [events, setEvents] = useState<SecurityEvent[]>([]);
  const [items, setItems] = useState<ProtectedItem[]>([]);
  const [ownerHasCredential, setOwnerHasCredential] = useState<boolean | null>(
    null,
  );

  // Family-network membership: an ACTIVE row in
  // frelux_archie_people (Owner-invited, Owner-approved; the
  // person can see only their own record via RLS). This — or
  // being the Owner — is what unlocks the full PWA.
  const [familyStatus, setFamilyStatus] = useState<FamilyStatus>("checking");
  const isPrivileged = isAdmin || familyStatus === "active";

  // vault form
  const [vLabel, setVLabel] = useState("");
  const [vType, setVType] = useState<
    "PROJECT" | "ESTIMATE" | "REPORT" | "DOCUMENT" | "PLAN" | "OTHER"
  >("PROJECT");
  const [vText, setVText] = useState("");
  const [vPass, setVPass] = useState("");
  const [recoverPass, setRecoverPass] = useState("");
  const [recovered, setRecovered] = useState<string | null>(null);

  // owner auth form
  const [authKind, setAuthKind] = useState<OwnerChangeKind>("CODE_CHANGE");
  const [authTarget, setAuthTarget] = useState("");
  const [authReason, setAuthReason] = useState("");
  const [authBefore, setAuthBefore] = useState("{}");
  const [authAfter, setAuthAfter] = useState("{}");
  const [authTests, setAuthTests] = useState(false);
  const [authEngReview, setAuthEngReview] = useState(false);
  const [authSecret, setAuthSecret] = useState("");
  const [newOwnerSecret, setNewOwnerSecret] = useState("");
  const [authTrail, setAuthTrail] = useState<OwnerAuthorizationRecord[]>([]);

  const userId = user?.id;
  useEffect(() => {
    let cancelled = false;
    if (!userId) {
      setFamilyStatus("none");
      return;
    }
    (async () => {
      try {
        const { data } = await supabase
          .from("frelux_archie_people")
          .select("status")
          .eq("user_id", userId)
          .eq("status", "ACTIVE")
          .limit(1);
        if (!cancelled) {
          setFamilyStatus(data && data.length > 0 ? "active" : "none");
        }
      } catch {
        if (!cancelled) setFamilyStatus("none");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const refresh = useCallback(async () => {
    if (!userId) return;
    const [c, p, s, e, i] = await Promise.all([
      fetchConsents(userId),
      fetchPaidActivations(userId),
      fetchSessions(userId),
      fetchSecurityEvents(userId),
      listProtectedItems(userId),
    ]);
    setConsents(c);
    setPaidActivations(p);
    setSessions(s);
    setEvents(e);
    setItems(i);
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    (async () => {
      setBusy(true);
      try {
        const cached = loadCachedConsents(userId);
        if (cached) setConsents(cached);
        // Stolen-phone check FIRST: a remotely revoked device signs
        // out and loses its protected cache immediately.
        const check = await validateCurrentSession(userId);
        if (check.revoked) {
          setError(
            "This device was revoked. You have been signed out and local protected data was removed.",
          );
          return;
        }
        await registerCurrentSession(userId, deviceLabel());
        await refresh();
        const cred = await checkOwnerCredential();
        setOwnerHasCredential(cred.hasCredential ?? false);
        const trail = await listOwnerAuthorizations();
        setAuthTrail(
          (trail.authorizations ?? []) as OwnerAuthorizationRecord[],
        );
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "ARCHIE could not start on this device.",
        );
      } finally {
        setBusy(false);
      }
    })();
  }, [userId, refresh]);

  function consentGate(cap: ArchieMobileCapability): boolean {
    if (!consents) return false;
    const gate = checkCapabilityConsent(cap, consents[cap]);
    if (!gate.ok) {
      pushArchie(gate.error!);
      return false;
    }
    return true;
  }

  function pushArchie(text: string) {
    setMessages((m) => [...m, { role: "archie", text }]);
    // ARCHIE's voice: speaks ONLY with an explicit VOICE_OUTPUT consent.
    // External visitors have no voice surface at all, so the
    // consent hint is only meaningful on the privileged PWA.
    if (isPrivileged) {
      const spoken = speakArchie(text, consents?.VOICE_OUTPUT);
      if (!spoken.ok && spoken.error) {
        // Non-blocking hint in the transcript, voice stays off until enabled.
        setMessages((m) => [...m, { role: "system", text: spoken.error! }]);
      }
    }
  }

  // -------------------------------------------------------
  // Assistant actions
  // -------------------------------------------------------
  async function handleSend() {
    const text = input.trim();
    if (!text || busy) return;
    stopArchieVoice();
    setMessages((m) => [...m, { role: "user", text }]);
    setInput("");
    // Voice/text may INITIATE an authorization workflow — but
    // only privileged users have a Security surface at all.
    if (
      isPrivileged &&
      /authoriz|approve|deploy|production change/i.test(text)
    ) {
      purgeTranscriptsForAuthorization(voiceBufferRef.current);
      pushArchie(
        "Owner authorization must be completed in Security → Owner Authorization, the secret is typed into a password field and verified server-side. Opening it now.",
      );
      setTab("security");
      return;
    }
    // Everyone else talks to the REAL ARCHIE engine through the
    // archie-chat edge function: Owner gets full ARCHIE, family
    // and external visitors get the isolated, rate-limited
    // visitor mode with FRELUX site knowledge. No local stubs,
    // no canned text — ARCHIE answers or honestly says why not.
    setBusy(true);
    try {
      const history = messages
        .filter((m) => m.role !== "system")
        .slice(-10)
        .map((m) => ({
          role: m.role === "user" ? ("user" as const) : ("assistant" as const),
          content: m.text,
        }));
      const { data, error: fnError } = await supabase.functions.invoke(
        "archie-chat",
        { body: { message: text, history, clientId: archieClientId() } },
      );
      if (fnError) {
        pushArchie(await getFunctionErrorMessage(fnError));
        return;
      }
      const body = (data ?? {}) as { reply?: string; error?: string };
      if (body.error) {
        pushArchie(body.error);
        return;
      }
      const reply = (body.reply ?? "").trim();
      pushArchie(
        reply || "The assistant produced no response. Please try again.",
      );
    } catch (err) {
      pushArchie(
        err instanceof Error
          ? err.message
          : "ARCHIE could not be reached. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  // -------------------------------------------------
  // PRIVILEGED CHAT — persistent conversations
  // (chat-client: frelux_archie_conversations + messages,
  // RLS per account). Owner and family keep full history,
  // attachments and tool-run audit trails; visitors keep
  // the plain ephemeral flow above.
  // -------------------------------------------------
  const loadConversations = useCallback(
    async (term: string) => {
      if (!user) return;
      try {
        const list = term
          ? await searchConversations(term)
          : await listConversations();
        setConversations(list);
      } catch {
        setConversations([]); // honest boundary — the list stays empty
      }
    },
    [user],
  );

  useEffect(() => {
    if (!isPrivileged) return;
    void loadConversations(convSearch.trim());
  }, [isPrivileged, convSearch, loadConversations]);

  async function openConversation(conv: ArchieConversation) {
    setActiveConv(conv);
    setConvOpen(false);
    try {
      const rows = await listMessages(conv.id);
      setMessages(
        rows.map((r) => ({
          role:
            r.role === "owner"
              ? ("user" as const)
              : (r.role as "archie" | "system"),
          text: r.content,
        })),
      );
    } catch {
      pushArchie("That conversation could not be opened.");
    }
  }

  async function newConversation() {
    try {
      const conv = await createConversation("Assistant chat");
      setActiveConv(conv);
      setConvOpen(false);
      setMessages([{ role: "archie", text: GREETING }]);
      void loadConversations(convSearch.trim());
    } catch (err) {
      pushArchie(
        err instanceof Error
          ? err.message
          : "A new conversation could not be started.",
      );
    }
  }

  async function renameActive() {
    if (!activeConv) return;
    const title = window.prompt("Conversation title", activeConv.title);
    if (!title || !title.trim()) return;
    try {
      await renameConversation(activeConv.id, title.trim());
      setActiveConv({ ...activeConv, title: title.trim().slice(0, 120) });
      void loadConversations(convSearch.trim());
    } catch {
      pushArchie("The conversation could not be renamed.");
    }
  }

  async function archiveActive() {
    if (!activeConv) return;
    try {
      await archiveConversation(activeConv.id);
      setActiveConv(null);
      setMessages([{ role: "archie", text: GREETING }]);
      void loadConversations(convSearch.trim());
    } catch {
      pushArchie("The conversation could not be archived.");
    }
  }

  async function privilegedSend(
    text: string,
    attachments: ArchieChatAttachment[],
  ) {
    if (busy) return;
    stopArchieVoice();
    // Authorization phrases route to the Security tab — never
    // through the chat engine.
    if (/authoriz|approve|deploy|production change/i.test(text)) {
      purgeTranscriptsForAuthorization(voiceBufferRef.current);
      pushArchie(
        "Owner authorization must be completed in Security → Owner Authorization, the secret is typed into a password field and verified server-side. Opening it now.",
      );
      setTab("security");
      return;
    }
    const display = attachments.length
      ? `${text} (📎 ${attachments.map((a) => a.name).join(", ")})`
      : text;
    setMessages((m) => [...m, { role: "user", text: display }]);
    setBusy(true);
    try {
      // Lazy conversation: the first privileged message creates it.
      let conv = activeConv;
      if (!conv) {
        conv = await createConversation("Assistant chat");
        setActiveConv(conv);
      }
      const history = messages
        .filter((m) => m.role !== "system")
        .slice(-10)
        .map((m) => ({
          role: m.role === "user" ? ("owner" as const) : ("archie" as const),
          content: m.text,
        }));
      const { archieMessage } = await sendMessage(
        conv,
        text,
        attachments,
        history,
      );
      // Authority boundary at the point of presentation: a
      // numeric answer is a final RESULT only when its engine
      // is registered in the canonical registry. Chat cannot
      // invoke registered calculator engines, so calculation
      // answers are honestly labeled as estimates.
      const sel = selectTool(text);
      let content = archieMessage.content;
      if (sel.intent === "CALCULATION") {
        const verdict = assertAuthority({ text: content });
        content = verdict.verified
          ? `${content}\n\n[Verified result — engine ${verdict.engine_id}]`
          : `${content}\n\n[ESTIMATE — ${verdict.reason}. This is not a calculator result; use the calculators for verifiable numbers.]`;
      }
      pushArchie(content);
    } catch (err) {
      pushArchie(
        err instanceof Error
          ? err.message
          : "ARCHIE could not be reached. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function startVoice() {
    stopArchieVoice();
    if (!consentGate("VOICE_INPUT")) return;
    const SR =
      (window as unknown as Record<string, unknown>).SpeechRecognition ??
      (window as unknown as Record<string, unknown>).webkitSpeechRecognition;
    if (!SR) {
      pushArchie("Voice recognition is not supported on this device.");
      return;
    }
    const recognition = new (
      SR as new () => {
        lang: string;
        onresult: (e: { results: { 0: { transcript: string } }[] }) => void;
        onend: () => void;
        start: () => void;
      }
    )();
    recognition.lang = "en-US";
    recognition.onresult = (e) => {
      const transcript = e.results[0][0].transcript;
      voiceBufferRef.current.push(transcript);
      setInput((prev) => (prev ? `${prev} ${transcript}` : transcript));
      setVoiceDraft((prev) => (prev ? `${prev} ${transcript}` : transcript));
    };
    recognition.onend = () => setListening(false);
    setListening(true);
    recognition.start();
  }

  async function handleCamera() {
    if (!consentGate("CAMERA")) return;
    photoInputRef.current?.setAttribute("capture", "environment");
    photoInputRef.current?.click();
  }

  async function handlePhotoSelected(f: File | undefined) {
    if (!f) return;
    if (f.size > 25 * 1024 * 1024) {
      pushArchie("That image is too large (max 25 MB).");
      return;
    }
    pushArchie(
      `Photo received (${f.name}, ${(f.size / 1024).toFixed(0)} KB). Ready to use with FRELUX calculators or ARCHIE training.`,
    );
  }

  async function handleFileSelected(f: File | undefined) {
    if (!f) return;
    if (f.size > 100 * 1024 * 1024) {
      pushArbie_safe();
      return;
    }
    pushArchie(
      `File received (${f.name}). Use it with ARCHIE Training or protect it in the Vault.`,
    );
  }
  function pushArbie_safe() {
    pushArchie("That file is too large (max 100 MB).");
  }

  async function handleLocation() {
    if (!consentGate("LOCATION")) return;
    if (!navigator.geolocation) {
      pushArchie("Geolocation is not supported on this device.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        pushArchie(
          `Location: ${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)} (±${Math.round(pos.coords.accuracy)} m). Used only for regional intelligence.`,
        );
      },
      () =>
        pushArchie(
          "Location permission was denied, FRELUX works fine without it.",
        ),
      { timeout: 10000 },
    );
  }

  async function handleNotifications() {
    if (!consentGate("NOTIFICATIONS")) return;
    const perm = await requestNotificationPermission();
    if (perm === "granted") {
      const res = await notifyUserDevice(
        "ARCHIE enabled",
        "You'll get security alerts here.",
      );
      pushArchie(
        res.shown
          ? "Notifications enabled."
          : (res.reason ?? "Notifications could not be shown."),
      );
    } else {
      pushArchie(
        "Notification permission was denied, FRELUX works fine without it.",
      );
    }
  }

  async function handleClipboardPaste() {
    if (!consentGate("CLIPBOARD")) return;
    try {
      const text = await navigator.clipboard.readText();
      setInput((prev) => (prev ? `${prev} ${text}` : text));
    } catch {
      pushArchie(
        "Clipboard permission was denied, FRELUX works fine without it.",
      );
    }
  }

  async function handleClipboardCopy(text: string) {
    if (!consentGate("CLIPBOARD")) return;
    try {
      await navigator.clipboard.writeText(text);
      pushArchie("Copied to clipboard.");
    } catch {
      pushArchie("Clipboard permission was denied.");
    }
  }

  function openLink(url: string) {
    if (!consentGate("OPEN_LINKS")) return;
    if (!isSafeLink(url)) {
      pushArchie("That link is not allowed.");
      return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
  }

  // -------------------------------------------------------
  // Vault actions
  // -------------------------------------------------------
  async function handleProtect() {
    if (!user) return;
    setError("");
    setNotice("");
    if (!vLabel.trim() || !vText.trim() || vPass.length < 12) {
      setError(
        "Label, content and a passphrase of at least 12 characters are required.",
      );
      return;
    }
    setBusy(true);
    try {
      await protectItem(user.id, {
        label: vLabel.trim(),
        itemType: vType,
        plaintext: vText,
        passphrase: vPass,
      });
      setNotice(
        `"${vLabel.trim()}" is encrypted and backed up, the phone is not the only copy.`,
      );
      setVLabel("");
      setVText("");
      setVPass("");
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Protection failed.");
    } finally {
      setBusy(false);
    }
  }

  async function handleRecover(item: ProtectedItem) {
    if (!user) return;
    setError("");
    setRecovered(null);
    if (recoverPass.length < 12) {
      setError("Enter the passphrase (min 12 characters).");
      return;
    }
    setBusy(true);
    try {
      const res = await recoverProtectedItem(user.id, item.id, recoverPass);
      setRecovered(res.plaintext);
      setNotice(
        `Decrypted "${item.label}" (v${res.version.version}), authenticated recovery complete.`,
      );
      setRecoverPass("");
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Recovery failed, wrong passphrase?",
      );
    } finally {
      setBusy(false);
    }
  }

  // -------------------------------------------------------
  // Security actions
  // -------------------------------------------------------
  async function handleToggleCapability(cap: ArchieMobileCapability) {
    if (!user || !consents) return;
    setBusy(true);
    try {
      if (consents[cap]?.granted) await revokeCapability(user.id, cap);
      else await grantCapability(user.id, cap);
      await refresh();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not update the capability.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleTogglePaid(cap: ArchiePaidCapability) {
    if (!user) return;
    setBusy(true);
    try {
      if (paidActivations[cap]) await deactivatePaidCapability(user.id, cap);
      else await activatePaidCapability(user.id, cap);
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function handleRevoke(sessionId: string) {
    if (!user) return;
    setBusy(true);
    try {
      await revokeSession(user.id, sessionId);
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function handleRevokeAll() {
    if (!user) return;
    setBusy(true);
    try {
      const n = await revokeAllOtherSessions(user.id);
      setNotice(
        `${n} other device session(s) revoked. A stolen phone is now locked out.`,
      );
      await notifyUserDevice(
        "Sessions revoked",
        "All other devices were signed out.",
      );
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function handleSetOwnerSecret() {
    setError("");
    setNotice("");
    purgeTranscriptsForAuthorization(voiceBufferRef.current);
    const res = await setOwnerSecret(newOwnerSecret);
    if (!res.ok) {
      setError(res.error ?? "Could not set the owner secret.");
      return;
    }
    setOwnerHasCredential(true);
    setNewOwnerSecret("");
    setNotice(
      "Owner credential stored server-side as a salted hash. The secret is never stored, logged or echoed.",
    );
  }

  async function handleAuthorize() {
    setError("");
    setNotice("");
    if (!authTarget.trim()) {
      setError("A change target is required.");
      return;
    }
    if (!authReason.trim()) {
      setError("The reason/context for this change is required.");
      return;
    }
    purgeTranscriptsForAuthorization(voiceBufferRef.current);
    let before: Record<string, unknown>, after: Record<string, unknown>;
    try {
      before = JSON.parse(authBefore || "{}");
      after = JSON.parse(authAfter || "{}");
    } catch {
      setError("Before/after state must be valid JSON.");
      return;
    }
    setBusy(true);
    try {
      const res = await authorizeOwnerChange({
        changeKind: authKind,
        target: authTarget.trim(),
        reason: authReason.trim(),
        beforeState: before,
        afterState: after,
        testsPassed: authTests,
        rollbackRef: `rollback:${Date.now()}`,
        secret: authSecret,
        engineeringReviewCompleted: authEngReview,
      });
      if (!res.ok) {
        setError(res.error ?? "Authorization failed.");
        return;
      }
      setNotice(
        "Change authorized, audit recorded with before/after state, versions, tests and a rollback reference.",
      );
      setAuthSecret("");
      setAuthTarget("");
      const trail = await listOwnerAuthorizations();
      setAuthTrail((trail.authorizations ?? []) as OwnerAuthorizationRecord[]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-md px-4 pb-24 pt-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Brain className="h-6 w-6 text-primary" />
          <h1 className="text-lg font-bold">ARCHIE</h1>
        </div>
        <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
          {isPrivileged ? "Family PWA" : "FRELUX assistant"}
        </span>
      </div>

      {(error || notice) && (
        <div
          className={classNames(
            "mt-3 flex items-start gap-2 rounded-lg border p-3 text-sm",
            error
              ? "border-red-300 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
              : "border-green-300 bg-green-50 text-green-700 dark:border-green-900 dark:bg-green-950 dark:text-green-300",
          )}
        >
          {error ? (
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          ) : (
            <Check className="mt-0.5 h-4 w-4 shrink-0" />
          )}
          <span>{error || notice}</span>
        </div>
      )}

      {/* Tabs — the full PWA surfaces exist ONLY for the Owner
          and the Owner-registered family network. External
          visitors get a clean chat and nothing else. */}
      {isPrivileged && (
        <div
          className="mt-4 grid grid-cols-4 gap-1 rounded-xl bg-muted p-1"
          role="tablist"
        >
          {TABS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              role="tab"
              aria-selected={tab === key}
              onClick={() => {
                setTab(key);
                setError("");
                setNotice("");
              }}
              className={classNames(
                "flex flex-col items-center gap-0.5 rounded-lg px-1 py-1.5 text-[11px] font-medium transition-colors",
                tab === key
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground",
              )}
            >
              <Icon className="h-4 w-4" /> {label}
            </button>
          ))}
        </div>
      )}

      {busy && (
        <div className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Working…
        </div>
      )}

      {/* ------------------------------------------------- */}
      {/* ASSISTANT */}
      {/* ------------------------------------------------- */}
      {tab === "assistant" && (
        <div className="mt-4 space-y-3" data-testid="archie-assistant">
          <div className="max-h-72 space-y-2 overflow-y-auto rounded-xl border bg-card p-3">
            {messages.map((m, i) => (
              <div
                key={i}
                className={classNames(
                  "max-w-[85%] rounded-xl px-3 py-2 text-sm",
                  m.role === "user"
                    ? "ml-auto bg-primary text-primary-foreground"
                    : m.role === "system"
                      ? "w-full bg-transparent px-0 py-0 text-center text-xs italic text-muted-foreground"
                      : "bg-muted text-foreground",
                )}
              >
                {m.text}
              </div>
            ))}
          </div>

          {isPrivileged && (
            <div className="grid grid-cols-4 gap-2">
              <ActionButton
                icon={Mic}
                label={listening ? "Listening…" : "Voice"}
                onClick={startVoice}
                active={listening}
              />
              <ActionButton
                icon={Camera}
                label="Camera"
                onClick={handleCamera}
              />
              <ActionButton
                icon={ImageIcon}
                label="Photos"
                onClick={() => {
                  photoInputRef.current?.removeAttribute("capture");
                  photoInputRef.current?.click();
                }}
              />
              <ActionButton
                icon={FileText}
                label="Files"
                onClick={() => fileInputRef.current?.click()}
              />
              <ActionButton
                icon={MapPin}
                label="Location"
                onClick={handleLocation}
              />
              <ActionButton
                icon={Bell}
                label="Alerts"
                onClick={handleNotifications}
              />
              <ActionButton
                icon={Clipboard}
                label="Paste"
                onClick={handleClipboardPaste}
              />
              <ActionButton
                icon={Calculator}
                label="Calc"
                onClick={() =>
                  openLink(`${window.location.origin}/paint-calculator`)
                }
              />
            </div>
          )}

          {isPrivileged ? (
            <>
              {/* Persistent-conversation bar — chat-client, RLS-scoped */}
              <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-card p-2 text-xs">
                <button
                  type="button"
                  onClick={() => setConvOpen((o) => !o)}
                  className="rounded-md border px-2 py-1 font-semibold hover:bg-accent"
                >
                  Conversations {convOpen ? "▲" : "▼"}
                </button>
                <span className="max-w-[10rem] truncate text-muted-foreground">
                  {activeConv?.title ?? "New chat — not saved yet"}
                </span>
                <button
                  type="button"
                  onClick={() => void newConversation()}
                  className="rounded-md border px-2 py-1 hover:bg-accent"
                >
                  New
                </button>
                {activeConv && (
                  <>
                    <button
                      type="button"
                      onClick={() => void renameActive()}
                      className="rounded-md border px-2 py-1 hover:bg-accent"
                    >
                      Rename
                    </button>
                    <button
                      type="button"
                      onClick={() => void archiveActive()}
                      className="rounded-md border px-2 py-1 hover:bg-accent"
                    >
                      Archive
                    </button>
                  </>
                )}
                {convOpen && (
                  <div className="w-full space-y-1 border-t pt-2">
                    <input
                      value={convSearch}
                      onChange={(e) => setConvSearch(e.target.value)}
                      placeholder="Search conversations…"
                      aria-label="Search conversations"
                      className="w-full rounded-md border bg-background px-2 py-1"
                    />
                    {conversations.filter((c) => !c.archived).length === 0 && (
                      <p className="px-1 text-muted-foreground">
                        No conversations yet — send a message to start one.
                      </p>
                    )}
                    {conversations
                      .filter((c) => !c.archived)
                      .map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => void openConversation(c)}
                          className="block w-full truncate rounded-md px-2 py-1 text-left hover:bg-accent"
                        >
                          {c.title}
                        </button>
                      ))}
                  </div>
                )}
              </div>
              <ChatComposer
                onSend={privilegedSend}
                busy={busy}
                draft={voiceDraft}
                onDraftConsumed={() => setVoiceDraft("")}
              />
            </>
          ) : (
            <div className="flex gap-2">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSend()}
                placeholder="Ask ARCHIE…"
                className="flex-1 rounded-lg border bg-background px-3 py-2 text-sm"
                aria-label="Ask ARCHIE"
              />
              <button
                onClick={handleSend}
                className="rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground"
                aria-label="Send"
              >
                <ExternalLink className="hidden" /> Send
              </button>
            </div>
          )}

          <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <Sparkles className="h-3 w-3" />
            ARCHIE answers with its own native intelligence engine, grounded in
            FRELUX knowledge — no external AI, ever.
          </p>

          <input
            ref={photoInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => handlePhotoSelected(e.target.files?.[0])}
          />
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={(e) => handleFileSelected(e.target.files?.[0])}
          />
        </div>
      )}

      {/* ------------------------------------------------- */}
      {/* CAPABILITIES */}
      {/* ------------------------------------------------- */}
      {tab === "capabilities" && consents && (
        <div className="mt-4 space-y-2" data-testid="archie-capabilities">
          <p className="text-xs text-muted-foreground">
            ARCHIE never touches a device feature without your explicit
            permission. Unsupported features stay off.
          </p>
          {FREE_CAPABILITY_KEYS.map((cap) => {
            const spec = MOBILE_CAPABILITIES[cap];
            const supported = isCapabilitySupported(cap);
            return (
              <div
                key={cap}
                className="flex items-center justify-between rounded-xl border bg-card p-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium">{spec.label}</p>
                  <p className="text-xs text-muted-foreground">
                    {spec.description}
                  </p>
                  {!supported && (
                    <p className="mt-0.5 text-[11px] text-amber-600 dark:text-amber-400">
                      Not supported on this device
                    </p>
                  )}
                </div>
                <button
                  onClick={() => handleToggleCapability(cap)}
                  disabled={!supported || busy}
                  aria-pressed={consents[cap]?.granted}
                  className={classNames(
                    "ml-3 shrink-0 rounded-full px-3 py-1 text-xs font-semibold transition-colors",
                    consents[cap]?.granted
                      ? "bg-green-600 text-white"
                      : "bg-muted text-muted-foreground",
                    (!supported || busy) && "opacity-50",
                  )}
                >
                  {consents[cap]?.granted ? "Allowed" : "Off"}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* ------------------------------------------------- */}
      {/* VAULT */}
      {/* ------------------------------------------------- */}
      {tab === "vault" && (
        <div className="mt-4 space-y-4" data-testid="archie-vault">
          <div className="rounded-xl border bg-card p-3">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <Lock className="h-4 w-4" /> Protect FRELUX data
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              You choose what to protect. It's encrypted on this phone
              (AES-256-GCM) and only ciphertext is backed up, the passphrase is
              never stored.
            </p>
            <input
              value={vLabel}
              onChange={(e) => setVLabel(e.target.value)}
              placeholder="Label (e.g. Site measurements)"
              className="mt-2 w-full rounded-lg border bg-background px-3 py-2 text-sm"
              aria-label="Item label"
            />
            <select
              value={vType}
              onChange={(e) => setVType(e.target.value as typeof vType)}
              className="mt-2 w-full rounded-lg border bg-background px-3 py-2 text-sm"
              aria-label="Item type"
            >
              {[
                "PROJECT",
                "ESTIMATE",
                "REPORT",
                "DOCUMENT",
                "PLAN",
                "OTHER",
              ].map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <textarea
              value={vText}
              onChange={(e) => setVText(e.target.value)}
              rows={4}
              placeholder="Content to protect…"
              className="mt-2 w-full rounded-lg border bg-background px-3 py-2 text-sm"
              aria-label="Content"
            />
            <input
              type="password"
              value={vPass}
              onChange={(e) => setVPass(e.target.value)}
              placeholder="Passphrase (min 12 chars)"
              className="mt-2 w-full rounded-lg border bg-background px-3 py-2 text-sm"
              aria-label="Passphrase"
            />
            <button
              onClick={handleProtect}
              disabled={busy}
              className="mt-2 w-full rounded-lg bg-primary py-2 text-sm font-semibold text-primary-foreground"
            >
              Encrypt & back up
            </button>
          </div>

          {recovered && (
            <div className="rounded-xl border bg-card p-3">
              <p className="text-xs font-semibold">Recovered content</p>
              <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-all text-xs">
                {recovered}
              </pre>
              <button
                onClick={() => handleClipboardCopy(recovered)}
                className="mt-2 text-xs underline"
              >
                Copy
              </button>
            </div>
          )}

          <div className="space-y-2">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <History className="h-4 w-4" /> Protected items ({items.length})
            </h3>
            {items.length === 0 && (
              <p className="text-xs text-muted-foreground">
                Nothing protected yet.
              </p>
            )}
            {items.map((item) => (
              <div key={item.id} className="rounded-xl border bg-card p-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">{item.label}</p>
                  <span className="rounded bg-muted px-1.5 py-0.5 text-[11px]">
                    {item.item_type} · v{item.latest_version}
                  </span>
                </div>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  {item.cipher} · {(item.size_bytes / 1024).toFixed(1)} KB ·
                  backed up {new Date(item.created_date).toLocaleDateString()}
                </p>
                <div className="mt-2 flex gap-2">
                  <input
                    type="password"
                    value={recoverPass}
                    onChange={(e) => setRecoverPass(e.target.value)}
                    placeholder="Passphrase"
                    aria-label={`Passphrase for ${item.label}`}
                    className="flex-1 rounded-lg border bg-background px-3 py-1.5 text-xs"
                  />
                  <button
                    onClick={() => handleRecover(item)}
                    disabled={busy}
                    className="rounded-lg bg-secondary px-3 py-1.5 text-xs font-semibold"
                  >
                    Decrypt
                  </button>
                </div>
              </div>
            ))}
            <button
              onClick={async () => {
                if (!user) return;
                const n = await clearLocalProtectedCache(user.id);
                setNotice(
                  `Removed ${n} local protected cache(s), where Android permits.`,
                );
              }}
              className="text-xs underline text-muted-foreground"
            >
              Remove locally cached protected data
            </button>
          </div>
        </div>
      )}

      {/* ------------------------------------------------- */}
      {/* SECURITY */}
      {/* ------------------------------------------------- */}
      {tab === "security" && (
        <div className="mt-4 space-y-4" data-testid="archie-security">
          {/* Device sessions */}
          <section className="rounded-xl border bg-card p-3">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <Smartphone className="h-4 w-4" /> Devices & sessions
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              A stolen phone can be locked out instantly from here. Complements
              Android's native anti-theft, never replaces it.
            </p>
            <div className="mt-2 space-y-2">
              {sessions.map((s) => (
                <div
                  key={s.id}
                  className="flex items-center justify-between rounded-lg border p-2"
                >
                  <div className="min-w-0">
                    <p className="text-xs font-medium">
                      {s.device_label}
                      {s.current ? " (this device)" : ""}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {s.revoked
                        ? "REVOKED"
                        : `Last seen ${new Date(s.last_seen).toLocaleString()}`}
                    </p>
                  </div>
                  {!s.revoked && (
                    <button
                      onClick={() => handleRevoke(s.id)}
                      disabled={busy}
                      className="ml-2 shrink-0 rounded-lg bg-red-600 px-2.5 py-1 text-[11px] font-semibold text-white"
                    >
                      Revoke
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button
              onClick={handleRevokeAll}
              disabled={busy}
              className="mt-2 w-full rounded-lg bg-destructive py-2 text-xs font-semibold text-destructive-foreground"
            >
              Stolen phone? Revoke ALL other sessions
            </button>
          </section>

          {/* Paid capabilities */}
          <section className="rounded-xl border bg-card p-3">
            <h2 className="text-sm font-semibold">
              Optional paid capabilities
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Modular, optional, OFF by default. ARCHIE never silently consumes
              a paid service.
            </p>
            <div className="mt-2 space-y-2">
              {PAID_CAPABILITY_KEYS.map((cap) => (
                <div key={cap} className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium">
                      {PAID_CAPABILITIES[cap].label}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {PAID_CAPABILITIES[cap].provider}
                    </p>
                  </div>
                  <button
                    onClick={() => handleTogglePaid(cap)}
                    disabled={busy}
                    aria-pressed={!!paidActivations[cap]}
                    className={classNames(
                      "rounded-full px-3 py-1 text-[11px] font-semibold",
                      paidActivations[cap]
                        ? "bg-green-600 text-white"
                        : "bg-muted text-muted-foreground",
                    )}
                  >
                    {paidActivations[cap] ? "Active" : "Off"}
                  </button>
                </div>
              ))}
            </div>
          </section>

          {/* Security feed */}
          <section className="rounded-xl border bg-card p-3">
            <h2 className="text-sm font-semibold">Security feed</h2>
            <div className="mt-2 space-y-1.5">
              {events.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  No security events yet.
                </p>
              )}
              {events.slice(0, 12).map((e) => (
                <div key={e.id} className="rounded-lg border p-2">
                  <p className="text-xs font-medium">{e.message}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {e.severity} · {new Date(e.created_date).toLocaleString()}
                  </p>
                </div>
              ))}
            </div>
            <button
              onClick={() => {
                if (!user) return;
                markSecurityEventsRead(user.id).then(refresh);
              }}
              className="mt-1 text-xs underline text-muted-foreground"
            >
              Mark all read
            </button>
          </section>

          {/* Owner authorization */}
          <section className="rounded-xl border bg-card p-3">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <KeyRound className="h-4 w-4" /> Owner authorization
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Production changes to FRELUX code, calculator engines,
              deterministic logic or high-risk config are owner-only, verified
              server-side. The secret is never stored, logged or spoken.
            </p>
            {ownerHasCredential === false && (
              <div className="mt-2">
                <input
                  type="password"
                  value={newOwnerSecret}
                  onChange={(e) => setNewOwnerSecret(e.target.value)}
                  placeholder="Set owner secret (min 12 chars)"
                  aria-label="New owner secret"
                  className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
                />
                <button
                  onClick={handleSetOwnerSecret}
                  className="mt-2 w-full rounded-lg bg-primary py-2 text-xs font-semibold text-primary-foreground"
                >
                  Set owner credential
                </button>
              </div>
            )}
            {ownerHasCredential && (
              <div className="mt-2 space-y-2">
                <select
                  value={authKind}
                  onChange={(e) =>
                    setAuthKind(e.target.value as OwnerChangeKind)
                  }
                  className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
                  aria-label="Change kind"
                >
                  {(Object.keys(OWNER_CHANGE_POLICY) as OwnerChangeKind[]).map(
                    (k) => (
                      <option key={k} value={k}>
                        {OWNER_CHANGE_POLICY[k].label}
                        {HIGH_RISK_CHANGE_KINDS.includes(k)
                          ? " (high-risk)"
                          : ""}
                      </option>
                    ),
                  )}
                </select>
                <input
                  value={authTarget}
                  onChange={(e) => setAuthTarget(e.target.value)}
                  placeholder="Target (e.g. src/lib/paint/coverage.ts)"
                  className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
                  aria-label="Change target"
                />
                <input
                  value={authReason}
                  onChange={(e) => setAuthReason(e.target.value)}
                  placeholder="Reason/context (required, stored with the approval record)"
                  className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
                  aria-label="Change reason"
                />
                <input
                  value={authBefore}
                  onChange={(e) => setAuthBefore(e.target.value)}
                  placeholder="Before state (JSON)"
                  className="w-full rounded-lg border bg-background px-3 py-2 text-xs"
                  aria-label="Before state"
                />
                <input
                  value={authAfter}
                  onChange={(e) => setAuthAfter(e.target.value)}
                  placeholder="After state (JSON)"
                  className="w-full rounded-lg border bg-background px-3 py-2 text-xs"
                  aria-label="After state"
                />
                <label className="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={authTests}
                    onChange={(e) => setAuthTests(e.target.checked)}
                  />
                  Test run passed (required)
                </label>
                {HIGH_RISK_CHANGE_KINDS.includes(authKind) && (
                  <label className="flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400">
                    <input
                      type="checkbox"
                      checked={authEngReview}
                      onChange={(e) => setAuthEngReview(e.target.checked)}
                    />
                    Engineering review completed (high-risk gate)
                  </label>
                )}
                <input
                  type="password"
                  value={authSecret}
                  onChange={(e) => setAuthSecret(e.target.value)}
                  placeholder="Owner secret"
                  aria-label="Owner secret"
                  className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
                />
                <button
                  onClick={handleAuthorize}
                  disabled={busy}
                  className="w-full rounded-lg bg-primary py-2 text-xs font-semibold text-primary-foreground"
                >
                  Authorize change (server-side verification)
                </button>
                <p className="text-[11px] text-muted-foreground">
                  {authTrail.length} authorization(s) on record, each with
                  before/after state, versions, tests and a rollback reference.
                </p>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

function ActionButton({
  icon: Icon,
  label,
  onClick,
  active,
}: {
  icon: typeof Mic;
  label: string;
  onClick: () => void;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={classNames(
        "flex flex-col items-center gap-1 rounded-xl border bg-card p-2 text-[11px] font-medium transition-colors hover:bg-accent",
        active && "border-primary text-primary",
      )}
    >
      <Icon className="h-4 w-4" /> {label}
    </button>
  );
}
