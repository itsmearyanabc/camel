"use client";

import React, { useEffect, useState } from "react";
import styles from "../app/dashboard/dashboard.module.css";
import { useLanguage } from "@/components/LanguageContext";

interface ReviewsProps {
  productId?: string;
  isLoggedIn?: boolean;
}

export default function Reviews({ productId, isLoggedIn = false }: ReviewsProps) {
  const { t } = useLanguage();
  const [reviews, setReviews] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  // Form state
  const [rating, setRating] = useState(5);
  const [text, setText] = useState("");
  const [location, setLocation] = useState("");

  const fetchReviews = async () => {
    try {
      const url = productId ? `/api/reviews?productId=${productId}` : "/api/reviews";
      const res = await fetch(url);
      const data = await res.json();
      if (Array.isArray(data)) {
        setReviews(data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReviews();
  }, [productId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch("/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId, rating, text, location })
      });
      if (res.ok) {
        setShowForm(false);
        setText("");
        setRating(5);
        setLocation("");
        fetchReviews(); // Refresh the list
      } else {
        alert("Failed to submit review. Are you logged in?");
      }
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <section style={{ padding: "40px 24px", maxWidth: "1200px", margin: "0 auto", width: "100%" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
        <h2 style={{ fontSize: "1.5rem", fontWeight: "700" }}>{t("reviews.title")}</h2>
        <span style={{ color: "var(--text-secondary)", fontSize: "0.9rem" }}>{reviews.length} {t("reviews.title").toLowerCase()}</span>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: "10px", marginBottom: "24px" }}>
        <div style={{ display: "flex", gap: "10px" }}>
          <select className="form-input" style={{ width: "auto", minWidth: "150px" }}>
            <option>{t("reviews.anyType")}</option>
          </select>
          <select className="form-input" style={{ width: "auto", minWidth: "150px" }}>
            <option>{t("reviews.anyCity")}</option>
          </select>
          <select className="form-input" style={{ width: "auto", minWidth: "150px" }}>
            <option>{t("reviews.anyProduct")}</option>
          </select>
        </div>
        
        {/* Write a review button */}
        {!showForm && (
          <button 
            className="btn btn-primary btn-sm" 
            onClick={() => {
              if (isLoggedIn) {
                setShowForm(true);
              } else {
                window.location.href = "/auth/login";
              }
            }}
          >
            {isLoggedIn ? t("reviews.write") : t("reviews.login")}
          </button>
        )}
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} style={{ background: "var(--surface)", padding: "20px", borderRadius: "12px", marginBottom: "24px" }}>
          <div style={{ marginBottom: "16px" }}>
            <label style={{ display: "block", marginBottom: "8px" }}>Rating</label>
            <select value={rating} onChange={e => setRating(Number(e.target.value))} className="form-input">
              <option value={5}>5 Stars - Excellent</option>
              <option value={4}>4 Stars - Good</option>
              <option value={3}>3 Stars - Average</option>
              <option value={2}>2 Stars - Poor</option>
              <option value={1}>1 Star - Terrible</option>
            </select>
          </div>
          <div style={{ marginBottom: "16px" }}>
            <label style={{ display: "block", marginBottom: "8px" }}>Location (Optional)</label>
            <input type="text" value={location} onChange={e => setLocation(e.target.value)} className="form-input" placeholder="e.g. Istanbul, TR" />
          </div>
          <div style={{ marginBottom: "16px" }}>
            <label style={{ display: "block", marginBottom: "8px" }}>Review</label>
            <textarea required value={text} onChange={e => setText(e.target.value)} className="form-input" rows={4} placeholder="Write your review here..."></textarea>
          </div>
          <div style={{ display: "flex", gap: "12px" }}>
            <button type="submit" className="btn btn-primary">{t("reviews.submit")}</button>
            <button type="button" className="btn btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
          </div>
        </form>
      )}

      {loading ? (
        <div style={{ textAlign: "center", padding: "40px" }}>Loading reviews...</div>
      ) : reviews.length === 0 ? (
        <div style={{ textAlign: "center", padding: "40px", color: "var(--text-secondary)" }}>No reviews yet. Be the first to leave one!</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {reviews.map((review) => (
            <div key={review.id} style={{ borderBottom: "1px solid var(--border)", paddingBottom: "16px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "8px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                  <div style={{ 
                    width: "32px", height: "32px", borderRadius: "50%", 
                    background: "var(--surface)", display: "flex", alignItems: "center", justifyContent: "center",
                    fontWeight: "bold", color: "var(--text-primary)", overflow: "hidden"
                  }}>
                    {review.user?.avatarUrl ? (
                      <img src={review.user.avatarUrl} alt="avatar" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    ) : (
                      review.user?.username?.[0]?.toUpperCase() || "A"
                    )}
                  </div>
                  <div>
                    <div style={{ fontSize: "0.95rem" }}>
                      <strong>{review.user?.username || "Anonymous"}</strong> 
                      {review.location && (
                        <span style={{ color: "var(--text-secondary)", fontSize: "0.85rem", marginLeft: "8px" }}>
                          • 📍 {review.location}
                        </span>
                      )}
                    </div>
                    <div style={{ color: "var(--accent)", fontSize: "0.9rem", marginTop: "2px" }}>
                      {"★".repeat(review.rating)}{"☆".repeat(5 - review.rating)}
                    </div>
                  </div>
                </div>
                <div style={{ color: "var(--text-secondary)", fontSize: "0.85rem" }}>
                  {new Date(review.createdAt).toLocaleDateString()}
                </div>
              </div>
              <p style={{ margin: "4px 0 0 44px", fontSize: "0.95rem" }}>{review.text}</p>
            </div>
          ))}
        </div>
      )}
      
      {!loading && reviews.length > 0 && (
        <div style={{ textAlign: "center", marginTop: "24px" }}>
          <button className="btn btn-secondary">{t("reviews.loadMore")}</button>
        </div>
      )}
    </section>
  );
}
