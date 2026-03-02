import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS, loadSettings, saveSettings, validateSettings } from "../src/taskpane/config.js";

const SETTINGS_STORAGE_KEY = "wordContractReviewer.settings";
const SESSION_API_KEY_KEY = "wordContractReviewer.sessionApiKey";

function createStorageMock() {
  const store = new Map();

  return {
    getItem(key) {
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key, value) {
      store.set(String(key), String(value));
    },
    removeItem(key) {
      store.delete(String(key));
    },
    clear() {
      store.clear();
    }
  };
}

beforeEach(() => {
  vi.stubGlobal("localStorage", createStorageMock());
  vi.stubGlobal("sessionStorage", createStorageMock());
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 404 }));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("config.validateSettings", () => {
  it("passes with valid settings", () => {
    const result = validateSettings({
      ...DEFAULT_SETTINGS,
      apiKey: "sk-demo"
    });

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("allows empty api key in mock mode", () => {
    const result = validateSettings(
      {
        ...DEFAULT_SETTINGS,
        apiKey: ""
      },
      { requireApiKey: false }
    );

    expect(result.valid).toBe(true);
  });

  it("fails on missing required fields", () => {
    const result = validateSettings({
      apiUrl: "",
      apiKey: "",
      modelName: "",
      commentAuthor: "",
      prompt: ""
    });

    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(1);
  });
});

describe("config storage behavior", () => {
  it("stores api key in session storage only", () => {
    saveSettings({
      ...DEFAULT_SETTINGS,
      apiKey: "sk-session-only"
    });

    const persisted = JSON.parse(globalThis.localStorage.getItem(SETTINGS_STORAGE_KEY) || "{}");

    expect(persisted.apiKey).toBeUndefined();
    expect(globalThis.sessionStorage.getItem(SESSION_API_KEY_KEY)).toBe("sk-session-only");
  });

  it("loads api key from session storage", async () => {
    globalThis.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify({
      ...DEFAULT_SETTINGS,
      apiKey: "sk-should-not-be-used",
      modelName: "gpt-5-mini"
    }));
    globalThis.sessionStorage.setItem(SESSION_API_KEY_KEY, "sk-from-session");

    const settings = await loadSettings();

    expect(settings.apiKey).toBe("sk-from-session");
  });
});
