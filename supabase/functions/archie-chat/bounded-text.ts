/** Read a response body without buffering more than the caller's byte budget. */
export class ResponseBodyLimitError extends Error {
  constructor(readonly byteLimit: number) {
    super(`response body exceeded ${byteLimit} byte limit`);
    this.name = "ResponseBodyLimitError";
  }
}

export async function readBoundedText(
  response: Response,
  byteLimit: number,
): Promise<string> {
  if (!Number.isSafeInteger(byteLimit) || byteLimit < 0) {
    throw new RangeError("byteLimit must be a non-negative safe integer");
  }
  const reader = response.body?.getReader();
  if (!reader) return "";

  const decoder = new TextDecoder();
  const chunks: string[] = [];
  let bytesRead = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytesRead += value.byteLength;
      if (bytesRead > byteLimit) {
        try {
          await reader.cancel("response body limit exceeded");
        } catch {
          // The size limit still rejects the response if cancellation races.
        }
        throw new ResponseBodyLimitError(byteLimit);
      }
      chunks.push(decoder.decode(value, { stream: true }));
    }
    chunks.push(decoder.decode());
    return chunks.join("");
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // A cancelled or errored reader may already have released its lock.
    }
  }
}
