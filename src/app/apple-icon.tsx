import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

// The Home Screen icon: the same mark as icon.tsx, full bleed on black (iOS rounds the
// corners itself).
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#111113",
        }}
      >
        <svg width="116" height="116" viewBox="8 8 48 48" fill="none">
          <circle cx="30" cy="32" r="19" fill="#FF5B2E" />
          <rect x="41" y="13" width="12" height="38" rx="6" fill="#FFFFFF" />
        </svg>
      </div>
    ),
    { ...size }
  );
}
