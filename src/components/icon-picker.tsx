"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import * as Tabler from "@tabler/icons-react";
import {
  IconArrowDown,
  IconArrowLeft,
  IconArrowRight,
  IconArrowUp,
  IconCheck,
  IconCrop,
  IconMinus,
  IconPencil,
  IconPlus,
  IconSearch,
  IconTrash,
  IconUpload,
  IconX,
} from "@tabler/icons-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { ClearButton } from "@/components/clear/button";
import { ClearDialogFooter, ClearDialogFooterDock, ClearDialogHeader } from "@/components/clear/dialog-chrome";
import { Segmented } from "@/components/clear/segmented";
import { Amount } from "@/components/clear/amount";
import { useConfirm } from "@/components/clear/confirm-dialog";
import { AnchoredTip } from "@/components/anchored-tip";
import { IconCropDialog } from "@/components/icon-crop-dialog";
import { Icon, buildBrandKey, buildImgKey, isBrandIcon, parseBrandKey, parseImgKey, softIconColors } from "@/components/icon";
import { BRAND_MAP } from "@/lib/brand-map";
import {
  PICKER_COLOURS,
  PICKER_COLOUR_NAMES,
  PICKER_ICONS,
  autoColourFor,
  colourNameOf,
  matchesQuery,
  pickerBrands,
  suggestBrands,
  suggestIcons,
  type PickerColourName,
} from "@/lib/icon-catalog";
import { cn } from "@/lib/utils";

// ─── Types ──────────────────────────────────────────────────────────────────

/** What the icon is for; decides the default tab, the subtitle and the suggestions. */
export type IconSubjectKind = "category" | "group" | "merchant" | "goal" | "debt" | "account" | "transaction";

export interface IconSubject {
  kind: IconSubjectKind;
  /** The display name ("Gym", "Basic-Fit"); suggestions and "Auto" colours derive from it. */
  name: string;
  /** Category or merchant id, for the transaction count and the preview row. */
  id?: number | null;
}

/** The picker's result: the icon key and the colour, always together. */
export interface IconChoice {
  icon: string | null;
  color: string | null;
}

type Tab = "icons" | "brands";
type ColourChoice = PickerColourName | "auto" | "custom";
type Sample = { name: string; date: string; categoryName: string | null; amount: number };
interface UploadedIcon { key: string; url: string; name: string }

const BRANDS_FIRST: IconSubjectKind[] = ["merchant", "transaction"];
const TABLER = Tabler as unknown as Record<string, React.ComponentType<{ size?: number; color?: string; stroke?: number }>>;
const SIZE_STEP = 0.1;
const SIZE_MIN = 0.4;
const SIZE_MAX = 2;
const NUDGE_STEP = 2;
const NUDGE_MAX = 20;

/** "Logo-like" keys: a brand SVG or an uploaded image (they get the adjust panel). */
function isLogoKey(key: string | null): boolean {
  return !!key && (key.startsWith("img:") || isBrandIcon(key));
}

function tabOf(key: string | null, kind: IconSubjectKind): Tab {
  if (isLogoKey(key)) return "brands";
  if (key && !key.startsWith("custom:")) return "icons";
  return BRANDS_FIRST.includes(kind) ? "brands" : "icons";
}

// ─── Tiles ──────────────────────────────────────────────────────────────────

const TILE =
  "group relative flex aspect-square w-full cursor-pointer items-center justify-center rounded-clear-tile outline-none transition-transform duration-150 hover:-translate-y-px focus-visible:ring-3 focus-visible:ring-clear-ember/50 motion-reduce:transition-none motion-reduce:hover:translate-y-0";
const TILE_SELECTED = "ring-2 ring-clear-ink ring-offset-2 ring-offset-clear-card";

/** One tile in a grid: a radio with its label shown on hover and focus. */
function Tile({
  label,
  selected,
  onPick,
  style,
  className,
  children,
}: {
  label: string;
  selected: boolean;
  onPick: () => void;
  style?: React.CSSProperties;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      aria-label={label}
      tabIndex={-1}
      data-tile=""
      onClick={onPick}
      className={cn(TILE, selected && TILE_SELECTED, className)}
      style={style}
    >
      {children}
      {selected && (
        <span aria-hidden className="absolute -top-2 -right-2 flex size-[22px] items-center justify-center rounded-full bg-clear-primary text-clear-primary-ink ring-2 ring-clear-card">
          <IconCheck size={13} stroke={2.8} />
        </span>
      )}
      <span
        aria-hidden
        className="pointer-events-none absolute -bottom-1.5 left-1/2 z-10 -translate-x-1/2 translate-y-full rounded-full bg-clear-primary px-2 py-0.5 text-xs font-bold whitespace-nowrap text-clear-primary-ink opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
      >
        {label}
      </span>
    </button>
  );
}

/** A grid of tiles as one radio group: roving tab stop, arrow keys move between tiles. */
function TileGrid({ label, children }: { label: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  // One tab stop per grid: the selected tile, else the first.
  useEffect(() => {
    const tiles = Array.from(ref.current?.querySelectorAll<HTMLButtonElement>("[data-tile]") ?? []);
    if (tiles.length === 0) return;
    if (tiles.some((t) => t.tabIndex === 0)) return;
    const stop = tiles.find((t) => t.getAttribute("aria-checked") === "true") ?? tiles[0];
    stop.tabIndex = 0;
  });
  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    const grid = e.currentTarget;
    const columns = getComputedStyle(grid).gridTemplateColumns.split(" ").length || 1;
    const delta = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -columns, ArrowDown: columns }[e.key];
    if (delta == null) return;
    const tiles = Array.from(grid.querySelectorAll<HTMLButtonElement>("[data-tile]"));
    const index = tiles.indexOf(document.activeElement as HTMLButtonElement);
    const next = tiles[index + delta];
    if (index < 0 || !next) return;
    e.preventDefault();
    tiles.forEach((t) => (t.tabIndex = -1));
    next.tabIndex = 0;
    next.focus();
  }
  return (
    <div
      ref={ref}
      role="radiogroup"
      aria-label={label}
      onKeyDown={onKeyDown}
      className="grid grid-cols-[repeat(auto-fill,minmax(56px,1fr))] gap-x-2.5 gap-y-3"
    >
      {children}
    </div>
  );
}

function GlyphTile({ iconKey, label, color, selected, onPick }: { iconKey: string; label: string; color: string; selected: boolean; onPick: () => void }) {
  const Comp = TABLER[iconKey];
  const soft = softIconColors(color);
  return (
    <Tile label={label} selected={selected} onPick={onPick} style={{ background: soft.background, color: soft.foreground }}>
      {Comp ? <Comp size={28} stroke={1.9} /> : null}
    </Tile>
  );
}

function BrandTile({ brandKey, label, selected, onPick }: { brandKey: string; label: string; selected: boolean; onPick: () => void }) {
  const entry = BRAND_MAP[brandKey];
  const svg = entry.svg.replace("<svg ", '<svg width="30" height="30" ');
  return (
    <Tile label={label} selected={selected} onPick={onPick} className="bg-clear-tile dark:bg-clear-ink/90">
      <span aria-hidden className="leading-[0]" dangerouslySetInnerHTML={{ __html: svg }} />
    </Tile>
  );
}

function UploadTile({ upload, label, selected, onPick }: { upload: UploadedIcon; label: string; selected: boolean; onPick: () => void }) {
  return (
    <Tile label={label} selected={selected} onPick={onPick} className="overflow-visible bg-clear-tile dark:bg-clear-ink/90">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={upload.url} alt="" className="size-9 object-contain" />
    </Tile>
  );
}

// ─── Adjust panel ───────────────────────────────────────────────────────────

/** Size stepper and nudge pad for a logo or upload; writes the key's ?s=&x=&y= params. */
function AdjustPanel({
  value,
  onChange,
  onCrop,
  onDelete,
}: {
  value: string;
  onChange: (key: string) => void;
  onCrop?: () => void;
  onDelete?: () => void;
}) {
  const t = useTranslations("iconPicker.adjust");
  const isImg = value.startsWith("img:");
  const parsed = isImg ? parseImgKey(value) : parseBrandKey(value);
  const base = "src" in parsed ? parsed.src : parsed.base;
  const { scale, ox, oy } = parsed;
  const changed = scale !== 1 || ox !== 0 || oy !== 0;

  function update(s: number, x: number, y: number) {
    const size = Math.round(Math.min(SIZE_MAX, Math.max(SIZE_MIN, s)) * 10) / 10;
    const cx = Math.min(NUDGE_MAX, Math.max(-NUDGE_MAX, x));
    const cy = Math.min(NUDGE_MAX, Math.max(-NUDGE_MAX, y));
    onChange(isImg ? buildImgKey(base, size, cx, cy) : buildBrandKey(base, size, cx, cy));
  }

  const round = "inline-flex size-9 cursor-pointer items-center justify-center rounded-full bg-clear-card text-clear-ink outline-none transition-colors hover:bg-clear-line focus-visible:ring-3 focus-visible:ring-clear-ember/50 disabled:cursor-default disabled:opacity-40";
  const nudge = cn(round, "size-[30px]");

  return (
    <div className="flex flex-wrap items-center gap-[18px] rounded-clear-tile bg-clear-tile p-4">
      {/* The list row's 40px icon, enlarged, so offsets look exactly as they will in a row. */}
      <div aria-hidden className="flex size-24 shrink-0 items-center justify-center overflow-hidden rounded-clear-tile bg-clear-card">
        <div className="scale-[2.2]">
          <Icon iconKey={value} soft size="md" />
        </div>
      </div>
      <div className="flex min-w-[200px] flex-1 flex-col gap-2.5">
        <div className="flex items-center justify-between gap-3">
          <span className="text-[13px] font-bold text-clear-ink-2">{t("size")}</span>
          <div role="group" aria-label={t("size")} className="inline-flex items-center gap-2">
            <button type="button" className={round} aria-label={t("smaller")} disabled={scale <= SIZE_MIN} onClick={() => update(scale - SIZE_STEP, ox, oy)}>
              <IconMinus size={16} stroke={2.6} aria-hidden />
            </button>
            <span className="min-w-12 text-center text-[15px] font-extrabold tabular-nums" aria-live="polite">
              {Math.round(scale * 100)}%
            </span>
            <button type="button" className={round} aria-label={t("larger")} disabled={scale >= SIZE_MAX} onClick={() => update(scale + SIZE_STEP, ox, oy)}>
              <IconPlus size={16} stroke={2.6} aria-hidden />
            </button>
          </div>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-[13px] font-bold text-clear-ink-2">{t("position")}</span>
          <div role="group" aria-label={t("position")} className="grid grid-cols-3 grid-rows-3 gap-[3px] [grid-template-areas:'._u_.''l_._r''._d_.']">
            <button type="button" className={cn(nudge, "[grid-area:u]")} aria-label={t("up")} onClick={() => update(scale, ox, oy - NUDGE_STEP)}>
              <IconArrowUp size={14} stroke={2.4} aria-hidden />
            </button>
            <button type="button" className={cn(nudge, "[grid-area:l]")} aria-label={t("left")} onClick={() => update(scale, ox - NUDGE_STEP, oy)}>
              <IconArrowLeft size={14} stroke={2.4} aria-hidden />
            </button>
            <button type="button" className={cn(nudge, "[grid-area:r]")} aria-label={t("right")} onClick={() => update(scale, ox + NUDGE_STEP, oy)}>
              <IconArrowRight size={14} stroke={2.4} aria-hidden />
            </button>
            <button type="button" className={cn(nudge, "[grid-area:d]")} aria-label={t("down")} onClick={() => update(scale, ox, oy + NUDGE_STEP)}>
              <IconArrowDown size={14} stroke={2.4} aria-hidden />
            </button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <ClearButton variant="ghost" size="sm" disabled={!changed} onClick={() => update(1, 0, 0)}>
            {t("reset")}
          </ClearButton>
          {onCrop && (
            <ClearButton variant="ghost" size="sm" onClick={onCrop}>
              <IconCrop aria-hidden />
              {t("crop")}
            </ClearButton>
          )}
          {onDelete && (
            <ClearButton variant="danger" size="sm" onClick={onDelete}>
              <IconTrash aria-hidden />
              {t("deleteUpload")}
            </ClearButton>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── The dialog ─────────────────────────────────────────────────────────────

/**
 * The one icon picker (concept: Popup-BrandIcon): a live preview row, search across
 * icons and brands, an Icons · Brands tab that opens on the right one for the
 * subject, the pastel colour row, suggestions for the name, and an adjust panel for
 * logos and uploads. Picks are a draft until "Use icon"; the result is the icon and
 * its colour together (`withColor={false}` hides the colour row and passes the
 * current colour through, for things whose colour comes from elsewhere).
 */
export function IconPickerDialog({
  open,
  onOpenChange,
  subject,
  value,
  onApply,
  withColor = true,
  renderPreview,
  noneLabel,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  subject: IconSubject;
  value: IconChoice;
  onApply: (choice: IconChoice) => void | Promise<void>;
  withColor?: boolean;
  /** The row the icon will appear on, when the caller can draw it better (a real transaction). */
  renderPreview?: (choice: IconChoice) => React.ReactNode;
  /** Label of the "no icon" action, e.g. "Use default". Already translated. */
  noneLabel?: string;
}) {
  const t = useTranslations("iconPicker");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* z-90/85: the picker is always the topmost layer; it opens from editors that
          themselves stack above full-screen portals (merchant editor, z-72). */}
      <DialogContent
        hideHeaderRow
        title={subject.name ? t("title", { name: subject.name }) : t("titleNoName")}
        sheetClassName="z-[90]"
        overlayClassName="z-[85]"
        className="gap-[18px] pt-6 font-clear text-clear-ink lg:w-[640px] lg:px-7 lg:pt-7"
      >
        {open && (
          <PickerBody
            subject={subject}
            value={value}
            withColor={withColor}
            renderPreview={renderPreview}
            noneLabel={noneLabel}
            onCancel={() => onOpenChange(false)}
            onApply={async (choice) => {
              await onApply(choice);
              onOpenChange(false);
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function PickerBody({
  subject,
  value,
  withColor,
  renderPreview,
  noneLabel,
  onCancel,
  onApply,
}: {
  subject: IconSubject;
  value: IconChoice;
  withColor: boolean;
  renderPreview?: (choice: IconChoice) => React.ReactNode;
  noneLabel?: string;
  onCancel: () => void;
  onApply: (choice: IconChoice) => Promise<void>;
}) {
  const t = useTranslations("iconPicker");
  const locale = useLocale();
  const confirm = useConfirm();
  const ids = useId();
  const name = subject.name.trim();

  const [draft, setDraft] = useState<string | null>(value.icon);
  const [colour, setColour] = useState<ColourChoice>(() => {
    const named = colourNameOf(value.color);
    if (named) return named;
    if (!value.color || value.color.toLowerCase() === autoColourFor(value.icon, name).toLowerCase()) return "auto";
    return "custom";
  });
  const [tab, setTab] = useState<Tab>(() => tabOf(value.icon, subject.kind));
  const [filled, setFilled] = useState(() => !!value.icon?.endsWith("Filled"));
  const [query, setQuery] = useState("");
  const [uploads, setUploads] = useState<UploadedIcon[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState(false);
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [info, setInfo] = useState<{ count: number | null; sample: Sample | null } | null>(null);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let live = true;
    fetch("/api/icons/upload")
      .then((r) => (r.ok ? r.json() : []))
      .then((data: UploadedIcon[]) => live && setUploads(Array.isArray(data) ? data : []))
      .catch(() => {});
    if ((subject.kind === "category" || subject.kind === "merchant") && subject.id) {
      fetch(`/api/icons/subject?kind=${subject.kind}&id=${subject.id}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => live && data && setInfo(data))
        .catch(() => {});
    }
    return () => {
      live = false;
    };
  }, [subject.kind, subject.id]);

  const labelOf = (key: string) => (t.has(`icons.${key}`) ? t(`icons.${key}`) : key.replace(/^Icon/, ""));
  const brands = useMemo(() => pickerBrands(), []);
  const resolvedColour =
    colour === "auto" ? autoColourFor(draft, name) : colour === "custom" ? value.color ?? autoColourFor(draft, name) : PICKER_COLOURS[colour];
  const choice: IconChoice = { icon: draft, color: withColor ? resolvedColour : value.color };
  // Glyph tiles render in the colour the icon will get (a caller-owned colour when the row is hidden).
  const tileColour = withColor ? resolvedColour : value.color ?? autoColourFor(null, name);

  const selectedBrand = draft && isBrandIcon(draft) ? parseBrandKey(draft).base : null;
  const selectedImg = draft?.startsWith("img:") ? parseImgKey(draft).src : null;

  function pickGlyph(key: string) {
    setDraft(key);
  }
  function pickBrand(key: string) {
    if (selectedBrand !== key) setDraft(key);
  }
  function pickUpload(u: UploadedIcon) {
    if (selectedImg !== u.url) setDraft(u.key);
  }

  async function upload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadError(false);
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/icons/upload", { method: "POST", body: fd }).catch(() => null);
    if (res?.ok) {
      const data: UploadedIcon = await res.json();
      setUploads((prev) => [...prev.filter((u) => u.key !== data.key), data]);
      setDraft(data.key);
      setTab("brands");
    } else {
      setUploadError(true);
    }
    setUploading(false);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function deleteUpload() {
    if (!selectedImg) return;
    const ok = await confirm({
      title: t("adjust.deleteTitle"),
      body: t("adjust.deleteBody"),
      confirmLabel: t("adjust.deleteConfirm"),
      destructive: true,
    });
    if (!ok) return;
    const key = `img:${selectedImg}`;
    await fetch("/api/icons/upload", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key }),
    }).catch(() => null);
    setUploads((prev) => prev.filter((u) => u.url !== selectedImg));
    setDraft(null);
  }

  // ── What the grid shows ──
  const q = query.trim();
  const glyphKey = (key: string) => (filled && TABLER[`${key}Filled`] ? `${key}Filled` : key);
  const glyphItems = PICKER_ICONS.filter((i) => TABLER[i.key]).filter((i) => !filled || TABLER[`${i.key}Filled`]);
  const iconHits = q ? PICKER_ICONS.filter((i) => TABLER[i.key] && matchesQuery(q, i.key, labelOf(i.key), i.keywords)) : [];
  const brandHits = q ? brands.filter((b) => matchesQuery(q, b.key, b.label)) : [];
  const uploadHits = q ? uploads.filter((u) => matchesQuery(q, u.name)) : [];
  const total = iconHits.length + brandHits.length + uploadHits.length;

  const suggestedIcons = suggestIcons(name, labelOf);
  const suggestedBrands = tab === "brands" ? suggestBrands(name) : [];

  const glyph = (key: string, k = key) => (
    <GlyphTile key={k} iconKey={glyphKey(key)} label={labelOf(key)} color={tileColour} selected={draft === key || draft === `${key}Filled`} onPick={() => pickGlyph(glyphKey(key))} />
  );
  const brand = (b: { key: string; label: string }, k = b.key) => (
    <BrandTile key={k} brandKey={b.key} label={b.label} selected={selectedBrand === b.key} onPick={() => pickBrand(b.key)} />
  );
  const uploadTile = (u: UploadedIcon) => (
    <UploadTile key={u.key} upload={u} label={t("uploadedNamed", { name: u.name })} selected={selectedImg === u.url} onPick={() => pickUpload(u)} />
  );
  const uploadButton = (
    <button
      key="upload"
      type="button"
      onClick={() => fileRef.current?.click()}
      disabled={uploading}
      className="flex aspect-square w-full cursor-pointer flex-col items-center justify-center gap-1 rounded-clear-tile border-[1.5px] border-dashed border-clear-placeholder text-[13px] font-bold text-clear-ink-2 outline-none transition-colors hover:border-clear-ink focus-visible:ring-3 focus-visible:ring-clear-ember/50 disabled:opacity-50"
    >
      <IconUpload size={20} stroke={2} aria-hidden />
      {uploading ? t("uploading") : t("upload")}
    </button>
  );

  const groupHead = (label: string, extra?: React.ReactNode) => (
    <div className="flex min-h-8 items-center justify-between gap-3">
      <span className="text-[13px] font-bold text-clear-ink-2">{label}</span>
      {extra}
    </div>
  );
  const styleToggle = (
    <Segmented
      label={t("style")}
      surface="tile"
      size="sm"
      value={filled ? "filled" : "line"}
      onChange={(v) => setFilled(v === "filled")}
      items={[
        { value: "line", label: t("line") },
        { value: "filled", label: t("filled") },
      ]}
    />
  );

  const groups: { id: string; title: string; extra?: React.ReactNode; tiles: React.ReactNode[] }[] = [];
  if (q) {
    if (iconHits.length) groups.push({ id: "icons", title: t("groups.icons"), extra: styleToggle, tiles: iconHits.map((i) => glyph(i.key)) });
    if (brandHits.length) groups.push({ id: "brands", title: t("groups.brands"), tiles: brandHits.map((b) => brand(b)) });
    if (uploadHits.length) groups.push({ id: "uploads", title: t("groups.uploads"), tiles: uploadHits.map(uploadTile) });
  } else if (tab === "icons") {
    if (suggestedIcons.length && name) groups.push({ id: "suggested", title: t("groups.suggested", { name }), tiles: suggestedIcons.map((k) => glyph(k, `s-${k}`)) });
    groups.push({ id: "all", title: t("groups.allIcons"), extra: styleToggle, tiles: glyphItems.map((i) => glyph(i.key)) });
  } else {
    const sugg = [
      ...suggestedBrands.map((k) => brand({ key: k, label: BRAND_MAP[k]?.title ?? k }, `s-${k}`)),
      ...suggestedIcons.slice(0, 2).map((k) => glyph(k, `s-${k}`)),
    ];
    if (sugg.length && name) groups.push({ id: "suggested", title: t("groups.suggested", { name }), tiles: sugg });
    groups.push({ id: "brands", title: t("groups.brands"), tiles: brands.map((b) => brand(b)) });
    groups.push({ id: "uploads", title: t("groups.uploads"), tiles: [...uploads.map(uploadTile), uploadButton] });
  }

  // ── Header and preview ──
  const kindLabel = t(`kinds.${subject.kind}`);
  const subtitle = info?.count != null ? `${kindLabel} · ${t("transactionsThisYear", { count: info.count })}` : kindLabel;
  const sample = info?.sample ?? null;
  const sampleDate = sample
    ? new Intl.DateTimeFormat(locale, { weekday: "short", day: "numeric", month: "short" }).format(new Date(`${sample.date}T12:00:00`))
    : null;
  const logoBackground = draft && isLogoKey(draft) ? null : undefined;

  const colourLabel = (n: PickerColourName) => t(`colours.${n}`);

  return (
    <>
      <ClearDialogHeader
        title={name ? t("title", { name }) : t("titleNoName")}
        subtitle={subtitle}
        onClose={onCancel}
        closeLabel={t("close")}
      />

      <div aria-live="polite" aria-label={t("preview")}>
        {renderPreview ? (
          renderPreview(choice)
        ) : (
          <div className="flex items-center gap-3 rounded-clear-tile bg-clear-tile px-3.5 py-3">
            <Icon iconKey={draft} color={draft ? choice.color : null} background={logoBackground} soft size="xl" />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-[15px] font-bold">{sample?.name ?? (name || t("titleNoName"))}</span>
              <span className="truncate text-[13px] text-clear-muted">
                {sample ? [sample.categoryName, sampleDate].filter(Boolean).join(" · ") : kindLabel}
              </span>
            </span>
            {sample && <Amount value={sample.amount} className="shrink-0 text-[15px]" />}
          </div>
        )}
      </div>

      <div className="flex h-12 items-center gap-2.5 rounded-clear-row border-[1.5px] border-transparent bg-clear-tile pr-2 pl-4 text-clear-muted transition-colors focus-within:border-clear-ink">
        <IconSearch className="size-[18px] shrink-0" aria-hidden />
        <input
          type="search"
          aria-label={t("search")}
          placeholder={t("search")}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="h-full min-w-0 flex-1 bg-transparent text-[15px] font-bold text-clear-ink outline-none placeholder:font-semibold placeholder:text-clear-placeholder [&::-webkit-search-cancel-button]:hidden"
        />
        {q && (
          <>
            <span className="shrink-0 text-[13px] font-semibold whitespace-nowrap" aria-live="polite">
              {t("matches", { count: total })}
            </span>
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label={t("clearSearch")}
              className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-full bg-clear-card text-clear-ink-2"
            >
              <IconX className="size-4" aria-hidden />
            </button>
          </>
        )}
      </div>

      <div data-tip-anchor="iconPickerTabs">
        <Segmented<Tab | "search">
          label={t("tabsLabel")}
          surface="tile"
          value={q ? "search" : tab}
          onChange={(v) => {
            if (v === "search") return;
            setTab(v);
            setQuery("");
          }}
          className="flex w-full [&>button]:flex-1"
          items={[
            {
              value: "icons",
              label: (
                <>
                  {t("tabs.icons")}
                  <span className="ml-1 font-semibold opacity-60">{q ? iconHits.length : PICKER_ICONS.length}</span>
                </>
              ),
            },
            {
              value: "brands",
              label: (
                <>
                  {t("tabs.brands")}
                  <span className="ml-1 font-semibold opacity-60">{q ? brandHits.length + uploadHits.length : brands.length + uploads.length}</span>
                </>
              ),
            },
          ]}
        />
      </div>

      {withColor && (
        <div role="radiogroup" aria-labelledby={`${ids}-colour`} className="flex flex-wrap items-center gap-2.5">
          <span id={`${ids}-colour`} className="mr-1 text-[13px] font-bold text-clear-ink-2">
            {t("colour")}
          </span>
          <button
            type="button"
            role="radio"
            aria-checked={colour === "auto"}
            aria-label={t("colours.auto")}
            title={t("colours.auto")}
            onClick={() => setColour("auto")}
            className={cn(
              "inline-flex size-[30px] cursor-pointer items-center justify-center rounded-full text-clear-ink outline-none focus-visible:ring-3 focus-visible:ring-clear-ember/50",
              colour === "auto" && "ring-2 ring-clear-ink ring-offset-2 ring-offset-clear-card",
            )}
            style={{ background: "conic-gradient(var(--clr-peach), var(--clr-butter), var(--clr-mint), var(--clr-sky), var(--clr-lilac), var(--clr-rose), var(--clr-peach))" }}
          >
            {colour === "auto" && <IconCheck size={14} stroke={3} aria-hidden />}
          </button>
          {PICKER_COLOUR_NAMES.map((n) => {
            const on = colour === n;
            const hex = PICKER_COLOURS[n];
            return (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={on}
                aria-label={colourLabel(n)}
                title={colourLabel(n)}
                onClick={() => setColour(n)}
                className={cn(
                  "inline-flex size-[30px] cursor-pointer items-center justify-center rounded-full text-clear-ink outline-none focus-visible:ring-3 focus-visible:ring-clear-ember/50",
                  on ? "ring-2 ring-clear-ink ring-offset-2 ring-offset-clear-card" : "ring-1 ring-clear-ink/8 ring-inset",
                )}
                style={{ background: softIconColors(hex).background }}
              >
                {on ? <IconCheck size={14} stroke={3} aria-hidden /> : <span aria-hidden className="size-3 rounded-full" style={{ background: hex }} />}
              </button>
            );
          })}
        </div>
      )}

      <div className="-mx-1 flex flex-col gap-[18px] px-1 pt-1 pb-3">
        {groups.length === 0 ? (
          <p className="m-0 rounded-clear-tile border-[1.5px] border-dashed border-clear-line p-7 text-center text-sm text-clear-muted">
            {t("noMatches", { query: q })}
          </p>
        ) : (
          groups.map((g) => (
            <div key={g.id} className="flex flex-col gap-2.5">
              {groupHead(g.title, g.extra)}
              <TileGrid label={g.title}>{g.tiles}</TileGrid>
            </div>
          ))
        )}
        {uploadError && <p className="m-0 text-[13px] font-semibold text-clear-negative">{t("uploadFailed")}</p>}
        <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" className="hidden" onChange={upload} />
      </div>

      {draft && isLogoKey(draft) && (
        <AdjustPanel
          value={draft}
          onChange={setDraft}
          onCrop={selectedImg ? () => setCropSrc(selectedImg) : undefined}
          onDelete={selectedImg ? deleteUpload : undefined}
        />
      )}

      {/* Pinned to the bottom of the scrolling dialog so Use icon stays in reach. */}
      <ClearDialogFooterDock className="border-t border-clear-ground pt-4 pb-1">
        <ClearDialogFooter
          destructive={
            <ClearButton variant="ghost" onClick={() => setDraft(null)} disabled={draft == null}>
              {noneLabel ?? t("noIcon")}
            </ClearButton>
          }
        >
          <ClearButton variant="secondary" onClick={onCancel}>
            {t("cancel")}
          </ClearButton>
          <ClearButton
            disabled={saving}
            onClick={async () => {
              setSaving(true);
              try {
                await onApply(choice);
              } finally {
                setSaving(false);
              }
            }}
          >
            {saving ? t("saving") : t("use")}
          </ClearButton>
        </ClearDialogFooter>
      </ClearDialogFooterDock>

      <AnchoredTip id="iconPicker" anchor="iconPickerTabs" />

      {cropSrc && (
        <IconCropDialog
          imageSrc={cropSrc}
          open={!!cropSrc}
          onOpenChange={(v) => {
            if (!v) setCropSrc(null);
          }}
          onConfirm={(key) => {
            setDraft(key);
            setCropSrc(null);
          }}
        />
      )}
    </>
  );
}

// ─── Triggers ───────────────────────────────────────────────────────────────

/** An icon tile that opens the picker: the icon as it will look, a pencil on hover. */
export function IconTileButton({
  tile,
  label,
  onClick,
  anchor,
}: {
  tile: React.ReactNode;
  /** Accessible name, e.g. "Change icon". Already translated. */
  label: string;
  onClick: () => void;
  /** data-tip-anchor for a walkthrough step. */
  anchor?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      data-tip-anchor={anchor}
      className="group relative shrink-0 cursor-pointer rounded-clear-tile outline-none transition-transform focus-visible:ring-3 focus-visible:ring-clear-ink/40 focus-visible:ring-offset-2 focus-visible:ring-offset-clear-card active:scale-[0.96]"
    >
      {tile}
      <span
        aria-hidden
        className="pointer-events-none absolute -right-1.5 -bottom-1.5 inline-flex size-6 items-center justify-center rounded-full bg-clear-primary text-clear-primary-ink opacity-0 ring-2 ring-clear-card transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 motion-reduce:transition-none"
      >
        <IconPencil size={13} stroke={2.4} />
      </span>
    </button>
  );
}

/**
 * The "Icon & colour" row of a form (a savings goal, a debt): the big tile that opens
 * the picker, its label and a one-line hint. The picker sets icon and colour together.
 * `open` is controllable so a walkthrough can pause while the picker is up.
 */
export function IconChoiceRow({
  label,
  tile,
  anchor,
  subject,
  value,
  onChange,
  open: openProp,
  onOpenChange,
}: {
  /** The row's label, e.g. "Icon & colour". Already translated. */
  label: string;
  tile: React.ReactNode;
  anchor?: string;
  subject: IconSubject;
  value: IconChoice;
  onChange: (choice: IconChoice) => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const t = useTranslations("iconPicker");
  const [ownOpen, setOwnOpen] = useState(false);
  const open = openProp ?? ownOpen;
  const setOpen = (next: boolean) => {
    setOwnOpen(next);
    onOpenChange?.(next);
  };
  return (
    <div data-tip-anchor={anchor} className="flex items-center gap-[18px]">
      <IconTileButton tile={tile} label={t("change")} onClick={() => setOpen(true)} />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-[13px] font-bold text-clear-ink-2">{label}</span>
        <span className="text-[13px] text-clear-muted">{t("rowHint")}</span>
      </div>
      <IconPickerDialog open={open} onOpenChange={setOpen} subject={subject} value={value} onApply={onChange} />
    </div>
  );
}

/**
 * A form field's icon: the tile (tap to change) and the picker behind it. The
 * picker's result (icon and colour) goes to `onChange`.
 */
export function IconPickerField({
  subject,
  value,
  onChange,
  withColor = true,
  tile,
  background,
}: {
  subject: IconSubject;
  value: IconChoice;
  onChange: (choice: IconChoice) => void;
  withColor?: boolean;
  /** The tile to show instead of the default soft icon. */
  tile?: React.ReactNode;
  /** Backdrop of the default tile (merchant logos). */
  background?: string | null;
}) {
  const t = useTranslations("iconPicker");
  const [open, setOpen] = useState(false);
  return (
    <>
      <IconTileButton
        tile={tile ?? <Icon iconKey={value.icon} color={value.icon ? value.color : null} background={value.icon ? background ?? null : null} soft size="xl" />}
        label={t("change")}
        onClick={() => setOpen(true)}
      />
      <IconPickerDialog open={open} onOpenChange={setOpen} subject={subject} value={value} onApply={onChange} withColor={withColor} />
    </>
  );
}
