"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import ThemeToggle from "@/components/ThemeToggle";
import styles from "../auth.module.css";

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
      router.push(data.user?.role === "ADMIN" || data.user?.role === "SUPERADMIN" ? "/control-panel-x7k9" : "/dashboard");
      router.refresh();
    } catch { setError("An unexpected error occurred. Please try again."); setLoading(false); loadCaptcha(); }
  };

  return <main className={styles.page}>
    <div className={styles.topbar}><Link href="/" className={styles.brand}><span className={styles.brandMark}>SB</span>Camel971BOYZ</Link><ThemeToggle compact /></div>
    <section className={styles.card}>
      <div className={styles.heading}><h1>Sign in</h1><p>Enter your details below to access your Camel971account.</p></div>
      {error && <div className="alert alert-error">{error}</div>}
      <form className={styles.form} onSubmit={handleSubmit}>
        <div className={styles.field}><label htmlFor="login-username">Login</label><input id="login-username" className="form-input" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Enter login" required /></div>
        <div className={styles.field}><label htmlFor="login-password">Password</label><div className={styles.passwordWrap}><input id="login-password" type={showPassword ? "text" : "password"} className="form-input" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Enter password" required /><button type="button" className={styles.iconButton} onClick={() => setShowPassword(!showPassword)} aria-label="Toggle password visibility">{showPassword ? "◉" : "◌"}</button></div></div>
        <div className={styles.captcha}><div className={styles.captchaLine}><label htmlFor="login-captcha">Security check</label><button type="button" className={styles.refresh} onClick={loadCaptcha}>↻ Refresh</button></div><div className={styles.captchaQuestion}>{captchaQuestion || "Loading…"}</div><input id="login-captcha" className="form-input" value={captchaAnswer} onChange={(e) => setCaptchaAnswer(e.target.value)} placeholder="Enter solution" required style={{ marginTop: 10 }} /></div>
        <button type="submit" className={`btn btn-primary ${styles.submit}`} disabled={loading}>{loading ? "Signing in…" : "Sign in"}</button>
      </form>
      <p className={styles.alternate}>Don&apos;t have an account? <Link href="/auth/register">Sign up</Link></p>
    </section>
  </main>;
}
