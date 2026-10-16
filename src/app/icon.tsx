import { ImageResponse } from "next/og";

export const size = { width: 512, height: 512 };
export const contentType = "image/png";

// The Arca mark (components/clear/brand-mark.tsx) on a black rounded tile — used for
// the manifest's PWA icons and the browser favicon/tab icon. Image generation has no
// CSS variables, so the Clear ink and ember are spelled out here.
export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: 116,
          background: "#111113",
        }}
      >
        <svg width="340" height="340" viewBox="8 8 48 48" fill="none">
          <circle cx="30" cy="32" r="19" fill="#FF5B2E" />
          <rect x="41" y="13" width="12" height="38" rx="6" fill="#FFFFFF" />
        </svg>
      </div>
    ),
    { ...size }
  );
}
