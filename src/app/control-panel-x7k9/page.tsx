"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import DashboardAnalytics from "./DashboardAnalytics";
import StockManagement from "./StockManagement";
import CouponManagement from "./CouponManagement";
import StaffManagement from "./StaffManagement";
import ProductManagement from "./ProductManagement";

type Tab = "dashboard" | "products" | "stock" | "locations" | "active-orders" | "all-orders" | "users" | "payments" | "disputes" | "employees" | "coupons";

export default function ClientAdminPanel() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>("dashboard");
  const [msg, setMsg] = useState<{ type: "success" | "error", text: string } | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // Data states
  const [stats, setStats] = useState<any>(null);
  const [orders, setOrders] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [userSearchTerm, setUserSearchTerm] = useState("");
  const [selectedUserModal, setSelectedUserModal] = useState<any | null>(null);
  const [balanceAdjustAmount, setBalanceAdjustAmount] = useState("");
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [disputes, setDisputes] = useState<any[]>([]);
  const [deposits, setDeposits] = useState<any[]>([]);
  
  // Product states
  const [categories, setCategories] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [locations, setLocations] = useState<any[]>([]);

  // Local UI states
  const [adminMessages, setAdminMessages] = useState<Record<string, string>>({});
  const [locationLinks, setLocationLinks] = useState<Record<string, string>>({});
  const [pickupVideos, setPickupVideos] = useState<Record<string, string>>({});
  const [cancellationReasons, setCancellationReasons] = useState<Record<string, string>>({});
  
  const [visiblePasswords, setVisiblePasswords] = useState<Record<string, boolean>>({});
  const [adminFiles, setAdminFiles] = useState<Record<string, { base64: string; name: string; type: string }>>({});
  const [cryptoAddress, setCryptoAddress] = useState("");
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);
  const [activeOrderFilter, setActiveOrderFilter] = useState("ALL");
  const [timeNow, setTimeNow] = useState(Date.now());

  useEffect(() => {
    const interval = setInterval(() => setTimeNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  // Product management UI states
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryDesc, setNewCategoryDesc] = useState("");
  const [newCategoryPrefix, setNewCategoryPrefix] = useState("");
  const [newProduct, setNewProduct] = useState<{name: string, description: string, price: string, currency: string, formula: string, casNumber: string, productType: string, imageUrl: string, stockQuantity: number, cityIds: string[], areaIds: string[], areaDetails: any[]}>({ name: "", description: "", price: "", currency: "USD", formula: "", casNumber: "", productType: "", imageUrl: "", stockQuantity: 0, cityIds: [], areaIds: [], areaDetails: [] });

  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [editProductData, setEditProductData] = useState<{name: string, description: string, price: string, currency: string, formula: string, casNumber: string, imageUrl: string, stockQuantity: string, productType: string, cityIds: string[], areaIds: string[], areaDetails: any[]}>({ name: "", description: "", price: "", currency: "USD", formula: "", casNumber: "", imageUrl: "", stockQuantity: "0", productType: "", cityIds: [], areaIds: [], areaDetails: [] });
  const [showLocationsModal, setShowLocationsModal] = useState<"new" | "edit" | null>(null);
  
  // Location UI states
  const [newCityName, setNewCityName] = useState("");
  const [newAreaName, setNewAreaName] = useState("");
  const [selectedCityForArea, setSelectedCityForArea] = useState("");
  const [disputeMessageTexts, setDisputeMessageTexts] = useState<Record<string, string>>({});

  const [cryptoSettings, setCryptoSettings] = useState({
    WALLET_BTC: "", FEE_BTC: "0",
    WALLET_ETH: "", FEE_ETH: "0",
    WALLET_USDT_ERC20: "", FEE_USDT_ERC20: "0",
    WALLET_USDT_TRC20: "", FEE_USDT_TRC20: "0",
    WALLET_SOL: "", FEE_SOL: "0",
    WALLET_TRX: "", FEE_TRX: "0"
  });

  const checkSession = async () => {
    try {
      const res = await fetch("/api/auth/me");
      const data = await res.json();
      if (!data.user) { router.push("/auth/login"); return; }
      if (!["ADMIN", "SUPERADMIN", "STAFF"].includes(data.user.role)) { router.push("/dashboard"); return; }
      setUser(data.user);
      if (data.user.role === "STAFF" && activeTab === "dashboard") {
        setActiveTab("active-orders");
      }
    } catch { router.push("/auth/login"); }
  };

  const fetchAll = async () => {
    try {
      const [statsRes, ordersRes, usersRes, settingsRes, disputesRes, depositsRes, categoriesRes, productsRes, locationsRes] = await Promise.all([
        fetch("/api/client-admin/stats"),
        fetch("/api/client-admin/orders"),
        fetch("/api/client-admin/users"),
        fetch("/api/client-admin/settings"),
        fetch("/api/disputes/list"),
        fetch("/api/client-admin/deposits"),
        fetch("/api/admin/categories"),
        fetch("/api/admin/products"),
        fetch("/api/admin/locations")
      ]);
      const [statsData, ordersData, usersData, settingsData, disputesData, depositsData, catData, prodData, locData] = await Promise.all([
        statsRes.json(), ordersRes.json(), usersRes.json(), settingsRes.json(), disputesRes.json(), depositsRes.json(), categoriesRes.json(), productsRes.json(), locationsRes.json()
      ]);
      if (statsData.stats) setStats(statsData.stats);
      if (ordersData.orders) setOrders(ordersData.orders);
      if (usersData.users) setUsers(usersData.users);
      if (settingsData.settings) {
        setSettings(settingsData.settings);
        setCryptoSettings({
          WALLET_BTC: settingsData.settings["WALLET_BTC"] || "", FEE_BTC: settingsData.settings["FEE_BTC"] || "0",
          WALLET_ETH: settingsData.settings["WALLET_ETH"] || "", FEE_ETH: settingsData.settings["FEE_ETH"] || "0",
          WALLET_USDT_ERC20: settingsData.settings["WALLET_USDT_ERC20"] || "", FEE_USDT_ERC20: settingsData.settings["FEE_USDT_ERC20"] || "0",
          WALLET_USDT_TRC20: settingsData.settings["WALLET_USDT_TRC20"] || "", FEE_USDT_TRC20: settingsData.settings["FEE_USDT_TRC20"] || "0",
          WALLET_SOL: settingsData.settings["WALLET_SOL"] || "", FEE_SOL: settingsData.settings["FEE_SOL"] || "0",
          WALLET_TRX: settingsData.settings["WALLET_TRX"] || "", FEE_TRX: settingsData.settings["FEE_TRX"] || "0"
        });
      }
      if (disputesData.disputes) setDisputes(disputesData.disputes);
      if (depositsData.deposits) setDeposits(depositsData.deposits);
      if (catData.categories) setCategories(catData.categories);
      if (prodData.products) setProducts(prodData.products);
      if (locData.cities) setLocations(locData.cities);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    (async () => {
      setLoading(true);
      await checkSession();
      await fetchAll();
      setLoading(false);
    })();
  }, []);

  const handleSendMessage = async (orderItemId: string, fallbackMessage?: string) => {
    const message = (adminMessages[orderItemId] ?? fallbackMessage ?? "").trim();
    const link = (locationLinks[orderItemId] ?? "").trim();
    const videoUrl = (pickupVideos[orderItemId] ?? "").trim();
    const cReason = (cancellationReasons[orderItemId] ?? "").trim();
    
    // We'll still send if there's any of these
    if (!message && !link && !videoUrl && !cReason && !adminFiles[orderItemId]) return;

    const fileData = adminFiles[orderItemId];

    setMsg(null);
    try {
      const res = await fetch("/api/client-admin/orders/send-message", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderItemId,
          message,
          locationLink: link,
          pickupVideoUrl: videoUrl,
          cancellationReason: cReason,
          file: fileData ? fileData.base64 : undefined,
          fileName: fileData ? fileData.name : undefined,
          fileType: fileData ? fileData.type : undefined
        })
      });
      const data = await res.json();
      if (!res.ok) { setMsg({ type: "error", text: data.error }); return; }

      if (data.telegramSent) {
        setMsg({ type: "success", text: "Details saved and delivered to user's Telegram!" });
      } else {
        const warningSuffix = data.telegramError ? ` (Telegram skipped: ${data.telegramError})` : "";
        setMsg({ type: "success", text: `Details saved and updated on user's dashboard!${warningSuffix}` });
      }
      fetchAll();
      setAdminMessages(prev => ({ ...prev, [orderItemId]: "" }));
      setLocationLinks(prev => ({ ...prev, [orderItemId]: "" }));
      setPickupVideos(prev => ({ ...prev, [orderItemId]: "" }));
      setCancellationReasons(prev => ({ ...prev, [orderItemId]: "" }));
      setAdminFiles(prev => {
        const next = { ...prev };
        delete next[orderItemId];
        return next;
      });
    } catch (e) {
      setMsg({ type: "error", text: "Failed to save details" });
    }
  };

  const handleProcessDeposit = async (depositRequestId: string, action: "APPROVE" | "REJECT") => {
    setMsg(null);
    try {
      const res = await fetch("/api/client-admin/deposits", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ depositRequestId, action })
      });
      const data = await res.json();
      if (!res.ok) { setMsg({ type: "error", text: data.error || "Failed to process deposit" }); return; }
      setMsg({ type: "success", text: `Deposit successfully ${action === "APPROVE" ? "approved" : "rejected"}!` });
      fetchAll();
    } catch (e) {
      setMsg({ type: "error", text: "Failed to process deposit" });
    }
  };

  const handleUpdateCrypto = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    try {
      const updates = Object.entries(cryptoSettings).map(([key, value]) =>
        fetch("/api/client-admin/settings", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key, value })
        })
      );
      await Promise.all(updates);
      setMsg({ type: "success", text: "Crypto configuration updated successfully!" });
      fetchAll();
    } catch (e) {
      setMsg({ type: "error", text: "Failed to update crypto configuration" });
    }
  };

  const handleConfirmPayment = async (orderId: string) => {
    setMsg(null);
    try {
      const res = await fetch("/api/client-admin/orders/confirm-payment", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId })
      });
      const data = await res.json();
      if (!res.ok) { setMsg({ type: "error", text: data.error || "Failed to confirm payment" }); return; }
      setMsg({ type: "success", text: "Payment confirmed. Order moved to Cooldown." });
      fetchAll();
    } catch (e) {
      setMsg({ type: "error", text: "Failed to confirm payment" });
    }
  };

  // --- Product Management ---
  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch("/api/admin/categories", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newCategoryName, description: newCategoryDesc, prefixCode: newCategoryPrefix })
      });
      if (res.ok) {
        setMsg({ type: "success", text: "Category added!" });
        setNewCategoryName(""); setNewCategoryDesc(""); setNewCategoryPrefix("");
        fetchAll();
      } else {
        const d = await res.json(); setMsg({ type: "error", text: d.error });
      }
    } catch (e) { setMsg({ type: "error", text: "Error adding category" }); }
  };

  const handleAdjustBalance = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUserModal) return;
    try {
      const res = await fetch("/api/admin/wallet-adjust", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: selectedUserModal.id, amount: balanceAdjustAmount })
      });
      const data = await res.json();
      if (res.ok) {
        setMsg({ type: "success", text: "Balance adjusted successfully!" });
        setBalanceAdjustAmount("");
        setSelectedUserModal(null);
        fetchAll();
      } else {
        setMsg({ type: "error", text: data.error || "Failed to adjust balance" });
      }
    } catch (e) {
      setMsg({ type: "error", text: "Error adjusting balance" });
    }
  };

  const handleDeleteCategory = async (categoryId: string) => {
    if (!confirm("Delete category?")) return;
    try {
      const res = await fetch("/api/admin/categories", {
        method: "DELETE", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ categoryId })
      });
      if (res.ok) { setMsg({ type: "success", text: "Category deleted!" }); fetchAll(); }
    } catch (e) { setMsg({ type: "error", text: "Error deleting category" }); }
  };

  const handleAddProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const areaStocks = newProduct.areaDetails.map((d: any) => ({ areaId: d.areaId, quantity: d.stockQuantity?.toString() || "0" }));
      const res = await fetch("/api/admin/products", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...newProduct, price: parseFloat(newProduct.price), areaStocks })
      });
      if (res.ok) {
        setMsg({ type: "success", text: "Product added!" });
        setNewProduct({ name: "", description: "", price: "", currency: "USD", formula: "", casNumber: "", productType: "", imageUrl: "", stockQuantity: 0, cityIds: [], areaIds: [], areaDetails: [] });
        fetchAll();
      } else {
        const d = await res.json(); setMsg({ type: "error", text: d.error });
      }
    } catch (e) { setMsg({ type: "error", text: "Error adding product" }); }
  };

  const startEditingProduct = (p: any) => {
    setEditingProductId(p.id);
    setEditProductData({
      name: p.name,
      description: p.description || "",
      price: p.price.toString(),
      currency: p.currency || "USD",
      formula: p.formula || "",
      casNumber: p.casNumber || "",
      imageUrl: p.imageUrl || "",
      stockQuantity: p.stockQuantity?.toString() || "0",
      productType: p.productType || "",
      cityIds: p.cities?.map((c: any) => c.id) || [],
      areaIds: p.areas?.map((a: any) => a.id) || [],
      areaDetails: p.areaDetails || []
    });
  };

  const handleEditProductSubmit = async () => {
    if (!editingProductId) return;
    try {
      const areaStocks = editProductData.areaDetails.map((d: any) => ({ areaId: d.areaId, quantity: d.stockQuantity?.toString() || "0" }));
      const res = await fetch("/api/admin/products", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...editProductData, productId: editingProductId, price: parseFloat(editProductData.price), stockQuantity: parseInt(editProductData.stockQuantity), productType: editProductData.productType, areaStocks })
      });
      if (res.ok) {
        if (editProductData.areaDetails && editProductData.areaDetails.length > 0) {
          await fetch(`/api/admin/products/${editingProductId}/area-details`, {
            method: "PUT", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ areaDetails: editProductData.areaDetails })
          });
        }
        setMsg({ type: "success", text: "Product updated!" });
        setEditingProductId(null);
        fetchAll();
      } else {
        const d = await res.json(); setMsg({ type: "error", text: d.error });
      }
    } catch (e) { setMsg({ type: "error", text: "Error updating product" }); }
  };

  const handleDeleteProduct = async (productId: string) => {
    if (!confirm("Delete product?")) return;
    try {
      const res = await fetch("/api/admin/products", {
        method: "DELETE", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId })
      });
      if (res.ok) { setMsg({ type: "success", text: "Product deleted!" }); fetchAll(); }
    } catch (e) { setMsg({ type: "error", text: "Error deleting product" }); }
  };

  const handleUpdateOrderItemStatus = async (orderItemId: string, status: string) => {
    try {
      const res = await fetch("/api/client-admin/orders/update-status", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderItemId, status })
      });
      if (res.ok) {
        setMsg({ type: "success", text: "Status updated successfully!" });
        fetchAll();
      } else {
        const d = await res.json(); setMsg({ type: "error", text: d.error });
      }
    } catch (e) {
      setMsg({ type: "error", text: "Error updating status" });
    }
  };

  const handleAddCity = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch("/api/admin/locations", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "CITY", name: newCityName })
      });
      if (res.ok) { setMsg({ type: "success", text: "City added!" }); setNewCityName(""); fetchAll(); }
      else { const d = await res.json(); setMsg({ type: "error", text: d.error }); }
    } catch (e) { setMsg({ type: "error", text: "Error adding city" }); }
  };

  const handleAddArea = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch("/api/admin/locations", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "AREA", name: newAreaName, cityId: selectedCityForArea })
      });
      if (res.ok) { setMsg({ type: "success", text: "Area added!" }); setNewAreaName(""); fetchAll(); }
      else { const d = await res.json(); setMsg({ type: "error", text: d.error }); }
    } catch (e) { setMsg({ type: "error", text: "Error adding area" }); }
  };

  const handleDeleteLocation = async (id: string, type: "city" | "area") => {
    if (!confirm(`Delete this ${type}?`)) return;
    try {
      const res = await fetch("/api/admin/locations", {
        method: "DELETE", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, type: type === "city" ? "CITY" : "AREA" })
      });
      if (res.ok) { setMsg({ type: "success", text: "Location deleted!" }); fetchAll(); }
    } catch (e) { setMsg({ type: "error", text: "Error deleting location" }); }
  };

  const handleSendDisputeMessage = async (disputeId: string) => {
    const text = (disputeMessageTexts[disputeId] || "").trim();
    if (!text) return;
    try {
      const res = await fetch("/api/disputes/message", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ disputeId, message: text })
      });
      if (res.ok) {
        setDisputeMessageTexts(prev => ({ ...prev, [disputeId]: "" }));
        fetchAll();
      } else {
        const d = await res.json(); setMsg({ type: "error", text: d.error });
      }
    } catch {
      setMsg({ type: "error", text: "Failed to send message" });
    }
  };

  const handleResolveDispute = async (disputeId: string, resolutionType: "REFUND" | "CREDIT" | "REPLACEMENT" | "REJECTED") => {
    try {
      const res = await fetch("/api/disputes/resolve", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ disputeId, resolutionType })
      });
      if (res.ok) {
        setMsg({ type: "success", text: `Dispute resolved as ${resolutionType}!` });
        fetchAll();
      } else {
        const d = await res.json(); setMsg({ type: "error", text: d.error });
      }
    } catch {
      setMsg({ type: "error", text: "Failed to resolve dispute" });
    }
  };
  const handleFileChange = (orderId: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target?.result as string;
      if (base64) {
        setAdminFiles(prev => ({
          ...prev,
          [orderId]: {
            base64,
            name: file.name,
            type: file.type
          }
        }));
      }
    };
    reader.readAsDataURL(file);
  };

  const handleProductImageUpload = async (e: React.ChangeEvent<HTMLInputElement>, isEdit: boolean) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/admin/upload-image", { method: "POST", body: formData });
      const data = await res.json();
      
      if (res.ok) {
        if (isEdit) {
          setEditProductData({ ...editProductData, imageUrl: data.url });
        } else {
          setNewProduct({ ...newProduct, imageUrl: data.url });
        }
        setMsg({ type: "success", text: "Image uploaded successfully!" });
      } else {
        setMsg({ type: "error", text: data.error || "Upload failed" });
      }
    } catch (err) {
      setMsg({ type: "error", text: "Failed to upload image" });
    }
  };

  if (loading && !user) {
    return (
      <div data-theme="night" style={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: "var(--bg-secondary)", color: "var(--text-primary)" }}>
        <header style={{ padding: "16px 24px", display: "flex", justifyContent: "space-between", alignItems: "center", background: "var(--bg-primary)", borderBottom: "1px solid var(--border)", position: "sticky", top: 0, zIndex: 100 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
            <h1 style={{ margin: 0, fontSize: "20px", fontWeight: "700" }}>Control Panel</h1>
          </div>
        </header>
        <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
          <main style={{ flex: 1, padding: "24px", overflowY: "auto", position: "relative" }}>
            <div style={{ maxWidth: "1200px", margin: "0 auto", display: "flex", flexDirection: "column", gap: "24px" }}>
               {/* Simplified Skeleton */}
               <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))", gap: "16px" }}>
                 <div className="skeleton" style={{ height: "100px", borderRadius: "var(--radius-md)" }}></div>
                 <div className="skeleton" style={{ height: "100px", borderRadius: "var(--radius-md)" }}></div>
                 <div className="skeleton" style={{ height: "100px", borderRadius: "var(--radius-md)" }}></div>
               </div>
               <div className="skeleton" style={{ height: "400px", borderRadius: "var(--radius-md)" }}></div>
            </div>
          </main>
        </div>
      </div>
    );
  }

  if (!user) return null;

  const allTabs: { key: Tab; label: string; icon: string }[] = [
    { key: "dashboard", label: "Dashboard", icon: "📊" },
    { key: "products", label: "Inventory", icon: "📦" },
    { key: "stock", label: "Stock Management", icon: "📊" },
    { key: "locations", label: "Locations", icon: "📍" },
    { key: "active-orders", label: "Active Orders", icon: "🚚" },
    { key: "all-orders", label: "All Orders", icon: "📋" },
    { key: "users", label: "Users", icon: "👥" },
    { key: "payments", label: "Payments", icon: "💰" },
    { key: "disputes", label: "Disputes", icon: "⚖️" },
    { key: "employees", label: "Employees", icon: "👔" },
    { key: "coupons", label: "Coupons", icon: "🎟️" },
  ];

  const tabs = allTabs.filter(t => {
    if (user?.role === "STAFF") {
      return ["active-orders", "all-orders", "disputes", "products", "locations"].includes(t.key);
    }
    return true;
  });

  const activeOrders = orders;
  const filteredActiveOrders = activeOrderFilter === "ALL" 
    ? activeOrders 
    : activeOrders.filter(o => o.status === activeOrderFilter);
  const newOrdersCount = orders.filter(o => ["ORDERED", "PENDING_PAYMENT", "PROCESSING"].includes(o.status)).length;
  const isAdmin = user && ["ADMIN", "SUPERADMIN"].includes(user.role);

  return (
    <div data-theme="night" style={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: "var(--bg-secondary)", color: "var(--text-primary)" }}>
      {/* Header */}
      <header className="cp-header" style={{
        padding: "16px 24px", display: "flex", justifyContent: "space-between",
        alignItems: "center", background: "var(--bg-primary)",
        borderBottom: "1px solid var(--border)", position: "sticky", top: 0, zIndex: 100,
        boxShadow: "var(--shadow-sm)"
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          {/* Mobile Menu Toggle */}
          <button 
            onClick={() => setIsSidebarOpen(!isSidebarOpen)} 
            className="btn btn-ghost btn-sm" 
            style={{ display: "none", padding: "8px" }} 
            id="mobile-menu-btn"
          >
            ☰
          </button>
          <span className="cp-header-title" style={{ fontSize: "20px", fontWeight: "800", letterSpacing: "-0.5px" }}>{isAdmin ? "Admin Area" : "Staff Panel"}</span>
          {isAdmin && <span className="badge badge-red" style={{ fontSize: "11px", letterSpacing: "0.5px" }}>{user.role === "SUPERADMIN" ? "ROOT" : "ADMIN"}</span>}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <span style={{ fontSize: "14px", color: "var(--text-secondary)", display: "none" }} className="hide-mobile">
            Admin: <strong style={{ color: "var(--text-primary)" }}>{user.username}</strong>
          </span>
          <button onClick={() => { 
            if (window.confirm("Are you sure you want to log out?")) {
              fetch("/api/auth/logout", { method: "POST" }).then(() => {
                window.location.href = "/";
              });
            }
          }} className="btn btn-ghost btn-sm">Log Out</button>
        </div>
      </header>

      <div className="admin-layout" style={{ display: "flex", flex: 1, maxWidth: "1600px", width: "100%", margin: "0 auto", padding: "24px", gap: "32px", position: "relative" }}>
        {/* Sidebar */}
        <aside 
          className={`admin-sidebar ${isSidebarOpen ? 'open' : ''}`}
          style={{ 
            width: "240px", flexShrink: 0, display: "flex", flexDirection: "column", gap: "8px",
            background: "var(--bg-secondary)", zIndex: 90
          }}
        >
          {tabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => { setActiveTab(tab.key); setMsg(null); setIsSidebarOpen(false); }}
              style={{
                display: "flex", alignItems: "center", gap: "12px",
                padding: "12px 16px", border: "none", borderRadius: "var(--radius-md)",
                background: activeTab === tab.key ? "var(--bg-primary)" : "transparent",
                color: activeTab === tab.key ? "var(--accent)" : "var(--text-secondary)",
                fontWeight: activeTab === tab.key ? "600" : "500",
                fontSize: "15px", cursor: "pointer", textAlign: "left",
                fontFamily: "inherit", transition: "all 0.2s var(--ease)",
                boxShadow: activeTab === tab.key ? "var(--shadow-sm)" : "none",
              }}
            >
              <span style={{ fontSize: "18px" }}>{tab.icon}</span> {tab.label}
              {tab.key === "active-orders" && newOrdersCount > 0 && (
                <span style={{ marginLeft: "auto", background: "var(--red)", color: "white", padding: "2px 8px", borderRadius: "100px", fontSize: "12px", fontWeight: "bold" }}>
                  {newOrdersCount}
                </span>
              )}
            </button>
          ))}
        </aside>

        <style dangerouslySetInnerHTML={{__html: `
          @media (max-width: 900px) {
            /* === LAYOUT === */
            .admin-layout { flex-direction: column !important; padding: 12px !important; gap: 12px !important; }
            #mobile-menu-btn { display: inline-flex !important; }
            .hide-mobile { display: none !important; }

            /* === SIDEBAR === */
            .admin-sidebar { 
              display: none !important; 
              position: absolute; top: 0; left: 0; right: 0; 
              background: var(--bg-primary) !important; padding: 16px; 
              border: 1px solid var(--border); border-radius: var(--radius-md); box-shadow: var(--shadow-lg);
              z-index: 200 !important;
            }
            .admin-sidebar.open { display: flex !important; }

            /* === ALL TABLES - horizontal scroll === */
            .cp-table-wrap {
              overflow-x: auto !important;
              -webkit-overflow-scrolling: touch !important;
            }
            .cp-table-wrap table {
              min-width: 600px !important;
            }
            .cp-table-wrap table th,
            .cp-table-wrap table td {
              padding: 10px 12px !important;
              font-size: 13px !important;
              white-space: nowrap !important;
            }

            /* === GRID STACKING === */
            .cp-grid-form {
              grid-template-columns: 1fr !important;
            }
            .cp-grid-span2 {
              grid-column: span 1 !important;
            }
            .cp-area-grid-2col {
              grid-template-columns: 1fr !important;
            }
            .cp-area-grid-3col {
              grid-template-columns: 1fr !important;
            }

            /* === ACTIVE ORDERS === */
            .cp-order-header {
              padding: 14px 16px !important;
            }
            .cp-order-badges {
              flex-wrap: wrap !important;
              gap: 6px !important;
            }
            .cp-order-summary {
              white-space: normal !important;
              word-break: break-word !important;
            }
            .cp-order-details {
              padding: 16px !important;
            }
            .cp-order-details-grid {
              grid-template-columns: 1fr !important;
              gap: 20px !important;
            }

            /* === STATUS FILTER TABS === */
            .cp-status-tabs {
              -webkit-overflow-scrolling: touch !important;
            }
            .cp-status-tabs button {
              flex-shrink: 0 !important;
              font-size: 12px !important;
              padding: 6px 10px !important;
            }

            /* === DISPUTES === */
            .cp-dispute-footer {
              flex-direction: column !important;
              align-items: flex-start !important;
              gap: 10px !important;
            }
            .cp-dispute-actions {
              flex-wrap: wrap !important;
              width: 100% !important;
            }
            .cp-dispute-actions > button {
              flex: 1 1 auto !important;
              min-width: 0 !important;
              font-size: 12px !important;
              padding: 6px 10px !important;
            }
            .cp-dispute-header {
              flex-wrap: wrap !important;
              gap: 8px !important;
            }

            /* === EMPLOYEE MANAGEMENT === */
            .cp-employee-form {
              flex-direction: column !important;
              align-items: stretch !important;
              gap: 10px !important;
            }
            .cp-employee-form input {
              width: 100% !important;
            }

            /* === HEADER === */
            .cp-header {
              padding: 12px 16px !important;
            }
            .cp-header-title {
              font-size: 16px !important;
            }

            /* === HEADINGS === */
            .cp-heading {
              font-size: 22px !important;
            }

            /* === CARDS === */
            .card {
              padding: 14px !important;
            }

            /* === MODAL === */
            .cp-modal {
              width: 95% !important;
              max-height: 90vh !important;
            }

            /* === MISC === */
            textarea.form-input {
              min-height: 60px !important;
            }
          }
        `}} />

        {/* Main Content */}
        <main style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: "24px" }}>
          {msg && (
            <div className={`alert ${msg.type === "error" ? "alert-error" : "alert-success"}`} style={{ animation: "fadeIn 0.3s ease" }}>
              {msg.text}
            </div>
          )}

          {activeTab === "dashboard" && (
            <div>
              <DashboardAnalytics onNavigate={(tab) => { setActiveTab(tab as Tab); setIsSidebarOpen(false); }} />
            </div>
          )}

          {activeTab === "products" && (
            <div style={{ animation: "fadeIn 0.4s ease" }}>
              <ProductManagement />
            </div>
          )}

          {/* STOCK MANAGEMENT TAB */}
          {activeTab === "stock" && (
            <div style={{ animation: "fadeIn 0.4s ease" }}>
              <StockManagement />
            </div>
          )}

          {/* LOCATIONS TAB */}
          {activeTab === "locations" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "24px", animation: "fadeIn 0.4s ease" }}>
              <h2 className="cp-heading" style={{ fontSize: "28px" }}>Locations Management</h2>
              
              <div className="cp-grid-form" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "24px" }}>
                <div className="card">
                  <h3 style={{ marginBottom: "16px", fontSize: "18px" }}>Add City</h3>
                  <form onSubmit={handleAddCity} style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <input className="form-input" placeholder="City Name" value={newCityName} onChange={e => setNewCityName(e.target.value)} required />
                    </div>
                    <button type="submit" className="btn btn-primary btn-sm">Add City</button>
                  </form>
                </div>

                <div className="card">
                  <h3 style={{ marginBottom: "16px", fontSize: "18px" }}>Add Area</h3>
                  <form onSubmit={handleAddArea} style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <select className="form-input" value={selectedCityForArea} onChange={e => setSelectedCityForArea(e.target.value)} required>
                        <option value="">Select City...</option>
                        {locations.map(city => <option key={city.id} value={city.id}>{city.name}</option>)}
                      </select>
                    </div>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <input className="form-input" placeholder="Area Name" value={newAreaName} onChange={e => setNewAreaName(e.target.value)} required />
                    </div>
                    <button type="submit" className="btn btn-primary btn-sm">Add Area</button>
                  </form>
                </div>
              </div>

              <div className="card">
                <h3 style={{ marginBottom: "16px", fontSize: "18px" }}>Existing Locations</h3>
                <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                  {locations.map(city => (
                    <div key={city.id} style={{ border: "1px solid var(--border)", borderRadius: "var(--radius-md)", padding: "16px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                        <h4 style={{ fontSize: "18px", color: "var(--text-primary)" }}>{city.name}</h4>
                        <button onClick={() => handleDeleteLocation(city.id, "city")} className="btn btn-ghost btn-sm" style={{ color: "var(--red)" }}>Delete City</button>
                      </div>
                      <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                        {city.areas?.length === 0 && <li style={{ color: "var(--text-secondary)", fontSize: "13px" }}>No areas added.</li>}
                        {city.areas?.map((area: any) => (
                          <li key={area.id} style={{ display: "flex", justifyContent: "space-between", padding: "8px 12px", background: "var(--bg-secondary)", borderRadius: "var(--radius-sm)", marginBottom: "8px" }}>
                            <span>{area.name}</span>
                            <button onClick={() => handleDeleteLocation(area.id, "area")} className="btn btn-ghost btn-sm" style={{ padding: "0 8px", color: "var(--red)" }}>Del</button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ACTIVE ORDERS */}
          {activeTab === "active-orders" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "24px", animation: "fadeIn 0.4s ease" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <h2 className="cp-heading" style={{ fontSize: "28px" }}>Orders ({activeOrders.length})</h2>
                <button onClick={fetchAll} className="btn btn-secondary btn-sm">🔄 Refresh</button>
              </div>

              {/* Horizontal Status Tabs */}
              <div className="cp-status-tabs" style={{ display: "flex", gap: "8px", overflowX: "auto", paddingBottom: "8px" }}>
                {["ALL", "ORDERED", "PROCESSING", "ON_PICKUP", "COMPLETED", "CANCELLED"].map(status => (
                  <button 
                    key={status}
                    onClick={() => setActiveOrderFilter(status)}
                    className={`btn btn-sm ${status === activeOrderFilter ? "btn-primary" : "btn-secondary"}`}
                  >
                    {status.replace("_", " ")}
                  </button>
                ))}
              </div>
              
              {filteredActiveOrders.length === 0 ? (
                <div className="card" style={{ textAlign: "center", padding: "64px 24px", color: "var(--text-secondary)" }}>
                  <span style={{ fontSize: "48px", display: "block", marginBottom: "16px" }}>🎉</span>
                  <h3 style={{ color: "var(--text-primary)", marginBottom: "8px" }}>All Caught Up!</h3>
                  <p>There are no orders matching this status.</p>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                  {filteredActiveOrders.map(order => (
                    <div key={order.id} className="card" style={{ padding: "0", overflow: "hidden", border: expandedOrderId === order.id ? "1px solid var(--accent)" : "1px solid var(--border)" }}>
                      {/* Order Row Header */}
                      <div 
                        onClick={() => setExpandedOrderId(expandedOrderId === order.id ? null : order.id)}
                        className="cp-order-header"
                        style={{ display: "flex", alignItems: "center", padding: "20px 24px", cursor: "pointer", background: expandedOrderId === order.id ? "var(--bg-tertiary)" : "var(--bg-primary)" }}
                      >
                        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "4px" }}>
                          <div className="cp-order-badges" style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                            <span style={{ fontWeight: "600", fontSize: "16px" }}>{order.user.username}</span>
                            <span className={`badge ${order.status === "ON_PICKUP" ? "badge-blue" : "badge-in_stock"}`}>{order.status}</span>
                            <span className="badge" style={{ background: order.orderSource === "TELEGRAM" ? "#0088cc" : "var(--bg-secondary)", color: order.orderSource === "TELEGRAM" ? "white" : "var(--text-secondary)" }}>
                              {order.orderSource === "TELEGRAM" ? "📱 Telegram" : "🌐 Website"}
                            </span>
                            <span className="badge badge-green">💳 Wallet</span>
                          </div>
                          <span className="cp-order-summary" style={{ color: "var(--text-tertiary)", fontSize: "13px" }}>Ordered {order.items.map((i: any) => `${i.product.name}`).join(", ")} • ${Number(order.totalAmount).toFixed(2)} • {new Date(order.createdAt).toLocaleString()}</span>
                        </div>
                        <div>
                          <span style={{ fontSize: "20px", color: "var(--text-tertiary)", transform: expandedOrderId === order.id ? "rotate(180deg)" : "rotate(0deg)", display: "inline-block", transition: "transform 0.2s ease" }}>↓</span>
                        </div>
                      </div>

                      {/* Expanded Details */}
                      {expandedOrderId === order.id && (
                        <div className="cp-order-details" style={{ padding: "24px", borderTop: "1px solid var(--border)", background: "var(--bg-primary)" }}>
                          <div className="cp-order-details-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "32px" }}>
                            <div>
                              <h4 style={{ marginBottom: "12px", color: "var(--text-secondary)", fontSize: "13px", textTransform: "uppercase", letterSpacing: "0.5px" }}>Customer Details</h4>
                              <p style={{ marginBottom: "8px" }}><strong>Username:</strong> {order.user.username}</p>
                              <p style={{ marginBottom: "8px" }}>
                                <strong>Telegram:</strong> {order.user.telegramUsername ? `@${order.user.telegramUsername}` : "Not linked"} 
                                {order.user.telegramId && <span style={{ color: "var(--green)", marginLeft: "8px", fontSize: "12px" }}>(Bot Connected)</span>}
                              </p>
                              {user?.role !== "STAFF" && (
                                <p style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                  <strong>Password:</strong> 
                                  <span style={{ fontFamily: "monospace", color: "var(--text-secondary)" }}>
                                    {visiblePasswords[order.user.id] ? (order.user.passwordPlain || "N/A") : "••••••••"}
                                  </span>
                                  {order.user.passwordPlain && (
                                    <button onClick={(e) => { e.stopPropagation(); setVisiblePasswords(prev => ({ ...prev, [order.user.id]: !prev[order.user.id] })) }} className="btn btn-ghost btn-sm" style={{ padding: "2px 6px" }}>
                                      {visiblePasswords[order.user.id] ? "Hide" : "Show"}
                                    </button>
                                  )}
                                </p>
                              )}
                              <p style={{ marginBottom: "8px", marginTop: "12px" }}>
                                <strong>Payment Method:</strong> {order.paymentMethod === "DIRECT_CRYPTO" ? `Crypto (${order.cryptoCurrency})` : "Wallet Balance"}
                              </p>
                              {order.paymentMethod === "DIRECT_CRYPTO" && order.status === "PENDING_PAYMENT" && (
                                <div style={{ background: "rgba(0, 113, 227, 0.05)", border: "1px solid var(--accent)", padding: "12px", borderRadius: "var(--radius-sm)", marginTop: "12px" }}>
                                  <p style={{ fontSize: "13px", fontWeight: "600", color: "var(--accent)", marginBottom: "8px" }}>Awaiting On-Chain Payment</p>
                                  <p style={{ fontSize: "12px", marginBottom: "4px" }}>Amount Expected: <strong>${order.cryptoAmountDue}</strong> in {order.cryptoCurrency}</p>
                                  <p style={{ fontSize: "12px", marginBottom: "12px" }}>Address: <span style={{ fontFamily: "monospace" }}>{order.paymentWalletAddress}</span></p>
                                  <button onClick={() => handleConfirmPayment(order.id)} className="btn btn-primary btn-sm" style={{ width: "100%" }}>
                                    Confirm Payment Received
                                  </button>
                                </div>
                              )}
                              {order.paymentMethod === "DIRECT_CRYPTO" && order.status !== "PENDING_PAYMENT" && (
                                <p style={{ fontSize: "12px", color: "var(--green)", marginTop: "8px", fontWeight: "600" }}>✓ Payment Verified</p>
                              )}
                              {order.coinbaseChargeUrl && (
                                <p style={{ fontSize: "12px" }}>
                                  <a href={order.coinbaseChargeUrl} target="_blank" rel="noreferrer">View Charge</a>
                                </p>
                              )}
                            </div>
                            <div style={{ flex: 1 }}>
                              <h4 style={{ marginBottom: "12px", color: "var(--text-secondary)", fontSize: "13px", textTransform: "uppercase", letterSpacing: "0.5px" }}>Deliver Items</h4>
                              <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                                {order.items.map((item: any) => {
                                  const secondsLeft = item.cooldownEndAt ? Math.max(0, Math.ceil((new Date(item.cooldownEndAt).getTime() - timeNow) / 1000)) : 0;
                                  const isAutomated = ["COOLDOWN_ACTIVE", "ON_PICKUP", "COMPLETED"].includes(item.status);
                                  return (
                                  <div key={item.id} style={{ background: "var(--bg-secondary)", padding: "16px", borderRadius: "var(--radius-md)", border: "1px solid var(--border)" }}>
                                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
                                      <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                                        <strong>{item.product.name}</strong>
                                        {item.area?.name && <span style={{ fontSize: "12px", color: "var(--text-tertiary)" }}>Area: {item.area.name}</span>}
                                      </div>
                                      <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                                        <select 
                                          className="form-input" 
                                          style={{ padding: "4px 8px", fontSize: "12px", width: "auto" }}
                                          value={item.status}
                                          onChange={(e) => handleUpdateOrderItemStatus(item.id, e.target.value)}
                                        >
                                          <option value="PENDING_PAYMENT">Pending</option>
                                          <option value="PAID">Paid</option>
                                          <option value="PROCESSING">Processing</option>
                                          <option value="COOLDOWN_ACTIVE">Cooldown</option>
                                          <option value="READY">Reached / Ready</option>
                                          <option value="ON_PICKUP">On Pickup</option>
                                          <option value="COMPLETED">Completed</option>
                                          <option value="REFUNDED">Refunded</option>
                                          <option value="FAILED">Failed</option>
                                          <option value="CANCELLED">Cancelled</option>
                                        </select>
                                      </div>
                                    </div>
                                    
                                    {item.status === "CANCELLED" && (
                                      <input 
                                        className="form-input" 
                                        type="text" 
                                        placeholder="Reason for cancellation..."
                                        value={cancellationReasons[item.id] !== undefined ? cancellationReasons[item.id] : (item.cancellationReason || "")}
                                        onChange={(e) => setCancellationReasons(prev => ({ ...prev, [item.id]: e.target.value }))}
                                        style={{ marginBottom: "12px", border: "1px solid var(--red)" }}
                                      />
                                    )}

                                    {item.status === "COOLDOWN_ACTIVE" && (
                                      <div style={{ padding: "12px", background: "var(--bg-primary)", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)", marginBottom: "12px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                        <span style={{ fontSize: "13px", color: "var(--text-secondary)" }}>Automated Cooldown Timer:</span>
                                        <span style={{ fontSize: "16px", fontWeight: "bold", color: "var(--accent)", fontFamily: "monospace" }}>
                                          {Math.floor(secondsLeft / 60).toString().padStart(2, '0')}:{(secondsLeft % 60).toString().padStart(2, '0')}
                                        </span>
                                      </div>
                                    )}

                                    {item.status === "ON_PICKUP" && (
                                      <div style={{ padding: "12px", background: "rgba(0,255,0,0.05)", borderRadius: "var(--radius-sm)", border: "1px solid var(--green)", marginBottom: "12px" }}>
                                        <p style={{ fontSize: "13px", color: "var(--green)", fontWeight: "500", margin: 0 }}>✓ Automated: Pick up location sent on user's dashboard and Telegram.</p>
                                      </div>
                                    )}

                                    {item.status === "COMPLETED" && (
                                      <div style={{ padding: "12px", background: "rgba(0,255,0,0.05)", borderRadius: "var(--radius-sm)", border: "1px solid var(--green)", marginBottom: "12px" }}>
                                        <p style={{ fontSize: "13px", color: "var(--green)", fontWeight: "500", margin: 0 }}>✓ Automated: Order finalized.</p>
                                      </div>
                                    )}

                                    {!isAutomated && (
                                      <>
                                        <textarea 
                                          className="form-input" 
                                          rows={3} 
                                          placeholder="Extra instructions, message to customer..."
                                          value={adminMessages[item.id] !== undefined ? adminMessages[item.id] : (item.adminMessage || "")}
                                          onChange={(e) => setAdminMessages(prev => ({ ...prev, [item.id]: e.target.value }))}
                                          style={{ marginBottom: "12px" }}
                                        />
                                        
                                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                            <label className="btn btn-secondary btn-sm" style={{ cursor: "pointer", margin: 0 }}>
                                              📎 Photo
                                              <input 
                                                type="file" 
                                                accept="image/*"
                                                onChange={(e) => handleFileChange(item.id, e)} 
                                                style={{ display: "none" }} 
                                              />
                                            </label>
                                            {(adminFiles[item.id] || item.adminMessageFileUrl) && (
                                              <span style={{ fontSize: "12px", color: "var(--green)", maxWidth: "120px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                                ✓ {adminFiles[item.id] ? adminFiles[item.id].name : "Photo Uploaded"}
                                              </span>
                                            )}
                                          </div>
                                          <button onClick={() => handleSendMessage(item.id, item.adminMessage || undefined)} className="btn btn-primary btn-sm">
                                            Save & Notify
                                          </button>
                                        </div>
                                      </>
                                    )}
                                  </div>
                                )})}
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ALL ORDERS */}
          {activeTab === "all-orders" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "24px", animation: "fadeIn 0.4s ease" }}>
              <h2 className="cp-heading" style={{ fontSize: "28px" }}>Order History</h2>
              <div className="card cp-table-wrap" style={{ padding: "0", overflow: "hidden" }}>
                <table>
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>Customer</th>
                      <th>Product</th>
                      <th>Amount</th>
                      <th>Payment</th>
                      <th>Status</th>
                      <th>Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map(o => (
                      <tr key={o.id}>
                        <td style={{ fontFamily: "monospace", fontSize: "12px", color: "var(--text-tertiary)" }}>{o.id.slice(0, 8)}</td>
                        <td style={{ fontWeight: "500" }}>{o.user.username}</td>
                        <td>{o.items.map((i: any) => i.product.name).join(", ")}</td>
                        <td style={{ fontWeight: "600", color: "var(--green)" }}>${Number(o.totalAmount).toFixed(2)}</td>
                        <td>
                          {o.paymentMethod === "DIRECT_CRYPTO" ? `Crypto (${o.cryptoCurrency || "N/A"})` : "Wallet"}
                        </td>
                        <td><span className={`badge ${o.status === "COMPLETED" ? "badge-green" : o.status === "ON_PICKUP" ? "badge-blue" : o.status === "CANCELLED" ? "badge-red" : "badge-in_stock"}`}>{o.status}</span></td>
                        <td style={{ color: "var(--text-tertiary)", fontSize: "13px" }}>{new Date(o.createdAt).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* USERS */}
          {activeTab === "users" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "24px", animation: "fadeIn 0.4s ease" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <h2 className="cp-heading" style={{ fontSize: "28px" }}>User Management</h2>
                <input 
                  type="text" 
                  className="form-input" 
                  placeholder="Search username or telegram..." 
                  value={userSearchTerm} 
                  onChange={e => setUserSearchTerm(e.target.value)}
                  style={{ width: "300px" }}
                />
              </div>
              <div className="card cp-table-wrap" style={{ padding: "0", overflow: "hidden" }}>
                <table>
                  <thead>
                    <tr>
                      <th>Username</th>
                      <th>Telegram</th>
                      <th>Password</th>
                      <th>Wallet</th>
                      <th>Orders</th>
                      <th>Spent</th>
                      <th>Joined</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users
                      .filter(u => u.username.toLowerCase().includes(userSearchTerm.toLowerCase()) || (u.telegramUsername && u.telegramUsername.toLowerCase().includes(userSearchTerm.toLowerCase())))
                      .map(u => (
                      <tr key={u.id} style={{ cursor: "pointer", transition: "background 0.2s" }} onClick={() => setSelectedUserModal(u)} onMouseEnter={e => e.currentTarget.style.background = "var(--bg-secondary)"} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                        <td style={{ fontWeight: "600" }}>
                          {u.username}
                          {u.role === "STAFF" && <span className="badge badge-red" style={{ marginLeft: "8px", fontSize: "10px" }}>STAFF</span>}
                          {u.role === "SUPERADMIN" && <span className="badge badge-red" style={{ marginLeft: "8px", fontSize: "10px" }}>ROOT</span>}
                        </td>
                        <td style={{ color: "var(--text-secondary)" }}>
                          {u.role === "STAFF" ? "NA" : u.telegramUsername ? `@${u.telegramUsername}` : "—"}
                        </td>
                        <td>
                          {user?.role === "STAFF" ? "—" : u.passwordPlain ? (
                            <div style={{ display: "flex", alignItems: "center", gap: "8px" }} onClick={e => e.stopPropagation()}>
                              <span style={{ fontFamily: "monospace", fontSize: "13px", color: "var(--text-secondary)" }}>
                                {visiblePasswords[u.id] ? u.passwordPlain : "••••••••"}
                              </span>
                              <button onClick={() => setVisiblePasswords(prev => ({ ...prev, [u.id]: !prev[u.id] }))} className="btn btn-ghost btn-sm" style={{ padding: "2px", fontSize: "16px" }}>
                                {visiblePasswords[u.id] ? "👁" : "👁‍🗨"}
                              </button>
                            </div>
                          ) : <span style={{ color: "var(--text-tertiary)" }}>N/A</span>}
                        </td>
                        <td style={{ fontWeight: "600", color: "var(--green)" }}>
                          {u.role === "STAFF" ? "—" : `$${Number(u.wallet?.balance || 0).toFixed(2)}`}
                        </td>
                        <td>{u.role === "STAFF" ? "—" : u.totalOrders}</td>
                        <td style={{ fontWeight: "600" }}>{u.role === "STAFF" ? "—" : `$${Number(u.totalSpent || 0).toFixed(2)}`}</td>
                        <td style={{ color: "var(--text-tertiary)", fontSize: "13px" }}>{new Date(u.createdAt).toLocaleDateString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* User Profile Modal */}
          {selectedUserModal && (
            <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.8)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: "20px" }} onClick={() => setSelectedUserModal(null)}>
              <div className="card" style={{ width: "100%", maxWidth: "800px", maxHeight: "90vh", overflowY: "auto", position: "relative" }} onClick={e => e.stopPropagation()}>
                <button style={{ position: "absolute", top: "16px", right: "16px", background: "none", border: "none", fontSize: "24px", color: "var(--text-secondary)", cursor: "pointer" }} onClick={() => setSelectedUserModal(null)}>×</button>
                <h2 style={{ fontSize: "24px", marginBottom: "8px" }}>User Profile: {selectedUserModal.username}</h2>
                <p style={{ color: "var(--text-secondary)", marginBottom: "24px" }}>
                  Role: <strong style={{ color: "var(--accent)" }}>{selectedUserModal.role}</strong> | 
                  Joined: {new Date(selectedUserModal.createdAt).toLocaleDateString()}
                </p>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px", marginBottom: "32px" }}>
                  {/* Balance / Adjustment */}
                  <div className="card" style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)" }}>
                    <h3 style={{ fontSize: "16px", marginBottom: "16px" }}>Wallet Balance</h3>
                    <div style={{ fontSize: "32px", fontWeight: "700", color: "var(--green)", marginBottom: "24px" }}>
                      ${Number(selectedUserModal.wallet?.balance || 0).toFixed(2)}
                    </div>
                    {isAdmin && (
                      <form onSubmit={handleAdjustBalance} style={{ display: "flex", gap: "12px" }}>
                        <input type="number" step="0.01" className="form-input" placeholder="Amount (e.g. 50 or -50)" required value={balanceAdjustAmount} onChange={e => setBalanceAdjustAmount(e.target.value)} />
                        <button type="submit" className="btn btn-primary">Adjust</button>
                      </form>
                    )}
                  </div>
                  
                  {/* Quick Stats */}
                  <div className="card" style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)" }}>
                    <h3 style={{ fontSize: "16px", marginBottom: "16px" }}>Order Statistics</h3>
                    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <span style={{ color: "var(--text-secondary)" }}>Total Orders:</span>
                        <strong>{selectedUserModal.orders?.length || 0}</strong>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <span style={{ color: "var(--text-secondary)" }}>Total Spent:</span>
                        <strong style={{ color: "var(--green)" }}>${Number(selectedUserModal.totalSpent || 0).toFixed(2)}</strong>
                      </div>
                    </div>
                  </div>
                </div>

                <h3 style={{ fontSize: "20px", marginBottom: "16px", borderBottom: "1px solid var(--border)", paddingBottom: "12px" }}>Order History</h3>
                {selectedUserModal.orders && selectedUserModal.orders.length > 0 ? (
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", textAlign: "left", borderCollapse: "collapse" }}>
                      <thead>
                        <tr style={{ borderBottom: "1px solid var(--border)" }}>
                          <th style={{ padding: "12px 8px", color: "var(--text-secondary)" }}>ID</th>
                          <th style={{ padding: "12px 8px", color: "var(--text-secondary)" }}>Date</th>
                          <th style={{ padding: "12px 8px", color: "var(--text-secondary)" }}>Status</th>
                          <th style={{ padding: "12px 8px", color: "var(--text-secondary)" }}>Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedUserModal.orders.map((o: any) => (
                          <tr key={o.id} style={{ borderBottom: "1px solid var(--border)" }}>
                            <td style={{ padding: "12px 8px", fontFamily: "monospace", fontSize: "13px" }}>{o.id.substring(0, 8)}...</td>
                            <td style={{ padding: "12px 8px", fontSize: "14px" }}>{new Date(o.createdAt).toLocaleDateString()}</td>
                            <td style={{ padding: "12px 8px" }}>
                              <span className={`badge ${o.status === "COMPLETED" ? "badge-green" : o.status === "CANCELLED" ? "badge-red" : "badge-orange"}`}>
                                {o.status}
                              </span>
                            </td>
                            <td style={{ padding: "12px 8px", fontWeight: "600" }}>${Number(o.totalAmount).toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p style={{ color: "var(--text-secondary)", textAlign: "center", padding: "20px" }}>No orders found for this user.</p>
                )}
              </div>
            </div>
          )}

          {/* PAYMENTS */}
          {activeTab === "payments" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "24px", animation: "fadeIn 0.4s ease" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <h2 style={{ fontSize: "28px" }}>Payment Configuration</h2>
                <button onClick={handleUpdateCrypto} className="btn btn-primary">Save Changes</button>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "24px", alignItems: "start" }}>
                
                {/* Crypto Wallet Configuration */}
                <div className="card" style={{ gridColumn: "span 2" }}>
                  <h3 style={{ marginBottom: "16px", fontSize: "18px" }}>Crypto Wallet Addresses & Network Fees</h3>
                  <p style={{ color: "var(--text-secondary)", fontSize: "14px", marginBottom: "24px" }}>
                    Configure your receiving addresses and estimated network fees for each supported cryptocurrency. The fees will be added to the customer's total at checkout.
                  </p>
                  
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "20px" }}>
                    {[
                      { label: "Bitcoin (BTC)", code: "BTC", addrKey: "WALLET_BTC", feeKey: "FEE_BTC" },
                      { label: "Ethereum (ETH)", code: "ETH", addrKey: "WALLET_ETH", feeKey: "FEE_ETH" },
                      { label: "USDT (ERC-20)", code: "USDT_ERC20", addrKey: "WALLET_USDT_ERC20", feeKey: "FEE_USDT_ERC20" },
                      { label: "USDT (TRC-20)", code: "USDT_TRC20", addrKey: "WALLET_USDT_TRC20", feeKey: "FEE_USDT_TRC20" },
                      { label: "Solana (SOL)", code: "SOL", addrKey: "WALLET_SOL", feeKey: "FEE_SOL" },
                      { label: "Tron (TRX)", code: "TRX", addrKey: "WALLET_TRX", feeKey: "FEE_TRX" },
                    ].map(crypto => (
                      <div key={crypto.code} style={{ background: "var(--bg-secondary)", padding: "16px", borderRadius: "var(--radius-md)", border: "1px solid var(--border)" }}>
                        <h4 style={{ marginBottom: "12px", fontSize: "14px" }}>{crypto.label}</h4>
                        <div className="form-group">
                          <label className="form-label" style={{ fontSize: "11px" }}>Receiving Address</label>
                          <input 
                            className="form-input" 
                            style={{ fontFamily: "monospace", fontSize: "12px" }}
                            value={cryptoSettings[crypto.addrKey as keyof typeof cryptoSettings]} 
                            onChange={e => setCryptoSettings({...cryptoSettings, [crypto.addrKey]: e.target.value})} 
                            placeholder={`Enter ${crypto.code} address`} 
                          />
                        </div>
                        <div className="form-group" style={{ marginBottom: 0 }}>
                          <label className="form-label" style={{ fontSize: "11px" }}>Est. Network Fee (USD)</label>
                          <input 
                            className="form-input" 
                            type="number" step="0.01"
                            style={{ fontSize: "12px" }}
                            value={cryptoSettings[crypto.feeKey as keyof typeof cryptoSettings]} 
                            onChange={e => setCryptoSettings({...cryptoSettings, [crypto.feeKey]: e.target.value})} 
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

              </div>

              {/* Deposit Requests Review Table */}
              <div className="card cp-table-wrap">
                <h3 style={{ marginBottom: "16px", fontSize: "18px" }}>Legacy Wallet Deposit Requests</h3>
                {deposits.length === 0 ? (
                  <p style={{ color: "var(--text-secondary)", fontSize: "14px" }}>No deposit requests submitted.</p>
                ) : (
                  <table>
                    <thead>
                      <tr>
                        <th>Customer</th>
                        <th>Amount</th>
                        <th>Status</th>
                        <th>Created At</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {deposits.map(req => (
                        <tr key={req.id}>
                          <td>
                            <strong>{req.user.username}</strong>
                            {req.user.telegramUsername && (
                              <span style={{ fontSize: "12px", color: "var(--text-tertiary)", display: "block" }}>
                                @{req.user.telegramUsername}
                              </span>
                            )}
                          </td>
                          <td style={{ fontWeight: "600", color: "var(--green)" }}>${Number(req.amount).toFixed(2)}</td>
                          <td>
                            <span className={`badge ${
                              req.status === "APPROVED" ? "badge-green" :
                              req.status === "PENDING" ? "badge-orange" : "badge-red"
                            }`}>
                              {req.status}
                            </span>
                          </td>
                          <td style={{ color: "var(--text-tertiary)", fontSize: "13px" }}>
                            {new Date(req.createdAt).toLocaleString()}
                          </td>
                          <td>
                            {req.status === "PENDING" ? (
                              <div style={{ display: "flex", gap: "8px" }}>
                                <button onClick={() => handleProcessDeposit(req.id, "APPROVE")} className="btn btn-primary btn-sm">
                                  Approve
                                </button>
                                <button onClick={() => handleProcessDeposit(req.id, "REJECT")} className="btn btn-secondary btn-sm" style={{ color: "var(--red)" }}>
                                  Reject
                                </button>
                              </div>
                            ) : (
                              <span style={{ color: "var(--text-tertiary)", fontSize: "13px" }}>Processed</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}

          {/* DISPUTES */}
          {activeTab === "disputes" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "24px", animation: "fadeIn 0.4s ease" }}>
              <h2 className="cp-heading" style={{ fontSize: "28px" }}>Dispute Logs ({disputes.length})</h2>
              <div className="card" style={{ padding: "20px" }}>
                {disputes.length === 0 ? (
                  <p style={{ color: "var(--text-secondary)", textAlign: "center", padding: "40px 0" }}>No disputes recorded.</p>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
                    {disputes.map(d => (
                      <div key={d.id} style={{ padding: "20px", border: "1px solid var(--border)", borderRadius: "var(--radius-md)", background: "var(--bg-primary)", display: "flex", flexDirection: "column", gap: "12px" }}>
                        <div className="cp-dispute-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <span style={{ fontWeight: "600", fontSize: "15px" }}>
                            👤 {d.user.username} <span style={{ color: "var(--text-secondary)", fontWeight: "normal" }}>disputed Order #{d.order.id.slice(0,8)} ({d.order.items.map((i: any) => i.product.name).join(", ")})</span>
                          </span>
                          <span className={`badge ${d.status === "RESOLVED" ? "badge-green" : "badge-orange"}`}>{d.status}</span>
                        </div>
                        <p style={{ color: "var(--text-secondary)", fontSize: "14px", fontStyle: "italic", margin: 0, paddingLeft: "4px" }}>
                          Description: "{d.reason}"
                        </p>

                        {/* Dispute Chat Thread */}
                        <div style={{
                          display: "flex", flexDirection: "column", gap: "8px",
                          maxHeight: "220px", overflowY: "auto", padding: "10px",
                          background: "var(--bg-secondary)", borderRadius: "var(--radius-md)",
                          border: "1px solid var(--border)", marginTop: "8px"
                        }}>
                          {d.messages && d.messages.length > 0 ? (
                            d.messages.map((m: any) => {
                              const isAdmin = m.senderRole === "ADMIN";
                              return (
                                <div key={m.id} style={{
                                  alignSelf: isAdmin ? "flex-end" : "flex-start",
                                  maxWidth: "80%",
                                  background: isAdmin ? "var(--accent)" : "var(--bg-tertiary)",
                                  color: isAdmin ? "#fff" : "var(--text-primary)",
                                  padding: "8px 12px",
                                  borderRadius: isAdmin ? "12px 12px 2px 12px" : "12px 12px 12px 2px",
                                  fontSize: "13px"
                                }}>
                                  <strong style={{ display: "block", fontSize: "9px", opacity: 0.8, marginBottom: "2px" }}>{m.senderName}</strong>
                                  <span>{m.message}</span>
                                  <span style={{ display: "block", fontSize: "8px", opacity: 0.6, marginTop: "2px", textAlign: "right" }}>
                                    {new Date(m.createdAt).toLocaleTimeString()}
                                  </span>
                                </div>
                              );
                            })
                          ) : (
                            <p style={{ color: "var(--text-secondary)", fontSize: "11px", textAlign: "center", margin: "8px 0" }}>No conversation messages.</p>
                          )}
                        </div>

                        {/* Admin Message Reply Input */}
                        {d.status !== "RESOLVED" && (
                          <div style={{ display: "flex", gap: "8px", marginTop: "4px" }}>
                            <input
                              type="text"
                              className="form-input"
                              placeholder="Type a message to customer..."
                              value={disputeMessageTexts[d.id] || ""}
                              onChange={e => setDisputeMessageTexts(prev => ({ ...prev, [d.id]: e.target.value }))}
                              onKeyDown={e => { if (e.key === "Enter") handleSendDisputeMessage(d.id); }}
                            />
                            <button onClick={() => handleSendDisputeMessage(d.id)} className="btn btn-primary btn-sm">Reply</button>
                          </div>
                        )}

                        <div className="cp-dispute-footer" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid var(--border)", paddingTop: "12px", marginTop: "4px" }}>
                          <span style={{ fontSize: "12px", color: "var(--text-tertiary)" }}>
                            Resolved: <strong style={{ color: d.resolutionType ? "var(--text-primary)" : "var(--text-tertiary)" }}>{d.resolutionType || "Pending"}</strong>
                          </span>
                          
                          {d.status !== "RESOLVED" ? (
                            <div className="cp-dispute-actions" style={{ display: "flex", gap: "8px" }}>
                              <button onClick={() => handleResolveDispute(d.id, "REFUND")} className="btn btn-secondary btn-sm" style={{ color: "var(--green)" }}>Refund</button>
                              <button onClick={() => handleResolveDispute(d.id, "CREDIT")} className="btn btn-secondary btn-sm" style={{ color: "var(--blue)" }}>Credit</button>
                              <button onClick={() => handleResolveDispute(d.id, "REPLACEMENT")} className="btn btn-secondary btn-sm" style={{ color: "var(--purple)" }}>Replace</button>
                              <button onClick={() => handleResolveDispute(d.id, "REJECTED")} className="btn btn-secondary btn-sm" style={{ color: "var(--red)" }}>Reject</button>
                            </div>
                          ) : (
                            <span style={{ fontSize: "12px", color: "var(--text-tertiary)" }}>Closed {new Date(d.updatedAt).toLocaleDateString()}</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Employees Tab */}
          {activeTab === "employees" && (
            <div style={{ animation: "fadeIn 0.4s ease" }}>
              <StaffManagement />
            </div>
          )}

          {/* Coupons Tab */}
          {activeTab === "coupons" && (
            <div style={{ animation: "fadeIn 0.4s ease" }}>
              <CouponManagement />
            </div>
          )}

          {/* Locations Modal */}
          {showLocationsModal && (
            <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.6)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <div className="card cp-modal" style={{ width: "90%", maxWidth: "600px", maxHeight: "80vh", display: "flex", flexDirection: "column", animation: "popIn 0.3s ease" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                  <h2 style={{ fontSize: "20px" }}>Manage Product Availability</h2>
                  <button onClick={() => setShowLocationsModal(null)} style={{ background: "none", border: "none", fontSize: "24px", cursor: "pointer", color: "var(--text-secondary)" }}>&times;</button>
                </div>
                
                <div style={{ flex: 1, overflowY: "auto", padding: "4px", display: "flex", flexDirection: "column", gap: "16px" }}>
                  {locations.length === 0 ? (
                    <p style={{ color: "var(--text-secondary)" }}>No cities available. Add them in the Locations tab first.</p>
                  ) : locations.map(city => {
                    const isNew = showLocationsModal === "new";
                    const currentState = isNew ? newProduct : editProductData;
                    const setState = isNew ? setNewProduct : setEditProductData;
                    
                    const isCitySelected = currentState.cityIds.includes(city.id);
                    
                    const toggleCity = (checked: boolean) => {
                      let nextCityIds = [...currentState.cityIds];
                      let nextAreaIds = [...currentState.areaIds];
                      
                      if (checked) {
                        nextCityIds.push(city.id);
                      } else {
                        nextCityIds = nextCityIds.filter(id => id !== city.id);
                        const cityAreaIds = city.areas?.map((a:any) => a.id) || [];
                        nextAreaIds = nextAreaIds.filter(id => !cityAreaIds.includes(id));
                      }
                      
                      setState({ ...currentState, cityIds: nextCityIds, areaIds: nextAreaIds } as any);
                    };
                    
                    const toggleArea = (areaId: string, checked: boolean) => {
                      let nextAreaIds = [...currentState.areaIds];
                      let nextCityIds = [...currentState.cityIds];
                      if (checked) {
                        nextAreaIds.push(areaId);
                        if (!nextCityIds.includes(city.id)) nextCityIds.push(city.id);
                      } else {
                        nextAreaIds = nextAreaIds.filter(id => id !== areaId);
                      }
                      setState({ ...currentState, cityIds: nextCityIds, areaIds: nextAreaIds } as any);
                    };

                    return (
                      <div key={city.id} style={{ border: "1px solid var(--border)", borderRadius: "var(--radius-md)", overflow: "hidden" }}>
                        <div style={{ background: "var(--bg-secondary)", padding: "12px 16px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: "8px" }}>
                          <input type="checkbox" checked={isCitySelected} onChange={e => toggleCity(e.target.checked)} style={{ transform: "scale(1.2)" }} />
                          <strong style={{ fontSize: "16px" }}>{city.name}</strong>
                        </div>
                        {isCitySelected && city.areas && city.areas.length > 0 && (
                          <div style={{ padding: "12px 16px", display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: "12px" }}>
                            {city.areas.map((area: any) => (
                              <label key={area.id} style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
                                <input type="checkbox" checked={currentState.areaIds.includes(area.id)} onChange={e => toggleArea(area.id, e.target.checked)} />
                                <span style={{ fontSize: "14px" }}>{area.name}</span>
                              </label>
                            ))}
                          </div>
                        )}
                        {isCitySelected && (!city.areas || city.areas.length === 0) && (
                          <div style={{ padding: "12px 16px", fontSize: "13px", color: "var(--text-secondary)" }}>
                            No areas defined for this city.
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                <div style={{ padding: "16px 0 0", marginTop: "16px", borderTop: "1px solid var(--border)", display: "flex", justifyContent: "flex-end", gap: "12px" }}>
                  <button onClick={() => setShowLocationsModal(null)} className="btn btn-primary">Done</button>
                </div>
              </div>
            </div>
          )}

        </main>
      </div>
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}} />
    </div>
  );
}
