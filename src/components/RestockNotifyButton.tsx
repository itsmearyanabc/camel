"use client";

import { useState, useEffect } from "react";

interface Props {
  productId: string;
  /** Optional areaId for per-area (per-flavour/variant) subscriptions. Omit for product-level. */
  areaId?: string | null;
  /** Optional label shown next to the bell, e.g. the area name. */
  label?: string;
  /** Compact mode renders just the bell icon button. */
  compact?: boolean;
}

/**
 * "Notify Me" bell button for out-of-stock products.
 * Subscribes the current user to restock alerts for a product (optionally per-area).
 * Toggles between subscribed / not-subscribed states.
 */
export default function RestockNotifyButton({ productId, areaId = null, label, compact = false }: Props) {
  const [subscribed, setSubscribed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const params = new URLSearchParams({ productId });
        if (areaId) params.set("areaId", areaId);
        const res = await fetch(`/api/products/restock?${params.toString()}`);
        const data = await res.json();
        if (!cancelled && res.ok) setSubscribed(!!data.subscribed);
      } catch {
        // ignore
      } finally {
        if (!cancelled) setChecking(false);
      }
    })();
    return () => { cancelled = true; };
  }, [productId, areaId]);

  const toggle = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (loading) return;
    setLoading(true);
    try {
      if (subscribed) {
        const res = await fetch("/api/products/restock", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ productId, areaId }),
        });
        if (res.ok) setSubscribed(false);
      } else {
        const res = await fetch("/api/products/restock", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ productId, areaId }),
        });
        if (res.ok) setSubscribed(true);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  const title = subscribed
    ? `You're subscribed${label ? ` for ${label}` : ""}. Click to unsubscribe.`
    : `Notify me when ${label ? `${label} ` : ""}is back in stock`;

  if (compact) {
    return (
      <button
        onClick={toggle}
        disabled={loading || checking}
        title={title}
        aria-label={title}
        style={{
          background: subscribed ? "var(--accent)" : "var(--bg-secondary)",
          color: subscribed ? "#fff" : "var(--text-secondary)",
          border: "1px solid var(--border)",
          borderRadius: "8px",
          width: "32px",
          height: "32px",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: loading || checking ? "not-allowed" : "pointer",
          opacity: loading || checking ? 0.6 : 1,
          fontSize: "15px",
          flexShrink: 0,
        }}
      >
        {subscribed ? "🔔" : "🔕"}
      </button>
    );
  }

  return (
    <button
      onClick={toggle}
      disabled={loading || checking}
      title={title}
      className={`btn btn-sm ${subscribed ? "btn-primary" : "btn-secondary"}`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "6px",
        opacity: loading || checking ? 0.6 : 1,
        cursor: loading || checking ? "not-allowed" : "pointer",
        whiteSpace: "nowrap",
      }}
    >
      <span>{subscribed ? "🔔" : "🔕"}</span>
      <span>{subscribed ? "Subscribed" : "Notify Me"}{label ? ` · ${label}` : ""}</span>
    </button>
  );
}
