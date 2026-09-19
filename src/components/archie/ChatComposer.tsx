// =========================================================
// FRELUX ARCHIE STAGE 1, CHAT COMPOSER
//
// Multimodal Owner input: text, images (gallery), camera,
// documents/PDF, and voice recording. ARCHIE never touches the
// device: every file is explicitly selected or recorded by
// the Owner. Attachments upload to the private per-user
// archie-media bucket; only the Owner can read them.
// =========================================================
import { useEffect, useRef, useState } from "react";
import { Paperclip, Camera, Mic, Square, X, Send, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { ArchieChatAttachment } from "@/lib/archie/chat-client";
import { classNames } from "@/lib/utils";

const MAX_FILE_MB = 20;
const ACCEPTED_DOCS = ".pdf,.txt,.md,.csv,.json,.doc,.docx,.xls,.xlsx";

interface Props {
  onSend: (text: string, attachments: ArchieChatAttachment[]) => Promise<void>;
  busy: boolean;
  /** Externally-injected draft (e.g. a voice transcript) —
   *  appended to the composer once, then consumed. */
  draft?: string;
  onDraftConsumed?: () => void;
}

export default function ChatComposer({
  onSend,
  busy,
  draft,
  onDraftConsumed,
}: Props) {
  const [text, setText] = useState("");
  const [attachments, setAttachments] = useState<ArchieChatAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Voice transcripts and other external drafts land in the
  // composer exactly once — the caller clears the prop.
  const consumedRef = useRef<string | null>(null);
  const onConsumedRef = useRef(onDraftConsumed);
  onConsumedRef.current = onDraftConsumed;
  useEffect(() => {
    if (!draft || consumedRef.current === draft) return;
    consumedRef.current = draft;
    setText((prev) => (prev ? `${prev} ${draft}` : draft));
    onConsumedRef.current?.();
  }, [draft]);

  const fileRef = useRef<HTMLInputElement>(null);
  const imageRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  async function addFiles(files: FileList | null) {
    if (!files?.length) return;
    setError(null);
    setUploading(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in");

      const added: ArchieChatAttachment[] = [];
      for (const file of Array.from(files).slice(0, 5)) {
        if (file.size > MAX_FILE_MB * 1024 * 1024) {
          throw new Error(`${file.name} exceeds ${MAX_FILE_MB} MB`);
        }
        const safeName = file.name.replace(/[^\w.-]/g, "_");
        const path = `${user.id}/chat_${Date.now()}_${safeName}`;
        const { error: upErr } = await supabase.storage
          .from("archie-media")
          .upload(path, file, { upsert: false });
        if (upErr) throw new Error(upErr.message);
        added.push({
          name: file.name,
          type: file.type || "application/octet-stream",
          uri: path,
        });
      }
      setAttachments((prev) => [...prev, ...added].slice(0, 8));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function toggleRecording() {
    if (recording) {
      recorderRef.current?.stop();
      setRecording(false);
      return;
    }
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("Voice recording is not supported by this browser");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      recorderRef.current = recorder;
      chunksRef.current = [];
      recorder.ondataavailable = (e) => chunksRef.current.push(e.data);
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        const file = new File([blob], `voice_${Date.now()}.webm`, {
          type: "audio/webm",
        });
        const dt = new DataTransfer();
        dt.items.add(file);
        await addFiles(dt.files);
      };
      recorder.start();
      setRecording(true);
    } catch {
      setError("Microphone permission was not granted");
    }
  }

  async function handleSend() {
    const trimmed = text.trim();
    if ((!trimmed && attachments.length === 0) || busy || uploading) return;
    setError(null);
    try {
      await onSend(trimmed || "(attachment)", attachments);
      setText("");
      setAttachments([]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "ARCHIE could not respond");
    }
  }

  return (
    <div
      className="border-t border-border bg-card p-3"
      data-testid="archie-composer"
    >
      {attachments.length > 0 && (
        <ul className="mb-2 flex flex-wrap gap-2" aria-label="Attachments">
          {attachments.map((a, i) => (
            <li
              key={`${a.name}-${i}`}
              className="flex items-center gap-1.5 rounded-full border border-border bg-muted px-2.5 py-1 text-xs text-foreground"
            >
              <span className="max-w-32 truncate">{a.name}</span>
              <button
                type="button"
                aria-label={`Remove ${a.name}`}
                onClick={() =>
                  setAttachments((prev) => prev.filter((_, j) => j !== i))
                }
                className="text-muted-foreground transition-colors hover:text-destructive"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {error && (
        <p role="alert" className="mb-2 text-xs text-destructive">
          {error}
        </p>
      )}

      <div className="flex items-end gap-1.5">
        <div className="flex">
          <button
            type="button"
            aria-label="Attach document or PDF"
            title="Documents, PDF, spreadsheets"
            onClick={() => fileRef.current?.click()}
            disabled={busy || uploading}
            className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
          >
            <Paperclip className="h-5 w-5" aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label="Attach image from gallery"
            onClick={() => imageRef.current?.click()}
            disabled={busy || uploading}
            className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-5 w-5"
              aria-hidden="true"
            >
              <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
              <circle cx="9" cy="9" r="2" />
              <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
            </svg>
          </button>
          <button
            type="button"
            aria-label="Take a photo with camera"
            onClick={() => cameraRef.current?.click()}
            disabled={busy || uploading}
            className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
          >
            <Camera className="h-5 w-5" aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label={
              recording ? "Stop voice recording" : "Record a voice message"
            }
            onClick={toggleRecording}
            disabled={busy || uploading}
            aria-pressed={recording}
            className={classNames(
              "rounded-lg p-2 transition-colors disabled:opacity-50",
              recording
                ? "bg-destructive/10 text-destructive"
                : "text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
          >
            {recording ? (
              <Square className="h-5 w-5" aria-hidden="true" />
            ) : (
              <Mic className="h-5 w-5" aria-hidden="true" />
            )}
          </button>
        </div>

        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          rows={1}
          placeholder="Message ARCHIE…"
          aria-label="Message ARCHIE"
          className="max-h-32 flex-1 resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />

        <button
          type="button"
          onClick={handleSend}
          disabled={
            busy || uploading || (!text.trim() && attachments.length === 0)
          }
          aria-label="Send message"
          className="rounded-lg bg-primary p-2 text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
        >
          {busy || uploading ? (
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
          ) : (
            <Send className="h-5 w-5" aria-hidden="true" />
          )}
        </button>
      </div>

      {/* Explicit file inputs: ARCHIE only ingests what the Owner selects */}
      <input
        ref={fileRef}
        type="file"
        multiple
        accept={ACCEPTED_DOCS}
        className="hidden"
        onChange={(e) => {
          addFiles(e.target.files);
          e.target.value = "";
        }}
      />
      <input
        ref={imageRef}
        type="file"
        multiple
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          addFiles(e.target.files);
          e.target.value = "";
        }}
      />
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          addFiles(e.target.files);
          e.target.value = "";
        }}
      />
    </div>
  );
}
