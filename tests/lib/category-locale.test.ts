// Default category names follow the chosen language (src/lib/config-sync.ts
// localizeDefaultCategories, src/lib/category-locale.ts): untouched defaults switch
// between English and Dutch, a name the user changed stays, a rename that would clash
// with another category is skipped, and the language is recorded as an app setting.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { Database } from "better-sqlite3";
import { migrateTestDb, removeTestDb } from "../helpers/test-db";
import { DEFAULT_CATEGORIES, defaultCategoryKind } from "@/config/categories";

beforeAll(() => migrateTestDb());
afterAll(() => removeTestDb());

async function nameOf(configKey: string): Promise<string | undefined> {
  const { db } = await import("@/db");
  const { categories } = await import("@/db/schema");
  const [row] = await db.select({ name: categories.name }).from(categories).where(eq(categories.configKey, configKey));
  return row?.name;
}

async function namesLocale(): Promise<string | null> {
  const { db } = await import("@/db");
  const { appSettings } = await import("@/db/schema");
  const [row] = await db.select().from(appSettings).where(eq(appSettings.key, "category_names_locale"));
  return row?.value ?? null;
}

async function sqlite(): Promise<Database> {
  const { db } = await import("@/db");
  return (db as unknown as { $client: Database }).$client;
}

describe("the Dutch names in the config", () => {
  it("are unique within each kind and never another entry's English name", () => {
    for (const lang of ["name", "nameNl"] as const) {
      const seen = new Set<string>();
      for (const def of DEFAULT_CATEGORIES) {
        const id = `${defaultCategoryKind(def)}|${def[lang].toLocaleLowerCase()}`;
        expect(seen.has(id), `${lang} ${def[lang]}`).toBe(false);
        seen.add(id);
      }
    }
    const english = new Map(DEFAULT_CATEGORIES.map((d) => [d.name, d.key]));
    for (const def of DEFAULT_CATEGORIES) {
      const owner = english.get(def.nameNl);
      if (owner) expect(owner).toBe(def.key);
    }
  });
});

describe("localizing the default categories", () => {
  it("catches an English install up once, then never again", async () => {
    const { ensureCategoryNamesLocale } = await import("@/lib/category-locale");
    expect(await nameOf("Groceries")).toBe("Groceries");
    expect(await namesLocale()).toBeNull();

    expect(ensureCategoryNamesLocale("nl")).toBe(true);
    expect(await nameOf("Groceries")).toBe("Boodschappen");
    expect(await nameOf("Housing")).toBe("Wonen");
    expect(await namesLocale()).toBe("nl");

    // A later render in another language changes nothing.
    expect(ensureCategoryNamesLocale("en")).toBe(false);
    expect(await nameOf("Groceries")).toBe("Boodschappen");
    expect(await namesLocale()).toBe("nl");
  });

  it("renames untouched defaults nl → en and back en → nl", async () => {
    const { applyCategoryNamesLocale } = await import("@/lib/category-locale");
    const toEn = applyCategoryNamesLocale("en");
    expect(toEn.renamed).toBeGreaterThan(50);
    expect(await nameOf("Groceries")).toBe("Groceries");
    expect(await nameOf("Eye Care")).toBe("Eye Care");
    expect(await namesLocale()).toBe("en");

    applyCategoryNamesLocale("nl");
    expect(await nameOf("Eye Care")).toBe("Oogzorg");
    expect(await nameOf("Streaming Services")).toBe("Streamingdiensten");
    expect(await namesLocale()).toBe("nl");
    // Same language again: nothing to do.
    expect(applyCategoryNamesLocale("nl").renamed).toBe(0);
  });

  it("leaves a name the user changed alone", async () => {
    const { db } = await import("@/db");
    const { categories } = await import("@/db/schema");
    const { applyCategoryNamesLocale } = await import("@/lib/category-locale");
    await db.update(categories).set({ name: "Supermarkt" }).where(eq(categories.configKey, "Groceries"));

    applyCategoryNamesLocale("en");
    expect(await nameOf("Groceries")).toBe("Supermarkt");
    expect(await nameOf("Medication")).toBe("Medication");
    applyCategoryNamesLocale("nl");
    expect(await nameOf("Groceries")).toBe("Supermarkt");
    expect(await nameOf("Medication")).toBe("Medicijnen");
  });

  it("skips a rename that would clash with another category of the same kind", async () => {
    const { db } = await import("@/db");
    const { categories } = await import("@/db/schema");
    const { applyCategoryNamesLocale } = await import("@/lib/category-locale");
    applyCategoryNamesLocale("en");
    const [transport] = await db.select().from(categories).where(eq(categories.configKey, "Transportation"));
    // The user's own category already carries Fuel's Dutch name (any case).
    await db.insert(categories).values({ name: "brandstof", group: "", isGroup: false, parentCategoryId: transport.id });

    const result = applyCategoryNamesLocale("nl");
    expect(result.skipped).toBe(1);
    expect(await nameOf("Fuel")).toBe("Fuel");
    expect(await nameOf("Parking")).toBe("Parkeren");
    expect(await namesLocale()).toBe("nl");
  });

  it("ends a reset to defaults in the recorded language, or the one asked for", async () => {
    const { resetDefaultCategories } = await import("@/lib/config-sync");
    const handle = await sqlite();

    resetDefaultCategories(handle);
    expect(await nameOf("Groceries")).toBe("Boodschappen");
    expect(await nameOf("Fuel")).toBe("Brandstof");

    resetDefaultCategories(handle, "en");
    expect(await nameOf("Groceries")).toBe("Groceries");
    expect(await namesLocale()).toBe("en");
  });
});
