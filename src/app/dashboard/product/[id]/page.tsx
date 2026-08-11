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
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(null);
  const [locations, setLocations] = useState<any[]>([]);
  const [filterCityId, setFilterCityId] = useState("ALL");
  const [filterAreaId, setFilterAreaId] = useState("ALL");

  const { addToCart, updateQuantity, cart } = useCart();

  const variants: any[] = product?.variants || [];
  const hasVariants = variants.length > 0;

  /** Every sellable row of this product - its options, or the product itself. */
  const sellables: any[] = hasVariants ? variants : product ? [product] : [];

  /**
   * Areas the customer's filter currently allows, or null for "no filter".
   *
   * Null and "an empty set" mean opposite things here, so they must stay
   * distinct: null lets everything through, an empty set lets nothing.
   */
  const scopedAreaIds: Set<string> | null = (() => {
    if (filterAreaId !== "ALL") return new Set([filterAreaId]);
    if (filterCityId !== "ALL") {
      const city = locations.find((c: any) => c.id === filterCityId);
      return new Set<string>((city?.areas || []).map((a: any) => a.id));
    }
    return null;
  })();

  /** Units of a sellable row available inside the current filter. */
  const stockInScope = (row: any): number => {
    const details = row?.areaDetails || [];
    if (!scopedAreaIds) {
      // No filter: trust the row's own total, which also covers products that
      // track stock as a plain count with no per-area rows behind it.
      return row?.stockQuantity ?? 0;
    }
    return details
      .filter((d: any) => scopedAreaIds.has(d.areaId))
      .reduce((sum: number, d: any) => sum + (d.stockQuantity || 0), 0);
  };

  /**
   * The row that is actually bought.
   *
   * Quantity options are separate products with their own price, stock, areas
   * and delivery media, so everything below - price, stock gate, cart line -
   * has to read from the selected option, not from the parent shell.
   */
  const selected = hasVariants
    ? variants.find((v) => v.id === selectedVariantId) || null
    : product;

  const selectedStock = selected ? stockInScope(selected) : 0;
  const cartItem = cart.find((item) => item.productId === selected?.id);

  // Cities/areas this product can actually be collected from. Listing every
  // city in the system would offer filters that only ever return nothing.
  const productAreaIds = new Set<string>(
    sellables.flatMap((row: any) =>
      (row?.areaDetails || []).filter((d: any) => d.stockQuantity > 0).map((d: any) => d.areaId)
    )
  );
  const filterCities = locations
    .map((city: any) => ({
      ...city,
      areas: (city.areas || []).filter((a: any) => productAreaIds.has(a.id)),
    }))
    .filter((city: any) => city.areas.length > 0);

  // If the chosen option has nothing left in the filtered area, move to one
  // that does - leaving a dead selection on screen just looks broken.
  useEffect(() => {
    if (!hasVariants || variants.length === 0) return;
    const current = variants.find((v) => v.id === selectedVariantId);
    if (current && stockInScope(current) > 0) return;
    const replacement = variants.find((v) => stockInScope(v) > 0);
    if (replacement) setSelectedVariantId(replacement.id);
  }, [filterCityId, filterAreaId, product]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [meRes, prodRes, ordRes, locRes] = await Promise.all([
          fetch("/api/auth/me"),
          fetch("/api/inventory/products"),
          fetch("/api/orders/list"),
          // Needed to group this product's areas under their cities - the
          // product payload carries areas but not which city each belongs to.
          fetch("/api/locations"),
        ]);
        
        const meData = await meRes.json();
        if (!meData.user) {
          router.push("/auth/login");
          return;
        }
        setUser(meData.user);

        const prodData = await prodRes.json();
        let foundProd = null;
        // A quantity option is its own product row, so its id can legitimately
        // arrive here - restock alerts link straight to the option the customer
        // subscribed to. Options are listed under their parent, so resolve to
        // the parent page and open it on that option.
        let preselectVariantId: string | null = null;
        if (prodData.categories) {
          outer: for (const cat of prodData.categories) {
            for (const p of cat.products) {
              if (p.id === id) {
                foundProd = p;
                break outer;
              }
              const match = (p.variants || []).find((v: any) => v.id === id);
              if (match) {
                foundProd = p;
                preselectVariantId = match.id;
                break outer;
              }
            }
          }
        }
        try {
          const locData = await locRes.json();
          if (locData?.cities) setLocations(locData.cities);
        } catch {
          // A missing location list only costs the filter, never the page.
        }

        setProduct(foundProd);

        // Preselect the requested option, else the first one that can actually
        // be bought, so the page opens usable instead of on a disabled button.
        const opts: any[] = foundProd?.variants || [];
        if (opts.length > 0) {
          setSelectedVariantId(
            preselectVariantId || (opts.find((v) => v.stockQuantity > 0) || opts[0]).id
          );
        }

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

  // Restock alerts are per sellable row: subscribing on a parent that holds no
  // stock would never fire, so the subscription follows the chosen option.
  const notifyProductId: string | null = selected?.id ?? null;

  useEffect(() => {
    if (!notifyProductId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/products/restock?productId=${notifyProductId}`);
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setRestockSubscribed(!!data.subscribed);
      } catch {}
    })();
    return () => {
      cancelled = true;
    };
  }, [notifyProductId]);

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
    if (!notifyProductId || restockLoading) return;
    setRestockLoading(true);
    try {
      if (restockSubscribed) {
        const res = await fetch("/api/products/restock", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ productId: notifyProductId }),
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
          body: JSON.stringify({ productId: notifyProductId }),
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
                          // With quantity options the stock lives on the chosen
                          // option, so the badges must follow the selection
                          // rather than the (empty) parent row.
                          const source = hasVariants ? selected : product;
                          const areaDetails = (source?.areaDetails || []).filter(
                            (d: any) => !scopedAreaIds || scopedAreaIds.has(d.areaId)
                          );
                          const totalStock = source ? stockInScope(source) : 0;
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
                            <span className={`badge badge-${totalStock > 0 ? "in_stock" : "out_of_stock"}`}>
                              {totalStock > 0 ? "IN STOCK" : "OUT OF STOCK"} ({totalStock})
                            </span>
                          );
                        })()}
                        {product.productType && (
                          <span className="badge badge-purple">{product.productType}</span>
                        )}
                        {(() => {
                          const allAreas = (hasVariants ? selected?.areas : product.areas) || [];
                          const areas = allAreas.filter(
                            (a: any) => !scopedAreaIds || scopedAreaIds.has(a.id)
                          );
                          if (areas.length === 0) return null;
                          return (
                            <div style={{ display: "flex", gap: "8px", alignItems: "center", marginLeft: "8px", borderLeft: "1px solid var(--border)", paddingLeft: "16px" }}>
                              <span style={{ fontSize: "13px", color: "var(--text-secondary)" }}>📍 Available in:</span>
                              <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                                {areas.map((a: any) => (
                                  <span key={a.id} style={{ fontSize: "12px", background: "var(--surface-subtle)", padding: "2px 8px", borderRadius: "12px", color: "var(--text-primary)", border: "1px solid var(--border)" }}>{a.name}</span>
                                ))}
                              </div>
                            </div>
                          );
                        })()}
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
                        {selectedStock > 0
                          ? `${selectedStock} unit(s) available${scopedAreaIds ? " in the selected location" : " in stock"}`
                          : hasVariants && !selected
                            ? "Choose an option below"
                            : scopedAreaIds
                              ? "Not available in the selected location"
                              : "Currently out of stock"}
                      </p>
                    </div>

                    {/* Where to collect. Prices and stock differ per area, so
                        narrowing to a city/area first is how a customer finds
                        what is actually available to them. */}
                    {filterCities.length > 0 && (
                      <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
                        <label style={{ flex: "1 1 180px", minWidth: 0 }}>
                          <span className="form-label">City</span>
                          <select
                            className="form-input"
                            value={filterCityId}
                            onChange={(e) => { setFilterCityId(e.target.value); setFilterAreaId("ALL"); }}
                            aria-label="Filter by city"
                          >
                            <option value="ALL">Any City</option>
                            {filterCities.map((city: any) => (
                              <option key={city.id} value={city.id}>{city.name}</option>
                            ))}
                          </select>
                        </label>
                        <label style={{ flex: "1 1 180px", minWidth: 0 }}>
                          <span className="form-label">Area</span>
                          <select
                            className="form-input"
                            value={filterAreaId}
                            disabled={filterCityId === "ALL"}
                            onChange={(e) => setFilterAreaId(e.target.value)}
                            aria-label="Filter by area"
                            style={{ opacity: filterCityId === "ALL" ? 0.6 : 1 }}
                          >
                            <option value="ALL">Any Area</option>
                            {(filterCities.find((c: any) => c.id === filterCityId)?.areas || []).map((area: any) => (
                              <option key={area.id} value={area.id}>{area.name}</option>
                            ))}
                          </select>
                        </label>
                      </div>
                    )}

                    {/* Quantity options. Each is its own product row with its own
                        price and stock, so picking one switches everything below. */}
                    {hasVariants && (
                      <div>
                        <p style={{ fontSize: "13px", fontWeight: "600", marginBottom: "8px", color: "var(--text-secondary)" }}>
                          Select quantity
                        </p>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: "10px" }}>
                          {variants.map((variant) => {
                            const isSelected = variant.id === selectedVariantId;
                            // Sold out *here* - an option with units in another
                            // city is still unbuyable for this customer.
                            const scopedStock = stockInScope(variant);
                            const soldOut = scopedStock < 1;
                            return (
                              <button
                                key={variant.id}
                                type="button"
                                onClick={() => setSelectedVariantId(variant.id)}
                                aria-pressed={isSelected}
                                style={{
                                  display: "flex",
                                  flexDirection: "column",
                                  alignItems: "flex-start",
                                  gap: "2px",
                                  padding: "10px 16px",
                                  borderRadius: "var(--radius-md)",
                                  cursor: "pointer",
                                  minWidth: "104px",
                                  border: isSelected ? "2px solid var(--accent)" : "1px solid var(--border)",
                                  background: isSelected ? "var(--accent-light, var(--surface-subtle))" : "var(--surface-subtle)",
                                  color: "var(--text-primary)",
                                  opacity: soldOut ? 0.5 : 1,
                                }}
                              >
                                <span style={{ fontWeight: "700", fontSize: "15px" }}>{variant.variantLabel}</span>
                                <span style={{ fontSize: "13px", color: "var(--text-secondary)" }}>
                                  {formatPrice(variant.price, user?.wallet?.currency || "USD", user?.wallet?.exchangeRate || 1)}
                                </span>
                                <span style={{ fontSize: "11px", color: soldOut ? "var(--red)" : "var(--green)" }}>
                                  {soldOut
                                    ? scopedAreaIds
                                      ? "Not here"
                                      : "Out of stock"
                                    : `${scopedStock} left`}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                     <div style={{ display: "flex", gap: "16px", alignItems: "center", flexWrap: "wrap" }}>
                       <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                         <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                           <span style={{ fontSize: "24px", fontWeight: "800", color: "var(--text-primary)" }}>
                             {formatPrice(selected?.price ?? product.price, user?.wallet?.currency || "USD", user?.wallet?.exchangeRate || 1)}
                           </span>
                           {selected?.originalPrice != null && Number(selected.originalPrice) > Number(selected.price) && (
                             <>
                               <span style={{ fontSize: "18px", color: "var(--text-tertiary)", textDecoration: "line-through" }}>
                                 {formatPrice(Number(selected.originalPrice), user?.wallet?.currency || "USD", user?.wallet?.exchangeRate || 1)}
                               </span>
                               <span style={{ background: "var(--red)", color: "#fff", fontSize: "12px", fontWeight: "700", padding: "2px 8px", borderRadius: "12px" }}>
                                 -{Math.round(((Number(selected.originalPrice) - Number(selected.price)) / Number(selected.originalPrice)) * 100)}%
                               </span>
                             </>
                           )}
                         </div>
                       </div>
                      {cartItem && selected ? (
                        <div style={{ display: "flex", alignItems: "center", background: "var(--background)", borderRadius: "var(--radius-sm)", overflow: "hidden", border: "1px solid var(--border)" }}>
                          <button onClick={() => updateQuantity(selected.id, -1)} style={{ padding: "8px 16px", background: "none", border: "none", cursor: "pointer", color: "var(--text-primary)" }}>-</button>
                          <span style={{ padding: "8px 16px", fontWeight: "600", borderLeft: "1px solid var(--border)", borderRight: "1px solid var(--border)" }}>{cartItem.quantity}</span>
                          <button onClick={() => updateQuantity(selected.id, 1)} disabled={cartItem.quantity >= selectedStock} style={{ padding: "8px 16px", background: "none", border: "none", cursor: cartItem.quantity >= selectedStock ? "not-allowed" : "pointer", color: "var(--text-primary)", opacity: cartItem.quantity >= selectedStock ? 0.5 : 1 }}>+</button>
                        </div>
                      ) : (
                        <button
                          onClick={() => {
                            if (!selected) return;
                            addToCart({
                              id: selected.id,
                              // Variants are stored as "Parent (2g)" - keep the
                              // cart line reading the same as the order will.
                              name: hasVariants ? `${product.name} (${selected.variantLabel})` : product.name,
                              price: Number(selected.price),
                              stockCount: selectedStock,
                              areas: selected.areas || [],
                            });
                          }}
                          className="btn btn-primary"
                          disabled={!selected || selectedStock < 1}
                          style={{ padding: "12px 24px", fontSize: "16px" }}
                        >
                          {selectedStock > 0 ? "Add to Cart" : "Out of Stock"}
                        </button>
                      )}
                      {selectedStock < 1 && (
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
