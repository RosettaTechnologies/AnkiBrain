import { beforeEach, expect, test, vi } from "vitest";

vi.mock("./PythonBridge", () => ({ asendPythonCommand: vi.fn() }));
vi.mock("./user", () => ({ isLocalMode: () => true }));
vi.mock("./toast", () => ({
  errorToast: vi.fn(),
  infoToast: vi.fn(),
  successToast: vi.fn(),
}));
vi.mock("./PythonBridge/senders/pyOpenDocumentBrowser", () => ({
  pyOpenDocumentBrowser: vi.fn(),
}));
vi.mock("./PythonBridge/senders/pyDeleteAllDocuments", () => ({
  pyDeleteAllDocuments: vi.fn(),
}));
vi.mock("./PythonBridge/senders/pyEditSetting", () => ({
  pyEditSetting: vi.fn(),
}));

import { asendPythonCommand } from "./PythonBridge";
import { splitSelectedDocument } from "./documents";

beforeEach(() => {
  asendPythonCommand.mockReset();
});

test("local split surfaces chunk_pages as chunkPages", async () => {
  asendPythonCommand.mockResolvedValue({
    chunks: JSON.stringify(["a", "b", "c"]),
    chunk_pages: JSON.stringify([1, 1, 2]),
    images: JSON.stringify([{ id: "run1/p.png", url: "u", anchorChunk: 2 }]),
  });

  const res = await splitSelectedDocument(
    { path: "/tmp/x.pdf", size: 10 },
    vi.fn()
  );

  expect(asendPythonCommand.mock.calls[0][0]).toBe("SPLIT_DOCUMENT");
  expect(res.chunkPages).toEqual([1, 1, 2]);
  expect(res.chunks).toEqual(["a", "b", "c"]);
  expect(res.images).toHaveLength(1);
});

test("missing chunk_pages degrades to null", async () => {
  asendPythonCommand.mockResolvedValue({
    chunks: JSON.stringify(["a"]),
    images: "[]",
  });

  const res = await splitSelectedDocument(
    { path: "/tmp/y.txt", size: 10 },
    vi.fn()
  );

  expect(res.chunkPages).toBeNull();
});
