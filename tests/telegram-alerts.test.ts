import { describe, test, expect, beforeEach } from "bun:test";
import { alreadySentRecently, markSent, sendTelegramAlert, formatHealthAlert, isTelegramConfigured } from "../src/telegram-alerts.js";

describe("telegram-alerts", () => {
  describe("formatHealthAlert", () => {
    test("formats critical alert", () => {
      const msg = formatHealthAlert("anthropic/opus", 0.2, 0.5);
      expect(msg).toContain("CRITICAL");
      expect(msg).toContain("anthropic/opus");
      expect(msg).toContain("20%");
    });

    test("formats degraded alert", () => {
      const msg = formatHealthAlert("google/gemini", 0.4, 0.5);
      expect(msg).toContain("DEGRADED");
      expect(msg).toContain("40%");
    });

    test("formats warning alert (health just below threshold)", () => {
      const msg = formatHealthAlert("huggingface/kimi", 0.49, 0.5);
      // 0.49 < 0.5 = DEGRADED, WARNING is for >=0.5
      expect(msg).toContain("DEGRADED");
      expect(msg).toContain("49%");
    });

    test("formats warning alert at threshold boundary", () => {
      const msg = formatHealthAlert("test/model", 0.50, 0.5);
      expect(msg).toContain("WARNING");
      expect(msg).toContain("50%");
    });

    test("includes threshold in message", () => {
      const msg = formatHealthAlert("test/model", 0.3, 0.5);
      expect(msg).toContain("50%");
    });

    test("formats HTML tags", () => {
      const msg = formatHealthAlert("test/model", 0.3, 0.5);
      expect(msg).toContain("<b>");
      expect(msg).toContain("<code>");
    });
  });

  describe("isTelegramConfigured", () => {
    test("returns boolean", () => {
      expect(typeof isTelegramConfigured()).toBe("boolean");
    });
  });

  describe("rate limiting (alreadySentRecently / markSent)", () => {
    beforeEach(() => {
      // Reset internal state by calling alreadySentRecently to clear
      alreadySentRecently("__cleanup__");
    });

    test("alreadySentRecently returns false for unsent model", () => {
      expect(alreadySentRecently("non-existent-model")).toBe(false);
    });

    test("alreadySentRecently returns true after marking", () => {
      markSent("model-a");
      expect(alreadySentRecently("model-a")).toBe(true);
    });

    test("alreadySentRecently returns false for different model", () => {
      markSent("model-a");
      expect(alreadySentRecently("model-b")).toBe(false);
    });

    test("multiple marks don't crash", () => {
      markSent("model-a");
      markSent("model-a");
      expect(alreadySentRecently("model-a")).toBe(true);
    });

    test("sendTelegramAlert no-ops when not configured", async () => {
      // Should not throw when token/chat_id are empty
      await expect(sendTelegramAlert("test message")).resolves.toBeUndefined();
    });
  });
});
