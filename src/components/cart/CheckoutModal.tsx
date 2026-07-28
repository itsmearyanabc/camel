"use client";

import React, { useState, useEffect, useMemo } from "react";
import { useCart } from "./CartContext";
import { formatPrice } from "@/lib/currencies";

interface CheckoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: any;
  onCheckoutSuccess: () => void;
}

export default function CheckoutModal({ isOpen, onClose, user, onCheckoutSuccess }: CheckoutModalProps) {
  const { cart, cartTotal, removeFromCart, updateQuantity, clearCart } = useCart();
  const [paymentMethod, setPaymentMethod] = useState<"WALLET" | "CRYPTO">("WALLET");
  const [cryptoCurrency, setCryptoCurrency] = useState("BTC");
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cryptoPending, setCryptoPending] = useState<any>(null);
  const [locations, setLocations] = useState<any[]>([]);
  const [selectedCityId, setSelectedCityId] = useState<string>("");
  const [selectedAreaId, setSelectedAreaId] = useState<string>("");

  useEffect(() => {
    fetch("/api/locations").then(r => r.json()).then(d => {
      if (d.cities) setLocations(d.cities);
    }).catch(() => {});
  }, []);

  const validAreaIds = useMemo(() => {
    if (cart.length === 0) return new Set<string>();
    let intersection = new Set(cart[0].areas?.map((a: any) => a.id) || []);
    for (let i = 1; i < cart.length; i++) {
      const currentAreaIds = new Set(cart[i].areas?.map((a: any) => a.id) || []);
      intersection = new Set([...intersection].filter(x => currentAreaIds.has(x)));
    }
    return intersection;
  }, [cart]);

  const filteredLocations = useMemo(() => {
    if (validAreaIds.size === 0 && cart.length > 0) return [];
    
    return locations.map(city => ({
      ...city,
      areas: city.areas?.filter((a: any) => validAreaIds.has(a.id))
    })).filter(city => city.areas && city.areas.length > 0);
  }, [locations, validAreaIds, cart.length]);

  const cryptoOptions = [
    { code: "BTC", name: "Bitcoin" },
    { code: "ETH", name: "Ethereum" },
    { code: "USDT", name: "Tether (TRC20)" },
    { code: "SOL", name: "Solana" },
    { code: "TRX", name: "Tron" },
  ];

  if (!isOpen) return null;

  const handleCheckout = async () => {
    setError(null);
    if (!selectedAreaId) {
      setError("Please select a delivery area.");
      return;
    }
    setIsProcessing(true);

    try {
      const endpoint = paymentMethod === "WALLET" ? "/api/orders/checkout" : "/api/orders/crypto-checkout";
      const payload = paymentMethod === "WALLET"
        ? { cart, paymentMethod: "WALLET", areaId: selectedAreaId }
        : { cart, cryptoCurrency, areaId: selectedAreaId };

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
      } else {
        setCryptoPending(data.order);
      }
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

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: "16px", borderTop: "1px solid var(--border)", marginBottom: "24px" }}>
                  <span style={{ fontSize: "18px", color: "var(--text-secondary)" }}>Total:</span>
                  <span style={{ fontSize: "24px", fontWeight: "800", color: "var(--text-primary)" }}>
                    {formatPrice(cartTotal, user?.wallet?.currency || "USD", user?.wallet?.exchangeRate || 1)}
                  </span>
                </div>

                <div style={{ marginBottom: "24px", background: "var(--surface-subtle)", padding: "16px", borderRadius: "var(--radius-md)", border: "1px solid var(--border)" }}>
                  <h3 style={{ fontSize: "16px", marginBottom: "12px" }}>Delivery Area</h3>
                  {filteredLocations.length === 0 && cart.length > 0 ? (
                    <div className="alert alert-error" style={{ marginBottom: "12px", padding: "8px 12px", fontSize: "13px" }}>
                      No common delivery area found for all items in your cart. Please remove some items.
                    </div>
                  ) : (
                    <div style={{ display: "flex", gap: "12px" }}>
                      <select className="form-input" value={selectedCityId} onChange={(e) => { setSelectedCityId(e.target.value); setSelectedAreaId(""); }} style={{ flex: 1 }}>
                        <option value="">Select City...</option>
                        {filteredLocations.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                      <select className="form-input" value={selectedAreaId} onChange={(e) => setSelectedAreaId(e.target.value)} disabled={!selectedCityId} style={{ flex: 1 }}>
                        <option value="">Select Area...</option>
                        {filteredLocations.find((c: any) => c.id === selectedCityId)?.areas?.map((a: any) => (
                          <option key={a.id} value={a.id}>{a.name}</option>
                        ))}
                      </select>
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
                  
                  {paymentMethod === "WALLET" && (user?.wallet?.balance || 0) < cartTotal && (
                    <div className="alert alert-error" style={{ marginTop: "12px", padding: "8px 12px", fontSize: "13px" }}>
                      Insufficient funds. You need {formatPrice(cartTotal - (user?.wallet?.balance || 0), user?.wallet?.currency || "USD", user?.wallet?.exchangeRate || 1)} more in your wallet.
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
                  style={{ width: "100%", padding: "14px", fontSize: "16px", opacity: isProcessing || !selectedAreaId || (paymentMethod === "WALLET" && (user?.wallet?.balance || 0) < cartTotal) ? 0.5 : 1 }}
                  onClick={handleCheckout}
                  disabled={isProcessing || !selectedAreaId || (paymentMethod === "WALLET" && (user?.wallet?.balance || 0) < cartTotal)}
                >
                  {isProcessing ? "Processing..." : `Pay ${formatPrice(cartTotal, user?.wallet?.currency || "USD", user?.wallet?.exchangeRate || 1)}`}
                </button>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
