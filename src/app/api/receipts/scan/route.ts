import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { db } from "@/db";
import { categories } from "@/db/schema";

// Local, free receipt OCR — no cloud vision API. Sends the photo to a locally-running
// Ollama instance with a vision-capable model and asks it to extract structured fields.
// Never reaches the network: if Ollama isn't installed/running, this just fails with a
// clear error, and the add-transaction page's manual flow keeps working as before.
const OLLAMA_HOST = process.env.OLLAMA_HOST || "http://localhost:11434";
const OLLAMA_VISION_MODEL = process.env.OLLAMA_VISION_MODEL || "llava";
const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp"];
const MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

const PROMPT = `You are reading a photo of a receipt for a personal finance app. Extract:
- name: the merchant/store name (short, e.g. "Albert Heijn")
- category: a single general spending category word/phrase (e.g. "Groceries", "Restaurant", "Fuel", "Clothing", "Electronics")
- amount: the final total paid, as a plain number with a dot decimal separator (e.g. 23.45) — no currency symbol
- date: the purchase date in YYYY-MM-DD format if visible, otherwise null

Reply with ONLY a JSON object with exactly these keys: name, category, amount, date. No other text.`;

interface OllamaGenerateResponse {
  response: string;
}

export async function POST(req: NextRequest) {
  const denied = await requireAuth();
  if (denied) return denied;

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "No file" }, { status: 400 });
  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json({ error: "Only PNG, JPG, and WEBP are allowed" }, { status: 400 });
  }
  if (file.size > MAX_SIZE_BYTES) {
    return NextResponse.json({ error: "File is too large (max 10 MB)" }, { status: 400 });
  }

  const base64 = Buffer.from(await file.arrayBuffer()).toString("base64");

  let ollamaJson: unknown;
  try {
    const res = await fetch(`${OLLAMA_HOST}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: OLLAMA_VISION_MODEL,
        prompt: PROMPT,
        images: [base64],
        format: "json",
        stream: false,
      }),
      signal: AbortSignal.timeout(90_000),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      if (res.status === 404) {
        return NextResponse.json(
          { error: `Model "${OLLAMA_VISION_MODEL}" isn't installed. Run: ollama pull ${OLLAMA_VISION_MODEL}` },
          { status: 502 },
        );
      }
      return NextResponse.json({ error: `Ollama returned an error: ${text || res.statusText}` }, { status: 502 });
    }
    const data = (await res.json()) as OllamaGenerateResponse;
    ollamaJson = JSON.parse(data.response);
  } catch (error) {
    if (error instanceof Error && (error.name === "TimeoutError" || error.message.includes("fetch failed") || error.message.includes("ECONNREFUSED"))) {
      return NextResponse.json(
        { error: `Couldn't reach Ollama at ${OLLAMA_HOST}. Install it from ollama.com, run "ollama pull ${OLLAMA_VISION_MODEL}", and make sure it's running.` },
        { status: 502 },
      );
    }
    return NextResponse.json({ error: "Couldn't read the receipt. Try a clearer photo." }, { status: 502 });
  }

  const parsed = ollamaJson as { name?: unknown; category?: unknown; amount?: unknown; date?: unknown };
  const name = typeof parsed.name === "string" ? parsed.name.trim() : "";
  const categoryName = typeof parsed.category === "string" ? parsed.category.trim() : "";
  const amount = typeof parsed.amount === "number" ? parsed.amount : parseFloat(String(parsed.amount ?? "")) || null;
  const date = typeof parsed.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(parsed.date) ? parsed.date : null;

  // Best-effort match against the user's real categories (case-insensitive, either
  // direction of substring) — never invents a new category, leaves it unset if unsure.
  let categoryId: number | null = null;
  let matchedCategoryName: string | null = null;
  if (categoryName) {
    const allCats = await db.select({ id: categories.id, name: categories.name }).from(categories);
    const needle = categoryName.toLowerCase();
    const match =
      allCats.find((c) => c.name.toLowerCase() === needle) ??
      allCats.find((c) => c.name.toLowerCase().includes(needle) || needle.includes(c.name.toLowerCase()));
    if (match) {
      categoryId = match.id;
      matchedCategoryName = match.name;
    }
  }

  return NextResponse.json({
    name: name || null,
    amount,
    date,
    categoryId,
    categoryName: matchedCategoryName ?? categoryName ?? null,
  });
}
