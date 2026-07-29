"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import ThemeToggle from "@/components/ThemeToggle";

import ParallaxIntro from "@/components/ParallaxIntro";
import Reviews from "@/components/Reviews";
import SiteFooter from "@/components/SiteFooter";
import DashboardNav from "@/components/DashboardNav";
import { formatPrice } from "@/lib/currencies";
import styles from "./dashboard.module.css";
import CartWidget from "@/components/cart/CartWidget";
import CheckoutModal from "@/components/cart/CheckoutModal";
import SkeletonLoader from "@/components/SkeletonLoader";
import { useLanguage } from "@/components/LanguageContext";

interface Product {
  id: string; name: string; description: string; price: number;
  currency: string;
  formula: string | null; casNumber: string | null; imageUrl: string | null;
  stockQuantity: number;
  cities: { id: string; name: string }[];
}
interface Category { id: string; name: string; prefixCode: string; description: string | null; products: Product[]; }
interface WalletLedger { id: string; type: string; amount: number; description: string; createdAt: string; }
interface OrderItem {
  id: string;
  productId: string;
  priceAtPurchase: number;
  status: string;
  cooldownEndAt: string | null;
  product: Product;
  adminMessage: string | null;
  adminMessageFileUrl: string | null;
  adminMessageFileType: string | null;
  adminMessageSentAt: string | null;
  cancellationReason: string | null;
  locationLink: string | null;
  pickupVideoUrl: string | null;
}

interface Order {
  id: string;
  totalAmount: number;
  currency: string;
  status: string;
  orderSource: string;
  paymentMethod: string;
  cryptoCurrency: string | null;
  cryptoAmountDue: string | null;
  paymentWalletAddress: string | null;
  coinbaseChargeUrl: string | null;
  createdAt: string;
  items: OrderItem[];
}
interface DisputeMessage {
  id: string;
  senderRole: string;
  senderName: string;
  message: string;
  createdAt: string;
}
interface Dispute {
  id: string; orderId: string; reason: string; status: string;
  resolutionType: string | null; createdAt: string;
  order: { items: { product: Product }[] };
  messages?: DisputeMessage[];
}

type Tab = "shop" | "wallet" | "orders" | "disputes" | "profile" | "settings" | "favorites" | "reviews";

const BOT_USERNAME = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME || "Camel971_bot";

export default function Dashboard() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>("shop");
  const [userOrderViewType, setUserOrderViewType] = useState<"ACTIVE" | "HISTORY">("ACTIVE");
  const [userOrderFilter, setUserOrderFilter] = useState("ALL");
  const [user, setUser] = useState<any>(null);

  const [categories, setCategories] = useState<Category[]>([]);
  const [locations, setLocations] = useState<{ id: string; name: string; areas?: { id: string; name: string }[] }[]>([]);
  const [selectedCityId, setSelectedCityId] = useState<string>("ALL");
  const [selectedAreaId, setSelectedAreaId] = useState<string>("ALL");
  const [ledgers, setLedgers] = useState<WalletLedger[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [disputes, setDisputes] = useState<Dispute[]>([]);

  const [depositAmount, setDepositAmount] = useState("");
  const [disputeReason, setDisputeReason] = useState("");
  const [selectedOrderIdForDispute, setSelectedOrderIdForDispute] = useState<string | null>(null);
  
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  
  // Raise Ticket states
  const [raiseTicketOpen, setRaiseTicketOpen] = useState(false);
  const [raiseTicketOrderId, setRaiseTicketOrderId] = useState("");
  const [raiseTicketReason, setRaiseTicketReason] = useState("");
  const [disputeMessageTexts, setDisputeMessageTexts] = useState<Record<string, string>>({}); // disputeId -> messageText

  const [walletMessage, setWalletMessage] = useState("");
  const [shopMsg, setShopMsg] = useState<{ type: "error" | "success"; text: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);

  // Deposit gateway state
  const [depositRequests, setDepositRequests] = useState<any[]>([]);
  const [cryptoWalletAddress, setCryptoWalletAddress] = useState("");
  const [pendingDeposit, setPendingDeposit] = useState<any | null>(null);
  const [showDepositInstructions, setShowDepositInstructions] = useState(false);
  const { t } = useLanguage();

  // Change password state
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrentPw, setShowCurrentPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);
  const [pwMsg, setPwMsg] = useState<{ type: "error" | "success"; text: string } | null>(null);
  const [pwLoading, setPwLoading] = useState(false);

  // Telegram settings state
  const [tgIdInput, setTgIdInput] = useState("");
  const [tgUsernameInput, setTgUsernameInput] = useState("");
  const [tgMsg, setTgMsg] = useState<{ type: "error" | "success"; text: string } | null>(null);
  const [tgLoading, setTgLoading] = useState(false);
  const tgInputsSeeded = useRef(false);

  // Crypto Modal State
  const [cryptoModalOpen, setCryptoModalOpen] = useState(false);
  const [selectedProductForCrypto, setSelectedProductForCrypto] = useState<string | null>(null);
  const [cryptoCurrency, setCryptoCurrency] = useState("BTC");
  const [cryptoPaymentInfo, setCryptoPaymentInfo] = useState<any>(null);
  const [cryptoStep, setCryptoStep] = useState<"select" | "pay">("select");

  const cryptoOptions = [
    { code: "BTC", label: "Bitcoin (BTC)", icon: "₿" },
    { code: "ETH", label: "Ethereum (ETH)", icon: "Ξ" },
    { code: "USDT_ERC20", label: "USDT (ERC-20)", icon: "₮" },
    { code: "USDT_TRC20", label: "USDT (TRC-20)", icon: "₮" },
    { code: "SOL", label: "Solana (SOL)", icon: "◎" },
    { code: "TRX", label: "Tron (TRX)", icon: "⟐" },
  ];

  const loadDashboardData = async (opts?: { seedTelegram?: boolean }) => {
    try {
      const res = await fetch("/api/dashboard/init");
      const data = await res.json();
      
      if (!res.ok || !data.user) {
        router.push("/auth/login");
        return;
      }
      
      if (["ADMIN", "SUPERADMIN", "STAFF"].includes(data.user.role)) {
        router.push("/control-panel-x7k9");
        return;
      }

      setUser(data.user);
      if (opts?.seedTelegram || !tgInputsSeeded.current) {
        setTgIdInput(data.user.telegramId || "");
        setTgUsernameInput(data.user.telegramUsername || "");
        tgInputsSeeded.current = true;
      }

      setCategories(data.categories || []);
      setLocations(data.cities || []);
      setLedgers(data.ledgers || []);
      setOrders(data.orders || []);
      setDisputes(data.disputes || []);
      setDepositRequests(data.depositRequests || []);
      setCryptoWalletAddress(data.cryptoAddress || "");

    } catch (error) {
      router.push("/auth/login");
    }
  };

  useEffect(() => {
    (async () => {
      setLoading(true);
      await loadDashboardData({ seedTelegram: true });
      setLoading(false);
    })();
  }, []);

  // Poll active orders for live data
  useEffect(() => {
    const activeStatuses = ["COOLDOWN_ACTIVE", "PROCESSING", "ON_PICKUP", "PENDING_PAYMENT"];
    const hasActive = orders.some(o => activeStatuses.includes(o.status));
    if (!hasActive) return;
    const interval = setInterval(async () => {
      const updated = await Promise.all(
        orders.map(async (order) => {
          if (activeStatuses.includes(order.status)) {
            const r = await fetch("/api/orders/status", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderId: order.id }) });
            const d = await r.json();
            if (r.ok) return d.order;
          }
          return order;
        })
      );
      setOrders(updated);
      // Auto-trigger cooldown processing if any active order is past its cooldownEndAt
      const now = new Date().getTime();
      const needsProcessing = orders.some(o => 
        o.items.some(i => i.status === "COOLDOWN_ACTIVE" && i.cooldownEndAt && new Date(i.cooldownEndAt).getTime() <= now)
      );
      if (needsProcessing) {
        await fetch("/api/cron/process-cooldowns");
      }

      const rMe = await fetch("/api/auth/me");
      const dMe = await rMe.json();
      if (dMe.user) setUser(dMe.user);
    }, 15000); // 15 seconds instead of 2.5s for massive scalability
    return () => clearInterval(interval);
  }, [orders]);

  const handleLogout = async () => {
    if (window.confirm("Are you sure you want to log out?")) {
      await fetch("/api/auth/logout", { method: "POST" });
      window.location.href = "/";
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwMsg(null);
    if (newPassword.length < 6) {
      setPwMsg({ type: "error", text: "New password must be at least 6 characters" });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPwMsg({ type: "error", text: "New passwords do not match" });
      return;
    }
    setPwLoading(true);
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        setPwMsg({ type: "error", text: data.error || "Failed to change password" });
      } else {
        setPwMsg({ type: "success", text: "Password changed successfully!" });
        setCurrentPassword(""); setNewPassword(""); setConfirmPassword("");
      }
    } catch {
      setPwMsg({ type: "error", text: "An error occurred" });
    }
    setPwLoading(false);
  };

  const handleTelegramSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTgMsg(null);
    setTgLoading(true);
    try {
      const trimmedId = tgIdInput.trim();
      const trimmedUsername = tgUsernameInput.trim();
      // Empty ID means "leave unchanged" — do not accidentally unlink a bot-linked account
      const payload: { telegramId?: string | null; telegramUsername?: string | null } = {
        telegramUsername: trimmedUsername || null,
      };
      if (trimmedId) {
        payload.telegramId = trimmedId;
      } else if (user?.telegramId) {
        payload.telegramId = user.telegramId;
      } else {
        payload.telegramId = null;
      }

      const res = await fetch("/api/auth/update-telegram", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setTgMsg({ type: "error", text: data.error || "Failed to update Telegram details" });
      } else {
        setTgMsg({ type: "success", text: "Telegram settings updated successfully!" });
        tgInputsSeeded.current = false;
        await checkSession({ seedTelegram: true });
      }
    } catch {
      setTgMsg({ type: "error", text: "An error occurred" });
    }
    setTgLoading(false);
  };

  const handleCheckoutSuccess = async () => {
    setIsCheckoutOpen(false);
    setShopMsg({ type: "success", text: "Order placed successfully! Cooldown active." });
    loadOrdersData();
    checkSession();
    setActiveTab("orders");
  };

  const handleDeposit = async (e: React.FormEvent) => {
    e.preventDefault(); setWalletMessage("");
    try {
      const r = await fetch("/api/wallet/deposit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ amount: depositAmount }) });
      const d = await r.json();
      if (!r.ok) { setWalletMessage(`Error: ${d.error}`); return; }
      
      if (d.paymentUrl) {
         setWalletMessage("Redirecting to secure payment gateway...");
         window.location.href = d.paymentUrl;
         return;
      }
      
      setPendingDeposit(d.depositRequest);
      setShowDepositInstructions(true);
      setWalletMessage(`Deposit request for ${formatPrice(parseFloat(depositAmount), user?.wallet?.currency || "USD", user?.wallet?.exchangeRate || 1)} submitted successfully!`);
      setDepositAmount("");
      loadDepositRequests();
    } catch { setWalletMessage("Error processing deposit"); }
  };

  const handleWalletBuy = async (productId: string) => {
    setShopMsg(null);
    try {
      const r = await fetch("/api/orders/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ productId }) });
      const d = await r.json();
      if (!r.ok) { setShopMsg({ type: "error", text: d.error || "Purchase failed" }); return; }
      setShopMsg({ type: "success", text: `Order placed! Cooldown active.` });
      const rMe = await fetch("/api/auth/me"); const dMe = await rMe.json(); setUser(dMe.user);
      loadShopData(); loadWalletData(); loadOrdersData();
      setActiveTab("orders");
    } catch { setShopMsg({ type: "error", text: "Error processing purchase" }); }
  };

  const handleCryptoBuy = async () => {
    if (!selectedProductForCrypto) return;
    setShopMsg(null);
    try {
      const r = await fetch("/api/orders/crypto-checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cart: [{ productId: selectedProductForCrypto, quantity: 1 }], cryptoCurrency, areaId: selectedAreaId }) });
      const d = await r.json();
      if (!r.ok) { setShopMsg({ type: "error", text: d.error || "Purchase failed" }); setCryptoModalOpen(false); return; }
      
      if (d.paymentUrl) {
         setShopMsg({ type: "success", text: "Redirecting to secure payment gateway..." });
         window.location.href = d.paymentUrl;
         return;
      }
      
      setCryptoPaymentInfo(d.order);
      setCryptoStep("pay");
      loadShopData(); loadOrdersData();
    } catch { setShopMsg({ type: "error", text: "Error processing crypto purchase" }); }
  };

  const handleCryptoModalClose = () => {
    setCryptoModalOpen(false);
    setCryptoStep("select");
    setCryptoPaymentInfo(null);
    setSelectedProductForCrypto(null);
  };

  const checkOrderStatus = async (orderId: string) => {
    try {
      const r = await fetch("/api/orders/status", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderId }) });
      const d = await r.json();
      if (r.ok) setOrders(orders.map(o => o.id === orderId ? d.order : o));
    } catch {}
  };

  const completeOrder = async (orderId: string) => {
    try {
      const r = await fetch("/api/orders/complete", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderId }) });
      const d = await r.json();
      if (r.ok) setOrders(orders.map(o => o.id === orderId ? d.order : o));
    } catch {}
  };

  const handleDisputeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrderIdForDispute) return;
    try {
      const r = await fetch("/api/disputes/submit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderId: selectedOrderIdForDispute, reason: disputeReason }) });
      if (r.ok) { setSelectedOrderIdForDispute(null); setDisputeReason(""); loadDisputesData(); loadOrdersData(); setActiveTab("disputes"); }
    } catch {}
  };

  const handleSendDisputeMessage = async (disputeId: string) => {
    const text = (disputeMessageTexts[disputeId] || "").trim();
    if (!text) return;
    try {
      const r = await fetch("/api/disputes/message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ disputeId, message: text })
      });
      if (r.ok) {
        setDisputeMessageTexts(prev => ({ ...prev, [disputeId]: "" }));
        loadDisputesData();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleRaiseTicketSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!raiseTicketOrderId || !raiseTicketReason.trim()) return;
    try {
      const r = await fetch("/api/disputes/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: raiseTicketOrderId, reason: raiseTicketReason })
      });
      if (r.ok) {
        setRaiseTicketOpen(false);
        setRaiseTicketOrderId("");
        setRaiseTicketReason("");
        loadDisputesData();
        loadOrdersData();
      }
    } catch (e) {
      console.error(e);
    }
  };




  const tabs: { key: Tab; label: string; icon: string }[] = [
    { key: "shop", label: "Products", icon: "🛒" },
    { key: "wallet", label: "Wallet", icon: "💳" },
    { key: "orders", label: "Orders", icon: "📦" },
    { key: "disputes", label: "Disputes", icon: "⚖️" },
    { key: "profile", label: "Profile", icon: "👤" },
    { key: "settings", label: "Settings", icon: "⚙️" },
  ];

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Please upload an image file.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      alert('File is too large. Maximum size is 5MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = async () => {
        const canvas = document.createElement('canvas');
        const MAX_SIZE = 256;
        let width = img.width;
        let height = img.height;

        if (width > height && width > MAX_SIZE) {
          height *= MAX_SIZE / width;
          width = MAX_SIZE;
        } else if (height > MAX_SIZE) {
          width *= MAX_SIZE / height;
          height = MAX_SIZE;
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, width, height);
        
        // Compress to high quality JPEG
        const base64 = canvas.toDataURL('image/jpeg', 0.9);
        
        try {
          const res = await fetch('/api/auth/update-avatar', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ image: base64 })
          });
          if (res.ok) {
            const dMe = await (await fetch('/api/auth/me')).json();
            if (dMe.user) setUser(dMe.user);
          }
        } catch (err) {
          console.error("Avatar upload failed", err);
        }
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  return (
    <>
      <ParallaxIntro />
      <div className={styles.shell}>
        {/* Header */}
      <DashboardNav
        user={user || { username: "Loading...", role: "CUSTOMER" } as any}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onLogout={handleLogout}
        hasActiveOrders={orders.some(o => o.status === "COOLDOWN_ACTIVE")}
        botUsername={BOT_USERNAME}
      />

      <div className={styles.content}>
        <main className={styles.section}>
          {loading ? (
            <SkeletonLoader />
          ) : !user ? null : (
            <>
              {/* SHOP */}
          {activeTab === "shop" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
              <section className={styles.dashboardHero}>
                <div>
                  <p className={styles.heroKicker}>Camel971marketplace</p>
                  <h1>{t("dash.title")}</h1>
                  <p>{t("dash.subtitle")}</p>
                </div>
                <div style={{ display: "flex", gap: "16px", flexWrap: "wrap" }}>
                  <label style={{ flex: 1, minWidth: "200px" }}>
                    <span className="form-label">{t("dash.city")}</span>
                    <select 
                      className={styles.citySelect} 
                      value={selectedCityId}
                      onChange={e => { setSelectedCityId(e.target.value); setSelectedAreaId("ALL"); }}
                      aria-label={t("dash.city")}
                    >
                      <option value="ALL">{t("dash.anycity")}</option>
                      {locations.map(loc => (
                        <option key={loc.id} value={loc.id}>{loc.name}</option>
                      ))}
                    </select>
                  </label>

                  {selectedCityId !== "ALL" && (locations.find(l => l.id === selectedCityId)?.areas?.length ?? 0) > 0 && (
                    <label style={{ flex: 1, minWidth: "200px" }}>
                      <span className="form-label">{t("dash.area")}</span>
                      <select 
                        className={styles.citySelect} 
                        value={selectedAreaId}
                        onChange={e => setSelectedAreaId(e.target.value)}
                        aria-label={t("dash.area")}
                      >
                        <option value="ALL">{t("dash.anyarea")}</option>
                        {locations.find(l => l.id === selectedCityId)?.areas?.map(area => (
                          <option key={area.id} value={area.id}>{area.name}</option>
                        ))}
                      </select>
                    </label>
                  )}
                </div>
              </section>
              {/* Telegram Bot Banner */}
              <div style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                background: "var(--bg-secondary)",
                border: "1px solid var(--border)", borderRadius: "var(--radius-lg)",
                padding: "14px 20px", gap: "16px", flexWrap: "wrap",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                  <span style={{ fontSize: "22px", background: "var(--accent-light)", borderRadius: "10px", padding: "8px", lineHeight: 1 }}>🤖</span>
                  <div>
                    <p style={{ fontWeight: 700, fontSize: "14px", margin: 0, color: "var(--text-primary)" }}>{t("dash.bot.title")}</p>
                    <p style={{ fontSize: "12px", margin: 0, color: "var(--text-secondary)" }}>{t("dash.bot.desc")}</p>
                  </div>
                </div>
                <a href={`https://t.me/${BOT_USERNAME}`} target="_blank" rel="noopener noreferrer"
                  className="btn btn-primary btn-sm"
                  style={{ gap: "6px", whiteSpace: "nowrap" }}>
                  {t("dash.bot.btn")}
                </a>
              </div>

              {shopMsg && (
                <div className={`alert ${shopMsg.type === "error" ? "alert-error" : "alert-success"}`}>
                  {shopMsg.text}
                </div>
              )}

              {categories.length === 0 ? (
                <div className="card" style={{ textAlign: "center", padding: "60px" }}>
                  <p style={{ color: "var(--text-secondary)" }}>No products available yet. Check back soon!</p>
                </div>
              ) : (
                <div className="product-grid">
                  {categories.flatMap(category => category.products).map(product => (
                    <div key={product.id} className="card card-interactive product-card-layout animate-fade-in">
                      <div className="product-card-top">
                        <div className="product-card-info">
                          <h4 style={{ marginBottom: "2px" }}>{product.name}</h4>
                          <div style={{ display: "flex", gap: "8px", marginBottom: "4px", flexWrap: "wrap" }}>
                            {product.formula && <span style={{ fontSize: "12px", color: "var(--accent)", fontWeight: "500" }}>{product.formula}</span>}
                            {product.casNumber && <span style={{ fontSize: "12px", color: "var(--text-tertiary)" }}>CAS: {product.casNumber}</span>}
                          </div>
                          <div style={{ marginBottom: "4px", display: "flex", flexWrap: "wrap", gap: "6px" }}>
                            {(() => {
                              const areaDetails = (product as any).areaDetails || [];
                              const hasAreaStock = areaDetails.some((d: any) => d.stockQuantity > 0);
                              if (hasAreaStock) {
                                return areaDetails.filter((d: any) => d.stockQuantity > 0).map((d: any) => (
                                  <span key={d.areaId} className="badge badge-in_stock" style={{ fontSize: "11px" }}>
                                    {d.area?.name || "Area"} ({d.stockQuantity})
                                  </span>
                                ));
                              }
                              return (
                                <span className={`badge badge-${product.stockQuantity > 0 ? "in_stock" : "out_of_stock"}`}>
                                  {product.stockQuantity > 0 ? "IN_STOCK" : "OUT_OF_STOCK"} ({product.stockQuantity})
                                </span>
                              );
                            })()}
                            {(() => {
                              if (selectedCityId === "ALL") return null;
                              const availableInCity = product.cities.some((c: any) => c.id === selectedCityId);
                              if (!availableInCity) {
                                return <span className="badge badge-red" style={{ opacity: 0.8 }}>Not available in selected city</span>;
                              }
                              if (selectedAreaId !== "ALL") {
                                const availableInArea = (product as any).areas?.some((a: any) => a.id === selectedAreaId);
                                if (!availableInArea) {
                                  return <span className="badge badge-red" style={{ opacity: 0.8 }}>Not available in selected area</span>;
                                }
                              }
                              return <span className="badge badge-purple" style={{ opacity: 0.8 }}>📍 Available in selected location</span>;
                            })()}
                          </div>
                          {product.description && (
                            <p style={{ fontSize: "13px", color: "var(--text-secondary)", marginTop: "4px", lineHeight: "1.5" }}>
                              {product.description}
                            </p>
                          )}
                        </div>
                        {product.imageUrl && (
                          <div className="product-card-image">
                            <img src={product.imageUrl} alt={product.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                          </div>
                        )}
                      </div>
                      <div className="product-card-bottom">
                        <span className="product-card-price">{formatPrice(product.price, user?.wallet?.currency || "USD", user?.wallet?.exchangeRate || 1)}</span>
                        <div style={{ display: "flex", flexDirection: "column", gap: "8px", alignItems: "flex-end" }}>
                          {(() => {
                            let isAvailable = product.stockQuantity > 0;
                            if (selectedCityId !== "ALL" && !product.cities.some((c: any) => c.id === selectedCityId)) isAvailable = false;
                            if (selectedCityId !== "ALL" && selectedAreaId !== "ALL" && !(product as any).areas?.some((a: any) => a.id === selectedAreaId)) isAvailable = false;

                            return (
                              <Link
                                href={isAvailable ? `/dashboard/product/${product.id}` : "#"}
                                onClick={(e) => { if (!isAvailable) { e.preventDefault(); alert("Product is out of stock or unavailable in your selected location."); } }}
                                className={`btn ${isAvailable ? "btn-primary" : "btn-secondary"} btn-sm`}
                                style={{ width: "100%", opacity: isAvailable ? 1 : 0.6, cursor: isAvailable ? "pointer" : "not-allowed" }}
                              >
                                {t("product.view")}
                              </Link>
                            );
                          })()}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Crypto Payment Modal */}
              {cryptoModalOpen && (
                <div style={{
                  position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
                  background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000,
                  backdropFilter: "blur(4px)", padding: "16px"
                }}>
                  <div className="card" style={{ width: "100%", maxWidth: "480px", background: "var(--bg-primary)", maxHeight: "90vh", overflowY: "auto" }}>
                    {cryptoStep === "select" ? (
                      <>
                        <h3 style={{ marginBottom: "8px" }}>Select Cryptocurrency</h3>
                        <p style={{ fontSize: "14px", color: "var(--text-secondary)", marginBottom: "20px" }}>
                          Choose which cryptocurrency to pay with. Network fees are borne by the sender.
                        </p>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "24px" }}>
                          {cryptoOptions.map(opt => (
                            <button
                              key={opt.code}
                              onClick={() => setCryptoCurrency(opt.code)}
                              className={`btn ${cryptoCurrency === opt.code ? "btn-primary" : "btn-secondary"}`}
                              style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "6px", fontSize: "13px", padding: "12px 8px" }}
                            >
                              <span style={{ fontSize: "16px" }}>{opt.icon}</span> {opt.label}
                            </button>
                          ))}
                        </div>
                        <div style={{ display: "flex", gap: "12px" }}>
                          <button onClick={handleCryptoBuy} className="btn btn-primary" style={{ flex: 1 }}>Proceed</button>
                          <button onClick={handleCryptoModalClose} className="btn btn-ghost" style={{ flex: 1 }}>Cancel</button>
                        </div>
                      </>
                    ) : cryptoPaymentInfo ? (
                      <>
                        <h3 style={{ marginBottom: "8px" }}>💰 Send Payment</h3>
                        <p style={{ fontSize: "13px", color: "var(--text-secondary)", marginBottom: "20px" }}>
                          Send the exact amount to the address below. Your order will be confirmed once the admin verifies the transaction on-chain.
                        </p>

                        <div style={{ background: "var(--bg-secondary)", borderRadius: "var(--radius-md)", padding: "16px", marginBottom: "16px", border: "1px solid var(--border)" }}>
                          <p style={{ fontSize: "12px", color: "var(--text-tertiary)", marginBottom: "4px", textTransform: "uppercase", fontWeight: "600" }}>Product</p>
                          <p style={{ fontWeight: "600", marginBottom: "12px" }}>{cryptoPaymentInfo.productName}</p>

                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "12px" }}>
                            <div>
                              <p style={{ fontSize: "12px", color: "var(--text-tertiary)", marginBottom: "2px" }}>Order Amount</p>
                              <p style={{ fontWeight: "600", color: "var(--green)" }}>{formatPrice(cryptoPaymentInfo.amountPaid, user?.wallet?.currency || "USD", user?.wallet?.exchangeRate || 1)}</p>
                            </div>
                            <div>
                              <p style={{ fontSize: "12px", color: "var(--text-tertiary)", marginBottom: "2px" }}>Network Fee (est.)</p>
                              <p style={{ fontWeight: "600", color: "var(--orange)" }}>{formatPrice(cryptoPaymentInfo.networkFee, user?.wallet?.currency || "USD", user?.wallet?.exchangeRate || 1)}</p>
                            </div>
                          </div>

                          <div style={{ borderTop: "1px solid var(--border)", paddingTop: "12px" }}>
                            <p style={{ fontSize: "12px", color: "var(--text-tertiary)", marginBottom: "2px" }}>Total Payable ({cryptoPaymentInfo.cryptoName})</p>
                            <p style={{ fontWeight: "800", fontSize: "20px", color: "var(--accent)" }}>{formatPrice(cryptoPaymentInfo.totalDue, user?.wallet?.currency || "USD", user?.wallet?.exchangeRate || 1)} <span style={{ fontSize: "13px", color: "var(--text-secondary)", fontWeight: "400" }}>in {cryptoPaymentInfo.cryptoName}</span></p>
                          </div>
                        </div>

                        <div style={{ marginBottom: "20px" }}>
                          <p style={{ fontSize: "12px", color: "var(--text-tertiary)", marginBottom: "6px", textTransform: "uppercase", fontWeight: "600" }}>
                            Send {cryptoPaymentInfo.cryptoName} to this address ({cryptoPaymentInfo.network} network)
                          </p>
                          <div style={{
                            background: "var(--bg-secondary)", padding: "12px", borderRadius: "var(--radius-sm)",
                            fontFamily: "monospace", fontSize: "13px", border: "1px solid var(--border)",
                            wordBreak: "break-all", userSelect: "all",
                          }}>
                            {cryptoPaymentInfo.walletAddress}
                          </div>
                        </div>

                        <p style={{ fontSize: "12px", color: "var(--text-tertiary)", marginBottom: "16px" }}>
                          ⚠️ Send the exact amount in {cryptoPaymentInfo.cryptoName}. Network fees are your responsibility. Once you send payment, the admin will verify the blockchain transaction and process your order.
                        </p>

                        <div style={{ display: "flex", gap: "12px" }}>
                          <button onClick={() => { handleCryptoModalClose(); setActiveTab("orders"); }} className="btn btn-primary" style={{ flex: 1 }}>I Have Paid</button>
                          <button onClick={handleCryptoModalClose} className="btn btn-ghost" style={{ flex: 1 }}>Close</button>
                        </div>
                      </>
                    ) : null}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* WALLET */}
          {activeTab === "wallet" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
              <h2>Wallet</h2>

              <div className="grid-2col">
                {showDepositInstructions && pendingDeposit ? (
                  <div className="card" style={{ border: "1px solid var(--accent)", background: "rgba(0, 113, 227, 0.05)" }}>
                    <h3 style={{ marginBottom: "12px", color: "var(--accent)" }}>💵 Send Crypto Payment</h3>
                    <p style={{ fontSize: "14px", color: "var(--text-secondary)", marginBottom: "16px" }}>
                      Your deposit of <strong>{formatPrice(pendingDeposit.amount, user?.wallet?.currency || "USD", user?.wallet?.exchangeRate || 1)}</strong> is currently <strong>PENDING verification</strong>. Please transfer the amount to the address below:
                    </p>
                    
                    <div style={{ marginBottom: "16px" }}>
                      <label className="form-label" style={{ fontSize: "11px", fontWeight: "bold" }}>Receiving Address</label>
                      <div style={{
                        background: "var(--bg-secondary)", padding: "12px", borderRadius: "var(--radius-sm)",
                        fontFamily: "monospace", fontSize: "14px", border: "1px solid var(--border)",
                        wordBreak: "break-all", userSelect: "all", display: "flex", justifyContent: "space-between", alignItems: "center"
                      }}>
                        <span>{cryptoWalletAddress}</span>
                      </div>
                    </div>

                    <p style={{ fontSize: "12px", color: "var(--text-tertiary)", marginBottom: "20px" }}>
                      ⚠️ Once payment is completed, the admin will verify the ledger and update your wallet balance.
                    </p>
                    
                    <button onClick={() => { setShowDepositInstructions(false); setPendingDeposit(null); }} className="btn btn-primary btn-sm" style={{ width: "100%" }}>
                      I Have Paid
                    </button>
                  </div>
                ) : (
                  <div className="card">
                    <p style={{ fontSize: "13px", color: "var(--text-secondary)", marginBottom: "4px" }}>Available Balance</p>
                    <h1 style={{ color: "var(--green)", marginBottom: "24px" }}>{formatPrice(user.wallet.balance, user.wallet.currency || "USD", user?.wallet?.exchangeRate || 1)}</h1>

                    {walletMessage && (
                      <div className={walletMessage.startsWith("Error") ? "alert alert-error" : "alert alert-success"}>
                        {walletMessage}
                      </div>
                    )}

                    <form onSubmit={handleDeposit} style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="form-label">Deposit Amount ({user?.wallet?.currency === 'EUR' ? '€' : '$'})</label>
                        <input className="form-input" type="number" step="0.01" value={depositAmount} onChange={e => setDepositAmount(e.target.value)} required placeholder="100.00" />
                      </div>
                      <button type="submit" className="btn btn-primary" style={{ width: "100%" }}>
                        Deposit via Crypto
                      </button>
                    </form>
                    <p style={{ fontSize: "12px", color: "var(--text-tertiary)", marginTop: "12px", textAlign: "center" }}>
                      Crypto payments only • Closed-loop wallet • No withdrawals
                    </p>
                  </div>
                )}

                <div className="card">
                  <h3 style={{ marginBottom: "16px" }}>Wallet Rules</h3>
                  <ul style={{ paddingLeft: "20px", color: "var(--text-secondary)", fontSize: "14px", lineHeight: "2" }}>
                    <li>This is a <strong>closed-loop wallet</strong>. No external withdrawals.</li>
                    <li>Deposits are made via crypto transfer and must be approved by the admin.</li>
                    <li>Every transaction is logged in a permanent ledger.</li>
                    <li>Refunds are credited directly to your balance.</li>
                  </ul>
                </div>
              </div>

              {/* Deposit Requests */}
              <div className="card">
                <h3 style={{ marginBottom: "16px" }}>Deposit Requests</h3>
                {depositRequests.length === 0 ? (
                  <p style={{ color: "var(--text-secondary)", fontSize: "14px" }}>No deposit requests yet.</p>
                ) : (
                <div className="table-scroll-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Amount</th>
                        <th>Status</th>
                        <th>Address</th>
                      </tr>
                    </thead>
                    <tbody>
                      {depositRequests.map(req => (
                        <tr key={req.id}>
                          <td style={{ fontSize: "13px", color: "var(--text-tertiary)" }}>{new Date(req.createdAt).toLocaleString()}</td>
                          <td style={{ fontWeight: "600" }}>{formatPrice(req.amount, user?.wallet?.currency || "USD", user?.wallet?.exchangeRate || 1)}</td>
                          <td>
                            <span className={`badge ${
                              req.status === "APPROVED" ? "badge-green" :
                              req.status === "PENDING" ? "badge-orange" : "badge-red"
                            }`}>
                              {req.status}
                            </span>
                          </td>
                          <td style={{ fontFamily: "monospace", fontSize: "12px", color: "var(--text-secondary)" }}>
                            {cryptoWalletAddress.slice(0, 10)}...{cryptoWalletAddress.slice(-6)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                )}
              </div>

              <div className="card">
                <h3 style={{ marginBottom: "16px" }}>Transaction History</h3>
                {ledgers.length === 0 ? (
                  <p style={{ color: "var(--text-secondary)", fontSize: "14px" }}>No transactions yet.</p>
                ) : (
                <div className="table-scroll-wrap">
                  <table>
                    <thead><tr><th>Date</th><th>Type</th><th>Amount</th><th>Description</th></tr></thead>
                    <tbody>
                      {ledgers.map(log => (
                        <tr key={log.id}>
                          <td style={{ fontSize: "13px", color: "var(--text-tertiary)" }}>{new Date(log.createdAt).toLocaleString()}</td>
                          <td><span className={`badge ${log.type === "DEPOSIT" || log.type === "REFUND" ? "badge-green" : "badge-red"}`}>{log.type}</span></td>
                          <td style={{ fontWeight: "600", color: log.amount > 0 ? "var(--green)" : "var(--red)" }}>
                            {log.amount > 0 ? `+${formatPrice(log.amount, user?.wallet?.currency || "USD", user?.wallet?.exchangeRate || 1)}` : `-${formatPrice(Math.abs(log.amount), user?.wallet?.currency || "USD", user?.wallet?.exchangeRate || 1)}`}
                          </td>
                          <td style={{ color: "var(--text-secondary)" }}>{log.description}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                )}
              </div>
            </div>
          )}

          {/* ORDERS */}
          {activeTab === "orders" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px" }}>
                <h2>My Orders</h2>
                <div style={{ display: "flex", background: "var(--bg-secondary)", borderRadius: "8px", padding: "4px" }}>
                  <button 
                    onClick={() => { setUserOrderViewType("ACTIVE"); setUserOrderFilter("ALL"); }}
                    className={`btn btn-sm ${userOrderViewType === "ACTIVE" ? "btn-primary" : "btn-ghost"}`}
                    style={{ borderRadius: "6px" }}
                  >
                    Active Orders
                  </button>
                  <button 
                    onClick={() => { setUserOrderViewType("HISTORY"); setUserOrderFilter("ALL"); }}
                    className={`btn btn-sm ${userOrderViewType === "HISTORY" ? "btn-primary" : "btn-ghost"}`}
                    style={{ borderRadius: "6px" }}
                  >
                    Order History
                  </button>
                </div>
              </div>
              
              {/* Horizontal Status Tabs */}
              <div style={{ display: "flex", gap: "8px", overflowX: "auto", paddingBottom: "8px" }}>
                {(userOrderViewType === "ACTIVE" 
                  ? ["ALL", "ORDERED", "PROCESSING", "ON_PICKUP"] 
                  : ["ALL", "COMPLETED", "CANCELLED"]
                ).map(status => (
                  <button 
                    key={status}
                    onClick={() => setUserOrderFilter(status)}
                    className={`btn btn-sm ${status === userOrderFilter ? "btn-primary" : "btn-secondary"}`}
                  >
                    {status.replace("_", " ")}
                  </button>
                ))}
              </div>

              {(() => {
                const filteredOrders = orders.filter(o => {
                  const isActive = !["COMPLETED", "CANCELLED"].includes(o.status);
                  if (userOrderViewType === "ACTIVE" && !isActive) return false;
                  if (userOrderViewType === "HISTORY" && isActive) return false;
                  if (userOrderFilter !== "ALL" && o.status !== userOrderFilter) return false;
                  return true;
                });

                if (filteredOrders.length === 0) {
                  return (
                    <div className="card" style={{ textAlign: "center", padding: "60px" }}>
                      <p style={{ color: "var(--text-secondary)" }}>No orders match this status.</p>
                    </div>
                  );
                }

                return filteredOrders.map(order => {
                  return (
                    <div key={order.id} className="card" style={{
                      borderLeft: `4px solid ${
                        order.status === "COMPLETED" ? "var(--green)" :
                        order.status === "CANCELLED" ? "var(--red)" : "var(--accent)"
                      }`,
                      marginBottom: "24px"
                    }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", borderBottom: "1px solid var(--border)", paddingBottom: "12px", flexWrap: "wrap", gap: "8px" }}>
                        <div>
                          <p style={{ fontSize: "12px", color: "var(--text-tertiary)", fontFamily: "monospace" }}>ORDER #{order.id.slice(0, 8)}</p>
                          <span style={{ fontSize: "13px", color: "var(--text-tertiary)" }}>{new Date(order.createdAt).toLocaleString()}</span>
                        </div>
                        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                          <span className={`badge ${
                            order.status === "COMPLETED" ? "badge-green" :
                            order.status === "CANCELLED" ? "badge-red" :
                            order.status === "ON_PICKUP" ? "badge-blue" : ""
                          }`}>{order.status.replace(/_/g, " ")}</span>
                        </div>
                      </div>

                      {order.status === "PENDING_PAYMENT" && order.coinbaseChargeUrl && (
                        <div style={{
                          background: "var(--red-bg)", padding: "14px",
                          borderRadius: "var(--radius-md)", marginBottom: "16px",
                          display: "flex", justifyContent: "space-between", alignItems: "center",
                          border: "1px solid rgba(255, 59, 48, 0.2)"
                        }}>
                          <div>
                            <p style={{ color: "var(--red)", fontWeight: "600", fontSize: "14px" }}>Awaiting Payment</p>
                            <p style={{ fontSize: "13px", color: "var(--text-secondary)" }}>Please pay using your selected cryptocurrency.</p>
                          </div>
                          <a href={order.coinbaseChargeUrl} target="_blank" rel="noreferrer" className="btn btn-primary btn-sm" style={{ background: "var(--red)", border: "none" }}>
                            Pay Now
                          </a>
                        </div>
                      )}

                      <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                        {order.items.reduce((acc: any[], item: any) => {
                          const existing = acc.find(x => 
                            x.productId === item.productId &&
                            x.areaId === item.areaId &&
                            x.status === item.status &&
                            x.locationLink === item.locationLink &&
                            x.pickupVideoUrl === item.pickupVideoUrl &&
                            x.adminMessage === item.adminMessage &&
                            x.cancellationReason === item.cancellationReason
                          );
                          if (existing) {
                            existing.groupQuantity += 1;
                            existing.groupTotal += Number(item.priceAtPurchase);
                          } else {
                            acc.push({ ...item, groupQuantity: 1, groupTotal: Number(item.priceAtPurchase) });
                          }
                          return acc;
                        }, []).map((item: any) => {
                          const isCooldown = item.status === "COOLDOWN_ACTIVE";
                          const secondsLeft = item.cooldownEndAt ? Math.max(0, Math.ceil((new Date(item.cooldownEndAt).getTime() - Date.now()) / 1000)) : 0;
                          return (
                            <div key={item.id} style={{ background: "var(--surface-subtle)", padding: "16px", borderRadius: "var(--radius-md)", border: "1px solid var(--border)" }}>
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px", flexWrap: "wrap", gap: "8px" }}>
                                <div>
                                  <h4 style={{ fontSize: "16px", marginBottom: "4px" }}>
                                    {item.groupQuantity > 1 ? `${item.groupQuantity}x ` : ""}{item.product.name}
                                  </h4>
                                  <p style={{ fontSize: "13px", color: "var(--text-secondary)" }}>
                                    {item.groupQuantity > 1 ? "Total " : ""}Price: {formatPrice(item.groupTotal, user?.wallet?.currency || "USD", user?.wallet?.exchangeRate || 1)}
                                  </p>
                                </div>
                                <span className={`badge ${
                                  item.status === "COMPLETED" ? "badge-green" :
                                  item.status === "ON_PICKUP" ? "badge-blue" :
                                  item.status === "CANCELLED" ? "badge-red" :
                                  item.status === "PROCESSING" ? "badge-orange" : ""
                                }`}>{item.status.replace(/_/g, " ")}</span>
                              </div>

                              {item.status === "CANCELLED" && item.cancellationReason && (
                                <div style={{
                                  background: "var(--red-bg)", padding: "10px 14px",
                                  borderRadius: "var(--radius-sm)", marginBottom: "12px",
                                  border: "1px solid rgba(255, 59, 48, 0.2)"
                                }}>
                                  <p style={{ fontSize: "13px", color: "var(--red)", fontWeight: "600", marginBottom: "4px" }}>Order Cancelled</p>
                                  <p style={{ fontSize: "13px", color: "var(--text-secondary)" }}>{item.cancellationReason}</p>
                                </div>
                              )}

                              {isCooldown && (
                                <div style={{
                                  background: "var(--orange-bg)", padding: "10px 14px",
                                  borderRadius: "var(--radius-sm)", marginBottom: "12px",
                                  display: "flex", justifyContent: "space-between", alignItems: "center",
                                }}>
                                  <p style={{ fontSize: "13px", color: "var(--orange)" }}>Preparing your batch allocation...</p>
                                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                                    <span style={{ fontWeight: "700", color: "var(--orange)", fontFamily: "monospace" }}>
                                      {secondsLeft > 0 ? `${secondsLeft}s` : "Ready"}
                                    </span>
                                    <button onClick={() => checkOrderStatus(order.id)} className="btn btn-secondary btn-sm">Check</button>
                                  </div>
                                </div>
                              )}

                              {item.status === "ON_PICKUP" && (
                                <div style={{
                                  background: "var(--blue-bg)", padding: "14px",
                                  borderRadius: "var(--radius-md)", marginBottom: "12px",
                                  border: "1px solid rgba(0, 122, 255, 0.2)"
                                }}>
                                  <p style={{ fontSize: "12px", color: "var(--blue)", marginBottom: "6px", fontWeight: "600", textTransform: "uppercase" }}>
                                    📍 Ready for Pickup
                                  </p>
                                  {item.adminMessage && (
                                    <p style={{ fontSize: "14px", color: "var(--text-primary)", whiteSpace: "pre-wrap", fontFamily: "monospace", marginBottom: "12px" }}>
                                      {item.adminMessage}
                                    </p>
                                  )}
                                  
                                  <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", marginBottom: "12px" }}>
                                    {item.locationLink && (
                                      <a href={item.locationLink} target="_blank" rel="noreferrer" className="btn btn-primary btn-sm">
                                        🗺️ View Location on Map
                                      </a>
                                    )}
                                    {item.pickupVideoUrl && (
                                      <a href={item.pickupVideoUrl} target="_blank" rel="noreferrer" className="btn btn-secondary btn-sm">
                                        🎥 Watch Video Guide
                                      </a>
                                    )}
                                  </div>
                                  {item.adminMessageFileUrl && (
                                    <div style={{ marginTop: "12px" }}>
                                      {item.adminMessageFileType?.startsWith("image/") ? (
                                        <img src={item.adminMessageFileUrl} alt="Delivery attachment" style={{ maxWidth: "100%", maxHeight: "250px", borderRadius: "8px", border: "1px solid var(--border)" }} />
                                      ) : item.adminMessageFileType?.startsWith("video/") ? (
                                        <video src={item.adminMessageFileUrl} controls style={{ maxWidth: "100%", maxHeight: "250px", borderRadius: "8px", border: "1px solid var(--border)" }} />
                                      ) : (
                                        <a href={item.adminMessageFileUrl} download className="btn btn-secondary btn-sm" style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                                          📥 Download Attachment ({item.adminMessageFileType?.split("/")[1]?.toUpperCase() || "File"})
                                        </a>
                                      )}
                                    </div>
                                  )}
                                  {item.adminMessageSentAt && (
                                    <p style={{ fontSize: "11px", color: "var(--text-tertiary)", marginTop: "8px", textAlign: "right" }}>
                                      Sent at {new Date(item.adminMessageSentAt).toLocaleString()}
                                    </p>
                                  )}
                                </div>
                              )}

                                <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "12px" }}>
                                  {item.status === "ON_PICKUP" && (
                                    <button onClick={() => completeOrder(order.id)} className="btn btn-primary btn-sm">Confirm Received</button>
                                  )}
                                  {(item.status === "ON_PICKUP" || item.status === "COMPLETED") && (
                                    <button
                                      onClick={() => { setSelectedOrderIdForDispute(order.id); setActiveTab("disputes"); }}
                                      className="btn btn-ghost btn-sm"
                                      style={{ color: "var(--orange)" }}
                                    >
                                      File Dispute
                                    </button>
                                  )}
                                </div>
                            </div>
                          );
                        })}
                      </div>

                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid var(--border)", paddingTop: "12px", marginTop: "16px", flexWrap: "wrap", gap: "8px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                          <span style={{ fontWeight: "600" }}>Total: {formatPrice(Number(order.totalAmount), user?.wallet?.currency || "USD", user?.wallet?.exchangeRate || 1)}</span>
                          {order.paymentMethod === "DIRECT_CRYPTO" ? (
                            <span className="badge badge-purple" style={{ fontSize: "10px" }}>Paid via {order.cryptoCurrency}</span>
                          ) : (
                            <span className="badge badge-green" style={{ fontSize: "10px" }}>Paid via Wallet</span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
          )}

          {/* DISPUTES */}
          {activeTab === "disputes" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px" }}>
                <h2>Support Tickets & Disputes</h2>
                {!raiseTicketOpen && !selectedOrderIdForDispute && (
                  <button onClick={() => setRaiseTicketOpen(true)} className="btn btn-primary btn-sm">
                    🎟 Raise a Ticket
                  </button>
                )}
              </div>

              {raiseTicketOpen && (
                <div className="card">
                  <h3 style={{ marginBottom: "12px" }}>Raise a Support Ticket</h3>
                  <form onSubmit={handleRaiseTicketSubmit} style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label">Select Order</label>
                      <select className="form-input" value={raiseTicketOrderId} onChange={e => setRaiseTicketOrderId(e.target.value)} required>
                        <option value="">Choose an order...</option>
                        {orders.map(o => (
                          <option key={o.id} value={o.id}>
                            Order #{o.id.slice(0,8)} - {o.items.map(i => i.product.name).join(", ")} ({formatPrice(Number(o.totalAmount), user?.wallet?.currency || "USD", user?.wallet?.exchangeRate || 1)})
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label">Describe your problem</label>
                      <textarea className="form-input" rows={3} value={raiseTicketReason} onChange={e => setRaiseTicketReason(e.target.value)} required placeholder="Describe what went wrong or what you need support with..." />
                    </div>
                    <div style={{ display: "flex", gap: "8px" }}>
                      <button type="submit" className="btn btn-primary btn-sm">Submit Ticket</button>
                      <button type="button" onClick={() => setRaiseTicketOpen(false)} className="btn btn-ghost btn-sm">Cancel</button>
                    </div>
                  </form>
                </div>
              )}

              {selectedOrderIdForDispute && (
                <div className="card">
                  <h3 style={{ marginBottom: "12px" }}>File a Dispute</h3>
                  <form onSubmit={handleDisputeSubmit} style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label">Reason</label>
                      <textarea className="form-input" rows={3} value={disputeReason} onChange={e => setDisputeReason(e.target.value)} required placeholder="Describe your issue..." />
                    </div>
                    <div style={{ display: "flex", gap: "8px" }}>
                      <button type="submit" className="btn btn-primary btn-sm">Submit Dispute</button>
                      <button type="button" onClick={() => setSelectedOrderIdForDispute(null)} className="btn btn-ghost btn-sm">Cancel</button>
                    </div>
                  </form>
                </div>
              )}

              {disputes.length === 0 && !selectedOrderIdForDispute && !raiseTicketOpen ? (
                <div className="card" style={{ textAlign: "center", padding: "60px" }}>
                  <p style={{ color: "var(--text-secondary)" }}>No disputes or tickets raised.</p>
                </div>
              ) : (
                disputes.map(d => (
                  <div key={d.id} className="card" style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid var(--border)", paddingBottom: "12px", flexWrap: "wrap", gap: "8px" }}>
                      <div>
                        <h4 style={{ marginBottom: "4px" }}>Ticket for {d.order.items?.map(i => i.product?.name).join(", ")}</h4>
                        <span style={{ fontSize: "12px", color: "var(--text-tertiary)" }}>Order ID: #{d.orderId.slice(0,8)}</span>
                      </div>
                      <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                        <span className={`badge ${d.status === "RESOLVED" ? "badge-green" : "badge-orange"}`}>{d.status}</span>
                        {d.status === "RESOLVED" && d.resolutionType && (
                          <span className="badge badge-blue">{d.resolutionType}</span>
                        )}
                      </div>
                    </div>

                    {/* Chat Thread */}
                    <div style={{
                      display: "flex", flexDirection: "column", gap: "12px",
                      maxHeight: "300px", overflowY: "auto", padding: "12px",
                      background: "var(--bg-secondary)", borderRadius: "var(--radius-md)",
                      border: "1px solid var(--border)"
                    }}>
                      {d.messages && d.messages.length > 0 ? (
                        d.messages.map((m: any) => {
                          const isMe = m.senderRole === "CUSTOMER";
                          return (
                            <div key={m.id} style={{
                              alignSelf: isMe ? "flex-end" : "flex-start",
                              maxWidth: "80%",
                              background: isMe ? "var(--accent)" : "var(--bg-tertiary)",
                              color: isMe ? "#fff" : "var(--text-primary)",
                              padding: "10px 14px",
                              borderRadius: isMe ? "14px 14px 2px 14px" : "14px 14px 14px 2px",
                              boxShadow: "var(--shadow-sm)"
                            }}>
                              <span style={{ display: "block", fontSize: "10px", opacity: 0.8, fontWeight: "bold", marginBottom: "4px" }}>
                                {m.senderName} ({m.senderRole})
                              </span>
                              <p style={{ margin: 0, fontSize: "13px", lineHeight: "1.4" }}>{m.message}</p>
                              <span style={{ display: "block", fontSize: "9px", opacity: 0.6, marginTop: "4px", textAlign: "right" }}>
                                {new Date(m.createdAt).toLocaleTimeString()}
                              </span>
                            </div>
                          );
                        })
                      ) : (
                        <p style={{ color: "var(--text-secondary)", fontSize: "12px", textAlign: "center", margin: "16px 0" }}>No messages yet.</p>
                      )}
                    </div>

                    {/* Send Message Area */}
                    {d.status !== "RESOLVED" && (
                      <div style={{ display: "flex", gap: "8px" }}>
                        <input
                          type="text"
                          className="form-input"
                          placeholder="Type your message..."
                          value={disputeMessageTexts[d.id] || ""}
                          onChange={e => setDisputeMessageTexts(prev => ({ ...prev, [d.id]: e.target.value }))}
                          onKeyDown={e => { if (e.key === "Enter") handleSendDisputeMessage(d.id); }}
                        />
                        <button onClick={() => handleSendDisputeMessage(d.id)} className="btn btn-primary btn-sm">Send</button>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          )}

          {/* PROFILE */}
          {activeTab === "profile" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
              <h2>User Profile</h2>
              <p style={{ color: "var(--text-secondary)", fontSize: "14px", marginTop: "-16px" }}>Manage your account</p>

              {/* Profile Info Card */}
              <div className="card">
                <h3 style={{ marginBottom: "4px" }}>Information</h3>
                <p style={{ fontSize: "13px", color: "var(--text-tertiary)", marginBottom: "24px" }}>Basic information about your account</p>

                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "16px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "16px", flexWrap: "wrap" }}>
                    <div style={{
                      width: "80px", height: "80px", borderRadius: "50%",
                      background: "linear-gradient(135deg, var(--accent) 0%, var(--purple) 100%)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      color: "#fff", fontWeight: "800", fontSize: "24px",
                      boxShadow: "0 4px 12px rgba(0,113,227,0.3)",
                      overflow: "hidden"
                    }}>
                      {user.avatarUrl ? (
                        <img src={user.avatarUrl} alt="Avatar" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      ) : (
                        user.username.slice(0, 2).toUpperCase()
                      )}
                    </div>
                    <div>
                      <h3 style={{ marginBottom: "4px" }}>{user.username}</h3>
                      <p style={{ fontSize: "13px", color: "var(--text-tertiary)", display: "flex", alignItems: "center", gap: "6px", marginBottom: "8px" }}>
                        📅 Registration date: {user.createdAt ? new Date(user.createdAt).toLocaleDateString() : "N/A"}
                      </p>
                      <label className="btn btn-secondary btn-sm" style={{ cursor: "pointer", display: "inline-block" }}>
                        Upload Photo
                        <input type="file" accept="image/png, image/jpeg, image/webp" onChange={handleAvatarUpload} style={{ display: "none" }} />
                      </label>
                    </div>
                  </div>
                </div>
              </div>

              {/* Stats Grid */}
              <div className="grid-3col">
                <div className="card stat-card" style={{ borderTop: "3px solid var(--accent)" }}>
                  <p style={{ fontSize: "24px", marginBottom: "4px" }}>🛒</p>
                  <p className="stat-value">{user.totalOrders || 0}</p>
                  <p className="stat-label">Total Orders</p>
                </div>
                <div className="card stat-card" style={{ borderTop: "3px solid var(--green)" }}>
                  <p style={{ fontSize: "24px", marginBottom: "4px" }}>📈</p>
                  <p className="stat-value" style={{ color: "var(--green)" }}>{formatPrice(user.totalSpent || 0, user?.wallet?.currency || "USD", user?.wallet?.exchangeRate || 1)}</p>
                  <p className="stat-label">Total Spent</p>
                </div>
                <div className="card stat-card" style={{ borderTop: "3px solid var(--purple)" }}>
                  <p style={{ fontSize: "24px", marginBottom: "4px" }}>💰</p>
                  <p className="stat-value" style={{ color: "var(--purple)" }}>{formatPrice(user.wallet?.balance || 0, user?.wallet?.currency || "USD", user?.wallet?.exchangeRate || 1)}</p>
                  <p className="stat-label">Current Balance</p>
                </div>
              </div>

              {/* Account Details */}
              <div className="card">
                <h3 style={{ marginBottom: "16px" }}>Account Details</h3>
                <div className="grid-2col" style={{ gap: "16px" }}>
                  <div>
                    <p style={{ fontSize: "12px", fontWeight: "600", color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "4px" }}>Username</p>
                    <p style={{ fontWeight: "500" }}>{user.username}</p>
                  </div>
                  <div>
                    <p style={{ fontSize: "12px", fontWeight: "600", color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "4px" }}>Role</p>
                    <span className="badge badge-blue">{user.role}</span>
                  </div>
                  <div>
                    <p style={{ fontSize: "12px", fontWeight: "600", color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "4px" }}>Telegram</p>
                    <p style={{ fontWeight: "500", color: user.telegramUsername ? "var(--text-primary)" : "var(--text-tertiary)" }}>{user.telegramUsername || "Not linked"}</p>
                  </div>
                  <div>
                    <p style={{ fontSize: "12px", fontWeight: "600", color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "4px" }}>Member Since</p>
                    <p style={{ fontWeight: "500" }}>{user.createdAt ? new Date(user.createdAt).toLocaleDateString() : "N/A"}</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* SETTINGS */}
          {activeTab === "settings" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
              <h2>Settings</h2>
              <p style={{ color: "var(--text-secondary)", fontSize: "14px", marginTop: "-16px" }}>Manage your account settings</p>

              {/* Change Password */}
              <div className="card">
                <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "20px" }}>
                  <span style={{ fontSize: "24px" }}>🔒</span>
                  <div>
                    <h3 style={{ marginBottom: "2px" }}>Change Password</h3>
                    <p style={{ fontSize: "13px", color: "var(--text-tertiary)" }}>Update your password to keep your account secure</p>
                  </div>
                </div>

                {pwMsg && (
                  <div className={`alert ${pwMsg.type === "error" ? "alert-error" : "alert-success"}`}>
                    {pwMsg.text}
                  </div>
                )}

                <form onSubmit={handleChangePassword} style={{ display: "flex", flexDirection: "column", gap: "16px", maxWidth: "480px" }}>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label" htmlFor="current-password">Current Password</label>
                    <div style={{ position: "relative" }}>
                      <input
                        id="current-password"
                        type={showCurrentPw ? "text" : "password"}
                        className="form-input"
                        value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)}
                        required
                        placeholder="Enter current password"
                        style={{ paddingRight: "48px" }}
                      />
                      <button
                        type="button"
                        onClick={() => setShowCurrentPw(!showCurrentPw)}
                        style={{
                          position: "absolute", right: "12px", top: "50%", transform: "translateY(-50%)",
                          background: "transparent", border: "none", cursor: "pointer",
                          fontSize: "18px", color: "var(--text-tertiary)", padding: "4px",
                          display: "flex", alignItems: "center", justifyContent: "center",
                        }}
                        title={showCurrentPw ? "Hide password" : "Show password"}
                      >
                        {showCurrentPw ? "👁" : "👁‍🗨"}
                      </button>
                    </div>
                  </div>

                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label" htmlFor="new-password">New Password</label>
                    <div style={{ position: "relative" }}>
                      <input
                        id="new-password"
                        type={showNewPw ? "text" : "password"}
                        className="form-input"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        required
                        placeholder="Min. 6 characters"
                        style={{ paddingRight: "48px" }}
                      />
                      <button
                        type="button"
                        onClick={() => setShowNewPw(!showNewPw)}
                        style={{
                          position: "absolute", right: "12px", top: "50%", transform: "translateY(-50%)",
                          background: "transparent", border: "none", cursor: "pointer",
                          fontSize: "18px", color: "var(--text-tertiary)", padding: "4px",
                          display: "flex", alignItems: "center", justifyContent: "center",
                        }}
                        title={showNewPw ? "Hide password" : "Show password"}
                      >
                        {showNewPw ? "👁" : "👁‍🗨"}
                      </button>
                    </div>
                  </div>

                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label" htmlFor="confirm-password">Confirm New Password</label>
                    <div style={{ position: "relative" }}>
                      <input
                        id="confirm-password"
                        type={showConfirmPw ? "text" : "password"}
                        className="form-input"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        required
                        placeholder="Re-enter new password"
                        style={{ paddingRight: "48px" }}
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPw(!showConfirmPw)}
                        style={{
                          position: "absolute", right: "12px", top: "50%", transform: "translateY(-50%)",
                          background: "transparent", border: "none", cursor: "pointer",
                          fontSize: "18px", color: "var(--text-tertiary)", padding: "4px",
                          display: "flex", alignItems: "center", justifyContent: "center",
                        }}
                        title={showConfirmPw ? "Hide password" : "Show password"}
                      >
                        {showConfirmPw ? "👁" : "👁‍🗨"}
                      </button>
                    </div>
                  </div>

                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={pwLoading}
                    style={{ width: "fit-content", marginTop: "8px" }}
                  >
                    {pwLoading ? "Changing..." : "Change Password"}
                  </button>
                </form>
              </div>

              {/* Telegram Settings */}
              <div className="card" style={{ marginTop: "24px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "20px" }}>
                  <span style={{ fontSize: "24px" }}>🤖</span>
                  <div>
                    <h3 style={{ marginBottom: "2px" }}>Telegram Integration</h3>
                    <p style={{ fontSize: "13px", color: "var(--text-tertiary)" }}>Link your Telegram account to access the 24/7 shop bot and receive order updates</p>
                  </div>
                </div>

                {tgMsg && (
                  <div className={`alert ${tgMsg.type === "error" ? "alert-error" : "alert-success"}`} style={{ marginBottom: "20px" }}>
                    {tgMsg.text}
                  </div>
                )}

                <div className="grid-settings-tg">
                  <form onSubmit={handleTelegramSubmit} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label" htmlFor="telegram-username">Telegram Username</label>
                      <div style={{ position: "relative" }}>
                        <span style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", color: "var(--text-tertiary)" }}>@</span>
                        <input
                          id="telegram-username"
                          type="text"
                          className="form-input"
                          value={tgUsernameInput}
                          onChange={(e) => setTgUsernameInput(e.target.value)}
                          placeholder="username"
                          style={{ paddingLeft: "28px" }}
                        />
                      </div>
                      <p style={{ fontSize: "11px", color: "var(--text-tertiary)", marginTop: "4px" }}>Your public Telegram handle (without @)</p>
                    </div>

                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label" htmlFor="telegram-id">Telegram User ID</label>
                      <input
                        id="telegram-id"
                        type="text"
                        className="form-input"
                        value={tgIdInput}
                        onChange={(e) => setTgIdInput(e.target.value)}
                        placeholder="e.g. 123456789"
                      />
                      <p style={{ fontSize: "11px", color: "var(--text-tertiary)", marginTop: "4px" }}>
                        Numeric Telegram ID. Get it by sending a message to <a href="https://t.me/userinfobot" target="_blank" rel="noreferrer" style={{ color: "var(--accent)" }}>@userinfobot</a>
                      </p>
                    </div>

                    <button
                      type="submit"
                      className="btn btn-primary"
                      disabled={tgLoading}
                      style={{ width: "fit-content", marginTop: "8px" }}
                    >
                      {tgLoading ? "Saving..." : "Save Telegram Settings"}
                    </button>
                  </form>

                  <div style={{ background: "var(--bg-secondary)", padding: "20px", borderRadius: "var(--radius-md)", border: "1px solid var(--border)" }}>
                    <h4 style={{ marginBottom: "12px", display: "flex", alignItems: "center", gap: "8px" }}>
                      <span>🚀</span> How to Connect
                    </h4>
                    <ol style={{ fontSize: "13px", color: "var(--text-secondary)", paddingLeft: "20px", margin: 0, display: "flex", flexDirection: "column", gap: "10px" }}>
                      <li>
                        Open the Telegram app and search for <strong>@{BOT_USERNAME}</strong> or click the button below.
                      </li>
                      <li>
                        Start a chat with the bot by clicking the <strong>Start</strong> button or sending <code>/start</code>.
                      </li>
                      <li>
                        Enter your Telegram details on the left and save them.
                      </li>
                      <li>
                        Use the bot menu to browse categories, buy compounds, and check your order history directly from Telegram!
                      </li>
                    </ol>
                    <a
                      href={`https://t.me/${BOT_USERNAME}`}
                      target="_blank"
                      rel="noreferrer"
                      className="btn btn-secondary"
                      style={{ width: "100%", marginTop: "20px", display: "inline-flex", justifyContent: "center", alignItems: "center", gap: "8px" }}
                    >
                      💬 Open Telegram Bot
                    </a>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === "favorites" && (
            <div className={styles.tabContent}>
              <h2 style={{ marginBottom: "16px" }}>Favorites</h2>
              <div className="card" style={{ padding: "40px", textAlign: "center" }}>
                <span style={{ fontSize: "40px", display: "block", marginBottom: "16px" }}>🤍</span>
                <p style={{ color: "var(--text-secondary)" }}>You haven't added any items to your favorites yet.</p>
                <button className="btn btn-primary" onClick={() => setActiveTab("shop")} style={{ marginTop: "24px" }}>Browse Shop</button>
              </div>
            </div>
          )}

          {activeTab === "reviews" && (
            <div className={styles.tabContent}>
              <Reviews isLoggedIn={!!user} />
            </div>
          )}
            </>
          )}
        </main>
      </div>

      <CartWidget onOpenCart={() => setIsCheckoutOpen(true)} currency={user?.wallet?.currency} exchangeRate={user?.wallet?.exchangeRate} />
      <CheckoutModal isOpen={isCheckoutOpen} onClose={() => setIsCheckoutOpen(false)} user={user} onCheckoutSuccess={handleCheckoutSuccess} />

      <SiteFooter />
    </div>
    </>
  );
}
