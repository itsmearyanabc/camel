"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import ThemeToggle from "@/components/ThemeToggle";
import styles from "../auth.module.css";

const BOT_USERNAME = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME || "camel_products_bot";

export default function Login() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [captchaQuestion, setCaptchaQuestion] = useState("");
  const [captchaToken, setCaptchaToken] = useState("");
  const [captchaAnswer, setCaptchaAnswer] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const loadCaptcha = async () => {
    try {
      const res = await fetch("/api/auth/captcha");
      const data = await res.json();
      if (res.ok) { setCaptchaQuestion(data.question); setCaptchaToken(data.token); setCaptchaAnswer(""); }
    } catch { setError("Unable to load security verification. Please refresh."); }
  };

  useEffect(() => { loadCaptcha(); }, []);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault(); setError(""); setLoading(true);
    try {
      const res = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username, password, captchaAnswer, captchaToken }) });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Login failed"); setLoading(false); loadCaptcha(); return; }
      router.push(["ADMIN", "SUPERADMIN", "STAFF"].includes(data.user?.role) ? "/control-panel-x7k9" : "/dashboard");
      router.refresh();
    } catch { setError("An unexpected error occurred. Please try again."); setLoading(false); loadCaptcha(); }
  };

  const isLocked = error.toLowerCase().includes("locked");

  return <main className={styles.page}>
    <div className={styles.topbar}><Link href="/" className={styles.brand}><img src="/logo.png" alt="Camel971" style={{ width: 28, height: 28, borderRadius: "50%", objectFit: "cover", marginRight: 8 }} />Camel971</Link><ThemeToggle compact /></div>
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
        <div className={styles.captcha}><div className={styles.captchaLine}><label htmlFor="login-captcha">Security check</label><button type="button" className={styles.refresh} onClick={loadCaptcha} disabled={isLocked}>↻ Refresh</button></div><div className={styles.captchaQuestion}>{captchaQuestion || "Loading…"}</div><input id="login-captcha" className="form-input" value={captchaAnswer} onChange={(e) => { setCaptchaAnswer(e.target.value); setError(""); }} placeholder="Enter solution" required disabled={isLocked} style={{ marginTop: 10 }} /></div>
        <button type="submit" className={`btn btn-primary ${styles.submit}`} disabled={loading || isLocked}>{loading ? "Signing in…" : isLocked ? "Locked" : "Sign in"}</button>
      </form>
      <p className={styles.alternate}>Don&apos;t have an account? <Link href="/auth/register">Sign up</Link></p>
    </section>
  </main>;
}
