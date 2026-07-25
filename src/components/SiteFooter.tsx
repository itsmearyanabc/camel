import Link from "next/link";
import ThemeToggle from "./ThemeToggle";

export default function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="footer-grid">
        <div className="footer-intro">
          <Link href="/" className="brand-lockup"><img src="/logo.png" alt="Camel971" style={{ width: 28, height: 28, borderRadius: "50%", objectFit: "cover" }} /><span>Camel971</span></Link>
          <p>A premium, privacy-first marketplace with secure ordering and always-on Telegram access.</p>
        </div>
        <div>
          <h3>Explore</h3>
          <div className="footer-links">
            <Link href="/">Home</Link>
            <Link href="/auth/register">Create account</Link>
            <Link href="/auth/login">Sign in</Link>
          </div>
        </div>
        <div>
          <h3>Secure access</h3>
          <div className="footer-links">
            <a href="https://t.me/Camel971_bot" target="_blank" rel="noreferrer">Telegram Bot</a>
            <span>Encrypted wallet</span>
            <span>24/7 availability</span>
          </div>
        </div>
        <div>
          <h3>Appearance</h3>
          <p className="footer-theme-copy">Choose the view that feels right for you.</p>
          <ThemeToggle />
        </div>
      </div>
      <div className="footer-bottom">© {new Date().getFullYear()} Camel971. All rights reserved.</div>
    </footer>
  );
}
