// What every AI provider shares, kept free of the database so tests and both clients can
// use it: the result and error vocabulary, redactForAi, and the answer schemas. The features write
// their schemas once, in the OpenAPI subset Gemini expects (type "OBJECT", "STRING", …);
// the local provider turns them into plain JSON Schema with toJsonSchema and checks the
// answer itself with validateAgainstSchema, because a local model may ignore the format.

export type AiError =
  | "notConfigured"
  | "invalidKey"
  | "rateLimited"
  | "dailyLimit"
  | "noFreeTier"
  | "modelUnavailable"
  | "unavailable"
  | "badResponse";
export type AiResult<T> = { ok: true; value: T } | { ok: false; error: AiError };

/** The schema subset the app's features use: objects, arrays, strings, numbers,
 *  integers, booleans, enums, required keys and item counts. */
export interface AiSchema {
  type: string;
  properties?: Record<string, AiSchema>;
  required?: string[];
  items?: AiSchema;
  enum?: unknown[];
  nullable?: boolean;
  minItems?: number;
  maxItems?: number;
}

/** Gemini's OpenAPI-style schema as standard JSON Schema: lower-case types, `nullable`
 *  as a "null" type, and objects closed to extra keys (what strict mode asks for). */
export function toJsonSchema(schema: AiSchema): Record<string, unknown> {
  const type = schema.type.toLowerCase();
  const out: Record<string, unknown> = { type: schema.nullable ? [type, "null"] : type };
  if (schema.enum) out.enum = schema.enum;
  if (schema.properties) {
    out.properties = Object.fromEntries(Object.entries(schema.properties).map(([key, value]) => [key, toJsonSchema(value)]));
    out.required = schema.required ?? [];
    out.additionalProperties = false;
  }
  if (schema.items) out.items = toJsonSchema(schema.items);
  if (schema.minItems != null) out.minItems = schema.minItems;
  if (schema.maxItems != null) out.maxItems = schema.maxItems;
  return out;
}

function typeOk(type: string, value: unknown): boolean {
  switch (type) {
    case "object":
      return typeof value === "object" && value !== null && !Array.isArray(value);
    case "array":
      return Array.isArray(value);
    case "string":
      return typeof value === "string";
    case "number":
      return typeof value === "number" && Number.isFinite(value);
    case "integer":
      return typeof value === "number" && Number.isInteger(value);
    case "boolean":
      return typeof value === "boolean";
    case "null":
      return value === null;
    default:
      return true;
  }
}

/**
 * Checks `value` against `schema`. Returns null when it fits, otherwise the first problem
 * in plain words with where it is ("$.facts: expected at least 3 items"), which is what the
 * retry sends back to the model. Extra object keys are allowed: the features ignore them.
 */
export function validateAgainstSchema(schema: AiSchema, value: unknown, path = "$"): string | null {
  const type = schema.type.toLowerCase();
  if (value === null && schema.nullable) return null;
  if (!typeOk(type, value)) return `${path}: expected ${type === "integer" ? "a whole number" : `${/^[aeiou]/.test(type) ? "an" : "a"} ${type}`}, got ${value === null ? "null" : Array.isArray(value) ? "an array" : typeof value}`;
  if (schema.enum && !schema.enum.includes(value)) return `${path}: must be one of ${schema.enum.map((v) => JSON.stringify(v)).join(", ")}`;

  if (type === "object" && schema.properties) {
    const record = value as Record<string, unknown>;
    for (const key of schema.required ?? []) {
      if (!(key in record)) return `${path}: missing "${key}"`;
    }
    for (const [key, child] of Object.entries(schema.properties)) {
      if (!(key in record)) continue;
      const problem = validateAgainstSchema(child, record[key], `${path}.${key}`);
      if (problem) return problem;
    }
  }

  if (type === "array") {
    const list = value as unknown[];
    if (schema.minItems != null && list.length < schema.minItems) return `${path}: expected at least ${schema.minItems} items, got ${list.length}`;
    if (schema.maxItems != null && list.length > schema.maxItems) return `${path}: expected at most ${schema.maxItems} items, got ${list.length}`;
    if (schema.items) {
      for (let i = 0; i < list.length; i++) {
        const problem = validateAgainstSchema(schema.items, list[i], `${path}[${i}]`);
        if (problem) return problem;
      }
    }
  }
  return null;
}

/**
 * The JSON inside a model's answer. Local models like to wrap it in ``` fences, put a
 * sentence before it, or (reasoning models) think out loud in <think> tags first; all of
 * that is taken off. Returns the parsed value, or the parse error in plain words.
 */
export function parseJsonAnswer(text: string): { ok: true; value: unknown } | { ok: false; error: string } {
  let body = text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(body);
  if (fenced) body = fenced[1].trim();
  try {
    return { ok: true, value: JSON.parse(body) };
  } catch {
    // Prose around the JSON: take the outermost object or array.
    const start = body.search(/[[{]/);
    const end = Math.max(body.lastIndexOf("}"), body.lastIndexOf("]"));
    if (start >= 0 && end > start) {
      try {
        return { ok: true, value: JSON.parse(body.slice(start, end + 1)) };
      } catch {
        // fall through
      }
    }
    return { ok: false, error: body ? "the answer is not valid JSON" : "the answer was empty" };
  }
}

/**
 * Bank text with what identifies an account taken out: IBANs, card numbers and any long
 * run of digits (references, account numbers) become "…". What's left — the merchant and
 * the free text — is what a category can be guessed from.
 */
export function redactForAi(text: string): string {
  return text
    .replace(/\b[A-Z]{2}\d{2}\s?(?:[A-Z0-9]{4}\s?){2,7}[A-Z0-9]{1,4}\b/gi, "…")
    .replace(/\d[\d\s-]{6,}\d/g, "…")
    .replace(/\s{2,}/g, " ")
    .trim()
    .slice(0, 140);
}
