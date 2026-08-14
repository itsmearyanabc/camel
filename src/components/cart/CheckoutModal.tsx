"use client";

import React, { useState, useEffect } from "react";
import { useCart } from "./CartContext";
import { formatPrice, CRYPTO_CURRENCIES } from "@/lib/currencies";

interface CheckoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: any;
  onCheckoutSuccess: () => void;
}

export default function CheckoutModal({ isOpen, onClose, user, onCheckoutSuccess }: CheckoutModalProps) {
  const { cart, cartTotal, removeFromCart, updateQuantity, clearCart, pickupArea } = useCart();
  const [paymentMethod, setPaymentMethod] = useState<"WALLET" | "CRYPTO">("WALLET");
  const [cryptoCurrency, setCryptoCurrency] = useState("ANY");
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cryptoPending, setCryptoPending] = useState<any>(null);
  const [couponInput, setCouponInput] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState<{ code: string; discount: number; finalAmount: number } | null>(null);
  const [couponError, setCouponError] = useState<string | null>(null);
  const [isValidatingCoupon, setIsValidatingCoupon] = useState(false);
  const [ongoing, setOngoing] = useState<{ enabled: boolean; percent: number }>({ enabled: false, percent: 0 });

  // Re-read on every open: an admin can switch the store-wide discount on or
  // off at any moment, and a stale percentage here would quote a total the
  // server then refuses to charge.
  useEffect(() => {
    if (!isOpen) return;
    fetch("/api/discount/ongoing")
      .then((r) => r.json())
      .then((d) => setOngoing({ enabled: !!d.enabled, percent: Number(d.percent) || 0 }))
      .catch(() => setOngoing({ enabled: false, percent: 0 }));
  }, [isOpen]);

  // Codes must match CRYPTO_CURRENCIES in src/lib/currencies.ts - the API
  // rejects anything else. "ANY" lets the customer choose from every coin
  // NOWPayments supports on the hosted invoice page.
  const cryptoOptions = [
    { code: "ANY", name: "Let me choose at checkout" },
    ...CRYPTO_CURRENCIES.map((c) => ({ code: c.code, name: c.name })),
  ];

  if (!isOpen) return null;

  // Mirrors the server's order: the store-wide discount comes off the subtotal
  // first, then any coupon applies to what is left. The API recomputes all of
  // this from its own settings, so these figures are a preview, never the
  // charge.
  const ongoingDiscount = ongoing.enabled
    ? Math.min(parseFloat(((cartTotal * ongoing.percent) / 100).toFixed(2)), cartTotal)
    : 0;
  const afterOngoing = parseFloat((cartTotal - ongoingDiscount).toFixed(2));
  const couponDiscount = appliedCoupon ? Math.min(appliedCoupon.discount, afterOngoing) : 0;
  const finalTotal = Math.max(0, parseFloat((afterOngoing - couponDiscount).toFixed(2)));

  const handleApplyCoupon = async () => {
    setCouponError(null);
    const code = couponInput.trim();
    if (!code) return;
    setIsValidatingCoupon(true);
    try {
      // Validate against what the coupon actually applies to. The store-wide
      // discount comes off first server-side, so quoting the coupon against the
      // full subtotal would show a bigger saving than the order receives.
      const res = await fetch("/api/coupons/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, orderAmount: afterOngoing }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Invalid coupon");
      setAppliedCoupon({ code: data.coupon.code, discount: data.discount, finalAmount: data.finalAmount });
      setCouponInput("");
    } catch (err: any) {
      setCouponError(err.message);
      setAppliedCoupon(null);
    } finally {
      setIsValidatingCoupon(false);
    }
  };

  const handleRemoveCoupon = () => {
    setAppliedCoupon(null);
    setCouponError(null);
    setCouponInput("");
  };

  const handleCheckout = async () => {
    setError(null);
    // The collection point is settled on the product page and travels on every
    // cart line, so there is nothing to choose here - only something to fail on
    // if a line somehow arrived without one.
    if (!pickupArea?.areaId) {
      setError("Your cart has no collection point. Please re-add the items from the product page.");
      return;
    }
    setIsProcessing(true);

    try {
      const endpoint = paymentMethod === "WALLET" ? "/api/orders/checkout" : "/api/orders/crypto-checkout";
       const payload = paymentMethod === "WALLET"
        ? { cart, paymentMethod: "WALLET", areaId: pickupArea.areaId, couponCode: appliedCoupon?.code }
        : { cart, cryptoCurrency, areaId: pickupArea.areaId, couponCode: appliedCoupon?.code };

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Checkout failed");

      if (paymentMethod === "WALLET") {
        clearCart();
        onCheckoutSuccess();
        return;
      }

      // NOWPayments path: hand the customer to the hosted invoice. The cart is
      // cleared first because the stock is already reserved against the order -
      // leaving it populated would let them check out the same units twice.
      if (data.paymentUrl) {
        clearCart();
        window.location.href = data.paymentUrl;
        return;
      }

      // Manual fallback: show our own address for the customer to pay directly.
      setCryptoPending(data.order);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCryptoComplete = () => {
    clearCart();
    setCryptoPending(null);
    onCheckoutSuccess();
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }}>
      <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }} onClick={!isProcessing && !cryptoPending ? onClose : undefined} />
      
      <div className="card" style={{ position: "relative", zIndex: 101, width: "100%", maxWidth: "600px", maxHeight: "90vh", overflowY: "auto" }}>
        
        {cryptoPending ? (
          <div>
            <h2 style={{ marginBottom: "16px" }}>Complete Payment</h2>
            <div className="alert alert-success" style={{ marginBottom: "20px" }}>Order created successfully! Please send payment to complete.</div>
            
            <div style={{ background: "var(--surface-subtle)", padding: "16px", borderRadius: "var(--radius-md)", marginBottom: "24px" }}>
              <p style={{ marginBottom: "8px", color: "var(--text-secondary)" }}>Send exactly:</p>
              <div style={{ fontSize: "28px", fontWeight: "800", color: "var(--text-primary)", marginBottom: "16px" }}>
                ${cryptoPending.totalDue.toFixed(2)} USD <span style={{ fontSize: "16px", color: "var(--text-secondary)", fontWeight: "normal" }}>in {cryptoPending.cryptoName}</span>
              </div>
              
              <p style={{ marginBottom: "8px", color: "var(--text-secondary)" }}>To Address ({cryptoPending.network}):</p>
              <div style={{ padding: "12px", background: "var(--background)", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)", wordBreak: "break-all", fontFamily: "monospace", fontSize: "16px", userSelect: "all" }}>
                {cryptoPending.walletAddress}
              </div>
            </div>

            <p style={{ fontSize: "14px", color: "var(--text-tertiary)", marginBottom: "24px" }}>
              After sending the payment, an admin will verify the transaction and release your items. Cooldown will begin automatically upon confirmation.
            </p>

            <button className="btn btn-primary" style={{ width: "100%" }} onClick={handleCryptoComplete}>
              I have sent the payment
            </button>
          </div>
        ) : (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
              <h2>Your Cart</h2>
              <button onClick={onClose} style={{ background: "none", border: "none", color: "var(--text-secondary)", cursor: "pointer", fontSize: "24px" }}>&times;</button>
            </div>

            {error && <div className="alert alert-error" style={{ marginBottom: "16px" }}>{error}</div>}

            {cart.length === 0 ? (
              <p style={{ color: "var(--text-secondary)", textAlign: "center", padding: "32px 0" }}>Your cart is empty.</p>
            ) : (
              <>
                <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginBottom: "24px" }}>
                  {cart.map((item) => (
                    <div key={item.productId} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px", background: "var(--surface-subtle)", borderRadius: "var(--radius-md)", border: "1px solid var(--border)" }}>
                      <div>
                        <div style={{ fontWeight: "600", marginBottom: "4px" }}>{item.name}</div>
                        <div style={{ fontSize: "14px", color: "var(--text-secondary)" }}>
                          {formatPrice(item.price, user?.wallet?.currency || "USD", user?.wallet?.exchangeRate || 1)} each
                        </div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                        <div style={{ display: "flex", alignItems: "center", background: "var(--background)", borderRadius: "var(--radius-sm)", overflow: "hidden", border: "1px solid var(--border)" }}>
                          <button onClick={() => updateQuantity(item.productId, -1)} style={{ padding: "4px 12px", background: "none", border: "none", cursor: "pointer", color: "var(--text-primary)" }}>-</button>
                          <span style={{ padding: "4px 12px", fontWeight: "600", borderLeft: "1px solid var(--border)", borderRight: "1px solid var(--border)" }}>{item.quantity}</span>
                          <button onClick={() => updateQuantity(item.productId, 1)} disabled={item.quantity >= item.stockCount} style={{ padding: "4px 12px", background: "none", border: "none", cursor: item.quantity >= item.stockCount ? "not-allowed" : "pointer", color: "var(--text-primary)", opacity: item.quantity >= item.stockCount ? 0.5 : 1 }}>+</button>
                        </div>
                        <button onClick={() => removeFromCart(item.productId)} style={{ background: "none", border: "none", color: "var(--error)", cursor: "pointer", padding: "4px" }}>🗑️</button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Coupon Code */}
                <div style={{ marginBottom: "16px", paddingTop: "16px", borderTop: "1px solid var(--border)" }}>
                  <label className="form-label" style={{ marginBottom: "8px", display: "block" }}>Have a coupon code?</label>
                  {appliedCoupon ? (
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 12px", background: "rgba(52,199,89,0.1)", border: "1px solid var(--green)", borderRadius: "var(--radius-sm)" }}>
                      <span style={{ fontWeight: "600", color: "var(--green)" }}>✓ {appliedCoupon.code} applied (−{formatPrice(couponDiscount, user?.wallet?.currency || "USD", user?.wallet?.exchangeRate || 1)})</span>
                      <button onClick={handleRemoveCoupon} style={{ background: "none", border: "none", color: "var(--error)", cursor: "pointer", fontSize: "13px" }}>Remove</button>
                    </div>
                  ) : (
                    <div style={{ display: "flex", gap: "8px" }}>
                      <input
                        className="form-input"
                        style={{ flex: 1, textTransform: "uppercase" }}
                        placeholder="Enter code"
                        value={couponInput}
                        onChange={(e) => setCouponInput(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleApplyCoupon()}
                      />
                      <button className="btn btn-secondary" onClick={handleApplyCoupon} disabled={isValidatingCoupon || !couponInput.trim()} style={{ whiteSpace: "nowrap" }}>
                        {isValidatingCoupon ? "..." : "Apply"}
                      </button>
                    </div>
                  )}
                  {couponError && <div style={{ color: "var(--error)", fontSize: "13px", marginTop: "6px" }}>{couponError}</div>}
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: "6px", paddingTop: "4px", marginBottom: "24px" }}>
                  {(appliedCoupon || ongoingDiscount > 0) && (
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontSize: "14px", color: "var(--text-secondary)" }}>Subtotal:</span>
                      <span style={{ fontSize: "16px", color: "var(--text-secondary)" }}>
                        {formatPrice(cartTotal, user?.wallet?.currency || "USD", user?.wallet?.exchangeRate || 1)}
                      </span>
                    </div>
                  )}
                  {ongoingDiscount > 0 && (
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontSize: "14px", color: "var(--green)" }}>
                        Store discount ({ongoing.percent}% off):
                      </span>
                      <span style={{ fontSize: "16px", color: "var(--green)" }}>
                        −{formatPrice(ongoingDiscount, user?.wallet?.currency || "USD", user?.wallet?.exchangeRate || 1)}
                      </span>
                    </div>
                  )}
                  {appliedCoupon && (
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontSize: "14px", color: "var(--green)" }}>Coupon ({appliedCoupon.code}):</span>
                      <span style={{ fontSize: "16px", color: "var(--green)" }}>
                        −{formatPrice(couponDiscount, user?.wallet?.currency || "USD", user?.wallet?.exchangeRate || 1)}
                      </span>
                    </div>
                  )}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: "18px", color: "var(--text-secondary)" }}>Total:</span>
                    <span style={{ fontSize: "24px", fontWeight: "800", color: "var(--text-primary)" }}>
                      {formatPrice(finalTotal, user?.wallet?.currency || "USD", user?.wallet?.exchangeRate || 1)}
                    </span>
                  </div>
                </div>

                {/* The collection point is chosen on the product page - every
                    row there is one weight in one place - so the cart only ever
                    confirms it. Asking again here used to let a customer pick an
                    area their items were not actually stocked in, and the order
                    was then refused at the very last step. */}
                <div style={{ marginBottom: "24px", background: "var(--surface-subtle)", padding: "16px", borderRadius: "var(--radius-md)", border: "1px solid var(--border)" }}>
                  <h3 style={{ fontSize: "16px", marginBottom: "12px" }}>Collection Point</h3>
                  {pickupArea ? (
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "15px", fontWeight: "600" }}>
                      <span aria-hidden>📍</span>
                      <span>{pickupArea.cityName ? `${pickupArea.cityName} / ` : ""}{pickupArea.areaName}</span>
                    </div>
                  ) : (
                    <div className="alert alert-error" style={{ margin: 0, padding: "8px 12px", fontSize: "13px" }}>
                      These items have no collection point. Please remove them and add them again from the product page.
                    </div>
                  )}
                </div>

                <div style={{ marginBottom: "24px" }}>
                  <h3 style={{ fontSize: "16px", marginBottom: "12px" }}>Payment Method</h3>
                  <div style={{ display: "flex", gap: "12px" }}>
                    <button
                      className={`btn ${paymentMethod === "WALLET" ? "btn-primary" : "btn-secondary"}`}
                      style={{ flex: 1, display: "flex", flexDirection: "column", gap: "4px", padding: "12px" }}
                      onClick={() => setPaymentMethod("WALLET")}
                    >
                      <span style={{ fontWeight: "600" }}>Wallet Balance</span>
                      <span style={{ fontSize: "12px", opacity: 0.8 }}>Available: {formatPrice(user?.wallet?.balance || 0, user?.wallet?.currency || "USD", user?.wallet?.exchangeRate || 1)}</span>
                    </button>
                    <button
                      className={`btn ${paymentMethod === "CRYPTO" ? "btn-primary" : "btn-secondary"}`}
                      style={{ flex: 1, display: "flex", flexDirection: "column", gap: "4px", padding: "12px", justifyContent: "center" }}
                      onClick={() => setPaymentMethod("CRYPTO")}
                    >
                      <span style={{ fontWeight: "600" }}>Direct Crypto</span>
                      <span style={{ fontSize: "12px", opacity: 0.8 }}>Pay with coins</span>
                    </button>
                  </div>
                  
                  {paymentMethod === "WALLET" && (user?.wallet?.balance || 0) < finalTotal && (
                    <div className="alert alert-error" style={{ marginTop: "12px", padding: "8px 12px", fontSize: "13px" }}>
                      Insufficient funds. You need {formatPrice(finalTotal - (user?.wallet?.balance || 0), user?.wallet?.currency || "USD", user?.wallet?.exchangeRate || 1)} more in your wallet.
                    </div>
                  )}
                </div>

                {paymentMethod === "CRYPTO" && (
                  <div style={{ marginBottom: "24px" }}>
                    <label className="form-label">Select Cryptocurrency</label>
                    <select
                      className="form-input"
                      value={cryptoCurrency}
                      onChange={(e) => setCryptoCurrency(e.target.value)}
                    >
                      {cryptoOptions.map(opt => (
                        <option key={opt.code} value={opt.code}>{opt.name} ({opt.code})</option>
                      ))}
                    </select>
                  </div>
                )}

                <button
                  className="btn btn-primary"
                  style={{ width: "100%", padding: "14px", fontSize: "16px", opacity: isProcessing || !pickupArea || (paymentMethod === "WALLET" && (user?.wallet?.balance || 0) < finalTotal) ? 0.5 : 1 }}
                  onClick={handleCheckout}
                  disabled={isProcessing || !pickupArea || (paymentMethod === "WALLET" && (user?.wallet?.balance || 0) < finalTotal)}
                >
                  {isProcessing ? "Processing..." : `Pay ${formatPrice(finalTotal, user?.wallet?.currency || "USD", user?.wallet?.exchangeRate || 1)}`}
                </button>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
