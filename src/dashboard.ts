import type {
  RoutingHistoryEntry,
  ModelHealthSnapshot,
  DashboardMetrics,
  BudgetStatus,
  TraitName,
} from "./types.js";
import { dashboard } from "./config.js";

export function createHistoryBuffer(maxSize: number) {
  const buffer: RoutingHistoryEntry[] = [];

  return {
    push(entry: RoutingHistoryEntry): void {
      buffer.unshift(entry);
      if (buffer.length > maxSize) buffer.pop();
    },
    getAll(): RoutingHistoryEntry[] {
      return [...buffer];
    },
    clear(): void {
      buffer.length = 0;
    },
    size(): number {
      return buffer.length;
    },
  };
}

export function computeMetrics(
  history: RoutingHistoryEntry[],
  startTime: number,
): DashboardMetrics {
  const completed = history.filter((h) => h.success !== undefined);
  const successes = completed.filter((h) => h.success);
  const latencies = history.filter((h) => h.latency_ms !== undefined).map((h) => h.latency_ms!);

  const modelUsage: Record<string, number> = {};
  const traitDist: Record<string, number> = {};

  for (const entry of history) {
    modelUsage[entry.picked_model] = (modelUsage[entry.picked_model] ?? 0) + 1;
    for (const trait of entry.top_traits) {
      traitDist[trait] = (traitDist[trait] ?? 0) + 1;
    }
  }

  const totalSpend = history.reduce((sum, h) => sum + (h.cost_usd ?? 0), 0);

  return {
    total_tasks: history.length,
    success_rate: completed.length > 0 ? successes.length / completed.length : 0,
    avg_latency_ms: latencies.length > 0 ? latencies.reduce((a, b) => a + b, 0) / latencies.length : 0,
    total_spend_usd: totalSpend,
    model_usage: modelUsage,
    trait_distribution: traitDist,
    uptime_ms: Date.now() - startTime,
  };
}

export function buildHealthSnapshots(
  healthRecords: Array<{ model_id: string; provider: string; health_score: number; success_count: number; error_count: number; latency_samples: number[] }>,
  unavailable: Set<string>,
): ModelHealthSnapshot[] {
  return healthRecords.map((h) => {
    const total = h.success_count + h.error_count;
    const avgLatency =
      h.latency_samples.length > 0
        ? h.latency_samples.reduce((a, b) => a + b, 0) / h.latency_samples.length
        : 0;
    return {
      model_id: h.model_id,
      provider: h.provider,
      health_score: h.health_score,
      success_rate: total > 0 ? h.success_count / total : 1,
      avg_latency_ms: avgLatency,
      total_calls: total,
      is_unavailable: unavailable.has(h.model_id),
    };
  });
}

const DASHBOARD_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>BramhaShiv AI Dashboard</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'SF Mono', 'Fira Code', monospace; background: #0d1117; color: #c9d1d9; padding: 20px; }
  h1 { color: #58a6ff; margin-bottom: 20px; font-size: 1.5em; }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 16px; margin-bottom: 24px; }
  .card { background: #161b22; border: 1px solid #30363d; border-radius: 8px; padding: 16px; }
  .card h3 { color: #8b949e; font-size: 0.8em; text-transform: uppercase; margin-bottom: 8px; }
  .card .value { font-size: 2em; font-weight: bold; color: #f0f6fc; }
  .card .sub { font-size: 0.8em; color: #8b949e; margin-top: 4px; }
  table { width: 100%; border-collapse: collapse; font-size: 0.85em; }
  th { text-align: left; padding: 8px; border-bottom: 1px solid #30363d; color: #8b949e; }
  td { padding: 8px; border-bottom: 1px solid #21262d; }
  .bar { height: 8px; background: #21262d; border-radius: 4px; overflow: hidden; }
  .bar-fill { height: 100%; border-radius: 4px; }
  .green { background: #238636; } .yellow { background: #d29922; } .red { background: #da3633; }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 12px; font-size: 0.75em; }
  .badge-success { background: #238636; color: #fff; } .badge-fallback { background: #d29922; color: #000; }
  .refresh { position: fixed; bottom: 20px; right: 20px; background: #161b22; border: 1px solid #30363d; padding: 8px 12px; border-radius: 6px; font-size: 0.75em; color: #8b949e; }
</style>
</head>
<body>
<h1>BramhaShiv AI — Routing Dashboard</h1>
<div class="grid" id="metrics"></div>
<h2 style="color:#58a6ff;margin-bottom:12px;font-size:1.1em;">Recent Routing Decisions</h2>
<div class="card"><table id="history"><thead><tr><th>Time</th><th>Task</th><th>Model</th><th>Score</th><th>Traits</th><th>Status</th></tr></thead><tbody></tbody></table></div>
<h2 style="color:#58a6ff;margin:20px 0 12px;font-size:1.1em;">Model Health</h2>
<div class="card"><table id="models"><thead><tr><th>Model</th><th>Health</th><th>Success Rate</th><th>Avg Latency</th><th>Calls</th></tr></thead><tbody></tbody></table></div>
<div class="refresh" id="refresh">Auto-refresh: 5s</div>
<script>
async function refresh() {
  try {
    const [mRes, hRes, modRes] = await Promise.all([fetch('/api/metrics'), fetch('/api/history'), fetch('/api/models')]);
    const metrics = await mRes.json();
    const history = await hRes.json();
    const models = await modRes.json();
    document.getElementById('metrics').innerHTML = [
      ['Total Tasks', metrics.total_tasks, ''],
      ['Success Rate', (metrics.success_rate * 100).toFixed(1) + '%', ''],
      ['Avg Latency', metrics.avg_latency_ms.toFixed(0) + 'ms', ''],
      ['Total Spend', '$' + metrics.total_spend_usd.toFixed(4), ''],
      ['Uptime', Math.floor(metrics.uptime_ms / 60000) + 'min', ''],
    ].map(([t,v,s]) => '<div class="card"><h3>' + t + '</h3><div class="value">' + v + '</div>' + (s ? '<div class="sub">' + s + '</div>' : '') + '</div>').join('');
    const tbody = document.querySelector('#history tbody');
    tbody.innerHTML = history.slice(0, 20).map(h => '<tr><td>' + new Date(h.timestamp).toLocaleTimeString() + '</td><td>' + (h.task_excerpt || '').slice(0,40) + '</td><td>' + h.picked_model + '</td><td>' + (h.score || 0).toFixed(2) + '</td><td>' + (h.top_traits || []).join(', ') + '</td><td><span class="badge ' + (h.was_fallback ? 'badge-fallback' : 'badge-success') + '">' + (h.was_fallback ? 'fallback' : 'ok') + '</span></td></tr>').join('');
    const mbody = document.querySelector('#models tbody');
    mbody.innerHTML = models.map(m => {
      const pct = (m.health_score * 100).toFixed(0);
      const cls = m.health_score > 0.8 ? 'green' : m.health_score > 0.5 ? 'yellow' : 'red';
      return '<tr><td>' + m.model_id + '</td><td><div class="bar"><div class="bar-fill ' + cls + '" style="width:' + pct + '%"></div></div> ' + pct + '%</td><td>' + (m.success_rate * 100).toFixed(0) + '%</td><td>' + m.avg_latency_ms.toFixed(0) + 'ms</td><td>' + m.total_calls + '</td></tr>';
    }).join('');
  } catch(e) { console.error('refresh failed', e); }
}
refresh();
setInterval(refresh, 5000);
</script>
</body>
</html>`;

export function createDashboardServer(opts: {
  port: number;
  getHistory: () => RoutingHistoryEntry[];
  getHealth: () => ModelHealthSnapshot[];
  getBudget: () => BudgetStatus;
  getMetrics: () => DashboardMetrics;
}): { stop: () => void } {
  const server = Bun.serve({
    port: opts.port,
    fetch(req) {
      const url = new URL(req.url);
      const path = url.pathname;

      if (path === "/" || path === "/index.html") {
        return new Response(DASHBOARD_HTML, { headers: { "Content-Type": "text/html" } });
      }
      if (path === "/api/metrics") {
        return Response.json(opts.getMetrics());
      }
      if (path === "/api/history") {
        return Response.json(opts.getHistory());
      }
      if (path === "/api/models") {
        return Response.json(opts.getHealth());
      }
      if (path === "/api/budget") {
        return Response.json(opts.getBudget());
      }
      return new Response("Not Found", { status: 404 });
    },
  });

  console.log(`[bramhashiv] dashboard running at http://localhost:${opts.port}`);
  return { stop: () => server.stop() };
}
