import { ImageResponse } from "next/og";

export const size = { width: 512, height: 512 };
export const contentType = "image/png";

// Same mark as apple-icon.tsx, larger — used for the manifest's PWA icons and the
// browser favicon/tab icon.
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
          background: "linear-gradient(to bottom right, #14b8a6, #047857)",
        }}
      >
        <svg width="300" height="304" viewBox="0 0 81 82" fill="none">
          <path d="M58.2473 35.3064C68.0664 54.5798 84.2081 67.4955 77.8027 70.7589C71.3972 74.0222 49.8385 67.6145 40.0194 48.3411C30.2003 29.0677 33.5235 5.84134 39.929 2.57798C46.3344 -0.68538 48.4282 16.033 58.2473 35.3064Z" fill="white" />
          <path d="M29.7629 15.9948C28.2369 25.5198 29.5688 39.6152 35.8459 52.3776C28.6542 67.4189 5.81616 72.7291 1.0559 69.9558C-3.85908 67.0917 9.50055 57.3709 18.1536 42.3103C26.002 28.6498 26.1378 16.0771 29.7629 15.9948Z" fill="white" />
          <circle cx="38.9996" cy="60.3749" r="2" fill="white" />
        </svg>
      </div>
    ),
    { ...size }
  );
}
