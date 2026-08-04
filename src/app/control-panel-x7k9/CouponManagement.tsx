"use client";

import { useState, useEffect } from "react";

interface Coupon {
  id: string;
  code: string;
  description?: string;
  discountType: "PERCENTAGE" | "FIXED_AMOUNT";
  discountValue: number;
  minOrderAmount?: number;
  maxDiscount?: number;
  usageLimit?: number;
  usedCount: number;
  userLimit?: number;
  validFrom: string;
  validUntil?: string;
  isActive: boolean;
  createdAt: string;
  couponUsages: Array<{
    id: string;
    userId: string;
    discount: number;
    createdAt: string;
  }>;
}

export default function CouponManagement() {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingCoupon, setEditingCoupon] = useState<Coupon | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterActive, setFilterActive] = useState<string>("all");

  // Form state
  const [formData, setFormData] = useState({
    code: "",
    description: "",
    discountType: "PERCENTAGE" as "PERCENTAGE" | "FIXED_AMOUNT",
    discountValue: "",
    minOrderAmount: "",
    maxDiscount: "",
    usageLimit: "",
    userLimit: "",
    validFrom: "",
    validUntil: "",
    isActive: true,
  });

  useEffect(() => {
    fetchCoupons();
  }, [filterActive, searchTerm]);

  const fetchCoupons = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (filterActive !== "all") params.append("isActive", filterActive);
      if (searchTerm) params.append("search", searchTerm);

      const res = await fetch(`/api/admin/coupons?${params}`);
      const data = await res.json();
      if (res.ok) {
        setCoupons(data.coupons);
      }
    } catch (error) {
      console.error("Error fetching coupons:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      const payload = {
        ...formData,
        discountValue: parseFloat(formData.discountValue),
        minOrderAmount: formData.minOrderAmount ? parseFloat(formData.minOrderAmount) : undefined,
        maxDiscount: formData.maxDiscount ? parseFloat(formData.maxDiscount) : undefined,
        usageLimit: formData.usageLimit ? parseInt(formData.usageLimit) : undefined,
        userLimit: formData.userLimit ? parseInt(formData.userLimit) : undefined,
        validFrom: formData.validFrom || undefined,
        validUntil: formData.validUntil || undefined,
      };

      const url = editingCoupon ? "/api/admin/coupons" : "/api/admin/coupons";
      const method = editingCoupon ? "PUT" : "POST";
      
      if (editingCoupon) {
        (payload as any).id = editingCoupon.id;
      }

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        setShowCreateModal(false);
        setEditingCoupon(null);
        resetForm();
        fetchCoupons();
      } else {
        const data = await res.json();
        alert(data.error || "Failed to save coupon");
      }
    } catch (error) {
      console.error("Error saving coupon:", error);
      alert("Failed to save coupon");
    }
  };

  const handleEdit = (coupon: Coupon) => {
    setEditingCoupon(coupon);
    setFormData({
      code: coupon.code,
      description: coupon.description || "",
      discountType: coupon.discountType,
      discountValue: coupon.discountValue.toString(),
      minOrderAmount: coupon.minOrderAmount?.toString() || "",
      maxDiscount: coupon.maxDiscount?.toString() || "",
      usageLimit: coupon.usageLimit?.toString() || "",
      userLimit: coupon.userLimit?.toString() || "",
      validFrom: coupon.validFrom ? new Date(coupon.validFrom).toISOString().split('T')[0] : "",
      validUntil: coupon.validUntil ? new Date(coupon.validUntil).toISOString().split('T')[0] : "",
      isActive: coupon.isActive,
    });
    setShowCreateModal(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this coupon?")) return;

    try {
      const res = await fetch(`/api/admin/coupons?id=${id}`, {
        method: "DELETE",
      });

      if (res.ok) {
        fetchCoupons();
      } else {
        const data = await res.json();
        alert(data.error || "Failed to delete coupon");
      }
    } catch (error) {
      console.error("Error deleting coupon:", error);
      alert("Failed to delete coupon");
    }
  };

  const resetForm = () => {
    setFormData({
      code: "",
      description: "",
      discountType: "PERCENTAGE",
      discountValue: "",
      minOrderAmount: "",
      maxDiscount: "",
      usageLimit: "",
      userLimit: "",
      validFrom: "",
      validUntil: "",
      isActive: true,
    });
  };

  const toggleActive = async (coupon: Coupon) => {
    try {
      const res = await fetch("/api/admin/coupons", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: coupon.id,
          isActive: !coupon.isActive,
        }),
      });

      if (res.ok) {
        fetchCoupons();
      }
    } catch (error) {
      console.error("Error toggling coupon:", error);
    }
  };

  const now = new Date();
  const stats = {
    total: coupons.length,
    active: coupons.filter((c) => c.isActive).length,
    expired: coupons.filter((c) => c.validUntil && new Date(c.validUntil) < now).length,
    redeemed: coupons.reduce((sum, c) => sum + (c.usedCount || 0), 0),
  };

  /** Human-readable state, so an admin can see at a glance why a code isn't working. */
  const couponState = (c: Coupon): { label: string; badge: string } => {
    if (!c.isActive) return { label: "Inactive", badge: "badge-out_of_stock" };
    if (c.validUntil && new Date(c.validUntil) < now) return { label: "Expired", badge: "badge-red" };
    if (new Date(c.validFrom) > now) return { label: "Scheduled", badge: "badge-blue" };
    if (c.usageLimit && c.usedCount >= c.usageLimit) return { label: "Used up", badge: "badge-orange" };
    return { label: "Active", badge: "badge-green" };
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px", marginBottom: "20px" }}>
        <div>
          <h2 style={{ fontSize: "22px", marginBottom: "4px" }}>Coupon Management</h2>
          <p style={{ color: "var(--text-secondary)", fontSize: "13px" }}>
            Create discount codes and track how often they are redeemed.
          </p>
        </div>
        <button
          className="btn btn-primary"
          onClick={() => {
            setEditingCoupon(null);
            resetForm();
            setShowCreateModal(true);
          }}
        >
          + Create Coupon
        </button>
      </div>

      {/* Summary */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "12px", marginBottom: "20px" }}>
        {[
          { label: "Total", value: stats.total },
          { label: "Active", value: stats.active },
          { label: "Expired", value: stats.expired },
          { label: "Times redeemed", value: stats.redeemed },
        ].map((s) => (
          <div key={s.label} className="card" style={{ padding: "14px 16px" }}>
            <div style={{ fontSize: "12px", color: "var(--text-secondary)", marginBottom: "4px" }}>{s.label}</div>
            <div style={{ fontSize: "22px", fontWeight: 800 }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: "12px", marginBottom: "16px", flexWrap: "wrap" }}>
        <input
          type="text"
          className="form-input"
          placeholder="Search by code or description..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{ flex: "1 1 240px" }}
        />
        <select
          className="form-input"
          value={filterActive}
          onChange={(e) => setFilterActive(e.target.value)}
          style={{ flex: "0 1 180px" }}
        >
          <option value="all">All Coupons</option>
          <option value="true">Active Only</option>
          <option value="false">Inactive Only</option>
        </select>
      </div>

      {/* Coupons */}
      {loading ? (
        <div className="card" style={{ textAlign: "center", padding: "40px", color: "var(--text-secondary)" }}>
          Loading coupons…
        </div>
      ) : coupons.length === 0 ? (
        <div className="card" style={{ textAlign: "center", padding: "48px 24px" }}>
          <div style={{ fontSize: "32px", marginBottom: "12px" }}>🎟️</div>
          <h3 style={{ fontSize: "16px", marginBottom: "6px" }}>No coupons yet</h3>
          <p style={{ color: "var(--text-secondary)", fontSize: "13px", marginBottom: "16px" }}>
            {searchTerm || filterActive !== "all"
              ? "No coupons match the current filters."
              : "Create your first discount code to get started."}
          </p>
          <button
            className="btn btn-primary"
            onClick={() => {
              setEditingCoupon(null);
              resetForm();
              setShowCreateModal(true);
            }}
          >
            + Create Coupon
          </button>
        </div>
      ) : (
        <div className="table-scroll-wrap" style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "820px" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)" }}>
                {["Code", "Discount", "Conditions", "Usage", "Valid Period", "Status", ""].map((h) => (
                  <th
                    key={h}
                    style={{
                      textAlign: "left",
                      padding: "10px 12px",
                      fontSize: "12px",
                      fontWeight: 700,
                      color: "var(--text-secondary)",
                      textTransform: "uppercase",
                      letterSpacing: ".04em",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {coupons.map((coupon) => {
                const state = couponState(coupon);
                const pct = coupon.usageLimit
                  ? Math.min(100, Math.round((coupon.usedCount / coupon.usageLimit) * 100))
                  : 0;
                return (
                  <tr key={coupon.id} style={{ borderBottom: "1px solid var(--border)" }}>
                    <td style={{ padding: "12px" }}>
                      <div style={{ fontFamily: "monospace", fontWeight: 800, fontSize: "14px" }}>{coupon.code}</div>
                      {coupon.description && (
                        <div style={{ fontSize: "12px", color: "var(--text-secondary)", marginTop: "2px", maxWidth: "220px" }}>
                          {coupon.description}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: "12px", whiteSpace: "nowrap" }}>
                      <span style={{ fontWeight: 700 }}>
                        {coupon.discountType === "PERCENTAGE"
                          ? `${coupon.discountValue}%`
                          : `$${coupon.discountValue}`}
                      </span>
                      {coupon.maxDiscount ? (
                        <div style={{ fontSize: "11px", color: "var(--text-tertiary)" }}>
                          max ${coupon.maxDiscount}
                        </div>
                      ) : null}
                    </td>
                    <td style={{ padding: "12px", fontSize: "12px", color: "var(--text-secondary)", whiteSpace: "nowrap" }}>
                      {coupon.minOrderAmount ? <div>Min order ${coupon.minOrderAmount}</div> : null}
                      {coupon.userLimit ? <div>{coupon.userLimit} per user</div> : null}
                      {!coupon.minOrderAmount && !coupon.userLimit ? <span>—</span> : null}
                    </td>
                    <td style={{ padding: "12px", minWidth: "130px" }}>
                      <div style={{ fontSize: "13px", fontWeight: 600 }}>
                        {coupon.usedCount}
                        {coupon.usageLimit ? ` / ${coupon.usageLimit}` : ""}
                      </div>
                      {coupon.usageLimit ? (
                        <div style={{ height: "5px", background: "var(--surface-subtle)", borderRadius: "999px", marginTop: "5px", overflow: "hidden" }}>
                          <div
                            style={{
                              width: `${pct}%`,
                              height: "100%",
                              background: pct >= 100 ? "var(--red)" : "var(--green)",
                            }}
                          />
                        </div>
                      ) : (
                        <div style={{ fontSize: "11px", color: "var(--text-tertiary)" }}>unlimited</div>
                      )}
                    </td>
                    <td style={{ padding: "12px", fontSize: "12px", whiteSpace: "nowrap" }}>
                      <div>{new Date(coupon.validFrom).toLocaleDateString("en-GB")}</div>
                      <div style={{ color: "var(--text-tertiary)" }}>
                        {coupon.validUntil ? `to ${new Date(coupon.validUntil).toLocaleDateString("en-GB")}` : "no expiry"}
                      </div>
                    </td>
                    <td style={{ padding: "12px" }}>
                      <button
                        onClick={() => toggleActive(coupon)}
                        title={coupon.isActive ? "Click to deactivate" : "Click to activate"}
                        className={`badge ${state.badge}`}
                        style={{ cursor: "pointer", border: "none" }}
                      >
                        {state.label}
                      </button>
                    </td>
                    <td style={{ padding: "12px", whiteSpace: "nowrap", textAlign: "right" }}>
                      <button
                        className="btn btn-secondary"
                        onClick={() => handleEdit(coupon)}
                        style={{ padding: "6px 12px", fontSize: "13px", marginRight: "8px" }}
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(coupon.id)}
                        style={{
                          padding: "6px 12px",
                          fontSize: "13px",
                          background: "none",
                          border: "1px solid var(--red)",
                          color: "var(--red)",
                          borderRadius: "var(--radius-sm)",
                          cursor: "pointer",
                        }}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Create/Edit Modal */}
      {showCreateModal && (
        <div style={{ position: "fixed", inset: 0, zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }}>
          <div
            style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}
            onClick={() => {
              setShowCreateModal(false);
              setEditingCoupon(null);
              resetForm();
            }}
          />
          <div className="card" style={{ position: "relative", zIndex: 201, width: "100%", maxWidth: "680px", maxHeight: "90vh", overflowY: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
              <h3 style={{ fontSize: "18px" }}>{editingCoupon ? "Edit Coupon" : "Create New Coupon"}</h3>
              <button
                type="button"
                aria-label="Close"
                onClick={() => {
                  setShowCreateModal(false);
                  setEditingCoupon(null);
                  resetForm();
                }}
                style={{ background: "none", border: "none", color: "var(--text-secondary)", cursor: "pointer", fontSize: "24px", lineHeight: 1 }}
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleSubmit}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "16px" }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Coupon Code *</label>
                  <input
                    type="text"
                    className="form-input"
                    style={{ textTransform: "uppercase", fontFamily: "monospace", fontWeight: 700 }}
                    placeholder="SUMMER20"
                    value={formData.code}
                    onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                    required
                  />
                  <small style={{ fontSize: "11px", color: "var(--text-tertiary)" }}>
                    Customers type this at checkout. Case-insensitive.
                  </small>
                </div>

                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Discount Type *</label>
                  <select
                    className="form-input"
                    value={formData.discountType}
                    onChange={(e) => setFormData({ ...formData, discountType: e.target.value as any })}
                  >
                    <option value="PERCENTAGE">Percentage (%)</option>
                    <option value="FIXED_AMOUNT">Fixed Amount ($)</option>
                  </select>
                </div>

                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">
                    Discount Value * {formData.discountType === "PERCENTAGE" ? "(%)" : "($)"}
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    className="form-input"
                    value={formData.discountValue}
                    onChange={(e) => setFormData({ ...formData, discountValue: e.target.value })}
                    required
                  />
                </div>

                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Max Discount ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    className="form-input"
                    placeholder="Optional"
                    value={formData.maxDiscount}
                    onChange={(e) => setFormData({ ...formData, maxDiscount: e.target.value })}
                    disabled={formData.discountType !== "PERCENTAGE"}
                  />
                  <small style={{ fontSize: "11px", color: "var(--text-tertiary)" }}>
                    {formData.discountType === "PERCENTAGE"
                      ? "Caps how much a percentage discount can take off."
                      : "Only applies to percentage discounts."}
                  </small>
                </div>

                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Min Order Amount ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    className="form-input"
                    placeholder="Optional"
                    value={formData.minOrderAmount}
                    onChange={(e) => setFormData({ ...formData, minOrderAmount: e.target.value })}
                  />
                </div>

                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Total Usage Limit</label>
                  <input
                    type="number"
                    min="0"
                    className="form-input"
                    placeholder="Unlimited"
                    value={formData.usageLimit}
                    onChange={(e) => setFormData({ ...formData, usageLimit: e.target.value })}
                  />
                </div>

                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Per-User Limit</label>
                  <input
                    type="number"
                    min="0"
                    className="form-input"
                    placeholder="Unlimited"
                    value={formData.userLimit}
                    onChange={(e) => setFormData({ ...formData, userLimit: e.target.value })}
                  />
                </div>

                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Valid From</label>
                  <input
                    type="date"
                    className="form-input"
                    value={formData.validFrom}
                    onChange={(e) => setFormData({ ...formData, validFrom: e.target.value })}
                  />
                </div>

                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Valid Until</label>
                  <input
                    type="date"
                    className="form-input"
                    value={formData.validUntil}
                    onChange={(e) => setFormData({ ...formData, validUntil: e.target.value })}
                  />
                  <small style={{ fontSize: "11px", color: "var(--text-tertiary)" }}>
                    Leave blank for no expiry.
                  </small>
                </div>

                <div className="form-group" style={{ marginBottom: 0, gridColumn: "1 / -1" }}>
                  <label className="form-label">Description</label>
                  <textarea
                    className="form-input"
                    rows={2}
                    placeholder="Internal note — what this coupon is for"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  />
                </div>

                <div style={{ gridColumn: "1 / -1" }}>
                  <label
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "10px",
                      padding: "12px",
                      background: "var(--surface-subtle)",
                      border: "1px solid var(--border)",
                      borderRadius: "var(--radius-md)",
                      cursor: "pointer",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={formData.isActive}
                      onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                    />
                    <span>
                      <span style={{ fontWeight: 600, fontSize: "14px" }}>Active</span>
                      <span style={{ display: "block", fontSize: "12px", color: "var(--text-secondary)" }}>
                        Inactive coupons are rejected at checkout.
                      </span>
                    </span>
                  </label>
                </div>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px", marginTop: "24px" }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    setShowCreateModal(false);
                    setEditingCoupon(null);
                    resetForm();
                  }}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  {editingCoupon ? "Save Changes" : "Create Coupon"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
