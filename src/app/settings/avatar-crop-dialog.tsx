"use client";

import { useId, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { IconMinus, IconPlus } from "@tabler/icons-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { ClearDialogFooter, ClearDialogHeader } from "@/components/clear/dialog-chrome";
import { clearButtonVariants } from "@/components/clear/button-variants";
import { cn } from "@/lib/utils";

/** Diameter of the round crop area — the exact region that is cut out. */
const VIEWPORT = 232;
/** The image keeps showing (dimmed) this far around the crop circle. */
const MARGIN = 34;
const FRAME = VIEWPORT + MARGIN * 2;
const OUTPUT = 256;
const MIN_ZOOM = 1;
const MAX_ZOOM = 3;
const ZOOM_STEP = 0.1;
/** Where the avatar shows up, at its real size there. */
const PREVIEWS = [
  { key: "topBar", size: 40 },
  { key: "settings", size: 64 },
  { key: "profile", size: 96 },
] as const;

interface Props {
  imageUrl: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCropped: (blob: Blob) => void;
  /** The Clear dark palette, for the onboarding wizard's fixed-dark scene, where the
   *  light dialog would sit oddly against the gradient. */
  dark?: boolean;
}

// Crops by letting the user drag/zoom the source image behind a fixed circular crop
// area, then reads back exactly the pixels inside it — no cropping library needed
// for a simple pan + zoom avatar crop.
export function AvatarCropDialog({ imageUrl, open, onOpenChange, onCropped, dark }: Props) {
  const t = useTranslations("avatarCrop");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        hideHeaderRow
        title={t("title")}
        className="gap-4 pt-6 font-clear text-clear-ink"
        // .dark on the sheet switches every clear-* token inside it to the dark palette.
        sheetClassName={cn("lg:max-w-[520px]", dark && "dark bg-clear-card")}
      >
        <CropBody imageUrl={imageUrl} onClose={() => onOpenChange(false)} onCropped={onCropped} />
      </DialogContent>
    </Dialog>
  );
}

function CropBody({ imageUrl, onClose, onCropped }: { imageUrl: string | null; onClose: () => void; onCropped: (blob: Blob) => void }) {
  const t = useTranslations("avatarCrop");
  const zoomId = useId();
  const imgRef = useRef<HTMLImageElement>(null);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  // Offset of the image's top-left corner from the crop circle's bounding box.
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);

  // Reset crop state during render when a new image comes in, rather than in an
  // effect — avoids an extra cascading render.
  const [prevImageUrl, setPrevImageUrl] = useState(imageUrl);
  if (imageUrl !== prevImageUrl) {
    setPrevImageUrl(imageUrl);
    setNatural(null);
    setZoom(1);
    setOffset({ x: 0, y: 0 });
  }

  function baseScale(w: number, h: number) {
    return Math.max(VIEWPORT / w, VIEWPORT / h);
  }

  // The image always covers the whole crop circle.
  function clampOffset(x: number, y: number, scale: number, w: number, h: number) {
    return {
      x: Math.min(0, Math.max(VIEWPORT - w * scale, x)),
      y: Math.min(0, Math.max(VIEWPORT - h * scale, y)),
    };
  }

  function handleImageLoad() {
    const img = imgRef.current;
    if (!img) return;
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    const scale = baseScale(w, h);
    setNatural({ w, h });
    setOffset({ x: (VIEWPORT - w * scale) / 2, y: (VIEWPORT - h * scale) / 2 });
  }

  // Zooms around the centre of the crop circle, so what you're looking at stays put.
  function handleZoomChange(value: number) {
    if (!natural) return;
    const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(value * 100) / 100));
    const base = baseScale(natural.w, natural.h);
    const ratio = next / zoom;
    const c = VIEWPORT / 2;
    setZoom(next);
    setOffset((prev) => clampOffset(c - (c - prev.x) * ratio, c - (c - prev.y) * ratio, base * next, natural.w, natural.h));
  }

  function handlePointerDown(e: React.PointerEvent) {
    (e.target as Element).setPointerCapture(e.pointerId);
    dragRef.current = { startX: e.clientX, startY: e.clientY, origX: offset.x, origY: offset.y };
  }

  function handlePointerMove(e: React.PointerEvent) {
    if (!dragRef.current || !natural) return;
    const scale = baseScale(natural.w, natural.h) * zoom;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    setOffset(clampOffset(dragRef.current.origX + dx, dragRef.current.origY + dy, scale, natural.w, natural.h));
  }

  function handlePointerUp() {
    dragRef.current = null;
  }

  function handleConfirm() {
    const img = imgRef.current;
    if (!img || !natural) return;
    const scale = baseScale(natural.w, natural.h) * zoom;
    const sourceX = -offset.x / scale;
    const sourceY = -offset.y / scale;
    const sourceSize = VIEWPORT / scale;

    const canvas = document.createElement("canvas");
    canvas.width = OUTPUT;
    canvas.height = OUTPUT;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(img, sourceX, sourceY, sourceSize, sourceSize, 0, 0, OUTPUT, OUTPUT);
    canvas.toBlob((blob) => {
      if (blob) onCropped(blob);
    }, "image/png");
  }

  const displayScale = natural ? baseScale(natural.w, natural.h) * zoom : 0;
  const percent = Math.round(zoom * 100);

  /** The image placed for a circle of `size` px showing exactly the crop area. */
  function imageStyle(size: number, inset = 0): React.CSSProperties | undefined {
    if (!natural) return undefined;
    const k = size / VIEWPORT;
    return {
      width: natural.w * displayScale * k,
      height: natural.h * displayScale * k,
      transform: `translate(${inset + offset.x * k}px, ${inset + offset.y * k}px)`,
    };
  }

  return (
    <>
      <ClearDialogHeader title={t("title")} subtitle={t("subtitle")} onClose={onClose} closeLabel={t("close")} />

      {imageUrl && (
        <div className="flex justify-center">
          <div
            role="img"
            aria-label={t("cropArea")}
            className="relative cursor-move touch-none overflow-hidden rounded-[20px] bg-clear-sky select-none"
            style={{ width: FRAME, height: FRAME }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              ref={imgRef}
              src={imageUrl}
              alt=""
              onLoad={handleImageLoad}
              draggable={false}
              className="pointer-events-none absolute top-0 left-0 max-w-none"
              style={imageStyle(VIEWPORT, MARGIN)}
            />
            {/* Everything outside the circle is dimmed (a huge spread shadow), with a
                dashed outline and four handles on the circle itself. */}
            <span
              aria-hidden
              className="pointer-events-none absolute rounded-full border-2 border-dashed border-white"
              style={{ left: MARGIN, top: MARGIN, width: VIEWPORT, height: VIEWPORT, boxShadow: "0 0 0 999px rgba(17, 17, 19, 0.55)" }}
            />
            {[
              { left: FRAME / 2, top: MARGIN },
              { left: MARGIN + VIEWPORT, top: FRAME / 2 },
              { left: FRAME / 2, top: MARGIN + VIEWPORT },
              { left: MARGIN, top: FRAME / 2 },
            ].map((p, i) => (
              <span
                key={i}
                aria-hidden
                className="pointer-events-none absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-black bg-white"
                style={p}
              />
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center gap-3">
        <label htmlFor={zoomId} className="w-12 shrink-0 text-[13px] font-bold text-clear-ink-2">
          {t("zoom")}
        </label>
        <button
          type="button"
          onClick={() => handleZoomChange(zoom - ZOOM_STEP)}
          disabled={!natural || zoom <= MIN_ZOOM}
          aria-label={t("zoomOut")}
          className={clearButtonVariants({ variant: "secondary", size: "icon" })}
        >
          <IconMinus aria-hidden stroke={2} />
        </button>
        <input
          id={zoomId}
          type="range"
          min={MIN_ZOOM}
          max={MAX_ZOOM}
          step={0.01}
          value={zoom}
          onChange={(e) => handleZoomChange(Number(e.target.value))}
          aria-valuetext={t("zoomValue", { percent })}
          disabled={!natural}
          className="h-11 min-w-0 flex-1 cursor-pointer accent-clear-ink"
        />
        <button
          type="button"
          onClick={() => handleZoomChange(zoom + ZOOM_STEP)}
          disabled={!natural || zoom >= MAX_ZOOM}
          aria-label={t("zoomIn")}
          className={clearButtonVariants({ variant: "secondary", size: "icon" })}
        >
          <IconPlus aria-hidden stroke={2} />
        </button>
        <span className="w-12 shrink-0 text-right text-sm font-extrabold tabular-nums">{percent}%</span>
      </div>

      <div className="flex flex-wrap items-end justify-between gap-4 rounded-clear-tile bg-clear-tile px-[18px] py-2.5">
        <div className="flex flex-col gap-0.5 self-center">
          <span className="text-[15px] font-bold">{t("preview")}</span>
          <span className="text-[13px] text-clear-muted">{t("previewHint")}</span>
        </div>
        <div className="flex items-end gap-[18px]">
          {PREVIEWS.map((p) => (
            <div key={p.key} className="flex flex-col items-center gap-1.5">
              <span
                className="relative block overflow-hidden rounded-full bg-clear-sky ring-2 ring-clear-card"
                style={{ width: p.size, height: p.size }}
              >
                {imageUrl && natural && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={imageUrl} alt="" draggable={false} className="pointer-events-none absolute top-0 left-0 max-w-none" style={imageStyle(p.size)} />
                )}
              </span>
              <span className="text-xs font-semibold text-clear-muted">{t(`places.${p.key}`)}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="border-t border-clear-ground pt-[18px] pb-1">
        <ClearDialogFooter>
          <button type="button" onClick={onClose} className={clearButtonVariants({ variant: "secondary" })}>
            {t("cancel")}
          </button>
          <button type="button" onClick={handleConfirm} disabled={!natural} className={clearButtonVariants()}>
            {t("save")}
          </button>
        </ClearDialogFooter>
      </div>
    </>
  );
}
