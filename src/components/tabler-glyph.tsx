"use client";

import { Suspense, createElement, use } from "react";
import { tablerFileOf } from "@/lib/tabler-icons";

// Tabler glyphs load one file per icon instead of the whole set (5,000+ icons, ~4 MB).
// Each icon is a tiny async chunk; a page ships only the icons it draws. The file import
// lives in lib/tabler-files.ts, itself loaded on demand.

type GlyphProps = { size?: number; color?: string; stroke?: number; style?: React.CSSProperties; className?: string };
type GlyphComponent = React.ComponentType<GlyphProps>;

// One promise per file for the life of the page (and of the server process). `use`
// marks a promise it has seen as settled, so later renders read it synchronously.
const cache = new Map<string, Promise<GlyphComponent | null>>();

/** Starts (or reuses) the load of one icon file; resolves to null for an unknown name.
 *  A Filled file that does not exist falls back to the line icon. */
export function loadTablerGlyph(file: string): Promise<GlyphComponent | null> {
  let promise = cache.get(file);
  if (!promise) {
    // The file table loads lazily too (see lib/tabler-files.ts); a name outside it rejects.
    promise = import("@/lib/tabler-files")
      .then((m) => m.importTablerFile(file.slice(4)))
      .then((m) => (m.default as GlyphComponent) ?? null)
      .catch(() => (file.endsWith("Filled") ? loadTablerGlyph(file.slice(0, -6)) : null));
    cache.set(file, promise);
  }
  return promise;
}

function Loaded({ file, ...props }: GlyphProps & { file: string }) {
  const glyph = use(loadTablerGlyph(file));
  return glyph ? createElement(glyph, props) : <Placeholder size={props.size} className={props.className} />;
}

/** An empty box the size of the glyph, so rows keep their layout while it loads. */
function Placeholder({ size = 24, className }: { size?: number; className?: string }) {
  return <span aria-hidden className={className} style={{ display: "inline-block", width: size, height: size, flexShrink: 0 }} />;
}

/**
 * One Tabler icon by its stored key ("IconEyeglass", "IconHeartFilled"). Rendered on
 * the server it waits for the file, so the HTML carries the icon; on the client the
 * server's markup stays until the file is in, and a fresh mount shows an empty box of
 * the same size meanwhile (no spinner, no jump).
 */
export function TablerGlyph({ iconKey, ...props }: GlyphProps & { iconKey: string }) {
  const file = tablerFileOf(iconKey);
  if (!file) return <Placeholder size={props.size} className={props.className} />;
  return (
    <Suspense fallback={<Placeholder size={props.size} className={props.className} />}>
      <Loaded file={file} {...props} />
    </Suspense>
  );
}
