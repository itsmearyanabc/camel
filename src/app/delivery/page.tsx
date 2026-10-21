import Link from "next/link";
import { getSession } from "@/lib/auth";
import SiteFooter from "@/components/SiteFooter";
import ThemeToggle from "@/components/ThemeToggle";
import styles from "../home.module.css";

/**
 * Public "How delivery works" page - the destination of the landing-page bar.
 *
 * Outside /dashboard and with no session check, for the same reason /channels
 * is: this exists to answer a question a visitor has BEFORE they sign up, and
 * putting it behind login would defeat the entire point of asking it on the
 * landing page.
 *
 * The guide itself is one designed image rather than re-typed markup. It is
 * artwork the shop already publishes elsewhere, so a second hand-built copy
 * here would be a second thing to update every time the process changes - and
 * the two would drift. Swapping the file swaps the page.
 */
export const metadata = {
  title: "How Delivery Works — Camel971",
  description:
    "Place your order, receive the GPS coordinates, reach the location and collect. Four simple steps.",
};

/**
 * The guide artwork, served from /public.
 *
 * Declared once so replacing the image is a one-line change here. If you export
 * a PNG instead, change the extension in this constant only - nothing else
 * references the path.
 */
const GUIDE_IMAGE = "/delivery-guide.jpg";

export default async function DeliveryGuidePage() {
  const session = await getSession();

  const dashboardHref = session
    ? session.role === "ADMIN" || session.role === "SUPERADMIN"
      ? "/control-panel-x7k9"
      : "/dashboard"
    : "/auth/register";

  return (
    <div className={styles.page}>
      <header className={styles.nav}>
        <Link href="/" className="brand-lockup">
          <img src="/logo-wordmark.png" alt="Camel971" className="brand-wordmark" />
        </Link>
        <div className={styles.navLinks}>
          <Link href="/#discover">Discover</Link>
          <Link href="/#access">Access</Link>
        </div>
        <div className={styles.navRight}>
          <ThemeToggle compact />
          <div className={styles.navActions}>
            {!session && (
              <Link href="/auth/login" className="btn btn-ghost btn-sm">
                Sign in
              </Link>
            )}
            <Link href={dashboardHref} className="btn btn-primary btn-sm">
              {session ? "Dashboard" : "Get started"}
            </Link>
          </div>
        </div>
      </header>

      <main style={{ maxWidth: "1180px", margin: "46px auto 0", padding: "0 24px 40px" }}>
        <Link
          href="/"
          className="btn btn-ghost btn-sm"
          style={{ marginBottom: "20px", display: "inline-flex" }}
        >
          ← Back to Home
        </Link>

        <div style={{ marginBottom: "28px" }}>
          <h1 style={{ fontSize: "28px", marginBottom: "8px" }}>How delivery works</h1>
          <p style={{ color: "var(--text-secondary)", fontSize: "14px" }}>
            Simple, discreet and convenient — four steps from placing your order to collecting it.
          </p>
        </div>

        {/* The artwork is a tall portrait infographic. Capping the column keeps
            it readable on a wide monitor instead of stretching to 1180px and
            forcing the reader to scroll past their own screen height, while
            width:100% still lets it shrink to fit a phone. */}
        <div style={{ maxWidth: "720px", margin: "0 auto" }}>
          <img
            src={GUIDE_IMAGE}
            alt="How delivery works: place your order, receive two pictures with the GPS coordinates, follow the map to the location, then find and collect your order at the marked spot."
            style={{
              width: "100%",
              height: "auto",
              display: "block",
              borderRadius: "var(--radius-lg)",
              border: "1px solid var(--border)",
            }}
          />
        </div>

        <div style={{ textAlign: "center", marginTop: "32px" }}>
          <Link href={dashboardHref} className="btn btn-primary">
            {session ? "Open dashboard" : "Create account"} <span>→</span>
          </Link>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
