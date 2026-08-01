import { ImageResponse } from "next/og";

/**
 * OpenGraph card, generated at build time.
 *
 * Rendered by Satori, which supports a flexbox subset of CSS — every container
 * therefore sets `display: flex` explicitly, and no CSS grid or custom font is
 * used, so the build cannot fail on a network font fetch.
 */
export const alt = "FinHub Tracker — Student Finance Planning Web App";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          backgroundColor: "#0b1014",
          backgroundImage:
            "radial-gradient(circle at 12% 0%, rgba(52,211,153,0.20), transparent 55%), radial-gradient(circle at 92% 8%, rgba(34,211,238,0.16), transparent 58%)",
          padding: "68px 72px",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 56,
              height: 56,
              borderRadius: 14,
              backgroundColor: "rgba(52,211,153,0.16)",
              color: "#34d399",
              fontSize: 30,
            }}
          >
            ▲
          </div>
          <div style={{ display: "flex", color: "#e6edf3", fontSize: 30, fontWeight: 600 }}>
            FinHub Tracker
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              display: "flex",
              color: "#f0f6fc",
              fontSize: 62,
              fontWeight: 700,
              lineHeight: 1.1,
              letterSpacing: "-0.02em",
            }}
          >
            Student Finance Planning
          </div>
          <div
            style={{
              display: "flex",
              color: "#34d399",
              fontSize: 62,
              fontWeight: 700,
              lineHeight: 1.15,
              letterSpacing: "-0.02em",
            }}
          >
            Web App
          </div>
          <div
            style={{
              display: "flex",
              marginTop: 22,
              color: "#9fb0c0",
              fontSize: 27,
              lineHeight: 1.4,
              maxWidth: 940,
            }}
          >
            Four-year college funding modelled with actuarial mathematics — inflation-adjusted cash
            flows, annuity-due accumulation, and Monte Carlo shortfall risk.
          </div>
        </div>

        <div style={{ display: "flex", gap: 12 }}>
          {["Value at Risk", "Black-Scholes Greeks", "Monte Carlo", "TypeScript", "62 tests"].map(
            (chip) => (
              <div
                key={chip}
                style={{
                  display: "flex",
                  padding: "10px 20px",
                  borderRadius: 999,
                  border: "1px solid rgba(158,176,192,0.28)",
                  color: "#c4d0dc",
                  fontSize: 22,
                }}
              >
                {chip}
              </div>
            ),
          )}
        </div>
      </div>
    ),
    size,
  );
}
