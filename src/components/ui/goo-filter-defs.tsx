// Mounted once at the root layout. Provides `filter: url(#goo)` — blur then
// sharpen the alpha channel back up, so overlapping shapes fuse into one
// blobby silhouette instead of just alpha-blending. Used by GooIconSwap and
// the mobile bottom nav's liquid tab indicator.
export function GooFilterDefs() {
  return (
    <svg aria-hidden className="absolute h-0 w-0" focusable="false">
      <defs>
        <filter id="goo">
          <feGaussianBlur in="SourceGraphic" stdDeviation="8" result="blur" />
          <feColorMatrix
            in="blur"
            mode="matrix"
            values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 19 -9"
            result="goo"
          />
          <feComposite in="SourceGraphic" in2="goo" operator="atop" />
        </filter>
      </defs>
    </svg>
  );
}
