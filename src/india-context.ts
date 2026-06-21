/**
 * India-context awareness for BramhaShiv.
 *
 * Detects:
 * - Indian language text (Hindi Devanagari, Bengali, Tamil, Telugu, etc.)
 * - Indian tech stacks (Django/DRF, MERN, MEAN, Flutter, React Native, Electron)
 * - Indian API integrations (UPI, Aadhaar, GST, PAN, IRCTC, DigiLocker)
 *
 * These insights are injected into the classifier prompt to route
 * Indic-language or India-stack tasks appropriately.
 */

const INDIAN_SCRIPT_RANGES: [number, number][] = [
  // Devanagari (Hindi, Marathi, Nepali, Sanskrit)
  [0x0900, 0x097F],
  // Bengali (Bengali, Assamese)
  [0x0980, 0x09FF],
  // Gurmukhi (Punjabi)
  [0x0A00, 0x0A7F],
  // Gujarati
  [0x0A80, 0x0AFF],
  // Oriya (Odia)
  [0x0B00, 0x0B7F],
  // Tamil
  [0x0B80, 0x0BFF],
  // Telugu
  [0x0C00, 0x0C7F],
  // Kannada
  [0x0C80, 0x0CFF],
  // Malayalam
  [0x0D00, 0x0D7F],
];

function isIndianScriptChar(code: number): boolean {
  for (const [lo, hi] of INDIAN_SCRIPT_RANGES) {
    if (code >= lo && code <= hi) return true;
  }
  return false;
}

export interface IndiaSignal {
  hasIndicText: boolean;
  primaryScript: string | null;
  techStacks: string[];
  indianApis: string[];
}

export function detectIndiaContext(text: string): IndiaSignal {
  const hasIndicText = detectIndicText(text);
  const primaryScript = hasIndicText ? detectPrimaryScript(text) : null;
  const techStacks = detectTechStacks(text);
  const indianApis = detectIndianApis(text);

  return { hasIndicText, primaryScript, techStacks, indianApis };
}

function detectIndicText(text: string): boolean {
  let indicCharCount = 0;
  let totalChars = 0;
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    if (code > 127) {
      totalChars++;
      if (isIndianScriptChar(code)) indicCharCount++;
    }
  }
  return indicCharCount / Math.max(totalChars, 1) > 0.3;
}

function detectPrimaryScript(text: string): string | null {
  const scriptCount: Record<string, number> = {};
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    for (const [[lo, hi], name] of [
      [[0x0900, 0x097F], "Devanagari"],
      [[0x0980, 0x09FF], "Bengali"],
      [[0x0A00, 0x0A7F], "Gurmukhi"],
      [[0x0A80, 0x0AFF], "Gujarati"],
      [[0x0B00, 0x0B7F], "Oriya"],
      [[0x0B80, 0x0BFF], "Tamil"],
      [[0x0C00, 0x0C7F], "Telugu"],
      [[0x0C80, 0x0CFF], "Kannada"],
      [[0x0D00, 0x0D7F], "Malayalam"],
    ] as [[number, number], string][]) {
      if (code >= lo && code <= hi) {
        scriptCount[name] = (scriptCount[name] ?? 0) + 1;
      }
    }
  }
  const top = Object.entries(scriptCount).sort((a, b) => b[1] - a[1])[0];
  return top ? top[0] : null;
}

// Common Indian tech stack file patterns
const STACK_PATTERNS = [
  { name: "MERN", patterns: [/mern/i, /package\.json/, /server\.js/, /mongo/i, /express/i] },
  { name: "MEAN", patterns: [/mean/i, /package\.json/, /server\.js/, /mongo/i, /angular/i] },
  { name: "Django", patterns: [/django/i, /requirements\.txt/, /manage\.py/, /settings\.py/i, /views\.py/] },
  { name: "Django REST", patterns: [/drf/i, /djangorestframework/i, /serializers\.py/] },
  { name: "Flutter", patterns: [/flutter/i, /pubspec\.yaml/, /\.dart/] },
  { name: "React Native", patterns: [/react\s*native/i, /package\.json/, /app\.json/, /android\/app/i, /ios\/app/i] },
  { name: "Electron", patterns: [/package\.json/, /main\.js/, /electron/i] },
  { name: "Spring Boot", patterns: [/pom\.xml/, /application\.properties/, /build\.gradle/] },
  { name: "Next.js", patterns: [/next\.config/, /pages\//, /app\//, /next\.js/i] },
  { name: "Rails", patterns: [/gemfile/i, /config\/routes/i, /db\/migrate/i] },
];

/**
 * Detect which Indian tech stacks a task involves.
 * Checks task text against known patterns (e.g. "build a Django API" → ["Django"]).
 */
export function detectTechStacks(text: string): string[] {
  const detected: string[] = [];
  const lower = text.toLowerCase();

  for (const stack of STACK_PATTERNS) {
    if (stack.patterns.some((p) => p.test(lower))) {
      detected.push(stack.name);
    }
  }
  return detected;
}

// Indian government / fintech API keywords
const INDIAN_API_KEYWORDS = [
  { name: "UPI", patterns: [/upi/i, /unified payments/i, /phonepe/i, /paytm/i, /gpay/i, /bhim/i] },
  { name: "Aadhaar", patterns: [/aadhaar/i, /aadhar/i, /uidai/i, /e-kyc/i, /eKYC/i] },
  { name: "GST", patterns: [/gst\s*(api|portal|invoice|return)/i, /goods\s*and\s*services/i] },
  { name: "PAN", patterns: [/pan\s*(api|card|verification)/i, /permanen/i, /ndsl/i] },
  { name: "DigiLocker", patterns: [/digilocker/i, /document\s*verif/i] },
  { name: "IRCTC", patterns: [/irctc/i, /railway\s*booking/i, /train\s*pnr/i] },
  { name: "CIBIL", patterns: [/cibil/i, /credit\s*score/i, /bureau\s*report/i] },
  { name: "eSign", patterns: [/esign/i, /digital\s*signature/i, /docsign/i] },
  { name: "BBPS", patterns: [/bbps/i, /bill\s*payment/i, /billdesk/i] },
  { name: "OCEN", patterns: [/ocen/i, /account\s*aggregator/i, /fino/i] },
];

export function detectIndianApis(text: string): string[] {
  const lower = text.toLowerCase();
  const detected: string[] = [];
  for (const api of INDIAN_API_KEYWORDS) {
    if (api.patterns.some((p) => p.test(lower))) {
      detected.push(api.name);
    }
  }
  return detected;
}

/**
 * Build a classifier-friendly context string from India signals.
 * Injected into the user prompt so Gemini Flash can route appropriately.
 */
export function buildIndiaClassifierHint(signal: IndiaSignal): string {
  const parts: string[] = [];

  if (signal.hasIndicText && signal.primaryScript) {
    parts.push(`User is writing in ${signal.primaryScript} script — consider models with strong multilingual / Indic language support.`);
  }

  if (signal.indianApis.length > 0) {
    parts.push(`India API integration: ${signal.indianApis.join(", ")}.`);
  }

  return parts.length > 0 ? `[INDIA CONTEXT] ${parts.join(" ")}` : "";
}