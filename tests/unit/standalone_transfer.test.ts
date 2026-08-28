import { afterEach, describe, expect, it, vi } from "vitest";
import { JSDOM } from "jsdom";
import { createAppShell, type AppShell } from "../../src/ui/render";
import { buildViewModel } from "../../src/economy/viewmodel";
import { MAX_SUPPORTED_SCHEMA_VERSION } from "../../src/save/types";
import { makeSession } from "./helpers";

let dom: JSDOM;
let shell: AppShell | undefined;
afterEach(() => {
  shell?.destroy();
  shell = undefined;
  dom?.window.close();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function setup() {
  dom = new JSDOM("<!doctype html><div id='app'></div>", { url: "http://localhost/", pretendToBeVisual: true });
  vi.stubGlobal("window", dom.window);
  vi.stubGlobal("document", dom.window.document);
  vi.stubGlobal("HTMLElement", dom.window.HTMLElement);
  vi.stubGlobal("localStorage", dom.window.localStorage);
  const harness = makeSession();
  shell = createAppShell(document.getElementById("app")!);
  const handler = vi.fn((command: string, payload?: unknown) => command === "import_json"
    ? harness.session.importJson((payload as { text: string }).text)
    : { ok: false });
  shell.setCommandHandler(handler);
  shell.render(buildViewModel(harness.session.getState()));
  const input = document.querySelector<HTMLInputElement>("input[type=file]")!;
  return { ...harness, handler, input };
}

function choose(input: HTMLInputElement, text: string, size = text.length) {
  Object.defineProperty(input, "files", { configurable: true, value: [{ size, text: async () => text }] });
  input.dispatchEvent(new dom.window.Event("change"));
}

const clickAction = (action: string) => document.querySelector<HTMLButtonElement>(`[data-action='${action}']`)!.click();

describe("local-only backup and disabled-ad UI", () => {
  it("opens a file picker only on an explicit import command", () => {
    const { input, handler } = setup();
    const picker = vi.spyOn(input, "click").mockImplementation(() => undefined);
    document.querySelector<HTMLButtonElement>("[data-command='import_json']")!.click();
    expect(picker).toHaveBeenCalledOnce();
    expect(handler).not.toHaveBeenCalled();
  });

  it("does not import before confirmation, keeps cancellation safe, and supports choosing again", async () => {
    const { input, session, storage, handler } = setup();
    const before = storage.load();
    const replacement = JSON.stringify({ ...session.getState(), money: 321, saveId: "local-import-fixture" });
    choose(input, replacement);
    await vi.waitFor(() => expect(document.querySelector(".dialog-overlay")).not.toBeNull());
    expect(handler).not.toHaveBeenCalled();
    expect(storage.load()).toEqual(before);
    clickAction("dialog_cancel");
    expect(storage.load()).toEqual(before);
    choose(input, replacement);
    await vi.waitFor(() => expect(document.querySelector(".dialog-overlay")).not.toBeNull());
    clickAction("dialog_confirm");
    expect(handler).toHaveBeenCalledOnce();
    expect(session.getState().saveId).toBe("local-import-fixture");
    expect(session.getState().money).toBe(321);
    expect(storage.load()?.saveId).toBe("local-import-fixture");
  });

  it.each(["not JSON", "{}", JSON.stringify({ schemaVersion: MAX_SUPPORTED_SCHEMA_VERSION + 1 })])("never overwrites current progress with invalid or future backup: %s", async (backup) => {
    const { input, session, storage } = setup();
    const before = session.exportJson();
    const persisted = storage.load();
    choose(input, backup);
    await vi.waitFor(() => expect(document.querySelector(".dialog-overlay")).not.toBeNull());
    clickAction("dialog_confirm");
    expect(session.exportJson()).toBe(before);
    expect(storage.load()).toEqual(persisted);
  });

  it("retains current state and storage if importing a valid save cannot be persisted", async () => {
    const { input, session, storage } = setup();
    const before = session.exportJson();
    const persisted = storage.load();
    vi.spyOn(storage, "save").mockReturnValue(false);
    choose(input, JSON.stringify({ ...session.getState(), money: 321 }));
    await vi.waitFor(() => expect(document.querySelector(".dialog-overlay")).not.toBeNull());
    clickAction("dialog_confirm");
    expect(session.exportJson()).toBe(before);
    expect(storage.load()).toEqual(persisted);
  });

  it("rejects oversized files without confirmation or writes", async () => {
    const { input, handler } = setup();
    choose(input, "{}", 2 * 1024 * 1024 + 1);
    await vi.waitFor(() => expect(document.querySelector(".toast")?.textContent).toContain("导入失败"));
    expect(document.querySelector(".dialog-overlay")).toBeNull();
    expect(handler).not.toHaveBeenCalled();
  });

  it("does not dispatch disabled ad buttons even with synthetic clicks", () => {
    const { handler, session } = setup();
    const before = session.exportJson();
    const buttons = [...document.querySelectorAll<HTMLButtonElement>("[data-action^='prepare_sponsor_ad:']")];
    expect(buttons).toHaveLength(2);
    for (const button of buttons) {
      expect(button.disabled).toBe(true);
      button.click();
      button.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
    }
    expect(handler).not.toHaveBeenCalled();
    expect(session.exportJson()).toBe(before);
  });
});
