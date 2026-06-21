import { parse as parseYaml } from "yaml";
import { readFileSync, existsSync } from "node:fs";
import type { WebhookConfig, WebhookPayload, WebhookEvent } from "./types.js";
import { webhooks } from "./config.js";

const sentTracker = new Map<string, number>();

export function loadWebhookConfigs(configPath: string): WebhookConfig[] {
  if (!webhooks.enabled) return [];
  const path = configPath || webhooks.config_path;
  if (!path || !existsSync(path)) return [];

  try {
    const text = readFileSync(path, "utf8");
    const parsed = parseYaml(text) as { webhooks?: WebhookConfig[] };
    return parsed.webhooks ?? [];
  } catch {
    return [];
  }
}

export function isRateLimited(config: WebhookConfig): boolean {
  const key = config.name;
  const lastSent = sentTracker.get(key);
  if (!lastSent) return false;
  return Date.now() - lastSent < config.rate_limit_ms;
}

function markSent(config: WebhookConfig): void {
  sentTracker.set(config.name, Date.now());
}

export function shouldFireWebhook(
  config: WebhookConfig,
  event: WebhookEvent,
  severity: string,
): boolean {
  if (!config.events.includes(event)) return false;
  if (config.severity_filter) {
    const severityOrder = ["info", "warning", "critical"];
    const configIdx = severityOrder.indexOf(config.severity_filter);
    const eventIdx = severityOrder.indexOf(severity);
    if (eventIdx < configIdx) return false;
  }
  if (isRateLimited(config)) return false;
  return true;
}

export function formatPayload(
  payload: WebhookPayload,
  format: WebhookConfig["format"],
): Record<string, unknown> {
  switch (format) {
    case "slack":
      return {
        text: `[BramhaShiv] ${payload.severity.toUpperCase()}: ${payload.message}`,
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `*${payload.severity.toUpperCase()}* — ${payload.message}`,
            },
          },
        ],
      };

    case "discord":
      return {
        content: `[BramhaShiv] ${payload.severity.toUpperCase()}: ${payload.message}`,
        embeds: [
          {
            title: `BramhaShiv Alert: ${payload.severity.toUpperCase()}`,
            description: payload.message,
            color: payload.severity === "critical" ? 0xff0000 : payload.severity === "warning" ? 0xffaa00 : 0x00ff00,
            timestamp: payload.timestamp,
          },
        ],
      };

    case "pagerduty":
      return {
        routing_key: "bramhashiv",
        event_action: "trigger",
        payload: {
          summary: payload.message,
          severity: payload.severity,
          source: "bramhashiv-ai",
          component: payload.model_id ?? "router",
        },
      };

    default:
      return payload as unknown as Record<string, unknown>;
  }
}

export async function sendWebhook(
  config: WebhookConfig,
  payload: WebhookPayload,
): Promise<{ success: boolean; status: number }> {
  if (!shouldFireWebhook(config, payload.event, payload.severity)) {
    return { success: true, status: 0 };
  }

  const body = formatPayload(payload, config.format);
  try {
    const res = await fetch(config.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(config.headers ?? {}),
      },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      markSent(config);
    }
    return { success: res.ok, status: res.status };
  } catch {
    return { success: false, status: 0 };
  }
}

export function resetWebhookRateLimits(): void {
  sentTracker.clear();
}
