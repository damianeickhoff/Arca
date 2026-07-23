"use client";

import { useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const VIEWPORT = 280;
const OUTPUT = 256;

interface Props {
  imageUrl: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCropped: (blob: Blob) => void;
  /** Restyles the dialog chrome (sheet background, title/description color, viewport
   *  placeholder) for a forced-dark surface — the onboarding wizard's auth-gradient
   *  background, where the default theme-token styling would go invisible in light mode. */
  dark?: boolean;
}

// Crops by letting the user drag/zoom the source image inside a fixed circular
// viewport, then reads back exactly the pixels visible in that viewport — no
// cropping library needed for a simple pan + zoom avatar crop.
export function AvatarCropDialog({ imageUrl, open, onOpenChange, onCropped, dark }: Props) {
  const imgRef = useRef<HTMLImageElement>(null);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);

  // Reset crop state during render when a new image comes in, rather than in an
  // effect — avoids an extra cascading render and matches this app's existing pattern
  // for resyncing local state from a changed prop.
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

  function clampOffset(x: number, y: number, scale: number, w: number, h: number) {
    const dw = w * scale;
    const dh = h * scale;
    const minX = VIEWPORT - dw;
    const minY = VIEWPORT - dh;
    return {
      x: Math.min(0, Math.max(minX, x)),
      y: Math.min(0, Math.max(minY, y)),
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

  function handleZoomChange(value: number) {
    if (!natural) return;
    const scale = baseScale(natural.w, natural.h) * value;
    setZoom(value);
    setOffset((prev) => clampOffset(prev.x, prev.y, scale, natural.w, natural.h));
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-sm"
        sheetClassName={dark ? "bg-[#0f1533] border border-white/10 text-white" : undefined}
      >
        <DialogHeader>
          <DialogTitle className={dark ? "text-white" : undefined}>Foto bijsnijden</DialogTitle>
          <DialogDescription className={dark ? "text-white/60" : undefined}>
            Sleep om te verplaatsen en gebruik de schuif om in/uit te zoomen.
          </DialogDescription>
        </DialogHeader>

        {imageUrl && (
          <div
            className={cn("relative mx-auto overflow-hidden rounded-full cursor-move touch-none select-none", dark ? "bg-white/10" : "bg-foreground/5")}
            style={{ width: VIEWPORT, height: VIEWPORT }}
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
              className="absolute top-0 left-0 max-w-none pointer-events-none"
              style={
                natural
                  ? {
                      width: natural.w * displayScale,
                      height: natural.h * displayScale,
                      transform: `translate(${offset.x}px, ${offset.y}px)`,
                    }
                  : undefined
              }
            />
          </div>
        )}

        <input
          type="range"
          min={1}
          max={3}
          step={0.01}
          value={zoom}
          onChange={(e) => handleZoomChange(Number(e.target.value))}
          className="w-full"
          disabled={!natural}
        />

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            className={dark ? "bg-white/10 text-white border-white/20 hover:bg-white/15" : undefined}
          >
            Cancel
          </Button>
          <Button type="button" onClick={handleConfirm} disabled={!natural} className={dark ? "bg-white text-[#0a1a5c]" : undefined}>
            Toepassen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
