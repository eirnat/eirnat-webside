import { ImageResponse } from "next/og";

export function renderTrafikkIcon(
  size: number,
  options?: { maskable?: boolean }
) {
  const maskable = options?.maskable ?? false;
  const mark = Math.round(size * (maskable ? 0.5 : 0.58));

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background: "#444f55",
        }}
      >
        {maskable ? (
          <div style={{ display: "flex", width: "100%", height: Math.round(size * 0.16) }} />
        ) : (
          <div
            style={{
              display: "flex",
              width: "100%",
              height: Math.round(size * 0.14),
            }}
          >
            <div style={{ display: "flex", flex: 1, background: "#ff9600" }} />
            <div style={{ display: "flex", flex: 1, background: "#ffffff" }} />
            <div style={{ display: "flex", flex: 1, background: "#dadada" }} />
          </div>
        )}
        <div
          style={{
            display: "flex",
            flex: 1,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <svg width={mark} height={mark} viewBox="0 0 64 64">
            <rect x="6" y="26" width="52" height="16" rx="4" fill="#ffffff" />
            <path d="M16 26 L22 14 H40 L48 26 Z" fill="#ff9600" />
            <rect x="26" y="16" width="12" height="8" rx="1" fill="#444f55" />
            <circle cx="18" cy="44" r="6" fill="#ff9600" />
            <circle cx="18" cy="44" r="3" fill="#444f55" />
            <circle cx="46" cy="44" r="6" fill="#ff9600" />
            <circle cx="46" cy="44" r="3" fill="#444f55" />
          </svg>
        </div>
      </div>
    ),
    { width: size, height: size }
  );
}
