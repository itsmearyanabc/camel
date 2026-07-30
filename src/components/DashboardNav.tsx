"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import ThemeToggle from "@/components/ThemeToggle";
import { formatPrice, FIAT_CURRENCIES } from "@/lib/currencies";
import { useLanguage, LanguageCode } from "@/components/LanguageContext";
import NotificationBell from "@/components/NotificationBell";
import styles from "../app/dashboard/dashboard.module.css";

type Tab = "shop" | "wallet" | "orders" | "disputes" | "profile" | "settings" | "favorites" | "reviews";

interface DashboardNavProps {
  user: any;
  activeTab: Tab;
  setActiveTab: (tab: Tab) => void;
  onLogout: () => void;
  hasActiveOrders: boolean;
  botUsername: string;
}

export default function DashboardNav({
  user,
  activeTab,
  setActiveTab,
  onLogout,
  hasActiveOrders,
  botUsername,
}: DashboardNavProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const [currencyOpen, setCurrencyOpen] = useState(false);
  const currencyRef = useRef<HTMLDivElement>(null);
  const [languageOpen, setLanguageOpen] = useState(false);
  const languageRef = useRef<HTMLDivElement>(null);

  // Close menus when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
      if (currencyRef.current && !currencyRef.current.contains(event.target as Node)) {
        setCurrencyOpen(false);
      }
      if (languageRef.current && !languageRef.current.contains(event.target as Node)) {
        setLanguageOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleCurrencyChange = async (currency: string) => {
    setCurrencyOpen(false);
    try {
      const res = await fetch("/api/wallet/change-currency", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currency })
      });
      if (res.ok) {
        window.location.reload();
      }
    } catch (e) {
      console.error("Currency change failed", e);
    }
  };

  const handleTabClick = (tab: Tab) => {
    setActiveTab(tab);
    setMenuOpen(false);
  };

  const username = user?.username || "USER";
  const balance = user?.wallet?.balance || 0;
  const activeCurrency = user?.wallet?.currency || "USD";

  // All supported currencies for the dropdown
  const currencyList = Object.values(FIAT_CURRENCIES);
  
  const { language: activeLanguage, setLanguage: setActiveLanguage, t } = useLanguage();
  
  const languages: { code: LanguageCode; name: string; iconUrl: string }[] = [
    { code: "EN", name: "English", iconUrl: "https://flagcdn.com/w40/gb.png" },
    { code: "RU", name: "Русский", iconUrl: "https://flagcdn.com/w40/ru.png" },
    { code: "AR", name: "العربية", iconUrl: "https://flagcdn.com/w40/sa.png" },
    { code: "TR", name: "Türkçe", iconUrl: "https://flagcdn.com/w40/tr.png" },
    { code: "ZH", name: "中文", iconUrl: "https://flagcdn.com/w40/cn.png" },
    { code: "ES", name: "Español", iconUrl: "https://flagcdn.com/w40/es.png" },
  ];

  // Bottom tab items
  const bottomTabs: { key: Tab; label: string; icon: string }[] = [
    { key: "shop", label: t("nav.shop"), icon: "🛒" },
    { key: "wallet", label: t("nav.wallet"), icon: "💳" },
    { key: "orders", label: t("nav.orders"), icon: "📦" },
    { key: "disputes", label: t("nav.tickets"), icon: "🎟" },
    { key: "profile", label: t("nav.profile"), icon: "👤" },
  ];

  return (
    <>
      <header className={styles.topnav} style={{ padding: "12px 24px", justifyContent: "space-between" }}>
        {/* Left side: Username */}
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <Link 
            href="/dashboard"
            onClick={() => setActiveTab("shop")}
            style={{ 
              display: "flex",
              alignItems: "center",
              gap: "10px",
              fontWeight: "700", 
              fontSize: "16px",
              letterSpacing: "0.03em",
              color: "var(--text-primary)",
              whiteSpace: "nowrap",
            }}
          >
            <img src="/logo.png?v=2" alt="Camel971" style={{ width: 28, height: 28, borderRadius: "50%", objectFit: "cover" }} />
            {username}
          </Link>
        </div>

        {/* Right side: Actions & Profile */}
        <div className={styles.account} style={{ gap: "8px" }}>
          {/* Bot link — desktop only */}
          <a
            href={`https://t.me/${botUsername}`}
            target="_blank"
            rel="noopener noreferrer"
            className={`btn btn-ghost btn-sm ${styles.hideOnMobile}`}
            style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "13px", padding: "6px 12px" }}
          >
            <span style={{ fontSize: "16px" }}>🤖</span> Bot
          </a>

          {/* Currency Picker */}
          <div className={styles.menuWrap} ref={currencyRef}>
            <button
              type="button"
              onClick={() => setCurrencyOpen(!currencyOpen)}
              className="btn btn-ghost btn-sm"
              style={{ fontWeight: "700", padding: "6px 12px", fontSize: "14px", display: "flex", gap: "6px", alignItems: "center", whiteSpace: "nowrap" }}
              title="Change Currency"
            >
              {formatPrice(balance, activeCurrency, user?.wallet?.exchangeRate || 1)}
            </button>
            
            <nav
              className={`${styles.menuPanel} ${currencyOpen ? styles.menuPanelOpen : ""}`}
              style={{ left: "50%", right: "auto", transform: "translateX(-50%)", top: "calc(100% + 12px)", minWidth: "180px", padding: "8px 0" }}
            >
              {currencyList.map(cur => (
                <button
                  key={cur.code}
                  type="button"
                  onClick={() => handleCurrencyChange(cur.code)}
                  className={`${styles.menuItem} ${activeCurrency === cur.code ? styles.currencyItemActive : ""}`}
                  style={{ justifyContent: "space-between" }}
                >
                  <span style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <span style={{ width: "18px", fontWeight: "bold", fontSize: "15px", textAlign: "center" }}>{cur.symbol}</span>
                    {cur.name}
                  </span>
                  {activeCurrency === cur.code && (
                    <span style={{ fontSize: "14px", color: "var(--accent)" }}>✓</span>
                  )}
                </button>
              ))}
            </nav>
          </div>

          {/* Language selector — visible on all devices */}
          <div className={styles.menuWrap} ref={languageRef}>
            <button
              type="button"
              onClick={() => setLanguageOpen(!languageOpen)}
              className="btn btn-ghost btn-sm"
              style={{ display: "flex", alignItems: "center", gap: "6px", padding: "6px 12px" }}
            >
              <img src={languages.find(l => l.code === activeLanguage)?.iconUrl || "https://flagcdn.com/w40/gb.png"} alt="flag" style={{ width: "20px", borderRadius: "2px" }} aria-hidden="true" />
              {languages.find(l => l.code === activeLanguage)?.name || "English"}
            </button>
            <nav
              className={`${styles.menuPanel} ${languageOpen ? styles.menuPanelOpen : ""}`}
              style={{ left: "50%", right: "auto", transform: "translateX(-50%)", top: "calc(100% + 12px)", minWidth: "160px", padding: "8px 0" }}
            >
              {languages.map(lang => (
                <button
                  key={lang.code}
                  type="button"
                  onClick={() => { setActiveLanguage(lang.code); setLanguageOpen(false); }}
                  className={`${styles.menuItem} ${activeLanguage === lang.code ? styles.currencyItemActive : ""}`}
                  style={{ justifyContent: "space-between" }}
                >
                  <span style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <img src={lang.iconUrl} alt={lang.name} style={{ width: "20px", borderRadius: "2px" }} />
                    {lang.name}
                  </span>
                  {activeLanguage === lang.code && (
                    <span style={{ fontSize: "14px", color: "var(--accent)" }}>✓</span>
                  )}
                </button>
              ))}
            </nav>
          </div>

          <ThemeToggle compact />

          {/* Notification Bell */}
          <NotificationBell />

          {/* Avatar / hamburger menu */}
          <div className={styles.menuWrap} ref={menuRef}>
            <button
              type="button"
              onClick={() => setMenuOpen(!menuOpen)}
              style={{
                width: "36px", height: "36px",
                borderRadius: "50%",
                border: "2px solid var(--border)",
                background: "linear-gradient(135deg, var(--accent) 0%, var(--purple) 100%)",
                color: "#fff",
                fontWeight: "700",
                fontSize: "14px",
                display: "flex", alignItems: "center", justifyContent: "center",
                cursor: "pointer",
                padding: 0,
                marginLeft: "4px",
                overflow: "hidden"
              }}
              aria-label="Open profile menu"
              aria-expanded={menuOpen}
            >
              {user?.avatarUrl ? (
                <img src={user.avatarUrl} alt="Avatar" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              ) : (
                username.slice(0, 2).toUpperCase()
              )}
            </button>

            {/* Dropdown Menu */}
            <nav
              className={`${styles.menuPanel} ${menuOpen ? styles.menuPanelOpen : ""}`}
              style={{ right: 0, top: "calc(100% + 12px)", minWidth: "220px", padding: "8px 0" }}
            >
              <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", marginBottom: "8px" }}>
                <strong style={{ display: "block", fontSize: "15px", marginBottom: "2px" }}>{username}</strong>
                <span style={{ fontSize: "13px", color: "var(--text-secondary)" }}>Balance: {formatPrice(balance, activeCurrency, user?.wallet?.exchangeRate || 1)}</span>
              </div>

              <button type="button" onClick={() => handleTabClick("profile")} className={styles.menuItem}>
                <span style={{ width: "20px" }}>👤</span> {t("nav.profile")}
              </button>
              <button type="button" onClick={() => handleTabClick("favorites")} className={styles.menuItem}>
                <span style={{ width: "20px" }}>🤍</span> Favorites
              </button>
              <button type="button" onClick={() => handleTabClick("wallet")} className={styles.menuItem}>
                <span style={{ width: "20px" }}>💳</span> {t("nav.wallet")}
              </button>
              <button type="button" onClick={() => handleTabClick("orders")} className={styles.menuItem} style={{ position: "relative" }}>
                <span style={{ width: "20px" }}>🛍️</span> {t("nav.orders")}
                {hasActiveOrders && <i className={styles.dot} style={{ position: "absolute", right: "12px" }} />}
              </button>
              <button type="button" onClick={() => handleTabClick("disputes")} className={styles.menuItem}>
                <span style={{ width: "20px" }}>🔍</span> {t("nav.tickets")}
              </button>
              <button type="button" onClick={() => handleTabClick("reviews")} className={styles.menuItem}>
                <span style={{ width: "20px" }}>💬</span> Reviews
              </button>
              <button type="button" onClick={() => handleTabClick("settings")} className={styles.menuItem}>
                <span style={{ width: "20px" }}>⚙️</span> Settings
              </button>
              
              {/* Bot link inside menu — for mobile convenience */}
              <a
                href={`https://t.me/${botUsername}`}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.menuItem}
              >
                <span style={{ width: "20px" }}>🤖</span> Telegram Bot
              </a>


              
              <div style={{ height: "1px", background: "var(--border)", margin: "8px 0" }} />
              
              <button type="button" onClick={onLogout} className={styles.menuItem} style={{ color: "var(--red)" }}>
                <span style={{ width: "20px" }}>↪</span> Sign Out
              </button>
            </nav>
          </div>
        </div>
      </header>

      {/* Mobile Bottom Tab Bar */}
      <nav className={styles.bottomBar}>
        {bottomTabs.map(tab => (
          <button
            key={tab.key}
            type="button"
            className={`${styles.bottomBarItem} ${activeTab === tab.key ? styles.bottomBarItemActive : ""}`}
            onClick={() => setActiveTab(tab.key)}
          >
            <span>{tab.icon}</span>
            <span>{tab.label}</span>
          </button>
        ))}
      </nav>
    </>
  );
}
