"use client";

import React, { useState, useEffect } from "react";

interface Product {
  id: string;
  name: string;
  description: string | null;
  price: number;
  originalPrice: number | null;
  currency: string;
  formula: string | null;
  casNumber: string | null;
  imageUrl: string | null;
  stockQuantity: number;
  productType: string | null;
  categoryId: string | null;
  categoryName: string | null;
  cities: Array<{ id: string; name: string }>;
  areas: Array<{ id: string; name: string }>;
  areaDetails: Array<{
    areaId: string;
    stockQuantity: number;
    locationUrl?: string;
    videoUrl?: string;
    message?: string;
    cooldownMinutes?: number;
    area?: { id: string; name: string };
  }>;
  createdAt: string;
}

interface Category {
  id: string;
  name: string;
  prefixCode: string | null;
  description: string | null;
}

interface City {
  id: string;
  name: string;
  areas: Array<{ id: string; name: string }>;
}

export default function ProductManagement() {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [locations, setLocations] = useState<City[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  
  // Filters
  const [searchTerm, setSearchTerm] = useState("");
  const [filterCategory, setFilterCategory] = useState<string>("ALL");
  const [filterStock, setFilterStock] = useState<string>("ALL");
  const [sortBy, setSortBy] = useState<string>("name");
  
  // Modals
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  
  // Form states
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    price: "",
    originalPrice: "",
    currency: "USD",
    formula: "",
    casNumber: "",
    productType: "",
    imageUrl: "",
    categoryId: "",
    stockQuantity: 0,
    cityIds: [] as string[],
    areaIds: [] as string[],
    areaDetails: [] as any[],
  });

  // Bulk operations
  const [selectedProducts, setSelectedProducts] = useState<Set<string>>(new Set());
  const [bulkAction, setBulkAction] = useState<string>("");
  const [bulkValue, setBulkValue] = useState<string>("");

  useEffect(() => {
    fetchData();
  }, []);

  const [userRole, setUserRole] = useState<string>("");

  const fetchData = async () => {
    setLoading(true);
    try {
      const [productsRes, categoriesRes, locationsRes, authRes] = await Promise.all([
        fetch("/api/admin/products"),
        fetch("/api/admin/categories"),
        fetch("/api/admin/locations"),
        fetch("/api/auth/me")
      ]);

      const [productsData, categoriesData, locationsData, authData] = await Promise.all([
        productsRes.json(),
        categoriesRes.json(),
        locationsRes.json(),
        authRes.json()
      ]);

      if (productsData.products) setProducts(productsData.products);
      if (categoriesData.categories) setCategories(categoriesData.categories);
      if (locationsData.cities) setLocations(locationsData.cities);
      if (authData.user) setUserRole(authData.user.role);
    } catch (e) {
      console.error("Failed to fetch data:", e);
      setMsg({ type: "error", text: "Failed to load data" });
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      name: "",
      description: "",
      price: "",
      originalPrice: "",
      currency: "USD",
      formula: "",
      casNumber: "",
      productType: "",
      imageUrl: "",
      categoryId: "",
      stockQuantity: 0,
      cityIds: [],
      areaIds: [],
      areaDetails: [],
    });
  };

  const handleAddProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);

    try {
      const areaStocks = formData.areaDetails.map((d: any) => ({
        areaId: d.areaId,
        quantity: d.stockQuantity?.toString() || "0",
      }));

      const res = await fetch("/api/admin/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          price: parseFloat(formData.price),
          originalPrice: formData.originalPrice ? parseFloat(formData.originalPrice) : null,
          areaStocks,
        }),
      });

      const data = await res.json();

      if (res.ok) {
        // Save per-unit area details (location/video links) for the new product.
        const newProductId = data.product?.id;
        if (newProductId && formData.areaDetails && formData.areaDetails.length > 0) {
          await fetch(`/api/admin/products/${newProductId}/area-details`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ areaDetails: normalizeAreaDetails(formData.areaDetails) }),
          });
        }

        setMsg({ type: "success", text: "Product added successfully!" });
        setShowAddModal(false);
        resetForm();
        fetchData();
      } else {
        setMsg({ type: "error", text: data.error || "Failed to add product" });
      }
    } catch (e) {
      setMsg({ type: "error", text: "Error adding product" });
    }
  };

  /**
   * Trim each area's per-unit links down to its stock quantity, at save time only.
   *
   * While editing, the extra entries are deliberately kept in state so that
   * lowering a quantity (or clearing the field mid-typing) never destroys the
   * location/video links - raising it again brings them straight back. The
   * truncation has to happen here instead, right before the data is persisted.
   */
  const normalizeAreaDetails = (areaDetails: any[]) =>
    areaDetails.map((d: any) => {
      const qty = parseInt(d.stockQuantity, 10) || 0;
      const items = Array.isArray(d.stockItems) ? d.stockItems : [];
      return { ...d, stockItems: items.slice(0, qty) };
    });

  const handleEditProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProduct) return;
    setMsg(null);

    try {
      const areaStocks = formData.areaDetails.map((d: any) => ({
        areaId: d.areaId,
        quantity: d.stockQuantity?.toString() || "0",
      }));

      const res = await fetch("/api/admin/products", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId: selectedProduct.id,
          ...formData,
          price: parseFloat(formData.price),
          originalPrice: formData.originalPrice ? parseFloat(formData.originalPrice) : null,
          areaStocks,
        }),
      });

      const data = await res.json();

      if (res.ok) {
        // Update area details if provided
        if (formData.areaDetails && formData.areaDetails.length > 0) {
          await fetch(`/api/admin/products/${selectedProduct.id}/area-details`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ areaDetails: normalizeAreaDetails(formData.areaDetails) }),
          });
        }

        setMsg({ type: "success", text: "Product updated successfully!" });
        setShowEditModal(false);
        setSelectedProduct(null);
        resetForm();
        fetchData();
      } else {
        setMsg({ type: "error", text: data.error || "Failed to update product" });
      }
    } catch (e) {
      setMsg({ type: "error", text: "Error updating product" });
    }
  };

  const handleDeleteProduct = async (productId: string) => {
    if (!confirm("Are you sure you want to delete this product? This action cannot be undone.")) return;

    try {
      const res = await fetch("/api/admin/products", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId }),
      });

      if (res.ok) {
        setMsg({ type: "success", text: "Product deleted successfully!" });
        fetchData();
      } else {
        const data = await res.json();
        setMsg({ type: "error", text: data.error || "Failed to delete product" });
      }
    } catch (e) {
      setMsg({ type: "error", text: "Error deleting product" });
    }
  };

  const handleBulkAction = async () => {
    if (selectedProducts.size === 0) {
      setMsg({ type: "error", text: "No products selected" });
      return;
    }

    if (!bulkAction) {
      setMsg({ type: "error", text: "Please select an action" });
      return;
    }

    if (!confirm(`Apply ${bulkAction} to ${selectedProducts.size} product(s)?`)) return;

    try {
      // Implement bulk actions here
      setMsg({ type: "success", text: `Bulk action applied to ${selectedProducts.size} products` });
      setSelectedProducts(new Set());
      setShowBulkModal(false);
      fetchData();
    } catch (e) {
      setMsg({ type: "error", text: "Error applying bulk action" });
    }
  };

  const openEditModal = (product: Product) => {
    setSelectedProduct(product);
    setFormData({
      name: product.name,
      description: product.description || "",
      price: product.price.toString(),
      originalPrice: product.originalPrice != null ? product.originalPrice.toString() : "",
      currency: product.currency,
      formula: product.formula || "",
      casNumber: product.casNumber || "",
      productType: product.productType || "",
      imageUrl: product.imageUrl || "",
      categoryId: product.categoryId || "",
      stockQuantity: product.stockQuantity,
      cityIds: product.cities.map((c) => c.id),
      areaIds: product.areas.map((a) => a.id),
      areaDetails: product.areaDetails || [],
    });
    setShowEditModal(true);
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const formDataUpload = new FormData();
    formDataUpload.append("file", file);

    try {
      const res = await fetch("/api/admin/upload-image", {
        method: "POST",
        body: formDataUpload,
      });

      const data = await res.json();

      if (res.ok) {
        setFormData({ ...formData, imageUrl: data.url });
        setMsg({ type: "success", text: "Image uploaded successfully!" });
      } else {
        setMsg({ type: "error", text: data.error || "Upload failed" });
      }
    } catch (err) {
      setMsg({ type: "error", text: "Failed to upload image" });
    }
  };

  const toggleProductSelection = (productId: string) => {
    const newSelection = new Set(selectedProducts);
    if (newSelection.has(productId)) {
      newSelection.delete(productId);
    } else {
      newSelection.add(productId);
    }
    setSelectedProducts(newSelection);
  };

  const toggleSelectAll = () => {
    if (selectedProducts.size === filteredProducts.length) {
      setSelectedProducts(new Set());
    } else {
      setSelectedProducts(new Set(filteredProducts.map((p) => p.id)));
    }
  };

  // Filter and sort products
  const filteredProducts = products
    .filter((p) => {
      const matchesSearch =
        p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.casNumber?.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesCategory = filterCategory === "ALL" || p.categoryId === filterCategory;

      const matchesStock =
        filterStock === "ALL" ||
        (filterStock === "IN_STOCK" && p.stockQuantity > 0) ||
        (filterStock === "OUT_OF_STOCK" && p.stockQuantity === 0) ||
        (filterStock === "LOW_STOCK" && p.stockQuantity > 0 && p.stockQuantity <= 10);

      return matchesSearch && matchesCategory && matchesStock;
    })
    .sort((a, b) => {
      switch (sortBy) {
        case "name":
          return a.name.localeCompare(b.name);
        case "price-asc":
          return a.price - b.price;
        case "price-desc":
          return b.price - a.price;
        case "stock-asc":
          return a.stockQuantity - b.stockQuantity;
        case "stock-desc":
          return b.stockQuantity - a.stockQuantity;
        case "newest":
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        default:
          return 0;
      }
    });

  const stats = {
    total: products.length,
    inStock: products.filter((p) => p.stockQuantity > 0).length,
    outOfStock: products.filter((p) => p.stockQuantity === 0).length,
    lowStock: products.filter((p) => p.stockQuantity > 0 && p.stockQuantity <= 10).length,
    totalValue: products.reduce((sum, p) => sum + p.price * p.stockQuantity, 0),
  };

  if (loading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "400px" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: "48px", marginBottom: "16px" }}>⏳</div>
          <p style={{ color: "var(--text-secondary)" }}>Loading products...</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "16px" }}>
        <div>
          <h2 style={{ fontSize: "28px", fontWeight: "700", marginBottom: "4px" }}>Product Management</h2>
          <p style={{ color: "var(--text-secondary)", fontSize: "14px" }}>
            Manage your product catalog, inventory, and pricing
          </p>
        </div>
        <div style={{ display: "flex", gap: "12px" }}>
          {selectedProducts.size > 0 && (
            <button onClick={() => setShowBulkModal(true)} className="btn btn-secondary">
              Bulk Actions ({selectedProducts.size})
            </button>
          )}
          <button onClick={() => { resetForm(); setShowAddModal(true); }} className="btn btn-primary">
            ➕ Add Product
          </button>
        </div>
      </div>

      {/* Message */}
      {msg && (
        <div className={`alert ${msg.type === "error" ? "alert-error" : "alert-success"}`}>
          {msg.text}
        </div>
      )}

      {/* Stats Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "16px" }}>
        <div className="card" style={{ padding: "20px" }}>
          <div style={{ fontSize: "14px", color: "var(--text-secondary)", marginBottom: "8px" }}>Total Products</div>
          <div style={{ fontSize: "32px", fontWeight: "700", color: "var(--accent)" }}>{stats.total}</div>
        </div>
        <div className="card" style={{ padding: "20px" }}>
          <div style={{ fontSize: "14px", color: "var(--text-secondary)", marginBottom: "8px" }}>In Stock</div>
          <div style={{ fontSize: "32px", fontWeight: "700", color: "var(--green)" }}>{stats.inStock}</div>
        </div>
        <div className="card" style={{ padding: "20px" }}>
          <div style={{ fontSize: "14px", color: "var(--text-secondary)", marginBottom: "8px" }}>Low Stock</div>
          <div style={{ fontSize: "32px", fontWeight: "700", color: "var(--orange)" }}>{stats.lowStock}</div>
        </div>
        <div className="card" style={{ padding: "20px" }}>
          <div style={{ fontSize: "14px", color: "var(--text-secondary)", marginBottom: "8px" }}>Out of Stock</div>
          <div style={{ fontSize: "32px", fontWeight: "700", color: "var(--red)" }}>{stats.outOfStock}</div>
        </div>
        <div className="card" style={{ padding: "20px" }}>
          <div style={{ fontSize: "14px", color: "var(--text-secondary)", marginBottom: "8px" }}>Total Value</div>
          <div style={{ fontSize: "32px", fontWeight: "700", color: "var(--green)" }}>
            ${stats.totalValue.toFixed(2)}
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="card" style={{ padding: "20px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "16px" }}>
          <div>
            <label style={{ display: "block", marginBottom: "8px", fontSize: "14px", fontWeight: "600" }}>
              Search
            </label>
            <input
              type="text"
              className="form-input"
              placeholder="Search products..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div>
            <label style={{ display: "block", marginBottom: "8px", fontSize: "14px", fontWeight: "600" }}>
              Stock Status
            </label>
            <select className="form-input" value={filterStock} onChange={(e) => setFilterStock(e.target.value)}>
              <option value="ALL">All</option>
              <option value="IN_STOCK">In Stock</option>
              <option value="LOW_STOCK">Low Stock (≤10)</option>
              <option value="OUT_OF_STOCK">Out of Stock</option>
            </select>
          </div>
          <div>
            <label style={{ display: "block", marginBottom: "8px", fontSize: "14px", fontWeight: "600" }}>
              Sort By
            </label>
            <select className="form-input" value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
              <option value="name">Name (A-Z)</option>
              <option value="price-asc">Price (Low to High)</option>
              <option value="price-desc">Price (High to Low)</option>
              <option value="stock-asc">Stock (Low to High)</option>
              <option value="stock-desc">Stock (High to Low)</option>
              <option value="newest">Newest First</option>
            </select>
          </div>
        </div>
      </div>

      {/* Products Table */}
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)", background: "var(--bg-secondary)" }}>
                <th style={{ padding: "16px", textAlign: "left", width: "40px" }}>
                  <input
                    type="checkbox"
                    checked={selectedProducts.size === filteredProducts.length && filteredProducts.length > 0}
                    onChange={toggleSelectAll}
                    style={{ cursor: "pointer" }}
                  />
                </th>
                <th style={{ padding: "16px", textAlign: "left", fontWeight: "600", color: "var(--text-secondary)" }}>
                  Product
                </th>
                <th style={{ padding: "16px", textAlign: "left", fontWeight: "600", color: "var(--text-secondary)" }}>
                  Price
                </th>
                <th style={{ padding: "16px", textAlign: "left", fontWeight: "600", color: "var(--text-secondary)" }}>
                  Stock
                </th>
                <th style={{ padding: "16px", textAlign: "left", fontWeight: "600", color: "var(--text-secondary)" }}>
                  Locations
                </th>
                <th style={{ padding: "16px", textAlign: "right", fontWeight: "600", color: "var(--text-secondary)" }}>
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredProducts.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ padding: "48px", textAlign: "center", color: "var(--text-secondary)" }}>
                    <div style={{ fontSize: "48px", marginBottom: "16px" }}>📦</div>
                    <p>No products found</p>
                  </td>
                </tr>
              ) : (
                filteredProducts.map((product) => (
                  <tr
                    key={product.id}
                    style={{
                      borderBottom: "1px solid var(--border)",
                      background: selectedProducts.has(product.id) ? "var(--bg-secondary)" : "transparent",
                    }}
                  >
                    <td style={{ padding: "16px" }}>
                      <input
                        type="checkbox"
                        checked={selectedProducts.has(product.id)}
                        onChange={() => toggleProductSelection(product.id)}
                        style={{ cursor: "pointer" }}
                      />
                    </td>
                    <td style={{ padding: "16px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                        {product.imageUrl ? (
                          <img
                            src={product.imageUrl}
                            alt={product.name}
                            style={{ width: "48px", height: "48px", borderRadius: "8px", objectFit: "cover" }}
                          />
                        ) : (
                          <div
                            style={{
                              width: "48px",
                              height: "48px",
                              borderRadius: "8px",
                              background: "var(--bg-secondary)",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              fontSize: "24px",
                            }}
                          >
                            📦
                          </div>
                        )}
                        <div>
                          <div style={{ fontWeight: "600", marginBottom: "4px" }}>{product.name}</div>
                          {product.productType && (
                            <div style={{ fontSize: "12px", color: "var(--text-secondary)" }}>{product.productType}</div>
                          )}
                          {product.casNumber && (
                            <div style={{ fontSize: "11px", color: "var(--text-tertiary)", fontFamily: "monospace" }}>
                              CAS: {product.casNumber}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: "16px" }}>
                      <span style={{ fontWeight: "600", color: "var(--green)", fontSize: "16px" }}>
                        {product.currency === "EUR" ? "€" : product.currency === "GBP" ? "£" : "$"}
                        {Number(product.price).toFixed(2)}
                      </span>
                    </td>
                    <td style={{ padding: "16px" }}>
                      <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                        <span
                          className={`badge ${
                            product.stockQuantity === 0
                              ? "badge-red"
                              : product.stockQuantity <= 10
                              ? "badge-orange"
                              : "badge-green"
                          }`}
                        >
                          {product.stockQuantity === 0 ? "Out of Stock" : `${product.stockQuantity} units`}
                        </span>
                        {product.areaDetails && product.areaDetails.length > 0 && (
                          <div style={{ fontSize: "11px", color: "var(--text-tertiary)" }}>
                            {product.areaDetails.filter((d) => d.stockQuantity > 0).length} area(s) with stock
                          </div>
                        )}
                      </div>
                    </td>
                    <td style={{ padding: "16px" }}>
                      <div style={{ fontSize: "13px", color: "var(--text-secondary)" }}>
                        {product.cities.length > 0 ? (
                          <>
                            <div>{product.cities.length} cities</div>
                            <div style={{ fontSize: "11px", color: "var(--text-tertiary)" }}>
                              {product.areas.length} areas
                            </div>
                          </>
                        ) : (
                          <span style={{ color: "var(--text-tertiary)" }}>No locations</span>
                        )}
                      </div>
                    </td>
                    <td style={{ padding: "16px", textAlign: "right" }}>
                      <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
                        <button
                          onClick={() => openEditModal(product)}
                          className="btn btn-ghost btn-sm"
                          style={{ color: "var(--accent)" }}
                        >
                          ✏️ Edit
                        </button>
                        <button
                          onClick={() => handleDeleteProduct(product.id)}
                          className="btn btn-ghost btn-sm"
                          style={{ color: "var(--red)" }}
                        >
                          🗑️ Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add/Edit Product Modal */}
      {(showAddModal || showEditModal) && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0,0,0,0.8)",
            backdropFilter: "blur(4px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            padding: "20px",
          }}
          onClick={() => {
            setShowAddModal(false);
            setShowEditModal(false);
            setSelectedProduct(null);
            resetForm();
          }}
        >
          <div
            className="card"
            style={{
              width: "100%",
              maxWidth: "900px",
              maxHeight: "90vh",
              overflowY: "auto",
              position: "relative",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              style={{
                position: "absolute",
                top: "16px",
                right: "16px",
                background: "none",
                border: "none",
                fontSize: "24px",
                color: "var(--text-secondary)",
                cursor: "pointer",
              }}
              onClick={() => {
                setShowAddModal(false);
                setShowEditModal(false);
                setSelectedProduct(null);
                resetForm();
              }}
            >
              ×
            </button>

            <h2 style={{ fontSize: "24px", marginBottom: "24px" }}>
              {showAddModal ? "Add New Product" : "Edit Product"}
            </h2>

            <form onSubmit={showAddModal ? handleAddProduct : handleEditProduct}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))", gap: "20px" }}>
                {/* Basic Info */}
                <div style={{ gridColumn: "1 / -1" }}>
                  <h3 style={{ fontSize: "16px", marginBottom: "16px", color: "var(--accent)" }}>Basic Information</h3>
                </div>

                <div className="form-group">
                  <label className="form-label">Product Name *</label>
                  <input
                    type="text"
                    className="form-input"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Product Type</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="e.g. Powder, Liquid, Capsule"
                    value={formData.productType}
                    onChange={(e) => setFormData({ ...formData, productType: e.target.value })}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Price (USD) *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    className="form-input"
                    value={formData.price}
                    onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                    required
                    disabled={userRole === "STAFF"}
                    style={{ opacity: userRole === "STAFF" ? 0.6 : 1, cursor: userRole === "STAFF" ? "not-allowed" : "text" }}
                  />
                  {userRole === "STAFF" && (
                    <small style={{ color: "var(--accent)" }}>Price can only be changed by Administrators</small>
                  )}
                </div>

                <div className="form-group">
                  <label className="form-label">Original Price (USD) — optional</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    className="form-input"
                    placeholder="Leave blank for no discount"
                    value={formData.originalPrice}
                    onChange={(e) => setFormData({ ...formData, originalPrice: e.target.value })}
                    disabled={userRole === "STAFF"}
                    style={{ opacity: userRole === "STAFF" ? 0.6 : 1, cursor: userRole === "STAFF" ? "not-allowed" : "text" }}
                  />
                  <small style={{ color: "var(--text-secondary)", fontSize: "12px" }}>
                    Set higher than the sale price to show a strikethrough discount on the storefront
                  </small>
                </div>

                <div className="form-group">
                  <label className="form-label">Chemical Formula</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="e.g. NaCl, H2SO4"
                    value={formData.formula}
                    onChange={(e) => setFormData({ ...formData, formula: e.target.value })}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">CAS Number</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="e.g. 7647-14-5"
                    value={formData.casNumber}
                    onChange={(e) => setFormData({ ...formData, casNumber: e.target.value })}
                  />
                </div>

                <div className="form-group" style={{ gridColumn: "1 / -1" }}>
                  <label className="form-label">Description</label>
                  <textarea
                    className="form-input"
                    rows={3}
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  />
                </div>

                {/* Image Upload */}
                <div className="form-group" style={{ gridColumn: "1 / -1" }}>
                  <label className="form-label">Product Image</label>
                  <div style={{ display: "flex", gap: "16px", alignItems: "center" }}>
                    <label className="btn btn-secondary" style={{ cursor: "pointer", margin: 0 }}>
                      📷 Upload Image
                      <input type="file" accept="image/*" onChange={handleImageUpload} style={{ display: "none" }} />
                    </label>
                    {formData.imageUrl && (
                      <img
                        src={formData.imageUrl}
                        alt="Preview"
                        style={{ width: "80px", height: "80px", objectFit: "cover", borderRadius: "8px" }}
                      />
                    )}
                  </div>
                </div>

                {/* Stock */}
                <div style={{ gridColumn: "1 / -1", marginTop: "16px" }}>
                  <h3 style={{ fontSize: "16px", marginBottom: "16px", color: "var(--accent)" }}>Inventory</h3>
                </div>

                <div className="form-group">
                  <label className="form-label">Global Stock Quantity</label>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => setFormData({ ...formData, stockQuantity: Math.max(0, (formData.stockQuantity || 0) - 1) })}
                      disabled={(formData.stockQuantity || 0) <= 0}
                      aria-label="Decrease global stock quantity"
                      style={{ padding: "8px 14px", fontSize: "18px", lineHeight: 1, opacity: (formData.stockQuantity || 0) <= 0 ? 0.4 : 1 }}
                    >
                      −
                    </button>
                    <input
                      type="number"
                      min="0"
                      className="form-input"
                      value={formData.stockQuantity}
                      onChange={(e) => setFormData({ ...formData, stockQuantity: Math.max(0, parseInt(e.target.value) || 0) })}
                      style={{ textAlign: "center", flex: 1 }}
                    />
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => setFormData({ ...formData, stockQuantity: (formData.stockQuantity || 0) + 1 })}
                      aria-label="Increase global stock quantity"
                      style={{ padding: "8px 14px", fontSize: "18px", lineHeight: 1 }}
                    >
                      +
                    </button>
                  </div>
                  <small style={{ color: "var(--text-secondary)", fontSize: "12px" }}>
                    Use + / − to adjust. This will be auto-calculated from area stocks if areas are selected.
                  </small>
                </div>

                {/* Locations */}
                <div style={{ gridColumn: "1 / -1", marginTop: "16px" }}>
                  <h3 style={{ fontSize: "16px", marginBottom: "16px", color: "var(--accent)" }}>
                    Availability & Locations
                  </h3>
                  <div
                    style={{
                      border: "1px solid var(--border)",
                      borderRadius: "8px",
                      padding: "16px",
                      background: "var(--bg-secondary)",
                    }}
                  >
                    <p style={{ fontSize: "14px", color: "var(--text-secondary)", marginBottom: "16px" }}>
                      Select cities and areas where this product is available
                    </p>
                    {locations.map((city) => (
                      <div key={city.id} style={{ marginBottom: "16px" }}>
                        <label style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
                          <input
                            type="checkbox"
                            checked={formData.cityIds.includes(city.id)}
                            onChange={(e) => {
                              const newCityIds = e.target.checked
                                ? [...formData.cityIds, city.id]
                                : formData.cityIds.filter((id) => id !== city.id);
                              setFormData({ ...formData, cityIds: newCityIds });
                            }}
                          />
                          <strong>{city.name}</strong>
                        </label>
                        {formData.cityIds.includes(city.id) && city.areas && city.areas.length > 0 && (
                          <div style={{ marginLeft: "24px", display: "flex", flexDirection: "column", gap: "8px" }}>
                            {city.areas.map((area) => (
                              <label key={area.id} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                <input
                                  type="checkbox"
                                  checked={formData.areaIds.includes(area.id)}
                                  onChange={(e) => {
                                    const newAreaIds = e.target.checked
                                      ? [...formData.areaIds, area.id]
                                      : formData.areaIds.filter((id) => id !== area.id);
                                    setFormData({ ...formData, areaIds: newAreaIds });
                                  }}
                                />
                                <span style={{ fontSize: "14px" }}>{area.name}</span>
                              </label>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Area Stock Allocation */}
                {formData.areaIds.length > 0 && (
                  <div style={{ gridColumn: "1 / -1" }}>
                    <h4 style={{ fontSize: "14px", marginBottom: "12px" }}>Area-Wise Stock Allocation & Delivery Details</h4>
                    <p style={{ fontSize: "12px", color: "var(--text-secondary)", marginBottom: "16px" }}>
                      Configure stock, delivery location, video, message, and cooldown timer for each area
                    </p>
                    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                      {formData.areaIds.map((areaId) => {
                        let areaName = "Unknown Area";
                        for (const city of locations) {
                          const area = city.areas?.find((a) => a.id === areaId);
                          if (area) {
                            areaName = `${city.name} - ${area.name}`;
                            break;
                          }
                        }

                         const detailIndex = formData.areaDetails.findIndex((d) => d.areaId === areaId);
                         const detail =
                           detailIndex >= 0
                             ? formData.areaDetails[detailIndex]
                             : {
                                 areaId,
                                 stockQuantity: 0,
                                 locationUrl: "",
                                 videoUrl: "",
                                 message: "",
                                 cooldownMinutes: 30,
                                 stockItems: [] as Array<{ locationUrl: string; videoUrl: string }>,
                               };

                         const qty = parseInt(detail.stockQuantity, 10) || 0;
                         let stockItems: Array<{ locationUrl: string; videoUrl: string }> = Array.isArray(detail.stockItems)
                           ? [...detail.stockItems]
                           : [];
                         // Seed from legacy single location/video if present and no items yet.
                         if (stockItems.length === 0 && (detail.locationUrl || detail.videoUrl)) {
                           stockItems = [{ locationUrl: detail.locationUrl || "", videoUrl: detail.videoUrl || "" }];
                         }
                         // Grow to match the quantity, but NEVER discard extras here.
                         // Truncating in state is what used to wipe the delivery links
                         // the moment someone backspaced the quantity field to empty.
                         // normalizeAreaDetails() trims to quantity at save time instead,
                         // so lowering and re-raising the number restores the links.
                         while (stockItems.length < qty) stockItems.push({ locationUrl: "", videoUrl: "" });
                         const visibleItems = stockItems.slice(0, qty);
                         const preservedCount = Math.max(0, stockItems.length - qty);

                         const setQuantity = (next: number) => {
                           const safe = Math.max(0, next);
                           const grown = [...stockItems];
                           while (grown.length < safe) grown.push({ locationUrl: "", videoUrl: "" });
                           const newDetails = [...formData.areaDetails];
                           const idx = newDetails.findIndex((d) => d.areaId === areaId);
                           const base = idx >= 0 ? newDetails[idx] : detail;
                           const updated = { ...base, stockQuantity: safe, stockItems: grown };
                           if (idx >= 0) {
                             newDetails[idx] = updated;
                           } else {
                             newDetails.push(updated);
                           }
                           setFormData({ ...formData, areaDetails: newDetails });
                         };

                         const updateDetail = (field: string, value: any) => {
                           const newDetails = [...formData.areaDetails];
                           const idx = newDetails.findIndex((d) => d.areaId === areaId);
                           const base = idx >= 0 ? newDetails[idx] : detail;
                           const updated = { ...base, [field]: value, stockItems };
                           if (idx >= 0) {
                             newDetails[idx] = updated;
                           } else {
                             newDetails.push(updated);
                           }
                           setFormData({ ...formData, areaDetails: newDetails });
                         };

                         const updateStockItem = (itemIdx: number, field: "locationUrl" | "videoUrl", value: string) => {
                           const newItems = [...stockItems];
                           newItems[itemIdx] = { ...newItems[itemIdx], [field]: value };
                           const newDetails = [...formData.areaDetails];
                           const idx = newDetails.findIndex((d) => d.areaId === areaId);
                           const base = idx >= 0 ? newDetails[idx] : detail;
                           const updated = { ...base, stockItems: newItems };
                           if (idx >= 0) {
                             newDetails[idx] = updated;
                           } else {
                             newDetails.push(updated);
                           }
                           setFormData({ ...formData, areaDetails: newDetails });
                         };

                        return (
                          <div
                            key={areaId}
                            style={{
                              padding: "16px",
                              border: "1px solid var(--border)",
                              borderRadius: "8px",
                              background: "var(--bg-primary)",
                            }}
                          >
                            <h5 style={{ fontSize: "14px", fontWeight: "600", marginBottom: "12px", color: "var(--accent)" }}>
                              {areaName}
                            </h5>
                            
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                              {/* Stock Quantity — stepper, so a stray backspace can't
                                  blank the field and hide every per-unit link at once. */}
                              <div className="form-group" style={{ marginBottom: 0 }}>
                                <label className="form-label" style={{ fontSize: "12px" }}>Stock Quantity *</label>
                                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                  <button
                                    type="button"
                                    className="btn btn-secondary"
                                    onClick={() => setQuantity(qty - 1)}
                                    disabled={qty <= 0}
                                    aria-label="Decrease stock quantity"
                                    style={{ padding: "8px 14px", fontSize: "18px", lineHeight: 1, opacity: qty <= 0 ? 0.4 : 1 }}
                                  >
                                    −
                                  </button>
                                  <input
                                    type="number"
                                    min="0"
                                    className="form-input"
                                    placeholder="0"
                                    value={qty}
                                    onChange={(e) => setQuantity(parseInt(e.target.value) || 0)}
                                    style={{ textAlign: "center", flex: 1 }}
                                  />
                                  <button
                                    type="button"
                                    className="btn btn-secondary"
                                    onClick={() => setQuantity(qty + 1)}
                                    aria-label="Increase stock quantity"
                                    style={{ padding: "8px 14px", fontSize: "18px", lineHeight: 1 }}
                                  >
                                    +
                                  </button>
                                </div>
                                {preservedCount > 0 ? (
                                  <small style={{ fontSize: "11px", color: "var(--accent)", display: "block", marginTop: "6px" }}>
                                    ↩️ {preservedCount} hidden unit link{preservedCount === 1 ? "" : "s"} kept — raise the quantity to restore {preservedCount === 1 ? "it" : "them"}. Saving now removes {preservedCount === 1 ? "it" : "them"}.
                                  </small>
                                ) : (
                                  <small style={{ fontSize: "11px", color: "var(--text-tertiary)", display: "block", marginTop: "6px" }}>
                                    Use + / − to adjust. Delivery links are only removed when you save.
                                  </small>
                                )}
                              </div>

                              {/* Cooldown Minutes */}
                              <div className="form-group" style={{ marginBottom: 0 }}>
                                <label className="form-label" style={{ fontSize: "12px" }}>Cooldown (minutes) *</label>
                                <input
                                  type="number"
                                  min="0"
                                  className="form-input"
                                  placeholder="30"
                                  value={detail.cooldownMinutes || 30}
                                  onChange={(e) => updateDetail("cooldownMinutes", parseInt(e.target.value) || 30)}
                                />
                              </div>

                              {/* Per-unit Location & Video URLs */}
                              <div style={{ gridColumn: "1 / -1" }}>
                                <label className="form-label" style={{ fontSize: "12px", marginBottom: "8px", display: "block" }}>
                                  📦 Per-Unit Delivery Details ({qty} {qty === 1 ? "unit" : "units"})
                                </label>
                                <small style={{ fontSize: "11px", color: "var(--text-tertiary)", display: "block", marginBottom: "12px" }}>
                                  Each unit gets a unique location & video link. Unit #1 is sold first, then #2, and so on. The same cooldown applies to all.
                                </small>
                                {qty === 0 ? (
                                  <div style={{ padding: "12px", background: "var(--bg-secondary)", borderRadius: "6px", fontSize: "12px", color: "var(--text-tertiary)" }}>
                                    Set a stock quantity above to add per-unit links.
                                  </div>
                                ) : (
                                  <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                                    {visibleItems.map((item, itemIdx) => (
                                      <div
                                        key={itemIdx}
                                        style={{
                                          padding: "12px",
                                          border: "1px solid var(--border)",
                                          borderRadius: "6px",
                                          background: "var(--bg-secondary)",
                                        }}
                                      >
                                        <div style={{ fontSize: "12px", fontWeight: "600", color: "var(--accent)", marginBottom: "8px" }}>
                                          Unit #{itemIdx + 1}
                                        </div>
                                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                                          <div className="form-group" style={{ marginBottom: 0 }}>
                                            <label className="form-label" style={{ fontSize: "11px" }}>📍 Location URL</label>
                                            <input
                                              type="url"
                                              className="form-input"
                                              placeholder="https://maps.google.com/?q=..."
                                              value={item.locationUrl || ""}
                                              onChange={(e) => updateStockItem(itemIdx, "locationUrl", e.target.value)}
                                            />
                                          </div>
                                          <div className="form-group" style={{ marginBottom: 0 }}>
                                            <label className="form-label" style={{ fontSize: "11px" }}>🎥 Video URL</label>
                                            <input
                                              type="url"
                                              className="form-input"
                                              placeholder="https://youtube.com/watch?v=..."
                                              value={item.videoUrl || ""}
                                              onChange={(e) => updateStockItem(itemIdx, "videoUrl", e.target.value)}
                                            />
                                          </div>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>

                              {/* Custom Message */}
                              <div className="form-group" style={{ marginBottom: 0, gridColumn: "1 / -1" }}>
                                <label className="form-label" style={{ fontSize: "12px" }}>
                                  💬 Custom Message (Sent after cooldown)
                                </label>
                                <textarea
                                  className="form-input"
                                  rows={3}
                                  placeholder="Your order is ready for pickup at..."
                                  value={detail.message || ""}
                                  onChange={(e) => updateDetail("message", e.target.value)}
                                />
                                <small style={{ fontSize: "11px", color: "var(--text-tertiary)" }}>
                                  This message will be sent via website notification and Telegram
                                </small>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end", marginTop: "32px" }}>
                <button
                  type="button"
                  onClick={() => {
                    setShowAddModal(false);
                    setShowEditModal(false);
                    setSelectedProduct(null);
                    resetForm();
                  }}
                  className="btn btn-secondary"
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  {showAddModal ? "Add Product" : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Bulk Actions Modal */}
      {showBulkModal && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0,0,0,0.8)",
            backdropFilter: "blur(4px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            padding: "20px",
          }}
          onClick={() => setShowBulkModal(false)}
        >
          <div
            className="card"
            style={{ width: "100%", maxWidth: "500px", position: "relative" }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              style={{
                position: "absolute",
                top: "16px",
                right: "16px",
                background: "none",
                border: "none",
                fontSize: "24px",
                color: "var(--text-secondary)",
                cursor: "pointer",
              }}
              onClick={() => setShowBulkModal(false)}
            >
              ×
            </button>

            <h2 style={{ fontSize: "24px", marginBottom: "24px" }}>Bulk Actions</h2>
            <p style={{ color: "var(--text-secondary)", marginBottom: "24px" }}>
              Apply action to {selectedProducts.size} selected product(s)
            </p>

            <div className="form-group">
              <label className="form-label">Action</label>
              <select className="form-input" value={bulkAction} onChange={(e) => setBulkAction(e.target.value)}>
                <option value="">Select Action</option>
                <option value="update-price">Update Price</option>
                <option value="update-stock">Update Stock</option>
                <option value="delete">Delete Products</option>
              </select>
            </div>

            {bulkAction === "update-price" && (
              <div className="form-group">
                <label className="form-label">New Price (USD)</label>
                <input
                  type="number"
                  step="0.01"
                  className="form-input"
                  value={bulkValue}
                  onChange={(e) => setBulkValue(e.target.value)}
                  placeholder="Enter new price"
                />
              </div>
            )}

            {bulkAction === "update-stock" && (
              <div className="form-group">
                <label className="form-label">Stock Adjustment</label>
                <input
                  type="number"
                  className="form-input"
                  value={bulkValue}
                  onChange={(e) => setBulkValue(e.target.value)}
                  placeholder="Enter quantity (+/-)"
                />
              </div>
            )}

            <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end", marginTop: "24px" }}>
              <button onClick={() => setShowBulkModal(false)} className="btn btn-secondary">
                Cancel
              </button>
              <button onClick={handleBulkAction} className="btn btn-primary">
                Apply
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
