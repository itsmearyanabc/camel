import Link from "next/link";
import { getTelegramChannels } from "@/lib/telegramLinks";

/**
 * Public "Join our Telegram channels" strip for the landing page.
 *
 * A server component that reads the admin-published channel list straight from
 * the database. It deliberately does NOT go through /api/telegram/config: that
 * endpoint is session-gated for the dashboard, and this strip exists precisely
 * so a visitor who has not signed in can still find the channels. Reading here
 * also means no client fetch and no flash of an empty strip on first paint.
 *
 * Renders nothing at all when no channels are published, so the landing page
 * never shows a bar that leads to an empty page. getTelegramChannels() never
 * throws - a database blip costs the strip, never the homepage.
 */
export default async function TelegramChannelsStrip() {
  const channels = await getTelegramChannels();
  if (channels.length === 0) return null;

  return (
    <div style={{ maxWidth: "1180px", margin: "22px auto 0" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "16px",
          flexWrap: "wrap",
          padding: "14px 20px",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-lg)",
          background: "var(--bg-secondary)",
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
            📣
          </span>
          <div style={{ minWidth: 0 }}>
            <p style={{ fontWeight: 700, fontSize: "14px", margin: 0, color: "var(--text-primary)" }}>
              Join our Telegram channels
            </p>
            <p style={{ fontSize: "12px", margin: 0, color: "var(--text-secondary)" }}>
              Drops, restocks and announcements as they happen.
            </p>
          </div>
        </div>

        <Link href="/channels" className="btn btn-primary btn-sm" style={{ gap: "6px", whiteSpace: "nowrap" }}>
          📣 Browse channels →
        </Link>
      </div>
    </div>
  );
}
