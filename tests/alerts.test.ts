import { describe, test, expect, beforeEach } from "bun:test";
import { checkHealthAlert, resetHealthAlerts } from "../src/alerts.js";
import type { HealthRecord } from "../src/types.js";

function makeRecord(overrides: Partial<HealthRecord> = {}): HealthRecord {
  return {
    provider: "anthropic",
    model_id: "anthropic/opus",
    latency_samples: [],
    error_count: 0,
    success_count: 10,
    last_used: Date.now(),
    health_score: 0.9,
    ...overrides,
  };
}

describe("alerts", () => {
  describe("checkHealthAlert", () => {
    beforeEach(() => {
      resetHealthAlerts();
    });

    test("returns null when health is above threshold", () => {
      const record = makeRecord({ health_score: 0.9 });
      expect(checkHealthAlert(record)).toBeNull();
    });

    test("returns alert when health drops below threshold", () => {
      const record = makeRecord({ health_score: 0.3 });
      const alert = checkHealthAlert(record);
      expect(alert).not.toBeNull();
      expect(alert).toContain("anthropic/opus");
      expect(alert).toContain("0.30");
    });

    test("returns null on second call for same model (dedup)", () => {
      const record = makeRecord({ health_score: 0.3 });
      expect(checkHealthAlert(record)).not.toBeNull();
      expect(checkHealthAlert(record)).toBeNull();
    });

    test("returns alert for different models", () => {
      const a = makeRecord({ model_id: "a", health_score: 0.3 });
      const b = makeRecord({ model_id: "b", health_score: 0.3 });
      expect(checkHealthAlert(a)).not.toBeNull();
      expect(checkHealthAlert(b)).not.toBeNull();
    });

    test("clears warning when health recovers above threshold", () => {
      const record = makeRecord({ health_score: 0.3 });
      expect(checkHealthAlert(record)).not.toBeNull();

      const recovered = makeRecord({ health_score: 0.9 });
      expect(checkHealthAlert(recovered)).toBeNull();

      // Drop again — should alert again since it was cleared
      const dropAgain = makeRecord({ health_score: 0.3 });
      expect(checkHealthAlert(dropAgain)).not.toBeNull();
    });

    test("returns null on boundary health (at threshold)", () => {
      const record = makeRecord({ health_score: 0.5 });
      const alert = checkHealthAlert(record);
      // 0.5 >= 0.5 threshold means no alert
      expect(alert).toBeNull();
    });

    test("formats alert with model_id and score", () => {
      const record = makeRecord({ model_id: "google/gemini", health_score: 0.25 });
      const alert = checkHealthAlert(record)!;
      expect(alert).toContain("[ALERT]");
      expect(alert).toContain("google/gemini");
      expect(alert).toContain("0.25");
      expect(alert).toContain("0.5");
    });
  });

  describe("resetHealthAlerts", () => {
    beforeEach(() => {
      resetHealthAlerts();
    });

    test("clears all warned models", () => {
      const record = makeRecord({ health_score: 0.3 });
      expect(checkHealthAlert(record)).not.toBeNull();
      resetHealthAlerts();
      expect(checkHealthAlert(record)).not.toBeNull(); // alerts again
    });
  });
});
