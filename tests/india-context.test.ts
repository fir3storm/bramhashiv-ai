import { describe, test, expect } from "bun:test";
import { detectIndiaContext, detectTechStacks, detectIndianApis } from "../src/india-context.js";

describe("detectIndiaContext", () => {
  test("detects Devanagari (Hindi) text", () => {
    const result = detectIndiaContext("मुझे एक Django API बनानी है");
    expect(result.hasIndicText).toBe(true);
    expect(result.primaryScript).toBe("Devanagari");
  });

  test("detects Bengali text", () => {
    const result = detectIndiaContext("আমাকে একটি Flask অ্যাপ তৈরি করতে হবে");
    expect(result.hasIndicText).toBe(true);
    expect(result.primaryScript).toBe("Bengali");
  });

  test("returns false for pure English text", () => {
    const result = detectIndiaContext("Build a REST API with Express and MongoDB");
    expect(result.hasIndicText).toBe(false);
    expect(result.primaryScript).toBeNull();
  });

  test("mixed Hindi-English is flagged as Indic", () => {
    const result = detectIndiaContext("Code a MERN stack app — मैं Redux store चाहता हूं");
    expect(result.hasIndicText).toBe(true);
  });

  test("detects tech stacks from text", () => {
    const result = detectIndiaContext("I need to build a Django REST API with authentication");
    expect(result.techStacks).toContain("Django");
  });

  test("detects multiple tech stacks", () => {
    const result = detectIndiaContext("Flutter app with React Native fallback and Django backend");
    expect(result.techStacks).toContain("Flutter");
    expect(result.techStacks).toContain("React Native");
    expect(result.techStacks).toContain("Django");
  });

  test("detects Indian APIs", () => {
    const result = detectIndiaContext("Integrate UPI payment gateway with GST invoice generation");
    expect(result.indianApis).toContain("UPI");
    expect(result.indianApis).toContain("GST");
  });

  test("detects Aadhaar and PAN together", () => {
    const result = detectIndiaContext("KYC verification using Aadhaar and PAN card validation");
    expect(result.indianApis).toContain("Aadhaar");
    expect(result.indianApis).toContain("PAN");
  });

  test("no Indian APIs in unrelated task", () => {
    const result = detectIndiaContext("Fix the sorting algorithm in my React component");
    expect(result.indianApis).toHaveLength(0);
  });

  test("empty text returns empty signals", () => {
    const result = detectIndiaContext("");
    expect(result.hasIndicText).toBe(false);
    expect(result.techStacks).toHaveLength(0);
    expect(result.indianApis).toHaveLength(0);
  });
});

describe("detectTechStacks", () => {
  test("MERN detection", () => {
    expect(detectTechStacks("Build a MERN stack application")).toContain("MERN");
    expect(detectTechStacks("MongoDB + Express + React")).toContain("MERN");
  });

  test("Django detection", () => {
    expect(detectTechStacks("Set up Django with DRF")).toContain("Django REST");
    expect(detectTechStacks("Python manage.py migrate")).toContain("Django");
  });

  test("Flutter detection", () => {
    expect(detectTechStacks("Create a Flutter app with pubspec.yaml")).toContain("Flutter");
    expect(detectTechStacks("Build .dart files in lib/")).toContain("Flutter");
  });

  test("React Native detection", () => {
    expect(detectTechStacks("Build a React Native app for android/app")).toContain("React Native");
  });
});

describe("detectIndianApis", () => {
  test("UPI variants", () => {
    expect(detectIndianApis("Integrate PhonePe UPI")).toContain("UPI");
    expect(detectIndianApis("Paytm GPay unified payments interface")).toContain("UPI");
  });

  test("GST detection", () => {
    expect(detectIndianApis("Generate GST invoice via API")).toContain("GST");
  });

  test("Aadhaar/UIDAI", () => {
    expect(detectIndianApis("Verify Aadhaar via UIDAI eKYC")).toContain("Aadhaar");
  });
});