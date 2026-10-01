import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "Clockinoff — solo time tracker";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage(): ImageResponse {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          justifyContent: "center",
          padding: "80px",
          background:
            "linear-gradient(180deg, #f7f6f3 0%, #ede9fe 100%)",
          fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "24px" }}>
          <svg width="120" height="120" viewBox="0 0 64 64">
            <rect width="64" height="64" rx="15" fill="#6d28d9" />
            <circle
              cx="32"
              cy="32"
              r="18"
              fill="none"
              stroke="#ffffff"
              strokeWidth="3"
            />
            <path
              d="M26.83 23.5 L42.33 32 L26.83 40.5 Z"
              fill="#ffffff"
              stroke="#ffffff"
              strokeWidth="1.5"
              strokeLinejoin="round"
            />
          </svg>
          <div
            style={{
              fontSize: 120,
              fontWeight: 700,
              color: "#0f172a",
              letterSpacing: "-3px",
            }}
          >
            Clockinoff
          </div>
        </div>
        <div
          style={{
            marginTop: "40px",
            fontSize: 48,
            color: "#0f172a",
            fontWeight: 600,
          }}
        >
          Solo time tracker
        </div>
        <div
          style={{
            marginTop: "16px",
            fontSize: 32,
            color: "#64748b",
          }}
        >
          One running timer. That&apos;s it.
        </div>
      </div>
    ),
    { ...size },
  );
}
