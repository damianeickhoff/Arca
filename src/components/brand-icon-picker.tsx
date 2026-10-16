"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { IconCheck, IconPhoto, IconSearch, IconUpload, IconX } from "@tabler/icons-react";
import { BRAND_MAP } from "@/lib/brand-map";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { BrandIcon } from "@/components/brand-icon";
import { IconGlyph } from "@/components/icon-picker";
import { ClearButton } from "@/components/clear/button";
import { ClearDialogFooter, ClearDialogHeader } from "@/components/clear/dialog-chrome";
import { ClearInput } from "@/components/clear/field";
import { Segmented } from "@/components/clear/segmented";
import { cn } from "@/lib/utils";
import { parseImgKey, buildImgKey, parseBrandKey, buildBrandKey, isBrandIcon } from "@/components/icon";

// Curated list of brands relevant to recurring bills & subscriptions
const BRAND_ICONS: { key: string; label: string }[] = [
  // Streaming & music
  { key: "spotify",         label: "Spotify" },
  { key: "netflix",         label: "Netflix" },
  { key: "plex",            label: "Plex" },
  { key: "youtube",         label: "YouTube" },
  { key: "youtube-music",   label: "YT Music" },
  { key: "apple-music",     label: "Apple Music" },
  { key: "deezer",          label: "Deezer" },
  { key: "tidal",           label: "Tidal" },
  { key: "hbo",             label: "HBO" },
  { key: "paramountplus",   label: "Paramount+" },
  { key: "disney",          label: "Disney" },
  { key: "suno",            label: "Suno" },
  { key: "amazon-prime",    label: "Amazon Prime" },
  { key: "subway",          label: "Subway" },

  // Tech & cloud
  { key: "apple",           label: "Apple" },
  { key: "google",          label: "Google" },
  { key: "samsung",         label: "Samsung" },
  { key: "sony",            label: "Sony" },
  { key: "dropbox",         label: "Dropbox" },
  { key: "box",             label: "Box" },
  { key: "figma",           label: "Figma" },
  { key: "notion",          label: "Notion" },
  { key: "github",          label: "GitHub" },
  // AI
  { key: "anthropic",       label: "Anthropic" },
  { key: "claude",          label: "Claude" },
  { key: "openai",          label: "OpenAI" },
  // Finance & payments
  { key: "paypal",          label: "PayPal" },
  { key: "stripe",          label: "Stripe" },
  { key: "revolut",         label: "Revolut" },
  { key: "n26",             label: "N26" },
  { key: "bunq",            label: "Bunq" },
  // Telecom
  { key: "vodafone",        label: "Vodafone" },
  { key: "virgin",          label: "Virgin" },
  // Gaming
  { key: "ea",              label: "EA" },
  { key: "steam",           label: "Steam" },
  { key: "playstation",     label: "PlayStation" },
  { key: "twitch",          label: "Twitch" },
  // Communication & social
  { key: "discord",         label: "Discord" },
  { key: "whatsapp",        label: "WhatsApp" },
  { key: "telegram",        label: "Telegram" },
  { key: "instagram",       label: "Instagram" },
  { key: "facebook",        label: "Facebook" },
  { key: "x",               label: "X" },
  { key: "reddit",          label: "Reddit" },
  { key: "snapchat",        label: "Snapchat" },
  // Content & communities
  { key: "patreon",         label: "Patreon" },
  // Travel & food
  { key: "airbnb",          label: "Airbnb" },
  { key: "bookingdotcom",   label: "Booking" },
  { key: "expedia",         label: "Expedia" },
  { key: "klm",             label: "KLM" },
  { key: "uber-eats",       label: "Uber Eats" },
  // Shopping
  { key: "ikea",            label: "IKEA" },
  { key: "lidl",            label: "Lidl" },
  { key: "zara",            label: "Zara" },
  { key: "vinted",          label: "Vinted" },
];

// De-duplicate by key
const DEDUPED_BRANDS = BRAND_ICONS.filter((v, i, a) => a.findIndex((x) => x.key === v.key) === i);

const TILE =
  "relative flex aspect-square cursor-pointer items-center justify-center rounded-clear-tile bg-clear-tile text-clear-ink outline-none transition-colors hover:bg-clear-line focus-visible:ring-3 focus-visible:ring-clear-ember/50";
const TILE_SELECTED = "ring-2 ring-clear-ink ring-offset-2 ring-offset-clear-card hover:bg-clear-tile";

/** The black check badge on a selected tile's corner. */
function SelectedBadge() {
  return (
    <span className="absolute -top-2 -right-2 flex size-[22px] items-center justify-center rounded-full bg-clear-primary text-clear-primary-ink ring-2 ring-clear-card">
      <IconCheck size={13} stroke={2.8} />
    </span>
  );
}

/** Arrow keys move focus between the tiles of a grid (Enter / Space pick natively). */
function moveInTileGrid(e: React.KeyboardEvent<HTMLElement>) {
  const grid = e.currentTarget;
  const columns = getComputedStyle(grid).gridTemplateColumns.split(" ").length || 1;
  const delta = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -columns, ArrowDown: columns }[e.key];
  if (delta == null) return;
  const tiles = Array.from(grid.querySelectorAll<HTMLButtonElement>(":scope > button"));
  const index = tiles.indexOf(document.activeElement as HTMLButtonElement);
  if (index < 0) return;
  const next = tiles[index + delta];
  if (!next) return;
  e.preventDefault();
  next.focus();
}

function SliderRow({ label, value, min, max, step, unit, onChange }: {
  label: string; value: number; min: number; max: number; step: number; unit: string;
  onChange: (v: number) => void;
}) {
  const id = useId();
  return (
    <div className="flex items-center gap-3">
      <label htmlFor={id} className="w-24 shrink-0 text-[13px] font-semibold text-clear-ink-2">{label}</label>
      <input
        id={id}
        type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="h-1.5 flex-1 cursor-pointer accent-clear-ink"
      />
      <span className="w-12 text-right text-[13px] font-bold tabular-nums">{value}{unit}</span>
    </div>
  );
}

/** Size and position sliders for a brand logo or an uploaded image — both store the
 *  transform in the icon key (?s=…&x=…&y=…). */
function IconAdjuster({ value, onChange }: { value: string; onChange: (key: string) => void }) {
  const t = useTranslations("brandIconPicker.adjust");
  const isImg = value.startsWith("img:");
  const parsed = isImg ? parseImgKey(value) : parseBrandKey(value);
  const base = "src" in parsed ? parsed.src : parsed.base;
  const { scale, ox, oy } = parsed;
  const hasTransform = scale !== 1 || ox !== 0 || oy !== 0;
  function update(s: number, x: number, y: number) {
    onChange(isImg ? buildImgKey(base, s, x, y) : buildBrandKey(base, s, x, y));
  }
  return (
    <div className="flex flex-col gap-3 rounded-clear-tile bg-clear-tile p-4">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[13px] font-bold text-clear-ink-2">{t("title")}</span>
        {hasTransform && (
          <button type="button" onClick={() => update(1, 0, 0)} className="cursor-pointer rounded-full px-2.5 py-1 text-[13px] font-bold text-clear-ink hover:bg-clear-line">
            {t("reset")}
          </button>
        )}
      </div>
      <div className="flex justify-center">
        <BrandIcon iconKey={value} size="xxl" />
      </div>
      <div className="flex flex-col gap-2.5">
        <SliderRow label={t("size")} value={Math.round(scale * 100)} min={20} max={250} step={5} unit="%" onChange={(v) => update(v / 100, ox, oy)} />
        <SliderRow label={t("horizontal")} value={ox} min={-40} max={40} step={1} unit="px" onChange={(v) => update(scale, v, oy)} />
        <SliderRow label={t("vertical")} value={oy} min={-40} max={40} step={1} unit="px" onChange={(v) => update(scale, ox, v)} />
      </div>
    </div>
  );
}

interface BrandIconPickerProps {
  value: string | null | undefined;
  onChange: (key: string | null) => void;
}

interface UploadedIcon { key: string; url: string; name: string }

/**
 * The merchant / brand icon chooser (Popup-BrandIcon, the picker grid part): a tile
 * trigger that opens a dialog with a search field, Popular · All brands, the logo grid,
 * your uploaded images, an emoji-or-text icon, and size/position sliders for a chosen
 * logo or image. Picks apply straight away (onChange); Done closes.
 */
export function BrandIconPicker({ value, onChange }: BrandIconPickerProps) {
  const t = useTranslations("brandIconPicker");
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [searchAll, setSearchAll] = useState(false);
  const [customInput, setCustomInput] = useState(value?.startsWith("custom:") ? value.slice(7) : "");
  const [uploadedIcons, setUploadedIcons] = useState<UploadedIcon[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const ids = useId();

  useEffect(() => {
    fetch("/api/icons/upload")
      .then((r) => r.json())
      .then((data) => setUploadedIcons(data))
      .catch(() => {});
  }, []);

  // The base key for the currently selected brand icon (strips any transform params)
  const selectedBrandBase = value && isBrandIcon(value) ? parseBrandKey(value).base : null;

  // Either the curated list or everything in BRAND_MAP
  const allKeys = searchAll
    ? Object.keys(BRAND_MAP).map((k) => ({ key: k, label: BRAND_MAP[k].title ?? k }))
    : DEDUPED_BRANDS;

  const query = search.trim().toLowerCase();
  const matching = allKeys
    .filter((b) => BRAND_MAP[b.key])
    .filter((b) => !query || b.label.toLowerCase().includes(query) || b.key.toLowerCase().includes(query));

  const filtered = (() => {
    const list = matching.slice(0, searchAll && !query ? 80 : undefined);
    // Pin the currently selected brand to the top (by base key)
    if (selectedBrandBase) {
      const idx = list.findIndex((b) => b.key === selectedBrandBase);
      if (idx > 0) {
        const [selected] = list.splice(idx, 1);
        list.unshift(selected);
      } else if (idx === -1) {
        list.unshift({ key: selectedBrandBase, label: BRAND_MAP[selectedBrandBase].title ?? selectedBrandBase });
      }
    }
    return list;
  })();

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/icons/upload", { method: "POST", body: fd });
    if (res.ok) {
      const { key, url, name } = await res.json();
      setUploadedIcons((prev) => [...prev, { key, url, name }]);
      onChange(key);
    }
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  const selectedLabel =
    DEDUPED_BRANDS.find((b) => b.key === selectedBrandBase)?.label ??
    (selectedBrandBase ? BRAND_MAP[selectedBrandBase]?.title : undefined) ??
    (value?.startsWith("img:") ? t("uploadedImage") : value?.startsWith("custom:") ? value.slice(7) : value);

  // The base src for the selected uploaded image (strips transform params for list matching)
  const selectedImgSrc = value?.startsWith("img:") ? parseImgKey(value).src : null;

  function selectBrand(key: string) {
    // Keep the dialog open so the sliders show; re-picking the same brand keeps its transform.
    if (selectedBrandBase !== key || !value) onChange(key);
  }

  function selectNone() {
    setCustomInput("");
    onChange(null);
    setOpen(false);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={value ? t("change", { name: selectedLabel ?? "" }) : t("choose")}
        className="flex size-12 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-clear-tile bg-clear-tile text-clear-muted outline-none transition-colors hover:bg-clear-line focus-visible:ring-3 focus-visible:ring-clear-ember/50"
      >
        {value ? <BrandIcon iconKey={value} size="sm" /> : <IconPhoto className="size-5" stroke={1.9} />}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        {/* z-90/85: this picker is always the topmost thing on screen when open, and it
            is opened from editors that themselves stack above full-screen portals
            (merchant editor, z-72) — anything lower would render behind its own host. */}
        <DialogContent
          hideHeaderRow
          title={t("title")}
          sheetClassName="z-[90]"
          overlayClassName="z-[85]"
          className="gap-5 pt-6 font-clear text-clear-ink lg:px-7 lg:pt-7"
          footer={
            <ClearDialogFooter
              destructive={
                value ? (
                  <ClearButton variant="danger" onClick={selectNone}>
                    {t("noIcon")}
                  </ClearButton>
                ) : undefined
              }
            >
              <ClearButton variant="primary" onClick={() => setOpen(false)}>
                {t("done")}
              </ClearButton>
            </ClearDialogFooter>
          }
        >
          <ClearDialogHeader
            title={t("title")}
            subtitle={value ? t("selected", { name: selectedLabel ?? "" }) : t("subtitle")}
            onClose={() => setOpen(false)}
            closeLabel={t("close")}
          />

          <div className="flex flex-col gap-3">
            <div className="flex h-12 items-center gap-2.5 rounded-clear-row border-[1.5px] border-transparent bg-clear-tile pr-2 pl-4 text-clear-muted transition-colors focus-within:border-clear-ink">
              <IconSearch className="size-[18px] shrink-0" />
              <input
                type="search"
                aria-label={t("search")}
                placeholder={t("search")}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-full min-w-0 flex-1 bg-transparent text-[15px] font-semibold text-clear-ink outline-none placeholder:font-medium placeholder:text-clear-placeholder [&::-webkit-search-cancel-button]:hidden"
              />
              {query && (
                <>
                  <span className="shrink-0 text-[13px] font-semibold whitespace-nowrap" aria-live="polite">
                    {t("matches", { count: matching.length })}
                  </span>
                  <button
                    type="button"
                    onClick={() => setSearch("")}
                    aria-label={t("clearSearch")}
                    className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-full bg-clear-card text-clear-ink-2"
                  >
                    <IconX className="size-4" />
                  </button>
                </>
              )}
            </div>
            <Segmented
              label={t("scope")}
              surface="tile"
              size="sm"
              value={searchAll ? "all" : "popular"}
              onChange={(v) => setSearchAll(v === "all")}
              items={[
                { value: "popular", label: t("popular") },
                { value: "all", label: t("all") },
              ]}
              className="self-start"
            />
          </div>

          <div className="flex flex-col gap-2.5">
            <span id={`${ids}-brands`} className="text-[13px] font-bold text-clear-ink-2">{t("brands")}</span>
            {filtered.length === 0 ? (
              <p className="m-0 py-4 text-center text-sm text-clear-muted">{t("noMatches")}</p>
            ) : (
              <div role="radiogroup" aria-labelledby={`${ids}-brands`} onKeyDown={moveInTileGrid} className="grid grid-cols-5 gap-3 sm:grid-cols-6">
                {filtered.map((brand) => {
                  const selected = selectedBrandBase === brand.key;
                  return (
                    <button
                      key={brand.key}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      aria-label={brand.label}
                      title={brand.label}
                      onClick={() => selectBrand(brand.key)}
                      className={cn(TILE, selected && TILE_SELECTED)}
                    >
                      <IconGlyph iconKey={brand.key} size={28} />
                      {selected && <SelectedBadge />}
                    </button>
                  );
                })}
              </div>
            )}
            {selectedBrandBase && value && <IconAdjuster value={value} onChange={onChange} />}
          </div>

          <div className="flex flex-col gap-2.5">
            <span id={`${ids}-uploads`} className="text-[13px] font-bold text-clear-ink-2">{t("uploads")}</span>
            <div role="radiogroup" aria-labelledby={`${ids}-uploads`} onKeyDown={moveInTileGrid} className="grid grid-cols-5 gap-3 sm:grid-cols-6">
              {uploadedIcons.map((img) => {
                const selected = selectedImgSrc === img.key.slice(4) || value === img.key;
                return (
                  <button
                    key={img.key}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    aria-label={t("uploadedNamed", { name: img.name })}
                    title={img.name}
                    onClick={() => {
                      if (!selected) onChange(img.key);
                    }}
                    className={cn(TILE, selected && TILE_SELECTED)}
                  >
                    <BrandIcon iconKey={selected && value ? value : img.key} size="sm" />
                    {selected && <SelectedBadge />}
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="flex h-16 cursor-pointer items-center gap-3 self-start rounded-clear-tile border-[1.5px] border-dashed border-clear-placeholder px-5 text-left transition-colors hover:border-clear-ink disabled:opacity-50"
            >
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-clear-ground">
                <IconUpload className="size-[18px]" stroke={2} />
              </span>
              <span className="flex flex-col gap-px">
                <span className="text-sm font-bold">{uploading ? t("uploading") : t("upload")}</span>
                <span className="text-xs font-medium text-clear-muted">{t("uploadHint")}</span>
              </span>
            </button>
            <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" className="hidden" onChange={handleUpload} />
            {value?.startsWith("img:") && <IconAdjuster value={value} onChange={onChange} />}
          </div>

          <div className="flex flex-col gap-2.5 border-t border-clear-ground pt-4">
            <label htmlFor={`${ids}-custom`} className="text-[13px] font-bold text-clear-ink-2">{t("custom")}</label>
            <div className="flex items-center gap-3">
              <ClearInput
                id={`${ids}-custom`}
                maxLength={2}
                placeholder={t("customPlaceholder")}
                value={customInput}
                onChange={(e) => {
                  const v = e.target.value;
                  setCustomInput(v);
                  if (v) onChange(`custom:${v}`);
                }}
                className="w-24 text-center"
              />
              {customInput && <BrandIcon iconKey={`custom:${customInput}`} size="sm" />}
              {value?.startsWith("custom:") && (
                <ClearButton
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setCustomInput("");
                    onChange(null);
                  }}
                >
                  {t("clearCustom")}
                </ClearButton>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
