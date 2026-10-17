import { describe, expect, it } from "vitest";
import { readBoundedText, ResponseBodyLimitError } from "./bounded-text.ts";

function streamedResponse(chunks: Uint8Array[]): { response: Response; cancelled: () => boolean } {
  let wasCancelled = false;
  let index = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (index < chunks.length) controller.enqueue(chunks[index++]);
      else controller.close();
    },
    cancel() {
      wasCancelled = true;
    },
  });
  return { response: new Response(body), cancelled: () => wasCancelled };
}

describe("readBoundedText", () => {
  it("reads a response within its byte budget and decodes split UTF-8 safely", async () => {
    const bytes = new TextEncoder().encode("A🌍B");
    const { response } = streamedResponse([bytes.slice(0, 3), bytes.slice(3)]);
    await expect(readBoundedText(response, bytes.byteLength)).resolves.toBe("A🌍B");
  });

  it("cancels and rejects a body as soon as it exceeds the byte budget", async () => {
    const { response, cancelled } = streamedResponse([
      new TextEncoder().encode("1234"),
      new TextEncoder().encode("5678"),
    ]);
    await expect(readBoundedText(response, 6)).rejects.toBeInstanceOf(ResponseBodyLimitError);
    expect(cancelled()).toBe(true);
  });

  it("treats a bodyless response as empty", async () => {
    await expect(readBoundedText(new Response(null), 0)).resolves.toBe("");
  });

  it("rejects invalid byte budgets", async () => {
    await expect(readBoundedText(new Response("x"), -1)).rejects.toThrow(RangeError);
  });
});
