"use client";

import React, { useState, useEffect } from "react";

interface LocationMapProps {
  locationUrl: string;
  productName: string;
}

export default function LocationMap({ locationUrl, productName }: LocationMapProps) {
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [distance, setDistance] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Extract coordinates from Google Maps URL
  const extractCoordinates = (url: string): { lat: number; lng: number } | null => {
    try {
      // Handle various Google Maps URL formats
      // Format 1: https://maps.google.com/?q=25.2048,55.2708
      // Format 2: https://www.google.com/maps/@25.2048,55.2708,15z
      // Format 3: https://maps.google.com/?ll=25.2048,55.2708
      
      const patterns = [
        /[?&]q=(-?\d+\.?\d*),(-?\d+\.?\d*)/,
        /@(-?\d+\.?\d*),(-?\d+\.?\d*)/,
        /[?&]ll=(-?\d+\.?\d*),(-?\d+\.?\d*)/,
      ];

      for (const pattern of patterns) {
        const match = url.match(pattern);
        if (match) {
          return {
            lat: parseFloat(match[1]),
            lng: parseFloat(match[2]),
          };
        }
      }

      return null;
    } catch (e) {
      return null;
    }
  };

  // Calculate distance between two coordinates using Haversine formula
  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = 6371; // Radius of the Earth in km
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c; // Distance in km
    return distance;
  };

  const getUserLocation = () => {
    setLoading(true);
    setError(null);

    if (!navigator.geolocation) {
      setError("Geolocation is not supported by your browser");
      setLoading(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const userCoords = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };
        setUserLocation(userCoords);

        const targetCoords = extractCoordinates(locationUrl);
        if (targetCoords) {
          const dist = calculateDistance(
            userCoords.lat,
            userCoords.lng,
            targetCoords.lat,
            targetCoords.lng
          );
          setDistance(dist.toFixed(2));
        }

        setLoading(false);
      },
      (error) => {
        setError("Unable to retrieve your location. Please enable location services.");
        setLoading(false);
      }
    );
  };

  const targetCoords = extractCoordinates(locationUrl);

  return (
    <div
      style={{
        border: "1px solid var(--border)",
        borderRadius: "12px",
        padding: "20px",
        background: "var(--bg-secondary)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "16px" }}>
        <div style={{ fontSize: "32px" }}>📍</div>
        <div>
          <h3 style={{ fontSize: "16px", fontWeight: "600", marginBottom: "4px" }}>
            Pickup Location
          </h3>
          <p style={{ fontSize: "13px", color: "var(--text-secondary)" }}>
            {productName}
          </p>
        </div>
      </div>

      {targetCoords && (
        <div
          style={{
            background: "var(--bg-primary)",
            borderRadius: "8px",
            padding: "16px",
            marginBottom: "16px",
          }}
        >
          <div style={{ fontSize: "13px", color: "var(--text-secondary)", marginBottom: "8px" }}>
            Coordinates
          </div>
          <div style={{ fontFamily: "monospace", fontSize: "14px", fontWeight: "600" }}>
            {targetCoords.lat.toFixed(6)}, {targetCoords.lng.toFixed(6)}
          </div>
        </div>
      )}

      {!userLocation && !loading && !error && (
        <button
          onClick={getUserLocation}
          className="btn btn-primary"
          style={{ width: "100%", marginBottom: "12px" }}
        >
          📍 Calculate Distance from My Location
        </button>
      )}

      {loading && (
        <div
          style={{
            padding: "16px",
            textAlign: "center",
            color: "var(--text-secondary)",
            fontSize: "14px",
          }}
        >
          <div style={{ fontSize: "24px", marginBottom: "8px" }}>⏳</div>
          Getting your location...
        </div>
      )}

      {error && (
        <div
          style={{
            padding: "12px",
            background: "rgba(239, 68, 68, 0.1)",
            border: "1px solid var(--red)",
            borderRadius: "8px",
            color: "var(--red)",
            fontSize: "13px",
            marginBottom: "12px",
          }}
        >
          {error}
        </div>
      )}

      {distance && (
        <div
          style={{
            padding: "16px",
            background: "rgba(34, 197, 94, 0.1)",
            border: "1px solid var(--green)",
            borderRadius: "8px",
            marginBottom: "12px",
          }}
        >
          <div style={{ fontSize: "13px", color: "var(--text-secondary)", marginBottom: "4px" }}>
            Distance from your location
          </div>
          <div style={{ fontSize: "24px", fontWeight: "700", color: "var(--green)" }}>
            {distance} km
          </div>
          <div style={{ fontSize: "12px", color: "var(--text-tertiary)", marginTop: "4px" }}>
            Approximately {Math.round(parseFloat(distance) * 0.621371)} miles
          </div>
        </div>
      )}

      <a
        href={locationUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="btn btn-secondary"
        style={{ width: "100%", textAlign: "center", textDecoration: "none" }}
      >
        🗺️ Open in Google Maps
      </a>

      <div
        style={{
          marginTop: "12px",
          padding: "12px",
          background: "var(--bg-primary)",
          borderRadius: "8px",
          fontSize: "12px",
          color: "var(--text-tertiary)",
        }}
      >
        💡 Tip: Click "Open in Google Maps" to get turn-by-turn directions
      </div>
    </div>
  );
}
