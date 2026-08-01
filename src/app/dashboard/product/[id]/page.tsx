"use client";

import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import DashboardNav from "@/components/DashboardNav";
import SiteFooter from "@/components/SiteFooter";
import { formatPrice } from "@/lib/currencies";
import styles from "../../dashboard.module.css";
import { useCart } from "@/components/cart/CartContext";
import CartWidget from "@/components/cart/CartWidget";
import CheckoutModal from "@/components/cart/CheckoutModal";
import Reviews from "@/components/Reviews";

const BOT_USERNAME = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME || "Camel971_bot";

export default function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [product, setProduct] = useState<any>(null);
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<{ type: "error" | "success"; text: string } | null>(null);
  const [activeTab, setActiveTab] = useState<any>("shop"); // Mock active tab for nav
  const [isFavorite, setIsFavorite] = useState(false);
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [isImageZoomed, setIsImageZoomed] = useState(false);
  const [restockSubscribed, setRestockSubscribed] = useState(false);
  const [restockLoading, setRestockLoading] = useState(false);

  const { addToCart, updateQuantity, cart } = useCart();
  const cartItem = cart.find(item => item.productId === product?.id);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [meRes, prodRes, ordRes] = await Promise.all([
          fetch("/api/auth/me"),
          fetch("/api/inventory/products"),
          fetch("/api/orders/list"),
        ]);
        
        const meData = await meRes.json();
        if (!meData.user) {
          router.push("/auth/login");
          return;
        }
        setUser(meData.user);

        const prodData = await prodRes.json();
        let foundProd = null;
        if (prodData.categories) {
          for (const cat of prodData.categories) {
            const p = cat.products.find((p: any) => p.id === id);
            if (p) {
              foundProd = p;
              break;
            }
          }
        }
        setProduct(foundProd);

        const ordData = await ordRes.json();
        if (ordRes.ok) setOrders(ordData.orders || []);

        // Load favorite status
        if (foundProd) {
          const favs = JSON.parse(localStorage.getItem("favorites") || "[]");
          setIsFavorite(favs.includes(foundProd.id));

          // Load restock subscription status
          try {
            const subRes = await fetch(`/api/products/restock?productId=${foundProd.id}`);
            if (subRes.ok) {
              const subData = await subRes.json();
              setRestockSubscribed(!!subData.subscribed);
            }
          } catch {}
        }
      } catch (err) {
        console.error(err);
      }
      setLoading(false);
    })();
  }, [id, router]);

  const toggleFavorite = () => {
    if (!product) return;
    const favs = JSON.parse(localStorage.getItem("favorites") || "[]");
    let newFavs;
    if (isFavorite) {
      newFavs = favs.filter((favId: string) => favId !== product.id);
    } else {
      newFavs = [...favs, product.id];
    }
    localStorage.setItem("favorites", JSON.stringify(newFavs));
    setIsFavorite(!isFavorite);
  };

  const toggleRestockNotify = async () => {
    if (!product || restockLoading) return;
    setRestockLoading(true);
    try {
      if (restockSubscribed) {
        const res = await fetch("/api/products/restock", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ productId: product.id }),
        });
        if (res.ok) {
          setRestockSubscribed(false);
          setMsg({ type: "success", text: "You will no longer be notified about this product." });
        } else {
          setMsg({ type: "error", text: "Failed to unsubscribe. Please try again." });
        }
      } else {
        const res = await fetch("/api/products/restock", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ productId: product.id }),
        });
        if (res.ok) {
          setRestockSubscribed(true);
          setMsg({ type: "success", text: "You'll be notified (website + Telegram) when this is back in stock!" });
        } else {
          setMsg({ type: "error", text: "Failed to subscribe. Please try again." });
        }
      }
    } catch {
      setMsg({ type: "error", text: "Network error. Please try again." });
    }
    setRestockLoading(false);
  };

  const handleLogout = async () => {
    if (window.confirm("Are you sure you want to log out?")) {
      await fetch("/api/auth/logout", { method: "POST" });
      window.location.href = "/";
    }
  };

  const handleCheckoutSuccess = async () => {
    setIsCheckoutOpen(false);
    setMsg({ type: "success", text: "Order placed successfully! Cooldown active." });
    
    // Refresh user balance & orders
    try {
      const [rMe, ordRes] = await Promise.all([
        fetch("/api/auth/me"),
        fetch("/api/orders/list")
      ]);
      const dMe = await rMe.json();
      if (dMe.user) setUser(dMe.user);
      
      const ordData = await ordRes.json();
      if (ordRes.ok) setOrders(ordData.orders || []);
    } catch {}
  };

  if (loading || !user) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg-secondary)" }}>
        <h3 style={{ color: "var(--text-secondary)" }}>Loading...</h3>
      </div>
    );
  }

  return (
    <div className={styles.shell}>
      <DashboardNav
        user={user}
        activeTab={activeTab}
        setActiveTab={(t) => {
          if (t !== "shop") {
            router.push("/dashboard");
            // state will be handled there
          }
        }}
        onLogout={handleLogout}
        hasActiveOrders={orders.some(o => o.status === "COOLDOWN_ACTIVE")}
        botUsername={BOT_USERNAME}
      />

      <div className={styles.content}>
        <main className={styles.section}>
          <Link href="/dashboard" className="btn btn-ghost btn-sm" style={{ marginBottom: "20px", display: "inline-flex" }}>
            ← Back to Products
          </Link>

          {!product ? (
            <div className="card">Product not found.</div>
          ) : (
            <>
              {msg && (
                <div className={`alert ${msg.type === "error" ? "alert-error" : "alert-success"}`}>
                  {msg.text}
                </div>
              )}

              <div className="grid-product-detail">
                {/* Left Side: Product Image */}
                <div className="card" style={{ padding: "0", overflow: "hidden" }}>
                  {product.imageUrl ? (
                    <img
                      src={product.imageUrl}
                      alt={product.name}
                      onClick={() => setIsImageZoomed(true)}
                      style={{ width: "100%", display: "block", aspectRatio: "1/1", objectFit: "cover", cursor: "zoom-in" }}
                    />
                  ) : (
                    <div style={{ width: "100%", aspectRatio: "1/1", background: "var(--surface-subtle)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      No image available
                    </div>
                  )}
                </div>

                {/* Right Side: Product Details & Variants */}
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "16px" }}>
                    <div>
                      <h1 style={{ fontSize: "28px", marginBottom: "8px" }}>{product.name}</h1>
                      <div style={{ display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
                        {(() => {
                          const areaDetails = product.areaDetails || [];
                          const hasAreaStock = areaDetails.some((d: any) => d.stockQuantity > 0);
                          if (hasAreaStock) {
                            return (
                              <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                                {areaDetails.filter((d: any) => d.stockQuantity > 0).map((d: any) => (
                                  <span key={d.areaId} className="badge badge-in_stock">
                                    {d.area?.name || "Area"} ({d.stockQuantity})
                                  </span>
                                ))}
                              </div>
                            );
                          }
                          return (
                            <span className={`badge badge-${product.stockQuantity > 0 ? "in_stock" : "out_of_stock"}`}>
                              {product.stockQuantity > 0 ? "IN STOCK" : "OUT OF STOCK"} ({product.stockQuantity})
                            </span>
                          );
                        })()}
                        {product.formula && <span style={{ fontSize: "14px", color: "var(--accent)", fontWeight: "500" }}>{product.formula}</span>}
                        {product.areas && product.areas.length > 0 && (
                          <div style={{ display: "flex", gap: "8px", alignItems: "center", marginLeft: "8px", borderLeft: "1px solid var(--border)", paddingLeft: "16px" }}>
                            <span style={{ fontSize: "13px", color: "var(--text-secondary)" }}>📍 Available in:</span>
                            <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                              {product.areas.map((a: any) => (
                                <span key={a.id} style={{ fontSize: "12px", background: "var(--surface-subtle)", padding: "2px 8px", borderRadius: "12px", color: "var(--text-primary)", border: "1px solid var(--border)" }}>{a.name}</span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                    <button onClick={toggleFavorite} className="btn btn-secondary btn-sm">
                      {isFavorite ? "❤️ Favorited" : "🤍 Add to Favorites"}
                    </button>
                  </div>

                  <p style={{ color: "var(--text-secondary)", marginBottom: "24px", lineHeight: "1.6" }}>
                    {product.description || "No description provided."}
                  </p>

                  <div className="card" style={{ padding: "24px", display: "flex", flexDirection: "column", gap: "16px", borderTop: "3px solid var(--accent)" }}>
                    <div>
                      <h3 style={{ marginBottom: "4px" }}>Purchase {product.name}</h3>
                      <p style={{ fontSize: "14px", color: "var(--text-secondary)" }}>
                        {product.stockQuantity > 0 ? `${product.stockQuantity} unit(s) available in stock` : "Currently out of stock"}
                      </p>
                    </div>
                     <div style={{ display: "flex", gap: "16px", alignItems: "center", flexWrap: "wrap" }}>
                       <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                         <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                           <span style={{ fontSize: "24px", fontWeight: "800", color: "var(--text-primary)" }}>
                             {formatPrice(product.price, user?.wallet?.currency || "USD", user?.wallet?.exchangeRate || 1)}
                           </span>
                           {product.originalPrice != null && Number(product.originalPrice) > Number(product.price) && (
                             <>
                               <span style={{ fontSize: "18px", color: "var(--text-tertiary)", textDecoration: "line-through" }}>
                                 {formatPrice(Number(product.originalPrice), user?.wallet?.currency || "USD", user?.wallet?.exchangeRate || 1)}
                               </span>
                               <span style={{ background: "var(--red)", color: "#fff", fontSize: "12px", fontWeight: "700", padding: "2px 8px", borderRadius: "12px" }}>
                                 -{Math.round(((Number(product.originalPrice) - Number(product.price)) / Number(product.originalPrice)) * 100)}%
                               </span>
                             </>
                           )}
                         </div>
                       </div>
                      {cartItem ? (
                        <div style={{ display: "flex", alignItems: "center", background: "var(--background)", borderRadius: "var(--radius-sm)", overflow: "hidden", border: "1px solid var(--border)" }}>
                          <button onClick={() => updateQuantity(product.id, -1)} style={{ padding: "8px 16px", background: "none", border: "none", cursor: "pointer", color: "var(--text-primary)" }}>-</button>
                          <span style={{ padding: "8px 16px", fontWeight: "600", borderLeft: "1px solid var(--border)", borderRight: "1px solid var(--border)" }}>{cartItem.quantity}</span>
                          <button onClick={() => updateQuantity(product.id, 1)} disabled={cartItem.quantity >= product.stockQuantity} style={{ padding: "8px 16px", background: "none", border: "none", cursor: cartItem.quantity >= product.stockQuantity ? "not-allowed" : "pointer", color: "var(--text-primary)", opacity: cartItem.quantity >= product.stockQuantity ? 0.5 : 1 }}>+</button>
                        </div>
                      ) : (
                        <button 
                          onClick={() => addToCart({ id: product.id, name: product.name, price: product.price, stockCount: product.stockQuantity, areas: product.areas || [] })}
                          className="btn btn-primary" 
                          disabled={product.stockQuantity < 1}
                          style={{ padding: "12px 24px", fontSize: "16px" }}
                        >
                          {product.stockQuantity > 0 ? "Add to Cart" : "Out of Stock"}
                        </button>
                      )}
                      {product.stockQuantity < 1 && (
                        <button
                          onClick={toggleRestockNotify}
                          disabled={restockLoading}
                          className={restockSubscribed ? "btn btn-secondary" : "btn btn-primary"}
                          style={{ padding: "12px 24px", fontSize: "16px", opacity: restockLoading ? 0.6 : 1 }}
                        >
                          {restockLoading
                            ? "..."
                            : restockSubscribed
                              ? "🔔 You'll be notified"
                              : "🔔 Notify Me When Available"}
                        </button>
                      )}
                    </div>
                  </div>

                </div>
              </div>
            </>
          )}
          <div style={{ marginTop: "40px" }}>
            <Reviews productId={product?.id} isLoggedIn={!!user} />
          </div>
        </main>
      </div>
      <SiteFooter />
      <CartWidget onOpenCart={() => setIsCheckoutOpen(true)} currency={user?.wallet?.currency} exchangeRate={user?.wallet?.exchangeRate} />
      <CheckoutModal isOpen={isCheckoutOpen} onClose={() => setIsCheckoutOpen(false)} user={user} onCheckoutSuccess={handleCheckoutSuccess} />

      {/* Image Zoom Lightbox */}
      {isImageZoomed && product?.imageUrl && (
        <div
          onClick={() => setIsImageZoomed(false)}
          style={{
            position: "fixed", inset: 0, zIndex: 2000,
            background: "rgba(0,0,0,0.85)", backdropFilter: "blur(6px)",
            display: "flex", alignItems: "center", justifyContent: "center",
            cursor: "zoom-out", padding: "24px",
          }}
        >
          <button
            onClick={() => setIsImageZoomed(false)}
            style={{
              position: "absolute", top: "20px", right: "24px",
              background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.25)",
              color: "#fff", borderRadius: "50%", width: "44px", height: "44px",
              fontSize: "20px", cursor: "pointer", lineHeight: 1,
            }}
            aria-label="Close"
          >
            ✕
          </button>
          <img
            src={product.imageUrl}
            alt={product.name}
            onClick={(e) => e.stopPropagation()}
            style={{
              maxWidth: "92vw", maxHeight: "90vh", objectFit: "contain",
              borderRadius: "12px", boxShadow: "0 20px 60px rgba(0,0,0,0.6)",
              cursor: "default",
            }}
          />
        </div>
      )}
    </div>
  );
}
