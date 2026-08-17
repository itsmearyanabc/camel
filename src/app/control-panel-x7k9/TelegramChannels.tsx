"use client";

import React, { useEffect, useState } from "react";

interface ChannelRow {
  name: string;
  url: string;
  description: string;
}

const MAX_CHANNELS = 30;

const blankRow = (): ChannelRow => ({ name: "", url: "", description: "" });

/**
 * Editor for the Telegram channel directory customers see at
 * /dashboard/channels.
 *
 * The whole list is saved in one request, so the order on screen is the order
 * customers get and removing a row needs no separate call. Nothing is written
 * until Save is pressed - editing here is always safe to abandon.
 */
export default function TelegramChannels() {
  const [rows, setRows] = useState<ChannelRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/admin/telegram-channels");
        const data = await res.json();
        if (res.ok && Array.isArray(data.channels)) {
          setRows(
            data.channels.map((c: any) => ({
              name: c.name || "",
              url: c.url || "",
              description: c.description || "",
            }))
          );
        }
      } catch {
        setMsg({ type: "error", text: "Could not load the channel list." });
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const update = (index: number, field: keyof ChannelRow, value: string) => {
    setRows((prev) => prev.map((row, i) => (i === index ? { ...row, [field]: value } : row)));
    setMsg(null);
  };

  const move = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= rows.length) return;
    setRows((prev) => {
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
    setMsg(null);
  };

  const removeRow = (index: number) => {
    setRows((prev) => prev.filter((_, i) => i !== index));
    setMsg(null);
  };

  const save = async () => {
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/telegram-channels", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channels: rows }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setMsg({ type: "error", text: data.error || "Failed to save channels" });
        return;
      }

      // Re-seed from the server so the admin sees exactly what was stored -
      // names normalised, blank rows dropped, links rewritten to full URLs.
      setRows(
        (data.channels || []).map((c: any) => ({
          name: c.name || "",
          url: c.url || "",
          description: c.description || "",
        }))
      );
      setMsg({
        type: "success",
        text: data.channels?.length
          ? `Published ${data.channels.length} channel(s). Customers see this immediately.`
          : "Channel list cleared. The strip is now hidden for customers.",
      });
    } catch {
      setMsg({ type: "error", text: "Failed to save channels" });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: "60px", textAlign: "center", color: "var(--text-secondary)" }}>
        Loading channels…
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "16px" }}>
        <div>
          <h2 className="cp-heading" style={{ fontSize: "28px", fontWeight: 700, marginBottom: "4px" }}>
            Telegram Channels
          </h2>
          <p style={{ color: "var(--text-secondary)", fontSize: "14px" }}>
            Published to the customer dashboard at <code>/dashboard/channels</code>
          </p>
        </div>
        <div style={{ display: "flex", gap: "12px" }}>
          <button
            className="btn btn-secondary"
            disabled={saving || rows.length >= MAX_CHANNELS}
            onClick={() => setRows((prev) => [...prev, blankRow()])}
          >
            ➕ Add Channel
          </button>
          <button className="btn btn-primary" onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save Changes"}
          </button>
        </div>
      </div>

      {msg && (
        <div className={`alert ${msg.type === "error" ? "alert-error" : "alert-success"}`}>{msg.text}</div>
      )}

      <div className="alert" style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)", fontSize: "13px" }}>
        ℹ️ The <strong>Link</strong> accepts a full <code>https://t.me/…</code> URL, an{" "}
        <code>@handle</code>, or a <code>+InviteCode</code> for a private channel. Anything that is
        not a Telegram link is rejected on save. Leave the list empty to hide the strip entirely.
      </div>

      {rows.length === 0 ? (
        <div className="card" style={{ textAlign: "center", padding: "60px 24px" }}>
          <span style={{ fontSize: "44px", display: "block", marginBottom: "16px" }}>📣</span>
          <p style={{ color: "var(--text-secondary)", marginBottom: "20px" }}>
            No channels published yet. Customers won&apos;t see the channels strip.
          </p>
          <button className="btn btn-primary" onClick={() => setRows([blankRow()])}>
            ➕ Add your first channel
          </button>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {rows.map((row, index) => (
            <div key={index} className="card" style={{ padding: "16px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
                <span style={{ fontSize: "12px", fontWeight: 700, color: "var(--text-tertiary)", letterSpacing: "0.06em" }}>
                  CHANNEL {index + 1}
                </span>
                <div style={{ display: "flex", gap: "4px" }}>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => move(index, -1)}
                    disabled={index === 0 || saving}
                    title="Move up"
                    aria-label={`Move channel ${index + 1} up`}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => move(index, 1)}
                    disabled={index === rows.length - 1 || saving}
                    title="Move down"
                    aria-label={`Move channel ${index + 1} down`}
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    style={{ color: "var(--red)" }}
                    onClick={() => removeRow(index)}
                    disabled={saving}
                    aria-label={`Remove channel ${index + 1}`}
                  >
                    🗑️ Remove
                  </button>
                </div>
              </div>

              <div
                className="cp-grid-form"
                style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}
              >
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Name</label>
                  <input
                    className="form-input"
                    value={row.name}
                    maxLength={60}
                    placeholder="e.g. Announcements"
                    onChange={(e) => update(index, "name", e.target.value)}
                  />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Link</label>
                  <input
                    className="form-input"
                    value={row.url}
                    placeholder="@camel971_news  or  https://t.me/…"
                    onChange={(e) => update(index, "url", e.target.value)}
                  />
                </div>
                <div className="form-group cp-grid-span2" style={{ marginBottom: 0, gridColumn: "span 2" }}>
                  <label className="form-label">Description (optional)</label>
                  <input
                    className="form-input"
                    value={row.description}
                    maxLength={140}
                    placeholder="Shown under the channel name on the card"
                    onChange={(e) => update(index, "description", e.target.value)}
                  />
                </div>
              </div>
            </div>
          ))}

          <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px" }}>
            <button
              className="btn btn-secondary"
              disabled={saving || rows.length >= MAX_CHANNELS}
              onClick={() => setRows((prev) => [...prev, blankRow()])}
            >
              ➕ Add Channel
            </button>
            <button className="btn btn-primary" onClick={save} disabled={saving}>
              {saving ? "Saving…" : "Save Changes"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
