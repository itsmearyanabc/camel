"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import ThemeToggle from "@/components/ThemeToggle";
import styles from "../auth.module.css";

export default function Register() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [captchaQuestion, setCaptchaQuestion] = useState("");
  const [captchaToken, setCaptchaToken] = useState("");
  const [captchaAnswer, setCaptchaAnswer] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const loadCaptcha = async () => {
    try { const res = await fetch("/api/auth/captcha"); const data = await res.json(); if (res.ok) { setCaptchaQuestion(data.question); setCaptchaToken(data.token); setCaptchaAnswer(""); } }
    catch { setError("Unable to load security verification. Please refresh."); }
  };
  useEffect(() => { loadCaptcha(); }, []);
  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault(); setError(""); setLoading(true);
    try {
      if (password !== confirmPassword) {
        setError("Passwords do not match");
        setLoading(false);
        return;
      }
      const res = await fetch("/api/auth/register", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username, password, confirmPassword, captchaAnswer, captchaToken }) });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Registration failed"); setLoading(false); loadCaptcha(); return; }
      router.push("/dashboard"); router.refresh();
    } catch { setError("An unexpected error occurred. Please try again."); setLoading(false); loadCaptcha(); }
  };

  return <main className={styles.page}>
    <div className={styles.topbar}><Link href="/" className={styles.brand}><img src="/logo.png" alt="Camel971" style={{ width: 28, height: 28, borderRadius: "50%", objectFit: "cover", marginRight: 8 }} />Camel971</Link><ThemeToggle compact /></div>
    <section className={styles.card}>
      <div className={styles.heading}><h1>Create account</h1><p>Join Camel971to browse, order, and manage your secure wallet.</p></div>
      {error && <div className="alert alert-error">{error}</div>}
      <form className={styles.form} onSubmit={handleSubmit}>
        <div className={styles.field}><label htmlFor="reg-username">Login</label><input id="reg-username" className="form-input" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Minimum 3 characters" required /></div>
        <div className={styles.field}><label htmlFor="reg-password">Password</label><div className={styles.passwordWrap}><input id="reg-password" type={showPassword ? "text" : "password"} className="form-input" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Minimum 6 characters" required /><button type="button" className={styles.iconButton} onClick={() => setShowPassword(!showPassword)} aria-label="Toggle password visibility">{showPassword ? "◉" : "◌"}</button></div></div>
        <div className={styles.field}><label htmlFor="reg-confirm-password">Confirm Password</label><div className={styles.passwordWrap}><input id="reg-confirm-password" type={showConfirmPassword ? "text" : "password"} className="form-input" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Minimum 6 characters" required /><button type="button" className={styles.iconButton} onClick={() => setShowConfirmPassword(!showConfirmPassword)} aria-label="Toggle password visibility">{showConfirmPassword ? "◉" : "◌"}</button></div></div>
        <div className={styles.captcha}><div className={styles.captchaLine}><label htmlFor="reg-captcha">Security check</label><button type="button" className={styles.refresh} onClick={loadCaptcha}>↻ Refresh</button></div><div className={styles.captchaQuestion}>{captchaQuestion || "Loading…"}</div><input id="reg-captcha" className="form-input" value={captchaAnswer} onChange={(e) => setCaptchaAnswer(e.target.value)} placeholder="Enter solution" required style={{ marginTop: 10 }} /></div>
        <button type="submit" className={`btn btn-primary ${styles.submit}`} disabled={loading}>{loading ? "Creating account…" : "Create account"}</button>
      </form>
      <p className={styles.alternate}>Already have an account? <Link href="/auth/login">Sign in</Link></p>
    </section>
  </main>;
}
