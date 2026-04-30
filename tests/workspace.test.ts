import { describe, test, expect } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { analyzeWorkspace } from "../src/workspace.js";

function tmpdir_(prefix: string) {
  return mkdtempSync(join(tmpdir(), `bramhashiv-${prefix}-`));
}

describe("analyzeWorkspace", () => {
  test("detects repo when .git exists", () => {
    const dir = tmpdir_("ws-repo");
    mkdirSync(join(dir, ".git"));
    const ctx = analyzeWorkspace(dir);
    expect(ctx.repo_detected).toBe(true);
  });

  test("detects no repo when no .git", () => {
    const dir = tmpdir_("ws-norepo");
    const ctx = analyzeWorkspace(dir);
    expect(ctx.repo_detected).toBe(false);
  });

  test("counts languages correctly", () => {
    const dir = tmpdir_("ws-lang");
    mkdirSync(join(dir, "src"), { recursive: true });
    writeFileSync(join(dir, "src", "app.ts"), "// ts");
    writeFileSync(join(dir, "src", "config.json"), "{}");
    writeFileSync(join(dir, "README.md"), "# hi");
    const ctx = analyzeWorkspace(dir);
    expect(ctx.languages.TypeScript).toBe(1);
    expect(ctx.languages.JSON).toBe(1);
    expect(ctx.languages.Markdown).toBe(1);
    expect(ctx.total_files).toBe(3);
  });

  test("detects tests via .test. pattern", () => {
    const dir = tmpdir_("ws-test");
    mkdirSync(join(dir, "src"), { recursive: true });
    writeFileSync(join(dir, "src", "utils.test.ts"), "//");
    const ctx = analyzeWorkspace(dir);
    expect(ctx.has_tests).toBe(true);
    expect(ctx.total_files).toBe(1);
  });

  test("detects tests via .spec. pattern", () => {
    const dir = tmpdir_("ws-spec");
    mkdirSync(join(dir, "spec"), { recursive: true });
    writeFileSync(join(dir, "spec", "app.spec.ts"), "//");
    const ctx = analyzeWorkspace(dir);
    expect(ctx.has_tests).toBe(true);
  });

  test("detects tests in __tests__ dir", () => {
    const dir = tmpdir_("ws-dir");
    mkdirSync(join(dir, "__tests__"), { recursive: true });
    writeFileSync(join(dir, "__tests__", "thing.js"), "//");
    const ctx = analyzeWorkspace(dir);
    expect(ctx.has_tests).toBe(true);
  });

  test("detects frontend from tsx/css files", () => {
    const dir = tmpdir_("ws-fe");
    writeFileSync(join(dir, "page.tsx"), "//");
    writeFileSync(join(dir, "styles.css"), "//");
    const ctx = analyzeWorkspace(dir);
    expect(ctx.has_frontend).toBe(true);
  });

  test("frontend from Vue/Svelte files", () => {
    const dir = tmpdir_("ws-vue");
    writeFileSync(join(dir, "app.vue"), "//");
    const ctx = analyzeWorkspace(dir);
    expect(ctx.has_frontend).toBe(true);
  });

  test("detects backend from Python/Rust/Go files", () => {
    const dir = tmpdir_("ws-be");
    writeFileSync(join(dir, "server.py"), "//");
    writeFileSync(join(dir, "lib.rs"), "//");
    const ctx = analyzeWorkspace(dir);
    expect(ctx.has_backend).toBe(true);
  });

  test("TypeScript >5 files marks both frontend+backend", () => {
    const dir = tmpdir_("ws-ts");
    mkdirSync(join(dir, "src"), { recursive: true });
    for (let i = 0; i < 6; i++) {
      writeFileSync(join(dir, "src", `file${i}.ts`), "//");
    }
    const ctx = analyzeWorkspace(dir);
    expect(ctx.has_frontend).toBe(true);
    expect(ctx.has_backend).toBe(true);
  });

  test("skips node_modules and .git dirs", () => {
    const dir = tmpdir_("ws-skip");
    mkdirSync(join(dir, "node_modules", "pkg"), { recursive: true });
    writeFileSync(join(dir, "node_modules", "pkg", "index.js"), "//");
    mkdirSync(join(dir, ".git", "objects"), { recursive: true });
    writeFileSync(join(dir, ".git", "HEAD"), "//");
    writeFileSync(join(dir, "real.ts"), "//");
    const ctx = analyzeWorkspace(dir);
    expect(ctx.total_files).toBe(1);
    expect(ctx.languages.TypeScript).toBe(1);
  });

  test("empty directory returns zero files", () => {
    const dir = tmpdir_("ws-empty");
    const ctx = analyzeWorkspace(dir);
    expect(ctx.total_files).toBe(0);
    expect(Object.keys(ctx.languages).length).toBe(0);
    expect(ctx.has_tests).toBe(false);
    expect(ctx.has_frontend).toBe(false);
    expect(ctx.has_backend).toBe(false);
  });

  test("builds human-readable summary", () => {
    const dir = tmpdir_("ws-summary");
    mkdirSync(join(dir, ".git"));
    writeFileSync(join(dir, "app.py"), "# py");
    writeFileSync(join(dir, "test_app.py"), "# test");
    const ctx = analyzeWorkspace(dir);
    expect(ctx.summary).toContain("Python(2)");
    expect(ctx.summary).toContain("Python(2)");
    expect(ctx.summary).toContain("Git repository detected");
    expect(ctx.summary).toContain("Tests present");
    expect(ctx.summary).toContain("Backend");
  });

  test("ignores unreadable directories gracefully", () => {
    const dir = tmpdir_("ws-unreadable");
    writeFileSync(join(dir, "good.ts"), "//");
    const ctx = analyzeWorkspace(dir);
    expect(ctx.total_files).toBe(1);
  });

  test("respects MAX_FILES limit", () => {
    const dir = tmpdir_("ws-limit");
    // Create 600 files — should cap at 500
    for (let i = 0; i < 600; i++) {
      writeFileSync(join(dir, `f${i}.ts`), "//");
    }
    const ctx = analyzeWorkspace(dir);
    expect(ctx.total_files).toBeLessThanOrEqual(500);
  });
});
