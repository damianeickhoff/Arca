import { describe, expect, it } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { isSafeUploadFilename, migrateLegacyDir, receiptFilenameFromUrl } from "@/lib/data-dir";

describe("receiptFilenameFromUrl", () => {
  it("returns the bare filename of a stored receipt URL", () => {
    expect(receiptFilenameFromUrl("/uploads/receipts/1700000000000-42.jpg")).toBe("1700000000000-42.jpg");
  });

  it("returns null for empty values", () => {
    expect(receiptFilenameFromUrl(null)).toBeNull();
    expect(receiptFilenameFromUrl(undefined)).toBeNull();
    expect(receiptFilenameFromUrl("")).toBeNull();
    expect(receiptFilenameFromUrl("/uploads/receipts/")).toBeNull();
  });

  it("rejects values that are not a plain filename", () => {
    expect(receiptFilenameFromUrl("/uploads/receipts/..")).toBeNull();
    expect(receiptFilenameFromUrl("/uploads/receipts/a b.jpg")).toBeNull();
  });
});

describe("isSafeUploadFilename", () => {
  it("accepts plain filenames", () => {
    expect(isSafeUploadFilename("receipt-1.PNG")).toBe(true);
    expect(isSafeUploadFilename("a_b.c")).toBe(true);
  });

  it("rejects separators, traversal and empty names", () => {
    expect(isSafeUploadFilename("")).toBe(false);
    expect(isSafeUploadFilename(".")).toBe(false);
    expect(isSafeUploadFilename("..")).toBe(false);
    expect(isSafeUploadFilename("../x.jpg")).toBe(false);
    expect(isSafeUploadFilename("a/b.jpg")).toBe(false);
    expect(isSafeUploadFilename("a\\b.jpg")).toBe(false);
  });
});

describe("migrateLegacyDir", () => {
  function tmp(): string {
    return fs.mkdtempSync(path.join(os.tmpdir(), "arca-data-dir-"));
  }

  it("moves files from the legacy folder into the target and keeps existing targets", () => {
    const legacy = tmp();
    const target = tmp();
    fs.writeFileSync(path.join(legacy, "old.jpg"), "legacy");
    fs.writeFileSync(path.join(legacy, "both.jpg"), "legacy");
    fs.writeFileSync(path.join(target, "both.jpg"), "target");

    migrateLegacyDir(legacy, target);

    expect(fs.readFileSync(path.join(target, "old.jpg"), "utf8")).toBe("legacy");
    expect(fs.readFileSync(path.join(target, "both.jpg"), "utf8")).toBe("target");
    expect(fs.existsSync(path.join(legacy, "old.jpg"))).toBe(false);
    expect(fs.existsSync(path.join(legacy, "both.jpg"))).toBe(true);
  });

  it("is a no-op when the legacy folder is missing", () => {
    const target = tmp();
    expect(() => migrateLegacyDir(path.join(target, "does-not-exist"), target)).not.toThrow();
    expect(fs.readdirSync(target)).toEqual([]);
  });
});
