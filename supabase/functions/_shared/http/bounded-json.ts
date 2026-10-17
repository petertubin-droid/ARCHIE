export type BoundedJsonResult =
  | { ok: true; value: unknown }
  | { ok: false; reason: "too_large" | "invalid_json" | "read_error" | "timeout" };

/** Parse JSON from a request while enforcing a hard byte cap before buffering. */
export async function readBoundedJsonRequest(
  request: Request,
  maxBytes: number,
  timeoutMs = 10_000,
): Promise<BoundedJsonResult> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) {
    throw new RangeError("maxBytes must be a positive safe integer");
  }
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1) {
    throw new RangeError("timeoutMs must be a positive safe integer");
  }

  const contentLength = request.headers.get("content-length");
  if (contentLength && /^\d+$/.test(contentLength) && Number(contentLength) > maxBytes) {
    // Do not await cancellation on an untrusted stream; cancellation may
    // itself be stalled by a client that keeps the upload open.
    void request.body?.cancel("request body limit exceeded").catch(() => {});
    return { ok: false, reason: "too_large" };
  }

  const reader = request.body?.getReader();
  if (!reader) return { ok: false, reason: "invalid_json" };
  const chunks: Uint8Array[] = [];
  let bytesRead = 0;
  let timedOut = false;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => {
      timedOut = true;
      reject(new Error("request body read timed out"));
    }, timeoutMs);
  });
  try {
    for (;;) {
      const { done, value } = await Promise.race([reader.read(), deadline]);
      if (done) break;
      bytesRead += value.byteLength;
      if (bytesRead > maxBytes) {
        try { await reader.cancel("request body limit exceeded"); } catch { /* limit still rejects */ }
        return { ok: false, reason: "too_large" };
      }
      chunks.push(value);
    }
  } catch {
    void reader.cancel(timedOut ? "request body read timed out" : "request body read failed").catch(() => {});
    return { ok: false, reason: timedOut ? "timeout" : "read_error" };
  } finally {
    if (timeout) clearTimeout(timeout);
    try { reader.releaseLock(); } catch { /* already released */ }
  }

  const bytes = new Uint8Array(bytesRead);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return { ok: true, value: JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) };
  } catch {
    return { ok: false, reason: "invalid_json" };
  }
}
