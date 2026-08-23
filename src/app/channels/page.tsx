import Link from "next/link";
import { getSession } from "@/lib/auth";
import { getTelegramChannels } from "@/lib/telegramLinks";
import SiteFooter from "@/components/SiteFooter";
import ThemeToggle from "@/components/ThemeToggle";
import styles from "../home.module.css";

/**
 * Public directory of the Telegram channels an admin has published.
 *
 * Deliberately outside /dashboard: the whole point is that a visitor who has
 * not signed in can browse the channels, so there is no session check and no
 * redirect to login. It reads the list server-side rather than through
 * /api/telegram/config, which stays session-gated for the dashboard.
 *
 * Signed-in visitors keep the same list - the dashboard's own channels page is
 * untouched and continues to serve them from inside the shell.
 */
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Telegram Channels — Camel971",
  description: "Join the Camel971 Telegram channels for drops, restocks and announcements.",
};

/** Telegram's own brand blue, so a Join button reads as a Telegram action. */
const TELEGRAM_BLUE = "#229ED9";

export default async function PublicChannelsPage() {
  const [session, channels] = await Promise.all([getSession(), getTelegramChannels()]);

  const dashboardHref = session
    ? session.role === "ADMIN" || session.role === "SUPERADMIN"
      ? "/control-panel-x7k9"
      : "/dashboard"
    : "/auth/register";

  return (
    <div className={styles.page}>
      <header className={styles.nav}>
        <Link href="/" className="brand-lockup">
          <img
            src="/logo.png?v=2"
            alt="Camel971"
            className="brand-logo"
            style={{
              width: 36,
              height: 36,
              borderRadius: "50%",
              objectFit: "cover",
              boxShadow: "0 2px 8px rgba(189,123,28,0.3)",
            }}
          />
        </Link>
        <div className={styles.navLinks}>
          <Link href="/#discover">Discover</Link>
          <Link href="/#access">Access</Link>
        </div>
        <div className={styles.navRight}>
          <ThemeToggle compact />
          <div className={styles.navActions}>
            {!session && (
              <Link href="/auth/login" className="btn btn-ghost btn-sm">
                Sign in
              </Link>
            )}
            <Link href={dashboardHref} className="btn btn-primary btn-sm">
              {session ? "Dashboard" : "Get started"}
            </Link>
          </div>
        </div>
      </header>

      <main style={{ maxWidth: "1180px", margin: "46px auto 0", paddingBottom: "40px" }}>
        <Link href="/" className="btn btn-ghost btn-sm" style={{ marginBottom: "20px", display: "inline-flex" }}>
          ← Back to Home
        </Link>

        <div style={{ marginBottom: "28px" }}>
          <h1 style={{ fontSize: "28px", marginBottom: "8px" }}>Telegram Channels</h1>
          <p style={{ color: "var(--text-secondary)", fontSize: "14px" }}>
            Join our channels for drops, restocks and announcements. Tap a channel to open it in
            Telegram — no account needed.
          </p>
        </div>

        {channels.length === 0 ? (
          <div className="card" style={{ textAlign: "center", padding: "60px 24px" }}>
            <span style={{ fontSize: "44px", display: "block", marginBottom: "16px" }}>📣</span>
            <p style={{ color: "var(--text-secondary)" }}>No channels have been published yet.</p>
          </div>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
              gap: "20px",
            }}
          >
            {channels.map((channel) => (
              <div
                key={channel.url}
                className="card"
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "14px",
                  textAlign: "center",
                  padding: "28px 20px",
                  minHeight: "210px",
                }}
              >
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "6px" }}>
                  <span
                    aria-hidden
                    style={{
                      fontSize: "26px",
                      background: "var(--accent-light)",
                      borderRadius: "50%",
                      width: "56px",
                      height: "56px",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      marginBottom: "4px",
                    }}
                  >
                    📣
                  </span>
                  <h3 style={{ fontSize: "18px", overflowWrap: "anywhere" }}>{channel.name}</h3>
                  {/* An entry given as a bare "@handle" has no separate name, so
                      the parser uses the handle for both - printing it twice
                      just looks like a bug. */}
                  {channel.handle && channel.handle !== channel.name && (
                    <span style={{ fontSize: "13px", color: "var(--text-tertiary)" }}>{channel.handle}</span>
                  )}
                  {channel.description && (
                    <p
                      style={{
                        fontSize: "13px",
                        color: "var(--text-secondary)",
                        lineHeight: 1.45,
                        marginTop: "2px",
                      }}
                    >
                      {channel.description}
                    </p>
                  )}
                </div>

                <a
                  href={channel.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-sm"
                  style={{
                    background: TELEGRAM_BLUE,
                    color: "#fff",
                    width: "100%",
                    justifyContent: "center",
                    fontWeight: 700,
                    letterSpacing: "0.04em",
                    textTransform: "uppercase",
                  }}
                >
                  Join Channel
                </a>
              </div>
            ))}
          </div>
        )}
      </main>

      <SiteFooter />
    </div>
  );
}
