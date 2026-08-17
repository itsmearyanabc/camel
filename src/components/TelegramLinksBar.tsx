"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useLanguage } from "@/components/LanguageContext";
import type { TelegramChannel } from "@/lib/telegramLinks";

interface Props {
  /** Shop bot username, as the dashboard already resolves it. */
  botUsername: string;
}

const strip: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  background: "var(--bg-secondary)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-lg)",
  padding: "14px 20px",
  gap: "16px",
  flexWrap: "wrap",
};

/**
 * One entry inside a strip: icon + copy on the left, action on the right.
 *
 * `flex: 1 1 300px` is what lets two of these sit side by side on a desktop
 * and stack on a phone without a media query.
 */
const cell: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "12px",
  flex: "1 1 300px",
  minWidth: 0,
};

const iconBox: React.CSSProperties = {
  fontSize: "22px",
  background: "var(--accent-light)",
  borderRadius: "10px",
  padding: "8px",
  lineHeight: 1,
  flexShrink: 0,
};

function Entry({
  icon,
  title,
  desc,
  action,
}: {
  icon: string;
  title: string;
  desc: string;
  action: React.ReactNode;
}) {
  return (
    <div style={cell}>
      <div style={{ display: "flex", alignItems: "center", gap: "12px", minWidth: 0 }}>
        <span style={iconBox}>{icon}</span>
        <div style={{ minWidth: 0 }}>
          <p style={{ fontWeight: 700, fontSize: "14px", margin: 0, color: "var(--text-primary)" }}>{title}</p>
          <p style={{ fontSize: "12px", margin: 0, color: "var(--text-secondary)" }}>{desc}</p>
        </div>
      </div>
      {action}
    </div>
  );
}

/**
 * The two Telegram strips above the product grid.
 *
 * Top strip: the channel directory. Bottom strip: the shop bot, plus the
 * customer-support bot beside it.
 *
 * Both new pieces are configuration-driven and hide themselves when the
 * matching environment variable is unset, so nothing renders a dead link
 * before the VPS is configured. See src/lib/telegramLinks.ts.
 */
export default function TelegramLinksBar({ botUsername }: Props) {
  const { t } = useLanguage();
  const [supportBotUsername, setSupportBotUsername] = useState<string | null>(null);
  const [channelCount, setChannelCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/telegram/config");
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        setSupportBotUsername(typeof data.supportBotUsername === "string" ? data.supportBotUsername : null);
        setChannelCount(Array.isArray(data.channels) ? (data.channels as TelegramChannel[]).length : 0);
      } catch {
        // A failed config read only costs the optional links, never the shop.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      {channelCount > 0 && (
        <div style={strip}>
          <Entry
            icon="📣"
            title={t("dash.channels.title")}
            desc={t("dash.channels.desc")}
            action={
              <Link
                href="/dashboard/channels"
                className="btn btn-primary btn-sm"
                style={{ gap: "6px", whiteSpace: "nowrap" }}
              >
                {t("dash.channels.btn")}
              </Link>
            }
          />
        </div>
      )}

      <div style={strip}>
        <Entry
          icon="🤖"
          title={t("dash.bot.title")}
          desc={t("dash.bot.desc")}
          action={
            <a
              href={`https://t.me/${botUsername}`}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-primary btn-sm"
              style={{ gap: "6px", whiteSpace: "nowrap" }}
            >
              {t("dash.bot.btn")}
            </a>
          }
        />

        {supportBotUsername && (
          <Entry
            icon="🎧"
            title={t("dash.support.title")}
            desc={t("dash.support.desc")}
            action={
              <a
                href={`https://t.me/${supportBotUsername}`}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-secondary btn-sm"
                style={{ gap: "6px", whiteSpace: "nowrap" }}
              >
                {t("dash.support.btn")}
              </a>
            }
          />
        )}
      </div>
    </div>
  );
}
