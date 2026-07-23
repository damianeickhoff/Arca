// Extracts a representative accent color from an (same-origin) image for use as the
// transaction detail dialog's header wash, for custom uploaded icons that carry no
// explicit brand color. Downsamples to a tiny canvas and averages non-transparent,
// non-near-white pixels — cheap and good enough for a soft background tint.
const cache = new Map<string, Promise<string | null>>();

export function getDominantImageColor(src: string): Promise<string | null> {
  const cached = cache.get(src);
  if (cached) return cached;

  const promise = new Promise<string | null>((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const size = 16;
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");
        if (!ctx) return resolve(null);
        ctx.drawImage(img, 0, 0, size, size);
        const { data } = ctx.getImageData(0, 0, size, size);

        let r = 0, g = 0, b = 0, count = 0;
        for (let i = 0; i < data.length; i += 4) {
          const alpha = data[i + 3];
          if (alpha < 32) continue;
          const rr = data[i], gg = data[i + 1], bb = data[i + 2];
          if (rr > 240 && gg > 240 && bb > 240) continue; // near-white
          r += rr; g += gg; b += bb; count++;
        }
        if (count === 0) return resolve(null);
        r = Math.round(r / count);
        g = Math.round(g / count);
        b = Math.round(b / count);
        const hex = "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("");
        resolve(hex);
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = src;
  });

  cache.set(src, promise);
  return promise;
}
