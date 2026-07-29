import Link from "next/link";
import ThemeToggle from "./ThemeToggle";

import { useLanguage } from "./LanguageContext";

export default function SiteFooter() {
  const { t } = useLanguage();
  return (
    <footer className="site-footer">
      <div className="footer-grid">
        <div className="footer-intro">
          <Link href="/" className="brand-lockup"><img src="/logo.png" alt="Camel971" style={{ width: 28, height: 28, borderRadius: "50%", objectFit: "cover" }} /><span>Camel971</span></Link>
          <p>{t("footer.desc") || "A premium, privacy-first marketplace with secure ordering and always-on Telegram access."}</p>
        </div>
        <div>
          <h3>{t("footer.explore") || "Explore"}</h3>
          <div className="footer-links">
            <Link href="/">{t("footer.home") || "Home"}</Link>
            <Link href="/auth/register">{t("footer.create") || "Create account"}</Link>
            <Link href="/auth/login">{t("footer.signin") || "Sign in"}</Link>
          </div>
        </div>
        <div>
          <h3>{t("footer.secure") || "Secure access"}</h3>
          <div className="footer-links">
            <a href="https://t.me/Camel971_bot" target="_blank" rel="noreferrer">{t("footer.bot") || "Telegram Bot"}</a>
            <span>{t("footer.wallet") || "Encrypted wallet"}</span>
            <span>{t("footer.247") || "24/7 availability"}</span>
          </div>
        </div>
        <div>
          <h3>{t("footer.appearance") || "Appearance"}</h3>
          <p className="footer-theme-copy">{t("footer.theme") || "Choose the view that feels right for you."}</p>
          <ThemeToggle />
        </div>
      </div>
      <div className="footer-bottom">{t("footer.rights") || `© ${new Date().getFullYear()} Camel971. All rights reserved.`}</div>
    </footer>
  );
}
