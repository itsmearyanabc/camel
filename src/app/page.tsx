import Link from "next/link";
import { getSession } from "@/lib/auth";
import SiteFooter from "@/components/SiteFooter";
import ThemeToggle from "@/components/ThemeToggle";
import styles from "./home.module.css";

export const revalidate = 0;

export default async function Home() {
  const session = await getSession();
  const dashboardHref = session ? "/dashboard" : "/auth/register";
  return <div className={styles.page}>
    <header className={styles.nav}>
      <Link href="/" className="brand-lockup"><img src="/logo.png" alt="Camel971" className="brand-logo" style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover', boxShadow: '0 2px 8px rgba(189,123,28,0.3)' }} /></Link>
      <div className={styles.navLinks}><a href="#discover">Discover</a><a href="#access">Access</a></div>
      <div className={styles.navRight}><ThemeToggle compact /><div className={styles.navActions}>{!session && <Link href="/auth/login" className="btn btn-ghost btn-sm">Sign in</Link>}<Link href={session ? "/dashboard" : "/auth/register"} className="btn btn-primary btn-sm">{session ? "Dashboard" : "Get started"}</Link></div></div>
    </header>
    <main>
      <section className={styles.hero} id="discover">
        <div className={styles.copy}><span className={styles.eyebrow}>◆ Private marketplace</span><h1>The <span>Camel971</span> experience, refined.</h1><p>Discover a clean, secure way to browse products, manage your wallet, and follow every order — built around effortless access.</p><div className={styles.heroActions}><Link href={dashboardHref} className="btn btn-primary">{session ? "Open dashboard" : "Create account"} <span>→</span></Link>{!session && <Link href="/auth/login" className="btn btn-secondary">Sign in</Link>}</div></div>
        <div className={styles.visual} aria-hidden="true"><img src="/logo.png" alt="Camel971Hero" className={styles.heroImg} style={{ borderRadius: '50%', objectFit: 'cover' }} /><div className={`${styles.floatCard} ${styles.topCard}`}><span>Secure wallet</span><strong>Private by design</strong></div><div className={`${styles.floatCard} ${styles.bottomCard}`}><span>Always available</span><strong>24/7 bot access</strong></div></div>
      </section>
      <section className={styles.botBanner} id="access"><div className={styles.botInfo}><span className={styles.botIcon}>◌</span><div><strong>Shop 24/7 with the Camel971Bot</strong><p>Instant, secure access to your account anytime, anywhere.</p></div></div><a className="btn btn-primary btn-sm" href="https://t.me/Camel971_bot" target="_blank" rel="noreferrer">Talk to bot →</a></section>
      <section className={styles.features}><article className={styles.feature}><div className={styles.featureIcon}>◈</div><h3>Designed for clarity</h3><p>A calm, fast interface that makes products, payments, and order tracking easy to understand.</p></article><article className={styles.feature}><div className={styles.featureIcon}>◎</div><h3>Wallet confidence</h3><p>Keep your balance and transactions in one protected place, with transparent history.</p></article><article className={styles.feature}><div className={styles.featureIcon}>↗</div><h3>Access everywhere</h3><p>Move between the web dashboard and Telegram without losing your place.</p></article></section>
    </main>
    <SiteFooter />
  </div>;
}
