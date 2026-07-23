"use client";

import { useState, useEffect, useRef } from "react";
import { BRAND_MAP } from "@/lib/brand-map";
import {
  IconSearchFilled as Search,
  IconPlusFilled as Plus
} from "@tabler/icons-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { BrandIcon } from "@/components/brand-icon";
import { Segmented, PickerTrigger, NoneTile, GridTile } from "@/components/icon-picker";
import { cn } from "@/lib/utils";
import { parseImgKey, buildImgKey, parseBrandKey, buildBrandKey, isBrandIcon } from "@/components/icon";

// Curated list of brands relevant to recurring bills & subscriptions
export const BRAND_ICONS: { key: string; label: string }[] = [
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

function SliderRow({ label, value, min, max, step, unit, onChange }: {
  label: string; value: number; min: number; max: number; step: number; unit: string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-foreground/50 w-20 shrink-0">{label}</span>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="flex-1 h-1.5 accent-primary cursor-pointer"
      />
      <span className="text-xs text-foreground/60 w-12 text-right tabular-nums">{value}{unit}</span>
    </div>
  );
}

function ImgAdjuster({ value, onChange }: { value: string; onChange: (key: string) => void }) {
  const { src, scale, ox, oy } = parseImgKey(value);
  const hasTransform = scale !== 1 || ox !== 0 || oy !== 0;
  function update(s: number, x: number, y: number) { onChange(buildImgKey(src, s, x, y)); }
  return (
    <div className="rounded-xl bg-foreground/[0.04] p-3 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-foreground/60">Formaat &amp; positie</p>
        {hasTransform && (
          <button type="button" onClick={() => update(1, 0, 0)} className="text-xs text-foreground/40 hover:text-foreground/70 cursor-pointer">Reset</button>
        )}
      </div>
      <div className="flex justify-center"><BrandIcon iconKey={value} size="xxl" /></div>
      <div className="space-y-2">
        <SliderRow label="Grootte" value={Math.round(scale * 100)} min={20} max={250} step={5} unit="%" onChange={(v) => update(v / 100, ox, oy)} />
        <SliderRow label="Links/Rechts" value={ox} min={-40} max={40} step={1} unit="px" onChange={(v) => update(scale, v, oy)} />
        <SliderRow label="Boven/Onder" value={oy} min={-40} max={40} step={1} unit="px" onChange={(v) => update(scale, ox, v)} />
      </div>
    </div>
  );
}

function BrandAdjuster({ value, onChange }: { value: string; onChange: (key: string) => void }) {
  const { base, scale, ox, oy } = parseBrandKey(value);
  const hasTransform = scale !== 1 || ox !== 0 || oy !== 0;
  function update(s: number, x: number, y: number) { onChange(buildBrandKey(base, s, x, y)); }
  return (
    <div className="rounded-xl bg-foreground/[0.04] p-3 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-foreground/60">Formaat &amp; positie</p>
        {hasTransform && (
          <button type="button" onClick={() => update(1, 0, 0)} className="text-xs text-foreground/40 hover:text-foreground/70 cursor-pointer">Reset</button>
        )}
      </div>
      <div className="flex justify-center"><BrandIcon iconKey={value} size="xxl" /></div>
      <div className="space-y-2">
        <SliderRow label="Grootte" value={Math.round(scale * 100)} min={20} max={250} step={5} unit="%" onChange={(v) => update(v / 100, ox, oy)} />
        <SliderRow label="Links/Rechts" value={ox} min={-40} max={40} step={1} unit="px" onChange={(v) => update(scale, v, oy)} />
        <SliderRow label="Boven/Onder" value={oy} min={-40} max={40} step={1} unit="px" onChange={(v) => update(scale, ox, v)} />
      </div>
    </div>
  );
}

interface BrandIconPickerProps {
  value: string | null | undefined;
  onChange: (key: string | null) => void;
}

interface UploadedIcon { key: string; url: string; name: string }

export function BrandIconPicker({ value, onChange }: BrandIconPickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [searchAll, setSearchAll] = useState(false);
  const [customInput, setCustomInput] = useState(value?.startsWith("custom:") ? value.slice(7) : "");
  const [uploadedIcons, setUploadedIcons] = useState<UploadedIcon[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/icons/upload")
      .then((r) => r.json())
      .then((data) => setUploadedIcons(data))
      .catch(() => {});
  }, []);

  // The base key for the currently selected brand icon (strips any transform params)
  const selectedBrandBase = value && isBrandIcon(value) ? parseBrandKey(value).base : null;

  // Build list: either curated list or all available in BRAND_MAP
  const allKeys = searchAll
    ? Object.keys(BRAND_MAP).map((k) => ({ key: k, label: BRAND_MAP[k].title ?? k }))
    : DEDUPED_BRANDS;

  const filtered = (() => {
    const list = allKeys
      .filter((b) => BRAND_MAP[b.key])
      .filter(
        (b) =>
          !search ||
          b.label.toLowerCase().includes(search.toLowerCase()) ||
          b.key.toLowerCase().includes(search.toLowerCase())
      )
      .slice(0, searchAll && !search ? 80 : undefined);

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

  const selectedLabel = DEDUPED_BRANDS.find((b) => b.key === selectedBrandBase)?.label
    ?? (selectedBrandBase ? BRAND_MAP[selectedBrandBase]?.title : undefined)
    ?? value;

  // The base src for the selected uploaded image (strips transform params for list matching)
  const selectedImgSrc = value?.startsWith("img:") ? parseImgKey(value).src : null;

  // Whether we're showing the adjuster (brand icon or img: selected)
  const showBrandAdjuster = !!selectedBrandBase;
  const showImgAdjuster = !!value?.startsWith("img:");
  const showAdjuster = showBrandAdjuster || showImgAdjuster;

  function selectBrand(key: string) {
    // Keep the dialog open so the adjuster is visible; preserve existing transforms if same brand
    if (selectedBrandBase === key && value) {
      // already selected — do nothing (adjuster stays)
    } else {
      onChange(key);
    }
  }

  function selectNone() {
    onChange(null);
    setOpen(false);
  }

  return (
    <>
      <PickerTrigger value={value ?? null} onClick={() => setOpen(true)} />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90dvh] overflow-y-auto z-[60]" overlayClassName="z-[55] backdrop-blur-lg bg-foreground/20">
          <DialogHeader>
            <DialogTitle>Merk kiezen</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-foreground/40" />
                <input
                  type="text"
                  placeholder="Search merk..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full rounded-full pl-9 pr-3 py-2 text-sm bg-foreground/5"
                />
              </div>
              <Segmented
                value={searchAll ? "all" : "popular"}
                onChange={(v) => setSearchAll(v === "all")}
                options={[{ value: "popular", label: "Populair" }, { value: "all", label: "Alle" }]}
              />
            </div>

            <div className="grid grid-cols-6 gap-1.5">
              <NoneTile selected={!value} onClick={selectNone} />
              {filtered.map((brand) => (
                <GridTile
                  key={brand.key}
                  iconKey={brand.key}
                  label={brand.label}
                  selected={selectedBrandBase === brand.key}
                  onClick={() => selectBrand(brand.key)}
                />
              ))}
            </div>

            {/* Brand adjuster */}
            {showBrandAdjuster && value && (
              <BrandAdjuster value={value} onChange={onChange} />
            )}

            {/* Uploaded images */}
            <div className="border-t border-foreground/10 pt-3 space-y-3">
              <p className="text-[10px] text-foreground/50 uppercase tracking-wide">Eigen afbeelding</p>
              <div className="flex flex-wrap gap-1.5">
                {uploadedIcons.map((img) => {
                  const isSelected = selectedImgSrc === img.key.slice(4) || value === img.key;
                  return (
                    <button
                      key={img.key}
                      type="button"
                      title={img.name}
                      onClick={() => {
                        if (!isSelected) onChange(img.key);
                      }}
                      className={cn(
                        "rounded-xl p-1.5 transition-colors cursor-pointer",
                        isSelected ? "ring-2 ring-foreground bg-foreground/5" : "hover:bg-foreground/5",
                      )}
                    >
                      <BrandIcon iconKey={isSelected && value ? value : img.key} size="sm" />
                    </button>
                  );
                })}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="size-10 rounded-xl border border-dashed border-foreground/25 text-foreground/40 hover:border-foreground/50 hover:text-foreground/70 transition-colors flex items-center justify-center disabled:opacity-50 cursor-pointer"
                  title="Upload image"
                >
                  {uploading ? "…" : <Plus className="size-4" />}
                </button>
                <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" className="hidden" onChange={handleUpload} />
              </div>

              {/* Img adjuster */}
              {showImgAdjuster && value && (
                <ImgAdjuster value={value} onChange={onChange} />
              )}
            </div>

            {/* Custom emoji/text icon */}
            <div className="border-t border-foreground/10 pt-3">
              <p className="text-[10px] text-foreground/50 uppercase tracking-wide mb-1.5">Eigen icoon (emoji of tekst)</p>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  maxLength={2}
                  placeholder="🏠 or AB"
                  value={customInput}
                  onChange={(e) => {
                    const v = e.target.value;
                    setCustomInput(v);
                    if (v) onChange(`custom:${v}`);
                  }}
                  className="w-24 rounded-full px-3 py-1.5 text-sm bg-foreground/5 text-center"
                />
                {customInput && <BrandIcon iconKey={`custom:${customInput}`} size="sm" />}
                {value?.startsWith("custom:") && (
                  <button
                    type="button"
                    onClick={() => { setCustomInput(""); onChange(null); }}
                    className="text-xs text-foreground/50 hover:text-foreground cursor-pointer"
                  >
                    Wissen
                  </button>
                )}
              </div>
            </div>
          </div>

          {value && !showAdjuster && (
            <p className="text-xs text-foreground/50 -mt-1">
              Geselecteerd: {selectedLabel}
            </p>
          )}

          {/* Confirm button when an adjustable icon is selected */}
          {showAdjuster && (
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="w-full rounded-xl bg-foreground text-primary-foreground py-2.5 text-sm font-medium mt-1 cursor-pointer"
            >
              Save
            </button>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
