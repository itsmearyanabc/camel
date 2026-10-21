"use client";

import React, { createContext, useContext, useState, useEffect } from "react";

export interface CartItem {
  productId: string;
  name: string;
  price: number;
  quantity: number;
  stockCount: number;
  /** Collection point chosen on the product page. Every line carries one. */
  areaId: string;
  areaName: string;
  cityName: string;
}

export interface AddToCartInput {
  id: string;
  name: string;
  price: number;
  stockCount: number;
  areaId: string;
  areaName: string;
  cityName: string;
}

export interface AddToCartResult {
  ok: boolean;
  error?: string;
}

interface CartContextType {
  cart: CartItem[];
  addToCart: (product: AddToCartInput, quantity?: number) => AddToCartResult;
  removeFromCart: (productId: string) => void;
  updateQuantity: (productId: string, delta: number) => void;
  clearCart: () => void;
  cartCount: number;
  cartTotal: number;
  /** The single collection point every line shares, or null for an empty cart. */
  pickupArea: { areaId: string; areaName: string; cityName: string } | null;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

/** Storage key. Bumped when the stored shape changed, so old carts are dropped
 *  rather than silently loaded without an area and failing at checkout. */
const CART_STORAGE_KEY = "Camel971_cart_v2";

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem(CART_STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        // A line with no area cannot be checked out - the order API needs one -
        // so anything missing it is discarded on load instead of blowing up at
        // the last step.
        const validCart = parsed.filter(
          (item: any) => item && typeof item.areaId === "string" && item.areaId.length > 0
        );
        setCart(validCart);
      } catch (e) {}
    }
    // The previous format kept a list of candidate areas per line and made the
    // customer pick one in the cart. That choice now happens on the product
    // page, so those carts cannot be migrated - drop them.
    localStorage.removeItem("Camel971_cart");
    setMounted(true);
  }, []);

  useEffect(() => {
    if (mounted) {
      localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart));
    }
  }, [cart, mounted]);

  const pickupArea = cart.length > 0
    ? { areaId: cart[0].areaId, areaName: cart[0].areaName, cityName: cart[0].cityName }
    : null;

  /**
   * Add a line, or top up an existing one.
   *
   * One order is collected from one place, and the checkout API takes a single
   * areaId for the whole cart - so a second area is refused here with a clear
   * message rather than being accepted and rejected at payment time.
   */
  const addToCart = (product: AddToCartInput, quantity = 1): AddToCartResult => {
    if (!product.areaId) {
      return { ok: false, error: "Choose a collection point first." };
    }

    const existingArea = cart.find((item) => item.areaId !== product.areaId);
    if (existingArea) {
      return {
        ok: false,
        error:
          `Your cart is being collected from ${existingArea.cityName ? existingArea.cityName + " / " : ""}${existingArea.areaName}. ` +
          `Clear it to order from ${product.cityName ? product.cityName + " / " : ""}${product.areaName} instead.`,
      };
    }

    const existing = cart.find((item) => item.productId === product.id);
    if (existing && existing.quantity + quantity > product.stockCount) {
      return { ok: false, error: "No more units are available here." };
    }
    if (!existing && quantity > product.stockCount) {
      return { ok: false, error: "No more units are available here." };
    }

    setCart((prev) => {
      const found = prev.find((item) => item.productId === product.id);
      if (found) {
        return prev.map((item) =>
          item.productId === product.id
            ? { ...item, quantity: item.quantity + quantity, stockCount: product.stockCount }
            : item
        );
      }
      return [
        ...prev,
        {
          productId: product.id,
          name: product.name,
          price: product.price,
          quantity,
          stockCount: product.stockCount,
          areaId: product.areaId,
          areaName: product.areaName,
          cityName: product.cityName,
        },
      ];
    });

    return { ok: true };
  };

  const removeFromCart = (productId: string) => {
    setCart((prev) => prev.filter((item) => item.productId !== productId));
  };

  const updateQuantity = (productId: string, delta: number) => {
    setCart((prev) =>
      prev.flatMap((item) => {
        if (item.productId !== productId) return [item];
        const newQty = item.quantity + delta;
        // Stepping the last unit down removes the line, so the customer is not
        // left with a "0" row they then have to delete separately.
        if (newQty < 1) return [];
        if (newQty > item.stockCount) return [item];
        return [{ ...item, quantity: newQty }];
      })
    );
  };

  const clearCart = () => setCart([]);

  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  const cartTotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);

  return (
    <CartContext.Provider value={{ cart, addToCart, removeFromCart, updateQuantity, clearCart, cartCount, cartTotal, pickupArea }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const context = useContext(CartContext);
  if (context === undefined) {
    throw new Error("useCart must be used within a CartProvider");
  }
  return context;
}
