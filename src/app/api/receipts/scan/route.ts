import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { db } from "@/db";
import { categories } from "@/db/schema";
import { getReceiptScanConfig } from "@/lib/ai-provider";
import { parseJsonAnswer } from "@/lib/ai-schema";
import { chatCompletion } from "@/lib/openai-compatible";

// Receipt OCR on the user's own AI server — no cloud vision API. Sends the photo to the
// vision model set under Settings › AI › Local server (OpenAI chat format, the photo as an
// image_url data URL) and asks it for structured fields. The photo goes nowhere else,
// whichever provider writes the text. Without a vision model this answers
// "notConfigured" and the add-transaction page's manual flow keeps working as before.
// Errors are codes; the scan dialog says them in the user's language.
const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp"];
const MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
/** Reading a photo on a local CPU is slow. */
const SCAN_TIMEOUT_MS = 90_000;

const PROMPT = `You are reading a photo of a receipt for a personal finance app. Extract:
- name: the merchant/store name (short, e.g. "Albert Heijn")
- category: a single general spending category word/phrase (e.g. "Groceries", "Restaurant", "Fuel", "Clothing", "Electronics")
- amount: the final total paid, as a plain number with a dot decimal separator (e.g. 23.45) — no currency symbol
- date: the purchase date in YYYY-MM-DD format if visible, otherwise null

Reply with ONLY a JSON object with exactly these keys: name, category, amount, date. No other text.`;

export async function POST(req: NextRequest) {
  const denied = await requireAuth();
  if (denied) return denied;

  const config = await getReceiptScanConfig();
  if (!config) return NextResponse.json({ error: "notConfigured" }, { status: 400 });

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "noFile" }, { status: 400 });
  if (!ALLOWED_TYPES.includes(file.type)) return NextResponse.json({ error: "badType" }, { status: 400 });
  if (file.size > MAX_SIZE_BYTES) return NextResponse.json({ error: "tooLarge" }, { status: 400 });

  const base64 = Buffer.from(await file.arrayBuffer()).toString("base64");
  const result = await chatCompletion(
    config,
    [
      {
        role: "user",
        content: [
          { type: "text", text: PROMPT },
          { type: "image_url", image_url: { url: `data:${file.type};base64,${base64}` } },
        ],
      },
    ],
    { type: "json_object" },
    SCAN_TIMEOUT_MS,
  );
  if (!result.ok) {
    // unavailable (not running, unreachable, too slow), modelUnavailable (not pulled),
    // invalidKey, badResponse: the dialog explains each, naming the model where it helps.
    return NextResponse.json({ error: result.error, model: config.model }, { status: 502 });
  }
  const answer = parseJsonAnswer(result.text);
  if (!answer.ok || typeof answer.value !== "object" || answer.value === null) {
    return NextResponse.json({ error: "unreadable" }, { status: 502 });
  }

  const parsed = answer.value as { name?: unknown; category?: unknown; amount?: unknown; date?: unknown };
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
