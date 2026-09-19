"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import DashboardNav from "@/components/DashboardNav";
import SiteFooter from "@/components/SiteFooter";
import styles from "../dashboard.module.css";
import { BOT_USERNAME } from "@/lib/botIdentity";
import type { TelegramChannel } from "@/lib/telegramLinks";


/** Telegram's own brand blue, so a Join button reads as a Telegram action. */
const TELEGRAM_BLUE = "#229ED9";

export default function ChannelsPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [channels, setChannels] = useState<TelegramChannel[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [meRes, cfgRes] = await Promise.all([
          fetch("/api/auth/me"),
          fetch("/api/telegram/config"),
        ]);

        const meData = await meRes.json();
        if (!meData.user) {
          router.push("/auth/login");
          return;
        }
        setUser(meData.user);

        if (cfgRes.ok) {
          const cfg = await cfgRes.json();
          setChannels(Array.isArray(cfg.channels) ? cfg.channels : []);
        }
      } catch {
        // Leaves the empty state below, which is accurate: nothing to join.
      } finally {
        setLoading(false);
      }
    })();
  }, [router]);

  const handleLogout = async () => {
    if (window.confirm("Are you sure you want to log out?")) {
      await fetch("/api/auth/logout", { method: "POST" });
      window.location.href = "/";
    }
  };

  if (loading || !user) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "var(--bg-secondary)",
        }}
      >
        <h3 style={{ color: "var(--text-secondary)" }}>Loading…</h3>
      </div>
    );
  }

  return (
    <div className={styles.shell}>
      <DashboardNav
        user={user}
        activeTab={"shop" as any}
        setActiveTab={() => router.push("/dashboard")}
        onLogout={handleLogout}
        hasActiveOrders={false}
        botUsername={BOT_USERNAME}
      />

      <div className={styles.content}>
        <main className={styles.section}>
          <Link
            href="/dashboard"
            className="btn btn-ghost btn-sm"
            style={{ marginBottom: "20px", display: "inline-flex" }}
          >
            ← Back to Products
          </Link>

          <div style={{ marginBottom: "28px" }}>
            <h1 style={{ fontSize: "28px", marginBottom: "8px" }}>Telegram Channels</h1>
            <p style={{ color: "var(--text-secondary)", fontSize: "14px" }}>
              Join our channels for drops, restocks and announcements. Tap a channel to open it in
              Telegram.
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
                    {/* An entry given as a bare "@handle" has no separate name,
                        so the parser uses the handle for both - printing it
                        twice just looks like a bug. */}
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
      </div>

      <SiteFooter />
    </div>
  );
}
