import Link from "next/link";

/**
 * Full-width "How does delivery work?" bar for the landing page.
 *
 * Sits directly under the Telegram channels strip and deliberately mirrors its
 * geometry - same 1180px column, same border, radius and surface - so the two
 * read as one stack rather than two unrelated bars bolted together.
 *
 * Phrased as a question on purpose. A first-time visitor's actual hesitation is
 * "how would this even reach me?", and a bar that asks their own question back
 * gets clicked where a label like "Delivery information" does not.
 *
 * The whole bar is the link, not just the arrow on the right: it is the widest
 * tap target on the page, which matters most on a phone, where a small button
 * at the far end of a wide row is easy to miss.
 */
export default function DeliveryGuideBanner() {
  return (
    <div style={{ maxWidth: "1180px", margin: "14px auto 0", padding: "0 24px" }}>
      <Link
        href="/delivery"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "16px",
          flexWrap: "wrap",
          padding: "16px 20px",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-lg)",
          background: "var(--bg-secondary)",
          textDecoration: "none",
          color: "inherit",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "12px", minWidth: 0 }}>
          <span
            aria-hidden
            style={{
              fontSize: "22px",
              background: "var(--accent-light)",
              borderRadius: "10px",
              padding: "8px",
              lineHeight: 1,
              flexShrink: 0,
            }}
          >
            📍
          </span>
          <div style={{ minWidth: 0 }}>
            <p
              style={{
                fontWeight: 700,
                fontSize: "15px",
                margin: 0,
                color: "var(--text-primary)",
              }}
            >
              How does delivery work?
            </p>
            <p style={{ fontSize: "12px", margin: 0, color: "var(--text-secondary)" }}>
              Four simple steps, from order to collection. Tap to see how.
            </p>
          </div>
        </div>

        {/* A span, not a nested <a>: this sits inside the Link that wraps the
            whole bar, and an anchor inside an anchor is invalid HTML that
            browsers repair unpredictably. */}
        <span className="btn btn-primary btn-sm" style={{ gap: "6px", whiteSpace: "nowrap" }}>
          See how it works →
        </span>
      </Link>
    </div>
  );
}
