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
import { buildImgKey } from "@/components/icon";

// The dialog viewport size in screen pixels.
const VIEWPORT = 240;
// The reference container size (size-10 = 40px). The stored x/y offsets are
// in CSS pixels relative to this container, matching how icon.tsx renders them.
const CONTAINER = 40;
const SCALE = VIEWPORT / CONTAINER; // 6 — conversion factor between dialog and actual render

interface Props {
  imageSrc: string;     // raw src path e.g. /uploads/icons/foo.png
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (key: string) => void; // returns new img: key with params
}

export function IconCropDialog({ imageSrc, open, onOpenChange, onConfirm }: Props) {
  const imgRef = useRef<HTMLImageElement>(null);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);

  const [prevSrc, setPrevSrc] = useState(imageSrc);
  if (imageSrc !== prevSrc) {
    setPrevSrc(imageSrc);
    setNatural(null);
    setZoom(1);
    setOffset({ x: 0, y: 0 });
  }

  function baseScale(w: number, h: number) {
    return Math.max(VIEWPORT / w, VIEWPORT / h);
  }

  function clampOffset(x: number, y: number, scale: number, w: number, h: number) {
    const imgW = w * scale;
    const imgH = h * scale;
    // Only enforce the "image must cover viewport" constraint when the image is large enough.
    // When smaller than the viewport (user zoomed out), allow free panning.
    if (imgW >= VIEWPORT && imgH >= VIEWPORT) {
      return {
        x: Math.min(0, Math.max(VIEWPORT - imgW, x)),
        y: Math.min(0, Math.max(VIEWPORT - imgH, y)),
      };
    }
    return { x, y };
  }

  function handleLoad() {
    const img = imgRef.current;
    if (!img) return;
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    const scale = baseScale(w, h);
    setNatural({ w, h });
    setOffset({ x: (VIEWPORT - w * scale) / 2, y: (VIEWPORT - h * scale) / 2 });
  }

  function handleZoom(value: number) {
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
    if (!natural) return;
    const displayScale = baseScale(natural.w, natural.h) * zoom;
    // Convert viewport coordinates to img: key params (relative to CONTAINER-sized render).
    // s: how wide the image is relative to the container (1.0 = fills container width)
    const s = (natural.w * displayScale) / VIEWPORT;
    // ox/oy: offset of the image center from container center, in CONTAINER px
    const imageCenterX = offset.x + (natural.w * displayScale) / 2;
    const imageCenterY = offset.y + (natural.h * displayScale) / 2;
    const ox = (imageCenterX - VIEWPORT / 2) / SCALE;
    const oy = (imageCenterY - VIEWPORT / 2) / SCALE;
    onConfirm(buildImgKey(imageSrc, s, ox, oy));
  }

  const displayScale = natural ? baseScale(natural.w, natural.h) * zoom : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm z-[70]" overlayClassName="z-[65] backdrop-blur-lg bg-foreground/20">
        <DialogHeader>
          <DialogTitle>Icon bijsnijden</DialogTitle>
          <DialogDescription>Sleep om te verplaatsen, gebruik de schuif om in/uit te zoomen.</DialogDescription>
        </DialogHeader>

        <div
          className="relative mx-auto overflow-hidden rounded-full bg-foreground/5 cursor-move touch-none select-none"
          style={{ width: VIEWPORT, height: VIEWPORT }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            ref={imgRef}
            src={imageSrc}
            alt=""
            onLoad={handleLoad}
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

        <input
          type="range"
          min={0.3}
          max={4}
          step={0.01}
          value={zoom}
          onChange={(e) => handleZoom(Number(e.target.value))}
          className="w-full accent-primary"
          disabled={!natural}
        />

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={handleConfirm} disabled={!natural}>
            Toepassen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
