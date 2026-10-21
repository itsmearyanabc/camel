"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import ThemeToggle from "@/components/ThemeToggle";
import Turnstile, { TURNSTILE_ENABLED } from "@/components/Turnstile";
import styles from "../auth.module.css";
import { BOT_USERNAME } from "@/lib/botIdentity";


export default function Login() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState("");
  // Bumped after every rejected attempt. Turnstile tokens are single-use, so
  // reusing one on the retry fails as a duplicate however correct the password
  // is - the customer would be told their credentials were wrong when they
  // were not.
  const [turnstileReset, setTurnstileReset] = useState(0);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault(); setError(""); setLoading(true);
    try {
      const res = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username, password, turnstileToken }) });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Login failed"); setLoading(false); setTurnstileReset((n) => n + 1); return; }
      router.push(["ADMIN", "SUPERADMIN", "STAFF"].includes(data.user?.role) ? "/control-panel-x7k9" : "/dashboard");
      router.refresh();
    } catch { setError("An unexpected error occurred. Please try again."); setLoading(false); setTurnstileReset((n) => n + 1); }
  };

  const isLocked = error.toLowerCase().includes("locked");

  return <main className={styles.page}>
    <div className={styles.topbar}><Link href="/" className={styles.brand}><img src="/logo-wordmark.png" alt="Camel971" className="brand-wordmark" /></Link><ThemeToggle compact /></div>
    <section className={styles.card}>
      <div className={styles.heading}>
        <div className={styles.headingRow}>
          <h1>Sign in</h1>
          {/* Reachable before signing in on purpose: the bot is a full second
              storefront, and a visitor who prefers it should not have to get
              through this form first. */}
          <a href={`https://t.me/${BOT_USERNAME}`} target="_blank" rel="noopener noreferrer" className={styles.botLink}>
            <span aria-hidden>✈️</span><span>Telegram bot</span>
          </a>
        </div>
        <p>Enter your details below to access your Camel971account.</p>
      </div>
      {error && <div className="alert alert-error">{error}</div>}
      <form className={styles.form} onSubmit={handleSubmit}>
        <div className={styles.field}><label htmlFor="login-username">Login</label><input id="login-username" className="form-input" value={username} onChange={(e) => { setUsername(e.target.value); setError(""); }} placeholder="Enter login" required /></div>
        <div className={styles.field}><label htmlFor="login-password">Password</label><div className={styles.passwordWrap}><input id="login-password" type={showPassword ? "text" : "password"} className="form-input" value={password} onChange={(e) => { setPassword(e.target.value); setError(""); }} placeholder="Enter password" required disabled={isLocked} /><button type="button" className={styles.iconButton} onClick={() => setShowPassword(!showPassword)} aria-label="Toggle password visibility" disabled={isLocked}>{showPassword ? "◉" : "◌"}</button></div></div>
        {TURNSTILE_ENABLED && <div className={styles.captcha}><div className={styles.captchaLine}><span className={styles.captchaLabel}>Security check</span></div><Turnstile onToken={setTurnstileToken} resetKey={turnstileReset} /></div>}
        {/* Held closed until the challenge is solved, but only when Turnstile
            is actually configured - with no site key there is no widget and no
            token will ever arrive, which would make the form unsubmittable. */}
        <button type="submit" className={`btn btn-primary ${styles.submit}`} disabled={loading || isLocked || (TURNSTILE_ENABLED && !turnstileToken)}>{loading ? "Signing in…" : isLocked ? "Locked" : "Sign in"}</button>
      </form>
      <p className={styles.alternate}>Don&apos;t have an account? <Link href="/auth/register">Sign up</Link></p>
    </section>
  </main>;
}
