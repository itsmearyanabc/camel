"use client";

import React from "react";
import styles from "../app/dashboard/dashboard.module.css";

const MOCK_REVIEWS = [
  { user: "yasamsafiri", product: "Fast Outdoor 5g", location: "Ankara, Alacaatlı", rating: 5, date: "07.24.2026", text: "elimi attığım gibi buldum çok iyi" },
  { user: "Angara7106", product: "AK-47 5g", location: "Ankara, Alacaatlı", rating: 5, date: "07.24.2026", text: "Mük mük" },
  { user: "xkraltr06", product: "Fast Outdoor 3g", location: "Ankara, Çayyolu", rating: 5, date: "07.22.2026", text: "Bulması kolaydı ürün de güzel" },
  { user: "Caesar", product: "Fast Outdoor 3g", location: "Ankara, Çayyolu", rating: 5, date: "07.21.2026", text: "😍" },
  { user: "Yurekcesur", product: "Dr. Seuss 200UG", location: "Istanbul, Küçükçekmece", rating: 5, date: "07.21.2026", text: "Kolay bulduk malı daha denemedim umarım iyidir" },
];

export default function Reviews() {
  return (
    <section style={{ padding: "40px 24px", maxWidth: "1200px", margin: "0 auto", width: "100%" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
        <h2 style={{ fontSize: "1.5rem", fontWeight: "700" }}>Reviews</h2>
        <span style={{ color: "var(--text-secondary)", fontSize: "0.9rem" }}>230 reviews</span>
      </div>

      <div style={{ display: "flex", gap: "10px", marginBottom: "24px" }}>
        <select className="form-input" style={{ width: "auto", minWidth: "150px" }}>
          <option>Any type</option>
        </select>
        <select className="form-input" style={{ width: "auto", minWidth: "150px" }}>
          <option>Any City</option>
        </select>
        <select className="form-input" style={{ width: "auto", minWidth: "150px" }}>
          <option>Any product</option>
        </select>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        {MOCK_REVIEWS.map((review, i) => (
          <div key={i} style={{ borderBottom: "1px solid var(--border)", paddingBottom: "16px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "8px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <div style={{ 
                  width: "32px", height: "32px", borderRadius: "50%", 
                  background: "var(--surface)", display: "flex", alignItems: "center", justifyContent: "center",
                  fontWeight: "bold", color: "var(--text-primary)"
                }}>
                  {review.user[0].toUpperCase()}
                </div>
                <div>
                  <div style={{ fontSize: "0.95rem" }}>
                    <strong>{review.user}</strong> 
                    <span style={{ color: "var(--text-secondary)", fontSize: "0.85rem", marginLeft: "8px" }}>
                      • {review.product} • 📍 {review.location}
                    </span>
                  </div>
                  <div style={{ color: "var(--accent)", fontSize: "0.9rem", marginTop: "2px" }}>
                    {"★".repeat(review.rating)}
                  </div>
                </div>
              </div>
              <div style={{ color: "var(--text-secondary)", fontSize: "0.85rem" }}>{review.date}</div>
            </div>
            <p style={{ margin: "4px 0 0 44px", fontSize: "0.95rem" }}>{review.text}</p>
          </div>
        ))}
      </div>
      <div style={{ textAlign: "center", marginTop: "24px" }}>
        <button className="btn btn-secondary">Load more</button>
      </div>
    </section>
  );
}
