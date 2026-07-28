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

  const handleLogout = async () => {
    if (window.confirm("Are you sure you want to log out?")) {
      await fetch("/api/auth/logout", { method: "POST" });
      router.push("/");
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
                    <img src={product.imageUrl} alt={product.name} style={{ width: "100%", display: "block", aspectRatio: "1/1", objectFit: "cover" }} />
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
                      <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
                        <span className={`badge badge-${product.stockQuantity > 0 ? "in_stock" : "out_of_stock"}`}>
                          {product.stockQuantity > 0 ? "IN STOCK" : "OUT OF STOCK"} ({product.stockQuantity})
                        </span>
                        {product.formula && <span style={{ fontSize: "14px", color: "var(--accent)", fontWeight: "500" }}>{product.formula}</span>}
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
                      <span style={{ fontSize: "24px", fontWeight: "800", color: "var(--text-primary)" }}>
                        {formatPrice(product.price, user?.wallet?.currency || "USD", user?.wallet?.exchangeRate || 1)}
                      </span>
                      {cartItem ? (
                        <div style={{ display: "flex", alignItems: "center", background: "var(--background)", borderRadius: "var(--radius-sm)", overflow: "hidden", border: "1px solid var(--border)" }}>
                          <button onClick={() => updateQuantity(product.id, -1)} style={{ padding: "8px 16px", background: "none", border: "none", cursor: "pointer", color: "var(--text-primary)" }}>-</button>
                          <span style={{ padding: "8px 16px", fontWeight: "600", borderLeft: "1px solid var(--border)", borderRight: "1px solid var(--border)" }}>{cartItem.quantity}</span>
                          <button onClick={() => updateQuantity(product.id, 1)} disabled={cartItem.quantity >= product.stockQuantity} style={{ padding: "8px 16px", background: "none", border: "none", cursor: cartItem.quantity >= product.stockQuantity ? "not-allowed" : "pointer", color: "var(--text-primary)", opacity: cartItem.quantity >= product.stockQuantity ? 0.5 : 1 }}>+</button>
                        </div>
                      ) : (
                        <button 
                          onClick={() => addToCart({ id: product.id, name: product.name, price: product.price, stockCount: product.stockQuantity })}
                          className="btn btn-primary" 
                          disabled={product.stockQuantity < 1}
                          style={{ padding: "12px 24px", fontSize: "16px" }}
                        >
                          {product.stockQuantity > 0 ? "Add to Cart" : "Out of Stock"}
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
    </div>
  );
}
