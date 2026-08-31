"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import ThemeToggle from "@/components/ThemeToggle";
import Turnstile, { TURNSTILE_ENABLED } from "@/components/Turnstile";
import styles from "../auth.module.css";
import { trackSignUp } from "@/lib/analytics";

const BOT_USERNAME = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME || "camel_products_bot";

export default function Register() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState("");
  // See the login page: a Turnstile token is single-use, so every rejected
  // attempt has to start a fresh challenge or the retry fails as a duplicate.
  const [turnstileReset, setTurnstileReset] = useState(0);
  const [referralCode, setReferralCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Prefill from ?ref=CODE so a referrer can share one link instead of asking
  // their invitee to copy a code across by hand - the step where codes get
  // mistyped and the referrer quietly loses their bonus. Read from the URL
  // rather than useSearchParams so this page needs no Suspense boundary.
  useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.search).get("ref");
    if (fromUrl) setReferralCode(fromUrl.trim().toUpperCase());
  }, []);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault(); setError(""); setLoading(true);
    try {
      if (password !== confirmPassword) {
        setError("Passwords do not match");
        setLoading(false);
        return;
      }
      const res = await fetch("/api/auth/register", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username, password, confirmPassword, referralCode, turnstileToken }) });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Registration failed"); setLoading(false); setTurnstileReset((n) => n + 1); return; }
      // The account genuinely exists from this line on, which makes this the
      // only honest place to count a sign-up: on submit it would count
      // attempts, and on the dashboard it would count every later visit.
      // Fires Google and X independently and never throws - see lib/analytics.
      trackSignUp();
      router.push("/dashboard"); router.refresh();
    } catch { setError("An unexpected error occurred. Please try again."); setLoading(false); setTurnstileReset((n) => n + 1); }
  };

  return <main className={styles.page}>
    <div className={styles.topbar}><Link href="/" className={styles.brand}><img src="/logo.png" alt="Camel971" style={{ width: 28, height: 28, borderRadius: "50%", objectFit: "cover", marginRight: 8 }} />Camel971</Link><ThemeToggle compact /></div>
    <section className={styles.card}>
      <div className={styles.heading}>
        <div className={styles.headingRow}>
          <h1>Create account</h1>
          {/* Reachable before signing in on purpose: the bot is a full second
              storefront, and a visitor who prefers it should not have to get
              through this form first. */}
          <a href={`https://t.me/${BOT_USERNAME}`} target="_blank" rel="noopener noreferrer" className={styles.botLink}>
            <span aria-hidden>✈️</span><span>Telegram bot</span>
          </a>
        </div>
        <p>Join Camel971to browse, order, and manage your secure wallet.</p>
      </div>
      {error && <div className="alert alert-error">{error}</div>}
      <form className={styles.form} onSubmit={handleSubmit}>
        <div className={styles.field}><label htmlFor="reg-username">Login</label><input id="reg-username" className="form-input" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Minimum 3 characters" required /></div>
        <div className={styles.field}><label htmlFor="reg-password">Password</label><div className={styles.passwordWrap}><input id="reg-password" type={showPassword ? "text" : "password"} className="form-input" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Minimum 6 characters" required /><button type="button" className={styles.iconButton} onClick={() => setShowPassword(!showPassword)} aria-label="Toggle password visibility">{showPassword ? "◉" : "◌"}</button></div></div>
        <div className={styles.field}><label htmlFor="reg-confirm-password">Confirm Password</label><div className={styles.passwordWrap}><input id="reg-confirm-password" type={showConfirmPassword ? "text" : "password"} className="form-input" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Minimum 6 characters" required /><button type="button" className={styles.iconButton} onClick={() => setShowConfirmPassword(!showConfirmPassword)} aria-label="Toggle password visibility">{showConfirmPassword ? "◉" : "◌"}</button></div></div>
        <div className={styles.field}><label htmlFor="reg-referral">Referral code <span style={{ color: "var(--text-tertiary)", fontWeight: 400 }}>(optional)</span></label><input id="reg-referral" className="form-input" value={referralCode} onChange={(e) => setReferralCode(e.target.value.toUpperCase())} placeholder="Enter a friend's code" autoComplete="off" spellCheck={false} /><p style={{ fontSize: "11px", color: "var(--text-tertiary)", marginTop: "4px" }}>Invited by someone? Their code earns them a bonus once you complete your first order.</p></div>
        {TURNSTILE_ENABLED && <div className={styles.captcha}><div className={styles.captchaLine}><span className={styles.captchaLabel}>Security check</span></div><Turnstile onToken={setTurnstileToken} resetKey={turnstileReset} /></div>}
        {/* Disabled until the challenge is solved - but only when Turnstile is
            configured, or a missing site key would leave nobody able to sign up. */}
        <button type="submit" className={`btn btn-primary ${styles.submit}`} disabled={loading || (TURNSTILE_ENABLED && !turnstileToken)}>{loading ? "Creating account…" : "Create account"}</button>
      </form>
      <p className={styles.alternate}>Already have an account? <Link href="/auth/login">Sign in</Link></p>
    </section>
  </main>;
}
