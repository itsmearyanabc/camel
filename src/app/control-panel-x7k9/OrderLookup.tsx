"use client";

import { useState } from "react";

/**
 * Order ID lookup for customer service.
 *
 * A customer raising a complaint quotes the id they were shown, which is the
 * first 8 characters of the order UUID - so this accepts a prefix as readily as
 * the full id. Everything the agent needs to answer "where is my order" lands
 * on one screen: current status, what was actually delivered and when, whether
 * the Telegram copy got through, the payment trail, and any open dispute.
 */
export default function OrderLookup() {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [order, setOrder] = useState<any>(null);
  const [candidates, setCandidates] = useState<any[] | null>(null);

  const badgeFor = (status: string) => {
    if (status === "COMPLETED") return "badge-green";
    if (status === "CANCELLED") return "badge-red";
    if (status === "ON_PICKUP") return "badge-blue";
    if (status === "PENDING_PAYMENT") return "badge-orange";
    return "badge-purple";
  };

  const fmtDate = (value: string | null) =>
    value ? new Date(value).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" }) : "—";

  const search = async (raw?: string) => {
    const term = (raw ?? query).trim();
    if (!term) return;

    setLoading(true);
    setError(null);
    setOrder(null);
    setCandidates(null);

    try {
      const res = await fetch(`/api/client-admin/orders/lookup?orderId=${encodeURIComponent(term)}`);
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Lookup failed");
      } else if (data.ambiguous) {
        setCandidates(data.candidates);
      } else {
        setOrder(data.order);
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setQuery("");
    setOrder(null);
    setCandidates(null);
    setError(null);
  };

  const Field = ({ label, value }: { label: string; value: React.ReactNode }) => (
    <div>
      <div style={{ fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--text-tertiary)", marginBottom: "3px" }}>
        {label}
      </div>
      <div style={{ fontSize: "14px", color: "var(--text-primary)", wordBreak: "break-word" }}>{value ?? "—"}</div>
    </div>
  );

  const grid: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: "14px",
  };

  return (
    <div className="card" style={{ padding: "20px" }}>
      <div style={{ marginBottom: "14px" }}>
        <h3 style={{ fontSize: "18px", marginBottom: "4px" }}>🔎 Find an Order</h3>
        <p style={{ color: "var(--text-secondary)", fontSize: "13px" }}>
          Paste the Order ID a customer gave you. The short 8-character ID they see in their
          notifications and Telegram messages works here too.
        </p>
      </div>

      <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
        <input
          className="form-input"
          style={{ flex: "1 1 300px", fontFamily: "monospace" }}
          placeholder="e.g. 3f2a1b9c"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && search()}
        />
        <button className="btn btn-primary" onClick={() => search()} disabled={loading || !query.trim()}>
          {loading ? "Searching…" : "Search"}
        </button>
        {(order || candidates || error) && (
          <button className="btn btn-secondary" onClick={reset}>Clear</button>
        )}
      </div>

      {error && <div className="alert alert-error" style={{ marginTop: "14px", marginBottom: 0 }}>{error}</div>}

      {candidates && (
        <div style={{ marginTop: "16px" }}>
          <p style={{ fontSize: "13px", color: "var(--text-secondary)", marginBottom: "10px" }}>
            {candidates.length} orders start with that ID. Pick the right one:
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {candidates.map((c) => (
              <button
                key={c.id}
                onClick={() => { setQuery(c.id); search(c.id); }}
                className="btn btn-secondary btn-sm"
                // Five fields on one line does not fit a phone; wrapping keeps
                // every candidate readable instead of clipping the date.
                style={{ justifyContent: "flex-start", textAlign: "left", gap: "10px", flexWrap: "wrap", height: "auto", padding: "10px 12px" }}
              >
                <span style={{ fontFamily: "monospace" }}>{c.id.slice(0, 13)}…</span>
                <span>{c.username}</span>
                <span>${Number(c.totalAmount).toFixed(2)}</span>
                <span className={`badge ${badgeFor(c.status)}`}>{c.status.replace(/_/g, " ")}</span>
                <span style={{ fontSize: "12px", color: "var(--text-tertiary)" }}>{fmtDate(c.createdAt)}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {order && (
        <div style={{ marginTop: "20px", display: "flex", flexDirection: "column", gap: "18px" }}>
          {/* Header */}
          <div
            style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              flexWrap: "wrap", gap: "12px", paddingBottom: "14px", borderBottom: "1px solid var(--border)",
            }}
          >
            <div>
              <div style={{ fontFamily: "monospace", fontSize: "15px", fontWeight: 700, userSelect: "all" }}>{order.id}</div>
              <div style={{ fontSize: "12px", color: "var(--text-tertiary)", marginTop: "2px" }}>
                Placed {fmtDate(order.createdAt)} · last updated {fmtDate(order.updatedAt)} · via {order.orderSource}
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <span style={{ fontSize: "20px", fontWeight: 800 }}>${Number(order.totalAmount).toFixed(2)}</span>
              <span className={`badge ${badgeFor(order.status)}`} style={{ fontSize: "13px" }}>
                {order.status.replace(/_/g, " ")}
              </span>
            </div>
          </div>

          {/* Customer */}
          <section>
            <h4 style={{ fontSize: "14px", marginBottom: "10px" }}>Customer</h4>
            <div style={grid}>
              <Field label="Username" value={order.customer.username} />
              <Field label="Telegram" value={order.customer.telegramUsername || order.customer.telegramId || "Not linked"} />
              <Field label="Member since" value={fmtDate(order.customer.memberSince)} />
              <Field
                label="Wallet"
                value={
                  order.customer.walletBalance != null
                    ? `${Number(order.customer.walletBalance).toFixed(2)} ${order.customer.walletCurrency || "USD"}`
                    : "—"
                }
              />
            </div>
          </section>

          {/* Payment */}
          <section>
            <h4 style={{ fontSize: "14px", marginBottom: "10px" }}>Payment</h4>
            <div style={grid}>
              <Field label="Method" value={order.payment.method?.replace(/_/g, " ")} />
              <Field label="Gateway status" value={order.payment.status || "—"} />
              <Field
                label="Paid"
                value={order.payment.paidAmount != null
                  ? `${Number(order.payment.paidAmount).toFixed(2)} ${order.payment.paidCurrency || ""}`.trim()
                  : "—"}
              />
              <Field label="Amount due" value={order.payment.amountDue ? `$${order.payment.amountDue}` : "—"} />
              <Field
                label="Payment ID"
                value={order.payment.providerPaymentId
                  ? <span style={{ fontFamily: "monospace", fontSize: "12px" }}>{order.payment.providerPaymentId}</span>
                  : "—"}
              />
              <Field label="Window closes" value={fmtDate(order.payment.expiresAt)} />
            </div>
          </section>

          {/* Items */}
          <section>
            <h4 style={{ fontSize: "14px", marginBottom: "10px" }}>
              Items ({order.items.length})
            </h4>
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              {order.items.map((item: any) => (
                <div
                  key={item.id}
                  style={{
                    padding: "14px",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius-md)",
                    background: "var(--bg-primary)",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px", marginBottom: "12px" }}>
                    <div style={{ fontWeight: 600 }}>
                      {item.productName}
                      {item.area && (
                        <span style={{ fontWeight: 400, color: "var(--text-secondary)", fontSize: "13px" }}>
                          {" "}— 📍 {item.area.city ? `${item.area.city} / ` : ""}{item.area.name}
                        </span>
                      )}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <span>${Number(item.priceAtPurchase).toFixed(2)}</span>
                      <span className={`badge ${badgeFor(item.status)}`}>{item.status.replace(/_/g, " ")}</span>
                    </div>
                  </div>

                  <div style={{ ...grid, marginBottom: "12px" }}>
                    <Field label="Cooldown ends" value={fmtDate(item.cooldownEndAt)} />
                    <Field label="Released for pickup" value={fmtDate(item.onPickupAt)} />
                    <Field label="Details sent" value={fmtDate(item.adminMessageSentAt)} />
                    <Field
                      label="Telegram copy"
                      value={
                        <span style={{ color: item.telegramDelivered ? "var(--green)" : "var(--red)", fontWeight: 600 }}>
                          {item.telegramDelivered ? "Delivered" : "Not delivered"}
                        </span>
                      }
                    />
                  </div>

                  {item.cancellationReason && (
                    <div className="alert alert-error" style={{ padding: "8px 12px", fontSize: "13px", marginBottom: "12px" }}>
                      Cancelled: {item.cancellationReason}
                    </div>
                  )}

                  {item.adminMessage && (
                    <div style={{ fontSize: "13px", color: "var(--text-secondary)", marginBottom: "12px" }}>
                      💬 {item.adminMessage}
                    </div>
                  )}

                  {/* Exactly what the customer received - the evidence for the
                      two complaints that actually happen: "I got nothing" and
                      "the spot was empty". */}
                  <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                    {item.locationLink && (
                      <a href={item.locationLink} target="_blank" rel="noreferrer" className="btn btn-secondary btn-sm">
                        🗺️ Location sent
                      </a>
                    )}
                    {item.pickupVideoUrl && (
                      <a href={item.pickupVideoUrl} target="_blank" rel="noreferrer" className="btn btn-secondary btn-sm">
                        🎥 Video sent
                      </a>
                    )}
                    {!item.locationLink && !item.pickupVideoUrl && item.deliveryMedia.length === 0 && (
                      <span style={{ fontSize: "13px", color: "var(--text-tertiary)" }}>
                        Nothing delivered yet.
                      </span>
                    )}
                  </div>

                  {item.deliveryMedia.length > 0 && (
                    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "10px" }}>
                      {item.deliveryMedia.map((media: any) => (
                        <a
                          key={media.url}
                          href={media.url}
                          target="_blank"
                          rel="noreferrer"
                          style={{
                            display: "block", width: "88px", height: "88px", borderRadius: "var(--radius-sm)",
                            overflow: "hidden", border: "1px solid var(--border)", background: "var(--bg-secondary)",
                          }}
                        >
                          {media.type === "video" ? (
                            <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "24px" }}>
                              🎬
                            </div>
                          ) : (
                            <img src={media.url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                          )}
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>

          {/* Disputes */}
          {order.disputes.length > 0 && (
            <section>
              <h4 style={{ fontSize: "14px", marginBottom: "10px" }}>Disputes ({order.disputes.length})</h4>
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                {order.disputes.map((dispute: any) => (
                  <div
                    key={dispute.id}
                    style={{ padding: "14px", border: "1px solid var(--border)", borderRadius: "var(--radius-md)", background: "var(--bg-primary)" }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "8px", marginBottom: "8px" }}>
                      <strong style={{ fontSize: "14px" }}>{dispute.reason}</strong>
                      <span className={`badge ${dispute.status === "RESOLVED" ? "badge-green" : "badge-orange"}`}>
                        {dispute.status}{dispute.resolutionType ? ` · ${dispute.resolutionType}` : ""}
                      </span>
                    </div>
                    <div style={{ fontSize: "12px", color: "var(--text-tertiary)", marginBottom: "10px" }}>
                      Opened {fmtDate(dispute.createdAt)}
                    </div>
                    {dispute.messages.map((m: any) => (
                      <div key={m.id} style={{ fontSize: "13px", marginBottom: "6px" }}>
                        <strong>{m.senderName}</strong>{" "}
                        <span style={{ color: "var(--text-tertiary)", fontSize: "11px" }}>{fmtDate(m.createdAt)}</span>
                        <div style={{ color: "var(--text-secondary)" }}>{m.message}</div>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
