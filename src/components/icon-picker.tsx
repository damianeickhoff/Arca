"use client";

import { useState, useEffect, useRef } from "react";
import { BRAND_MAP } from "@/lib/brand-map";
import * as Tabler from "@tabler/icons-react";
import {
  IconSearch as Search,
  IconPlusFilled as Plus,
  IconXFilled as X,
  IconCrop as Crop,
  IconTrash as Trash,
} from "@tabler/icons-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Icon, isBrandIcon, parseImgKey, buildImgKey } from "@/components/icon";
import { IconCropDialog } from "@/components/icon-crop-dialog";
import { cn } from "@/lib/utils";
import { contrastIconColor } from "@/lib/color-luminance";


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

function ImageAdjuster({ value, onChange }: { value: string; onChange: (key: string) => void }) {
  const { src, scale, ox, oy } = parseImgKey(value);
  const hasTransform = scale !== 1 || ox !== 0 || oy !== 0;

  function update(s: number, x: number, y: number) {
    onChange(buildImgKey(src, s, x, y));
  }

  return (
    <div className="rounded-xl bg-foreground/[0.04] p-3 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-foreground/60">Formaat &amp; positie</p>
        {hasTransform && (
          <button type="button" onClick={() => update(1, 0, 0)} className="text-xs text-foreground/40 hover:text-foreground/70 cursor-pointer">
            Reset
          </button>
        )}
      </div>
      <div className="flex justify-center">
        <Icon iconKey={value} size="xxl" round />
      </div>
      <div className="space-y-2">
        <SliderRow label="Grootte" value={Math.round(scale * 100)} min={20} max={250} step={5} unit="%" onChange={(v) => update(v / 100, ox, oy)} />
        <SliderRow label="Links/Rechts" value={ox} min={-40} max={40} step={1} unit="px" onChange={(v) => update(scale, v, oy)} />
        <SliderRow label="Boven/Onder" value={oy} min={-40} max={40} step={1} unit="px" onChange={(v) => update(scale, ox, v)} />
      </div>
    </div>
  );
}
// ─── Brand icons (@thesvg/icon    s) ──────────────────────────────────────────────

export const BRAND_ICONS: { key: string; label: string }[] = [
  // Streaming & music
  { key: "spotify",                 label: "Spotify" },
  { key: "netflix",                 label: "Netflix" },
  { key: "plex",                    label: "Plex" },
  { key: "youtube",                 label: "YouTube" },
  { key: "youtube-music",           label: "YT Music" },
  { key: "apple-music",             label: "Apple Music" },
  { key: "deezer",                  label: "Deezer" },
  { key: "tidal",                   label: "Tidal" },
  { key: "hbo",                     label: "HBO" },
  { key: "paramountplus",           label: "Paramount+" },
  { key: "disney",                  label: "Disney" },
  // Tech & hardware        
  { key: "apple",                   label: "Apple" },
  { key: "google",                  label: "Google" },
  { key: "samsung",                 label: "Samsung" },
  { key: "sony",                    label: "Sony" },
  { key: "intel",                   label: "Intel" },
  { key: "figma",                   label: "Figma" },
  { key: "notion",                  label: "Notion" },
  { key: "github",                  label: "GitHub" },
  { key: "dropbox",                 label: "Dropbox" },
  // AI       
  { key: "anthropic",               label: "Anthropic" },
  { key: "claude",                  label: "Claude" },
  // Finance & payments       
  { key: "paypal",                  label: "PayPal" },
  { key: "stripe",                  label: "Stripe" },
  { key: "revolut",                 label: "Revolut" },
  { key: "n26",                     label: "N26" },
  { key: "bunq",                    label: "Bunq" },
  // Telecom        
  { key: "vodafone",                label: "Vodafone" },
  { key: "virgin",                  label: "Virgin" },
  // Gaming       
  { key: "ea",                      label: "EA" },
  { key: "steam",                   label: "Steam" },
  { key: "playstation",             label: "PlayStation" },
  { key: "twitch",                  label: "Twitch" },
  // Communication & social       
  { key: "discord",                 label: "Discord" },
  { key: "whatsapp",                label: "WhatsApp" },
  { key: "telegram",                label: "Telegram" },
  { key: "instagram",               label: "Instagram" },
  { key: "facebook",                label: "Facebook" },
  { key: "x",                       label: "X" },
  { key: "reddit",                  label: "Reddit" },
  { key: "snapchat",                label: "Snapchat" },
  { key: "patreon",                 label: "Patreon" },
  // Food & restaurants       
  { key: "kfc",                     label: "KFC" },
  { key: "mcdonalds",               label: "McDonald's" },
  { key: "burger-king",             label: "Burger King" },
  { key: "starbucks",               label: "Starbucks" },
  { key: "taco-bell",               label: "Taco Bell" },
  { key: "uber-eats",               label: "Uber Eats" },
  // Supermarkets & shopping        
  { key: "albert-heijn",            label: "Albert Heijn" },
  { key: "lidl",                    label: "Lidl" },
  { key: "ikea",                    label: "IKEA" },
  { key: "zalando",                 label: "Zalando" },
  { key: "ebay",                    label: "eBay" },
  { key: "etsy",                    label: "Etsy" },
  { key: "aliexpress",              label: "AliExpress" },
  { key: "wish",                    label: "Wish" },
  { key: "nike",                    label: "Nike" },
  { key: "adidas",                  label: "Adidas" },
  { key: "zara",                    label: "Zara" },
  { key: "uniqlo",                  label: "Uniqlo" },
  { key: "mediamarkt",              label: "MediaMarkt" },
  { key: "saturn",                  label: "Saturn" },
  // Travel       
  { key: "airbnb",                  label: "Airbnb" },
  { key: "bookingdotcom",           label: "Booking" },
  { key: "expedia",                 label: "Expedia" },
  { key: "klm",                     label: "KLM" },

];

// ─── Tabler (generic) icons ────────────────────────────────────────────────────

export const TABLER_ICONS: { key: string; label: string }[] = [
  // Transactions & money
  { key: "IconBriefcase",        label: "Werk" },
  { key: "IconTrendingUp",       label: "Groei" },
  { key: "IconCash",             label: "Geld" },
  { key: "IconWallet",           label: "Portemonnee" },
  { key: "IconPig",              label: "Spaarvarken" },
  { key: "IconCashBanknote",     label: "Contant" },
  { key: "IconSwitchHorizontal", label: "Transactie" },
  { key: "IconArrowBackUp",      label: "Terugbetaling" },
  { key: "IconCreditCardRefund", label: "cashback" },
  { key: "IconChartHistogram",   label: "Beleggingen" },
  // Housing & bills
  { key: "IconHome",             label: "Wonen" },
  { key: "IconBolt",             label: "Energie" },
  { key: "IconWifi",             label: "Internet" },
  { key: "IconPhone",            label: "Telefoon" },
  { key: "IconShield",           label: "Verzekering" },
  { key: "IconUmbrella",         label: "Paraplu" },
  // Food & groceries
  { key: "IconShoppingCart",     label: "Groceries" },
  { key: "IconToolsKitchen2",    label: "Restaurant" },
  { key: "IconCoffee",           label: "Koffie" },
  { key: "IconPizza",            label: "Eten" },
  // Transport
  { key: "IconCar",              label: "Auto" },
  { key: "IconGasStation",       label: "Tanken" },
  { key: "IconTrain",            label: "OV" },
  { key: "IconBike",             label: "Fiets" },
  // Entertainment
  { key: "IconMusic",            label: "Muziek" },
  { key: "IconDeviceTv",         label: "Streaming" },
  { key: "IconDeviceGamepad2",   label: "Games" },
  { key: "IconMovie",            label: "Film" },
  { key: "IconBook",             label: "Boeken" },
  { key: "IconHeadphones",       label: "Audio" },
  { key: "IconTicket",           label: "Uitje" },
  // Health & fitness
  { key: "IconHeart",            label: "Gezondheid" },
  { key: "IconBarbell",          label: "Sport" },
  { key: "IconStethoscope",      label: "Dokter" },
  { key: "IconPill",             label: "Medicijnen" },
  { key: "IconDental",           label: "Dentist" },
  // Shopping & clothing
  { key: "IconShoppingBag",      label: "Shoppen" },
  { key: "IconShirt",            label: "Kleding" },
  { key: "IconDeviceWatch",      label: "Accessoires" },
  { key: "IconGift",             label: "Cadeau" },
  // Family & kids
  { key: "IconBabyCarriage",     label: "Baby" },
  { key: "IconSchool",           label: "Opleiding" },
  { key: "IconUsers",            label: "Familie" },
  // Travel
  { key: "IconPlane",            label: "Vliegtuig" },
  { key: "IconMapPin",           label: "Reizen" },
  { key: "IconLuggage",          label: "Bagage" },
  { key: "IconBeach",            label: "Vakantie" },
  // Savings & investments
  { key: "IconTarget",           label: "Goal" },
  { key: "IconChartBar",         label: "Beleggen" },
  { key: "IconBuildingEstate",   label: "Buy a house" },
  { key: "IconBuildingBank",     label: "Bank" },
  { key: "IconPercentage",       label: "Rente" },
  { key: "IconReportMoney",      label: "ReportMoney" },
  
  // Debt
  { key: "IconCreditCard",       label: "Creditcard" },
  { key: "IconReceipt",          label: "Debt" },
  // Misc
  { key: "IconStar",             label: "Favoriet" },
  { key: "IconTag",              label: "Label" },
  { key: "IconPackage",          label: "Pakket" },
  { key: "IconTool",             label: "Onderhoud" },
  { key: "IconSparkles",         label: "Diversen" },
  { key: "IconBriefcase2",       label: "Diensten" },
  { key: "IconBallBowling",             label: "Bowling"},
  { key: "IconBallFootball",        label: "Football"},
  { key: "IconCup",                 label: "Cup"},
  { key: "IconBowlChopsticks",      label: "Bowl with Chopsticks"},
  { key: "IconGlassCocktail",       label: "Glass with Cocktail"},
  { key: "IconFaceMask",            label: "Face Mask"},
  { key: "IconShieldHeart",         label: "Shield with Heart"},
  { key: "IconBulb",                label: "Bulb"},
  { key: "IconDeviceMobile",        label: "Mobile Device"},
  { key: "IconHomeShield",          label: "Home with Shield"},
  { key: "IconReceiptEuro",         label: "Receipt (Euro)"},
  { key: "IconHomeDollar",          label: "Home (Dollar)"},
  { key: "IconHomeBolt",            label: "Home (Bolt)"},
  { key: "IconMassage",             label: "Massage"},
  { key: "IconPerfume",             label: "Perfume"},
  { key: "IconBuildingStore",       label: "Building (Store)"},
  { key: "IconDog",                 label: "Dog"},
  { key: "IconLamp",                label: "Lamp"},
  { key: "IconDeviceLaptop",        label: "Laptop"},
  { key: "IconApps",                label: "Apps"},
  { key: "IconShieldLock",          label: "Shield with Lock"},
  { key: "IconMap2",                label: "Map"},
  { key: "IconBrandUber",           label: "Uber"},
  { key: "IconBuildingSkyscraper",  label: "Skyscraper"},
  { key: "IconSailboat",            label: "Sailboat"},
  { key: "IconCamper",              label: "Camper"},
  { key: "IconPlaneDeparture",      label: "Plane Departure"},
  { key: "IconMapShield",           label: "Map with Shield"},
  { key: "IconFridge",              label: "Fridge"},
  { key: "IconActivityHeartbeat",   label: "Heartbeat"},
  { key: "IconPaw",                 label: "Paw"},
  { key: "IconParkingCircle",       label: "Parking"},
  { key: "IconGrave2",              label: "Grave"},
  { key: "IconCoins",               label: "Coins"},
  { key: "IconRoad",                label: "Road"},
  { key: "IconChartAreaLine",       label: "ChartAreaLine"},
];

// ─── Bare glyph renderer — no chip/background, used inside the grid ──────────

type TablerLib = Record<string, React.ComponentType<{ size?: number; color?: string }>>;

export function IconGlyph({ iconKey, color, size = 20 }: { iconKey: string; color?: string | null; size?: number }) {
  if (iconKey.startsWith("img:")) {
    return <img src={iconKey.slice(4)} alt="" className="object-contain" style={{ width: size, height: size }} />;
  }
  if (iconKey.startsWith("custom:")) {
    return <span className="leading-none select-none" style={{ fontSize: size * 0.7, color: color ?? undefined }}>{iconKey.slice(7)}</span>;
  }
  const brandBase = iconKey.includes("?") ? iconKey.slice(0, iconKey.indexOf("?")) : iconKey;
  if (BRAND_MAP[brandBase]) {
    const ic = BRAND_MAP[brandBase];
    const sizedSvg = ic.svg.replace("<svg ", `<svg width="${size}" height="${size}" `);
    return <div dangerouslySetInnerHTML={{ __html: sizedSvg }} style={{ lineHeight: 0 }} aria-hidden="true" />;
  }
  const tablerLib = Tabler as unknown as TablerLib;
  const Comp = tablerLib[iconKey];
  if (Comp) return <Comp size={size} color={color ?? "currentColor"} />;
  return null;
}

// ─── Segmented control (tabs / outline-filled toggle) ────────────────────────

export function Segmented<T extends string>({
  value, options, onChange,
}: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="inline-flex items-center gap-0.5 rounded-full bg-foreground/5 p-1 shrink-0">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={cn(
            "rounded-full px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer",
            value === opt.value ? "bg-foreground text-primary-foreground" : "text-foreground/60 hover:text-foreground",
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

// ─── Picker dialog body ───────────────────────────────────────────────────────

type Tab = "brand" | "tabler";

interface IconPickerProps {
  value?: string | null;
  onChange: (key: string | null) => void;
  previewColor?: string | null;
  previewBackground?: string | null;
  brandOnly?: boolean;
  /** Hides the "Merken" (brand icon) tab — used where brand icons aren't supported, e.g. categories. */
  hideBrandTab?: boolean;
  /** Controlled open state — lets a caller open the picker from its own trigger
   *  (e.g. a large hero icon). Pair with `hideDefaultTrigger`. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Suppress the built-in swatch trigger (the caller renders its own). */
  hideDefaultTrigger?: boolean;
}

interface UploadedIcon { key: string; url: string; name: string }

export function IconPicker({ value, onChange, previewColor, previewBackground, brandOnly = false, hideBrandTab = false, open: openProp, onOpenChange, hideDefaultTrigger = false }: IconPickerProps) {
  const [openState, setOpenState] = useState(false);
  const open = openProp ?? openState;
  const setOpen = (o: boolean) => { if (onOpenChange) onOpenChange(o); else setOpenState(o); };
  const tablerLib = Tabler as unknown as TablerLib;
  const tablerKeys = new Set(Object.keys(tablerLib));

  const [tab, setTab] = useState<Tab>(() =>
    brandOnly || (!hideBrandTab && value && isBrandIcon(value)) ? "brand" : "tabler"
  );
  const [fillMode, setFillMode] = useState<boolean>(() =>
    typeof value === "string" && value.endsWith("Filled")
  );
  const [search, setSearch] = useState("");
  const [customInput, setCustomInput] = useState(value?.startsWith("custom:") ? value.slice(7) : "");
  const [uploadedIcons, setUploadedIcons] = useState<UploadedIcon[]>([]);
  const [uploading, setUploading] = useState(false);
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/icons/upload")
      .then((r) => r.json())
      .then((data) => setUploadedIcons(data))
      .catch(() => {});
  }, []);

  async function handleDelete(key: string) {
    const baseKey = key.split("?")[0];
    await fetch("/api/icons/upload", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: baseKey }),
    });
    setUploadedIcons((prev) => prev.filter((i) => i.key !== key && i.key !== baseKey));
    if (value === key || value === baseKey) onChange(null);
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/icons/upload", { method: "POST", body: fd });
    if (res.ok) {
      const data = await res.json();
      setUploadedIcons((prev) => [...prev, data]);
      onChange(data.key);
    }
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  // Guard against duplicate keys slipping back into the lists — a repeated key would
  // render the same icon twice and collide as a React list key.
  const dedupe = <T extends { key: string }>(items: T[]) =>
    items.filter((item, i, arr) => arr.findIndex((x) => x.key === item.key) === i);

  const filteredBrands = dedupe(BRAND_ICONS)
    .filter((b) => BRAND_MAP[b.key])
    .filter((b) => !search || b.label.toLowerCase().includes(search.toLowerCase()) || b.key.toLowerCase().includes(search.toLowerCase()));

  const filteredTabler = dedupe(TABLER_ICONS)
    .filter((l) => tablerKeys.has(l.key))
    .filter((l) => !fillMode || tablerKeys.has(`${l.key}Filled`))
    .filter((l) => !search || l.label.toLowerCase().includes(search.toLowerCase()) || l.key.toLowerCase().includes(search.toLowerCase()));

  const selectedLabel = [...BRAND_ICONS, ...TABLER_ICONS].find((i) => i.key === value)?.label ?? value;

  function select(key: string | null) {
    onChange(key);
    setOpen(false);
  }

  return (
    <>
      {!hideDefaultTrigger && (
        <PickerTrigger value={value ?? null} color={previewColor} background={previewBackground} onClick={() => setOpen(true)} />
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90dvh] overflow-y-auto z-[60]" overlayClassName="z-[55] backdrop-blur-lg bg-foreground/20">
          <DialogHeader>
            <DialogTitle>Icon kiezen</DialogTitle>
          </DialogHeader>

          <div className="space-y-3 min-h-[60vh] sm:min-h-[440px]">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-foreground/40" />
              <input
                type="text"
                placeholder="Search icoon..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-full pl-9 pr-3 py-2 text-sm bg-foreground/5"
              />
            </div>

            {/* Tabs + outline/filled toggle */}
            {!brandOnly && (
              <div className={cn("flex items-center gap-2", hideBrandTab ? "justify-end" : "justify-between")}>
                {!hideBrandTab && (
                  <Segmented
                    value={tab}
                    onChange={setTab}
                    options={[{ value: "brand", label: "Merken" }, { value: "tabler", label: "Iconen" }]}
                  />
                )}
                {tab === "tabler" && (
                  <Segmented
                    value={fillMode ? "fill" : "line"}
                    onChange={(v) => setFillMode(v === "fill")}
                    options={[{ value: "line", label: "Lijn" }, { value: "fill", label: "Gevuld" }]}
                  />
                )}
              </div>
            )}

            {/* Grid */}
            {tab === "brand" && (
              <div className="space-y-4">
                <div className="grid grid-cols-6 gap-1.5">
                  <NoneTile selected={!value} onClick={() => select(null)} />
                  {filteredBrands.map((brand) => (
                    <GridTile
                      key={brand.key}
                      iconKey={brand.key}
                      label={brand.label}
                      selected={value === brand.key}
                      onClick={() => select(brand.key)}
                    />
                  ))}
                </div>

                {/* Uploaded images */}
                <div className="border-t border-foreground/10 pt-3">
                  <p className="text-[10px] text-foreground/50 uppercase tracking-wide mb-1.5">Eigen afbeeldingen</p>
                  <div className="flex flex-wrap gap-1.5">
                    {uploadedIcons.map((img) => (
                      <div key={img.key} className="relative group">
                        <button
                          type="button"
                          title={img.name}
                          onClick={() => select(img.key)}
                          className={cn(
                            "rounded-xl p-1.5 transition-colors cursor-pointer",
                            value === img.key ? "ring-2 ring-foreground" : "hover:bg-foreground/5",
                          )}
                        >
                          <Icon iconKey={img.key} size="sm" />
                        </button>
                        <button
                          type="button"
                          title="Bijsnijden"
                          onClick={(e) => { e.stopPropagation(); setCropSrc(img.url); }}
                          className="absolute -top-1 -right-1 size-4 rounded-full bg-primary text-primary-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer z-10"
                        >
                          <Crop className="size-2.5" />
                        </button>
                        <button
                          type="button"
                          title="Delete"
                          onClick={(e) => { e.stopPropagation(); handleDelete(img.key); }}
                          className="absolute -bottom-1 -right-1 size-4 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer z-10"
                        >
                          <Trash className="size-2.5" />
                        </button>
                      </div>
                    ))}
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
                    {customInput && <Icon iconKey={`custom:${customInput}`} size="sm" />}
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
            )}

            {!brandOnly && tab === "tabler" && (
              <div className="grid grid-cols-6 gap-1.5">
                <NoneTile selected={!value} onClick={() => select(null)} />
                {filteredTabler.map((item) => {
                  const filledKey = `${item.key}Filled`;
                  const resolvedKey = fillMode && tablerKeys.has(filledKey) ? filledKey : item.key;
                  const isSelected = value === item.key || value === filledKey;
                  return (
                    <GridTile
                      key={item.key}
                      iconKey={resolvedKey}
                      label={item.label}
                      selected={isSelected}
                      onClick={() => select(resolvedKey)}
                    />
                  );
                })}
              </div>
            )}
          </div>

          {value && (
            <p className="text-xs text-foreground/50 -mt-1">
              Geselecteerd: {selectedLabel}
            </p>
          )}
        </DialogContent>
      </Dialog>

      {cropSrc && (
        <IconCropDialog
          imageSrc={cropSrc}
          open={!!cropSrc}
          onOpenChange={(v) => { if (!v) setCropSrc(null); }}
          onConfirm={(key) => { onChange(key); setCropSrc(null); }}
        />
      )}
    </>
  );
}

// ─── Trigger swatch ──────────────────────────────────────────────────────────

export function PickerTrigger({ value, color, background, onClick }: { value: string | null; color?: string | null; background?: string | null; onClick: () => void }) {
  const isBrand = value ? isBrandIcon(value) : false;
  const hasColorBg = !!color && !isBrand;
  const glyphColor = hasColorBg ? contrastIconColor(color!) : (color ?? undefined);
  const bgStyle = background
    ? { backgroundColor: background }
    : hasColorBg
    ? { backgroundColor: color! }
    : { backgroundColor: "var(--card, white)" };
  return (
    <button
      type="button"
      onClick={onClick}
      className="size-12 rounded-full shrink-0 cursor-pointer transition-transform hover:scale-105 flex items-center justify-center overflow-hidden"
      style={bgStyle}
    >
      {value ? <IconGlyph iconKey={value} color={isBrand ? undefined : glyphColor} size={24} /> : <span className="size-2 rounded-sm bg-foreground/30" />}
    </button>
  );
}

export function NoneTile({ selected, onClick }: { selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      title="No icon"
      onClick={onClick}
      className={cn(
        "flex items-center justify-center rounded-xl aspect-square transition-colors cursor-pointer",
        selected ? "bg-foreground text-primary-foreground" : "hover:bg-foreground/5 text-foreground/40",
      )}
    >
      <X className="size-4" />
    </button>
  );
}

export function GridTile({
  iconKey,
  label,
  selected,
  color,
  onClick,
}: {
  iconKey: string;
  label: string;
  selected: boolean;
  color?: string | null;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={label}
      onClick={onClick}
      className={cn(
        "flex items-center justify-center rounded-xl aspect-square transition-colors cursor-pointer",
        selected ? "ring-2 ring-foreground bg-foreground/8" : "hover:bg-foreground/5",
      )}
    >
      <IconGlyph iconKey={iconKey} color={color} size={20} />
    </button>
  );
}
