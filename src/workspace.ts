import { readdirSync, statSync, readFileSync, existsSync } from "node:fs";
import { join, basename, extname } from "node:path";
import type { WorkspaceContext } from "./types.js";
import { workspace as cfg } from "./config.js";

const LANGUAGE_MAP: Record<string, string> = {
  ".ts": "TypeScript",
  ".tsx": "TypeScript",
  ".js": "JavaScript",
  ".jsx": "JavaScript",
  ".py": "Python",
  ".rs": "Rust",
  ".go": "Go",
  ".java": "Java",
  ".rb": "Ruby",
  ".php": "PHP",
  ".cs": "C#",
  ".c": "C",
  ".cpp": "C++",
  ".hpp": "C++",
  ".h": "C/C++",
  ".swift": "Swift",
  ".kt": "Kotlin",
  ".scala": "Scala",
  ".vue": "Vue",
  ".svelte": "Svelte",
  ".css": "CSS",
  ".scss": "SCSS",
  ".less": "Less",
  ".html": "HTML",
  ".json": "JSON",
  ".yaml": "YAML",
  ".yml": "YAML",
  ".toml": "TOML",
  ".md": "Markdown",
  ".sql": "SQL",
  ".graphql": "GraphQL",
  ".dart": "Dart",
  ".lua": "Lua",
  ".r": "R",
  ".sh": "Shell",
  ".dockerfile": "Docker",
};

const FRONTEND_EXTS = new Set([
  ".tsx", ".jsx", ".vue", ".svelte", ".css", ".scss", ".less", ".html",
]);

const BACKEND_EXTS = new Set([
  ".py", ".rs", ".go", ".java", ".rb", ".php", ".cs", ".sql", ".graphql",
]);

const TEST_PATTERNS = [/\.test\./, /\.spec\./, /test_/, /_test/, /__tests__/, /tests?\//];

const SKIP_DIRS = new Set([
  "node_modules", ".git", "dist", "build", ".next", "__pycache__",
  "target", "vendor", ".browser-sessions", ".code-review-graph",
]);

function scanDir(
  dir: string,
  stats: { languages: Record<string, number>; total_files: number; has_tests: boolean },
  depth: number = 0,
): void {
  if (depth > cfg.max_depth || stats.total_files >= cfg.max_files) return;
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const entry of entries) {
    if (stats.total_files >= cfg.max_files) return;
    const full = join(dir, entry);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      if (SKIP_DIRS.has(entry)) continue;
      scanDir(full, stats, depth + 1);
    } else if (st.isFile()) {
      stats.total_files++;
      const ext = extname(entry).toLowerCase();
      const lang = LANGUAGE_MAP[ext] ?? LANGUAGE_MAP[basename(entry).toLowerCase()] ?? "Other";
      stats.languages[lang] = (stats.languages[lang] ?? 0) + 1;
      if (!stats.has_tests && TEST_PATTERNS.some((p) => p.test(entry) || p.test(full))) {
        stats.has_tests = true;
      }
    }
  }
}

function detectFrontendBackend(lang: Record<string, number>): { has_frontend: boolean; has_backend: boolean } {
  let has_frontend = false;
  let has_backend = false;
  for (const [language, count] of Object.entries(lang)) {
    for (const ext of FRONTEND_EXTS) {
      if (language === LANGUAGE_MAP[ext]) { has_frontend = true; break; }
    }
    for (const ext of BACKEND_EXTS) {
      if (language === LANGUAGE_MAP[ext]) { has_backend = true; break; }
    }
    if (language === "TypeScript" && count > 5) {
      has_frontend = true;
      has_backend = true;
    }
  }
  return { has_frontend, has_backend };
}

function buildSummary(ctx: {
  languages: Record<string, number>;
  total_files: number;
  has_tests: boolean;
  has_frontend: boolean;
  has_backend: boolean;
  repo_detected: boolean;
}): string {
  const parts: string[] = [];
  const top = Object.entries(ctx.languages)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  if (top.length > 0) {
    parts.push(`Languages: ${top.map(([l, c]) => `${l}(${c})`).join(", ")}`);
  }
  parts.push(`Files scanned: ${ctx.total_files}`);
  if (ctx.repo_detected) parts.push("Git repository detected");
  if (ctx.has_tests) parts.push("Tests present");
  if (ctx.has_frontend) parts.push("Frontend");
  if (ctx.has_backend) parts.push("Backend");
  return parts.join(". ");
}

export function analyzeWorkspace(rootDir: string): WorkspaceContext {
  const repo_detected = existsSync(join(rootDir, ".git"));
  const stats = { languages: {} as Record<string, number>, total_files: 0, has_tests: false };
  scanDir(rootDir, stats);
  const { has_frontend, has_backend } = detectFrontendBackend(stats.languages);
  return {
    languages: stats.languages,
    total_files: stats.total_files,
    repo_detected,
    has_tests: stats.has_tests,
    has_frontend,
    has_backend,
    summary: buildSummary({ ...stats, has_frontend, has_backend, repo_detected }),
  };
}
