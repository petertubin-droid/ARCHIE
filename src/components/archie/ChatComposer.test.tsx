// =========================================================
// ARCHIE PWA — CHAT COMPOSER
//
// Multimodal Owner input. The contract under test:
//   * Every file is explicitly selected by the Owner —
//     uploads go to the private per-user archie-media bucket.
//   * Empty messages never send; failures surface honestly
//     in the alert region.
//   * Oversize files are refused before upload.
//   * Attachments can be removed before sending.
// =========================================================

import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const uploadMock = vi.fn();
const getUserMock = vi.fn();
vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: { getUser: () => getUserMock() },
    storage: {
      from: () => ({ upload: (...a: unknown[]) => uploadMock(...a) }),
    },
  },
}));

import ChatComposer from "@/components/archie/ChatComposer";

beforeEach(() => {
  vi.clearAllMocks();
  getUserMock.mockResolvedValue({ data: { user: { id: "owner-1" } } });
  uploadMock.mockResolvedValue({ error: null });
});

function renderComposer(
  over: {
    onSend?: (t: string, a: unknown[]) => Promise<void>;
    busy?: boolean;
  } = {},
) {
  const onSend =
    over.onSend ??
    (vi.fn() as unknown as (t: string, a: unknown[]) => Promise<void>);
  (onSend as ReturnType<typeof vi.fn>).mockResolvedValue?.(undefined);
  render(<ChatComposer onSend={onSend as never} busy={over.busy ?? false} />);
  return { onSend: onSend as ReturnType<typeof vi.fn> };
}

describe("ChatComposer", () => {
  it("renders the composer and never sends an empty message", async () => {
    const { onSend } = renderComposer();
    expect(screen.getByTestId("archie-composer")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /send message/i }));
    await waitFor(() => expect(onSend).not.toHaveBeenCalled());
  });

  it("sends the typed text and clears the field", async () => {
    const { onSend } = renderComposer();
    const box = screen.getByLabelText(/message ARCHIE/i) as HTMLTextAreaElement;
    fireEvent.change(box, { target: { value: "  Estimate my roof  " } });
    fireEvent.click(screen.getByRole("button", { name: /send message/i }));

    await waitFor(() => expect(onSend).toHaveBeenCalledTimes(1));
    expect(onSend).toHaveBeenCalledWith("Estimate my roof", []);
    // Field cleared for the next message.
    await waitFor(() => expect(box.value).toBe(""));
  });

  it("blocks sending while ARCHIE is busy — no double sends", async () => {
    const { onSend } = renderComposer({ busy: true });
    const box = screen.getByLabelText(/message ARCHIE/i);
    fireEvent.change(box, { target: { value: "hello" } });
    const sendBtn = screen.getByRole("button", {
      name: /send message/i,
    }) as HTMLButtonElement;
    expect(sendBtn.disabled).toBe(true);
    fireEvent.click(sendBtn);
    await waitFor(() => expect(onSend).not.toHaveBeenCalled());
  });

  it("surfaces a failed ARCHIE response honestly in the alert region", async () => {
    const onSend = vi.fn();
    onSend.mockRejectedValue(new Error("ARCHIE is offline"));
    render(<ChatComposer onSend={onSend as never} busy={false} />);
    fireEvent.change(screen.getByLabelText(/message ARCHIE/i), {
      target: { value: "hi" },
    });
    fireEvent.click(screen.getByRole("button", { name: /send message/i }));

    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByText(/ARCHIE is offline/i)).toBeTruthy();
    // The draft is preserved — the Owner's words are never lost.
    expect(
      (screen.getByLabelText(/message ARCHIE/i) as HTMLTextAreaElement).value,
    ).toBe("hi");
  });

  it("refuses files larger than the 20 MB cap before any upload", async () => {
    renderComposer();
    const input = screen
      .getByTestId("archie-composer")
      .querySelector('input[type="file"]') as HTMLInputElement;

    const huge = new File(["x".repeat(10)], "huge.pdf", {
      type: "application/pdf",
    });
    Object.defineProperty(huge, "size", { value: 21 * 1024 * 1024 });
    const dt = new DataTransfer();
    dt.items.add(huge);

    fireEvent.change(input, { target: { files: dt.files } });
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByText(/exceeds 20 MB/i)).toBeTruthy();
    expect(uploadMock).not.toHaveBeenCalled();
  });

  it("uploads explicitly selected files to the PRIVATE per-user bucket", async () => {
    renderComposer();
    const input = screen
      .getByTestId("archie-composer")
      .querySelector('input[type="file"]') as HTMLInputElement;

    const file = new File(["data"], "plan.pdf", { type: "application/pdf" });
    const dt = new DataTransfer();
    dt.items.add(file);
    fireEvent.change(input, { target: { files: dt.files } });

    await waitFor(() => expect(uploadMock).toHaveBeenCalledTimes(1));
    const [path, sent] = uploadMock.mock.calls[0] as [string, File];
    expect(path.startsWith("owner-1/")).toBe(true); // private per-user path
    expect(sent).toBe(file);
    // The attachment chip appears and can be removed before sending.
    expect(await screen.findByText("plan.pdf")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Remove plan.pdf/i }));
    expect(screen.queryByText("plan.pdf")).toBeNull();
  });

  it("reports an honest error when the upload itself fails", async () => {
    uploadMock.mockResolvedValue({ error: { message: "bucket unreachable" } });
    renderComposer();
    const input = screen
      .getByTestId("archie-composer")
      .querySelector('input[type="file"]') as HTMLInputElement;

    const file = new File(["data"], "doc.pdf", { type: "application/pdf" });
    const dt = new DataTransfer();
    dt.items.add(file);
    fireEvent.change(input, { target: { files: dt.files } });

    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByText(/bucket unreachable/i)).toBeTruthy();
  });
});
