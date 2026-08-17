"use client";

import React, { useState, useEffect, useRef } from "react";

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
  /** Set on variant rows ("2g", "3g") - points at the display parent. */
  parentProductId: string | null;
  variantLabel: string | null;
  categoryId: string | null;
  categoryName: string | null;
  cities: Array<{ id: string; name: string }>;
  areas: Array<{ id: string; name: string }>;
  areaDetails: Array<{
    areaId: string;
    stockQuantity: number;
    locationUrl?: string;
    videoUrl?: string;
    mediaUrls?: DeliveryMedia[];
    message?: string;
    cooldownMinutes?: number;
    area?: { id: string; name: string };
  }>;
  createdAt: string;
}

/** An uploaded pickup photo/video, stored on this server and sent after cooldown. */
interface DeliveryMedia {
  url: string;
  type: "image" | "video";
}

/**
 * One unit of stock while it is being edited.
 *
 * `id` is present for units that already exist in the database and MUST be sent
 * back on save: the API uses it to tell an untouched unit from a new one, and
 * to drop any unit that was sold while this form was open. Dropping the id
 * would let a sold unit's location and video be re-issued to another customer.
 */
interface StockItemDraft {
  id?: string;
  locationUrl: string;
  videoUrl: string;
  mediaUrls: DeliveryMedia[];
}

/** A weight/quantity option ("2g" @ $70) while it is being edited. */
interface VariantDraft {
  id?: string;
  label: string;
  price: string;
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

  // Weight/quantity variants for the product being edited
  const [variants, setVariants] = useState<VariantDraft[]>([]);

  // Single-option editor, opened from an option's own row in the list.
  const [variantEditor, setVariantEditor] = useState<{
    parentId: string;
    variantId: string;
    parentName: string;
    label: string;
    price: string;
    error: string | null;
    saving: boolean;
  } | null>(null);
  const [addingNewType, setAddingNewType] = useState(false);
  const [uploadingMediaFor, setUploadingMediaFor] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);

  // Product-type picker. A native <select> cannot carry a per-row delete
  // button, so the field is a custom listbox - see the Product Type field in
  // the add/edit modal.
  const [typeMenuOpen, setTypeMenuOpen] = useState(false);
  const [deletingType, setDeletingType] = useState<string | null>(null);
  const typeMenuRef = useRef<HTMLDivElement>(null);

  /**
   * Products whose delete was refused because they carry order history, held
   * here while the admin confirms the override with their password.
   */
  const [forceDelete, setForceDelete] = useState<{
    targets: Array<{ id: string; name: string; orderCount: number }>;
    password: string;
    error: string | null;
    running: boolean;
  } | null>(null);

  useEffect(() => {
    if (!typeMenuOpen) return;
    const onPointerDown = (e: MouseEvent) => {
      if (typeMenuRef.current && !typeMenuRef.current.contains(e.target as Node)) {
        setTypeMenuOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setTypeMenuOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [typeMenuOpen]);

  // Live save feedback, pinned bottom-right so it is visible no matter how far
  // down the modal the admin has scrolled.
  const [saveState, setSaveState] = useState<
    { status: "saving" | "success" | "error"; text: string } | null
  >(null);

  useEffect(() => {
    if (!saveState || saveState.status === "saving") return;
    const timer = setTimeout(() => setSaveState(null), saveState.status === "error" ? 6000 : 2500);
    return () => clearTimeout(timer);
  }, [saveState]);

  // Bulk operations
  const [selectedProducts, setSelectedProducts] = useState<Set<string>>(new Set());
  const [bulkAction, setBulkAction] = useState<string>("");
  const [bulkValue, setBulkValue] = useState<string>("");
  const [bulkRunning, setBulkRunning] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const [userRole, setUserRole] = useState<string>("");

  /**
   * Staff run inventory, not the catalogue.
   *
   * They may move stock, change which areas a product is offered in, and set
   * the per-unit delivery links / cooldown / message. Everything describing or
   * pricing the product - and creating or deleting products altogether - is
   * admin-only. The API enforces the same split, so this is presentation, not
   * the security boundary.
   */
  const isStaff = userRole === "STAFF";

  /** Props that grey out a catalogue field when a staff member is editing. */
  const adminOnlyField = {
    disabled: isStaff,
    style: { opacity: isStaff ? 0.6 : 1, cursor: isStaff ? "not-allowed" : "text" } as React.CSSProperties,
  };

  /**
   * Re-read just the product list.
   *
   * Saving a product cannot change the categories, the city/area list or who
   * is logged in, so pulling all four endpoints afterwards (as fetchData does)
   * spent three extra round trips re-fetching data that could not have moved.
   */
  const refreshProducts = async () => {
    try {
      const res = await fetch("/api/admin/products");
      const data = await res.json();
      if (data.products) setProducts(data.products);
    } catch (e) {
      console.error("Failed to refresh products:", e);
    }
  };

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
    setVariants([]);
    setAddingNewType(false);
  };

  /**
   * Product types offered in the dropdown.
   *
   * Built from the types already in use rather than a hardcoded list, so a new
   * type typed into "Add new type" is available on every product from then on
   * without a code change.
   */
  const productTypeOptions = Array.from(
    new Set(
      products
        .map((p) => (p.productType || "").trim())
        .filter((t) => t.length > 0)
    )
  ).sort((a, b) => a.localeCompare(b));

  /**
   * How many product rows currently carry each type.
   *
   * Shown next to the delete button so an admin can tell a stray test entry
   * from one that is live on the storefront before removing it.
   */
  const productTypeCounts = products.reduce<Map<string, number>>((acc, p) => {
    const type = (p.productType || "").trim();
    if (type) acc.set(type, (acc.get(type) || 0) + 1);
    return acc;
  }, new Map());

  /**
   * Remove a type from the catalogue.
   *
   * There is no ProductType table - the list is the distinct `productType`
   * values in use - so this clears the column on every product carrying it and
   * the entry disappears from the list. The products themselves are kept.
   */
  const handleDeleteType = async (type: string) => {
    if (deletingType) return;

    const count = productTypeCounts.get(type) || 0;
    const warning =
      count > 0
        ? `Remove the "${type}" type?\n\nIt will be cleared from ${count} product(s). The products themselves are kept — they just stop showing a type on the shop and in the Telegram bot.`
        : `Remove the "${type}" type from the list?`;
    if (!confirm(warning)) return;

    setDeletingType(type);
    try {
      const res = await fetch("/api/admin/product-types", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setSaveState({ status: "error", text: data.error || "Failed to remove type" });
        return;
      }

      // The form open right now may be showing the type that just went away.
      setFormData((prev) => (prev.productType === type ? { ...prev, productType: "" } : prev));
      await refreshProducts();
      setSaveState({
        status: "success",
        text: data.cleared > 0 ? `Removed "${type}" from ${data.cleared} product(s)` : `Removed "${type}"`,
      });
    } catch {
      setSaveState({ status: "error", text: "Failed to remove type" });
    } finally {
      setDeletingType(null);
    }
  };

  /**
   * Formula / CAS values already in the catalogue, offered as datalist hints.
   *
   * Unlike product type these are not a closed set - two products rarely share
   * a CAS number - so they stay free-text inputs and this only saves retyping
   * when the same compound is listed again under a different name.
   */
  const distinctValues = (pick: (p: Product) => string | null) =>
    Array.from(new Set(products.map((p) => (pick(p) || "").trim()).filter((v) => v.length > 0))).sort(
      (a, b) => a.localeCompare(b)
    );

  const formulaOptions = distinctValues((p) => p.formula);
  const casNumberOptions = distinctValues((p) => p.casNumber);

  /** Variant rows belonging to a parent, in creation order. */
  const variantsOf = (parentId: string) =>
    products
      .filter((p) => p.parentProductId === parentId)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  const handleAddProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    setSaveState({ status: "saving", text: "Adding product…" });

    try {
      const fullAreaDetails = buildFullAreaDetails(formData.areaIds, formData.areaDetails);
      const areaStocks = buildAreaStocks(fullAreaDetails);

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
        // Save per-unit area details (location/media) for the new product.
        const newProductId = data.product?.id;
        if (newProductId && fullAreaDetails.length > 0) {
          await fetch(`/api/admin/products/${newProductId}/area-details`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ areaDetails: normalizeAreaDetails(fullAreaDetails) }),
          });
        }

        const variantError = newProductId ? await saveVariants(newProductId) : null;

        setShowAddModal(false);
        resetForm();
        // Close first, refresh after: the modal is already gone, so the list
        // catching up a moment later never blocks the admin.
        refreshProducts();
        setSaveState(
          variantError
            ? { status: "error", text: `Product added, but quantity options failed: ${variantError}` }
            : { status: "success", text: "Product added" }
        );
      } else {
        setSaveState({ status: "error", text: data.error || "Failed to add product" });
      }
    } catch (e) {
      setSaveState({ status: "error", text: "Error adding product" });
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

  /** Cooldown shown for an area the admin hasn't touched yet. */
  const DEFAULT_COOLDOWN_MINUTES = 30;

  /**
   * One entry per selected area, filling in the defaults the form displays.
   *
   * Ticking an area's checkbox does not add anything to `areaDetails` until its
   * quantity or links are edited. Building the payload from `areaDetails` alone
   * therefore (a) attached the area to the product with no stock row behind it,
   * so the storefront offered delivery there and checkout had nothing to sell,
   * and (b) silently saved a 0-minute cooldown while the form showed 30 -
   * handing the pickup location over instantly. Driving this off `areaIds`
   * keeps the saved data equal to what is on screen.
   */
  const buildFullAreaDetails = (areaIds: string[], areaDetails: any[]) =>
    areaIds.map((areaId) => {
      const detail = areaDetails.find((d: any) => d.areaId === areaId);
      return {
        areaId,
        stockQuantity: 0,
        locationUrl: "",
        videoUrl: "",
        mediaUrls: [],
        message: "",
        cooldownMinutes: DEFAULT_COOLDOWN_MINUTES,
        stockItems: [],
        ...(detail || {}),
      };
    });

  /**
   * Persist the weight/quantity options for a product.
   *
   * Runs after the product itself is saved so the children inherit the parent's
   * freshly-saved name, image and type. Returns an error string on failure so
   * the caller can surface it instead of reporting a clean save.
   */
  const saveVariants = async (productId: string): Promise<string | null> => {
    const rows = variants
      .map((v) => ({ id: v.id, label: v.label.trim(), price: v.price }))
      .filter((v) => v.label.length > 0);

    for (const row of rows) {
      const price = parseFloat(row.price);
      if (!Number.isFinite(price) || price <= 0) {
        return `Variant "${row.label}" needs a price greater than 0`;
      }
    }

    try {
      const res = await fetch(`/api/admin/products/${productId}/variants`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          variants: rows.map((r) => ({ id: r.id, label: r.label, price: parseFloat(r.price) })),
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        return data.error || "Failed to save quantity options";
      }
      return null;
    } catch {
      return "Failed to save quantity options";
    }
  };

  const buildAreaStocks = (fullAreaDetails: any[]) =>
    fullAreaDetails.map((d: any) => ({
      areaId: d.areaId,
      quantity: (parseInt(d.stockQuantity, 10) || 0).toString(),
    }));

  const handleEditProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProduct) return;
    setMsg(null);
    setSaveState({ status: "saving", text: "Saving changes…" });

    try {
      const fullAreaDetails = buildFullAreaDetails(formData.areaIds, formData.areaDetails);
      const areaStocks = buildAreaStocks(fullAreaDetails);

      // Staff only ever send the inventory half of the form. The API discards
      // catalogue fields from a staff session anyway; not sending them keeps
      // the request honest about what is actually being changed.
      const payload = isStaff
        ? {
            productId: selectedProduct.id,
            cityIds: formData.cityIds,
            areaIds: formData.areaIds,
            stockQuantity: formData.stockQuantity,
            areaStocks,
          }
        : {
            productId: selectedProduct.id,
            ...formData,
            price: parseFloat(formData.price),
            originalPrice: formData.originalPrice ? parseFloat(formData.originalPrice) : null,
            areaStocks,
          };

      const res = await fetch("/api/admin/products", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (res.ok) {
        // Update area details if provided
        if (fullAreaDetails.length > 0) {
          await fetch(`/api/admin/products/${selectedProduct.id}/area-details`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ areaDetails: normalizeAreaDetails(fullAreaDetails) }),
          });
        }

        // Staff never send variants - pricing is admin-only, and the variants
        // API rejects their session anyway.
        const variantError =
          isStaff || selectedProduct.parentProductId ? null : await saveVariants(selectedProduct.id);

        setShowEditModal(false);
        setSelectedProduct(null);
        resetForm();
        // Close first, refresh after: the modal is already gone, so the list
        // catching up a moment later never blocks the admin.
        refreshProducts();
        setSaveState(
          variantError
            ? { status: "error", text: `Product saved, but quantity options failed: ${variantError}` }
            : { status: "success", text: "Changes saved" }
        );
      } else {
        setSaveState({ status: "error", text: data.error || "Failed to update product" });
      }
    } catch (e) {
      setSaveState({ status: "error", text: "Error updating product" });
    }
  };

  /**
   * Ask the API to delete one product row.
   *
   * `requiresForce` comes back when the row has order history. That is not a
   * failure the admin can do anything about on its own, so it is reported
   * separately and the caller offers the password-confirmed override.
   */
  const requestDelete = async (
    productId: string,
    opts: { force?: boolean; password?: string } = {}
  ): Promise<{ ok: boolean; requiresForce?: boolean; orderCount?: number; error?: string }> => {
    try {
      const res = await fetch("/api/admin/products", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId,
          ...(opts.force ? { force: true, password: opts.password } : {}),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) return { ok: true };
      return {
        ok: false,
        requiresForce: data?.requiresForce === true,
        orderCount: data?.orderCount,
        error: data?.error || "Failed to delete product",
      };
    } catch {
      return { ok: false, error: "Error deleting product" };
    }
  };

  const handleDeleteProduct = async (productId: string) => {
    const childCount = variantsOf(productId).length;
    const warning = childCount > 0
      ? `Delete this product and all ${childCount} of its quantity options? This cannot be undone.`
      : "Are you sure you want to delete this product? This action cannot be undone.";
    if (!confirm(warning)) return;

    const name = products.find((p) => p.id === productId)?.name || "this product";
    const result = await requestDelete(productId);

    if (result.ok) {
      setMsg({ type: "success", text: "Product deleted successfully!" });
      fetchData();
      return;
    }

    if (result.requiresForce) {
      setForceDelete({
        targets: [{ id: productId, name, orderCount: result.orderCount || 0 }],
        password: "",
        error: null,
        running: false,
      });
      return;
    }

    setMsg({ type: "error", text: result.error || "Failed to delete product" });
  };

  /**
   * Run the password-confirmed override against every held-back product.
   *
   * One password entry covers the whole batch: clearing out a round of test
   * products otherwise means retyping it once per row.
   */
  const submitForceDelete = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!forceDelete || forceDelete.running) return;

    if (!forceDelete.password) {
      setForceDelete({ ...forceDelete, error: "Enter your password to confirm." });
      return;
    }

    setForceDelete({ ...forceDelete, error: null, running: true });

    const failures: string[] = [];
    let deleted = 0;

    for (const target of forceDelete.targets) {
      const result = await requestDelete(target.id, { force: true, password: forceDelete.password });
      if (result.ok) {
        deleted++;
      } else {
        failures.push(`${target.name}: ${result.error}`);
      }
    }

    // A wrong password fails every row identically - keep the dialog open and
    // say so, rather than closing on what looks like a partial success.
    if (deleted === 0 && failures.length > 0) {
      setForceDelete({
        ...forceDelete,
        running: false,
        error: failures[0].includes("Incorrect password") ? "Incorrect password." : failures[0],
      });
      return;
    }

    setForceDelete(null);
    setSelectedProducts(new Set());
    setMsg(
      failures.length > 0
        ? { type: "error", text: `Deleted ${deleted}, failed ${failures.length}: ${failures.join(" • ")}` }
        : { type: "success", text: `Permanently deleted ${deleted} product(s) and their order history.` }
    );
    fetchData();
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

    const ids = Array.from(selectedProducts);

    if (bulkAction === "update-price") {
      const price = parseFloat(bulkValue);
      if (!Number.isFinite(price) || price <= 0) {
        setMsg({ type: "error", text: "Enter a price greater than 0" });
        return;
      }
      if (!confirm(`Set the price of ${ids.length} product(s) to $${price.toFixed(2)}?`)) return;

      setBulkRunning(true);
      try {
        const results = await Promise.all(
          ids.map((productId) =>
            fetch("/api/admin/products", {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ productId, price }),
            })
          )
        );
        const failed = results.filter((r) => !r.ok).length;
        setMsg(
          failed
            ? { type: "error", text: `Updated ${ids.length - failed} of ${ids.length} — ${failed} failed` }
            : { type: "success", text: `Price updated on ${ids.length} product(s)` }
        );
      } catch (e) {
        setMsg({ type: "error", text: "Error applying bulk price update" });
      } finally {
        setBulkRunning(false);
      }
    } else if (bulkAction === "delete") {
      if (!confirm(`Permanently delete ${ids.length} product(s)? This cannot be undone.`)) return;

      setBulkRunning(true);
      try {
        const results = await Promise.all(ids.map((productId) => requestDelete(productId)));

        // Rows the API held back because they carry order history are not
        // failures - they are the ones that need the override, so they are
        // gathered up and offered in a single confirmation instead of being
        // reported as errors the admin cannot act on.
        const blocked = results
          .map((result, i) => ({ result, id: ids[i] }))
          .filter(({ result }) => result.requiresForce)
          .map(({ result, id }) => ({
            id,
            name: products.find((p) => p.id === id)?.name || id.slice(0, 8),
            orderCount: result.orderCount || 0,
          }));

        const failed = results.filter((r) => !r.ok && !r.requiresForce).length;
        const deleted = results.filter((r) => r.ok).length;

        if (blocked.length > 0) {
          setShowBulkModal(false);
          setBulkAction("");
          setBulkValue("");
          setForceDelete({ targets: blocked, password: "", error: null, running: false });
          if (deleted > 0 || failed > 0) {
            setMsg({ type: "success", text: `Deleted ${deleted} of ${ids.length} — ${blocked.length} need confirmation` });
          }
          fetchData();
          return;
        }

        setMsg(
          failed
            ? { type: "error", text: `Deleted ${deleted} of ${ids.length} — ${failed} failed` }
            : { type: "success", text: `Deleted ${ids.length} product(s)` }
        );
      } catch (e) {
        setMsg({ type: "error", text: "Error deleting products" });
      } finally {
        setBulkRunning(false);
      }
    } else {
      setMsg({ type: "error", text: "Unsupported action" });
      return;
    }

    setSelectedProducts(new Set());
    setBulkAction("");
    setBulkValue("");
    setShowBulkModal(false);
    fetchData();
  };

  /**
   * Rename / reprice one quantity option straight from its row.
   *
   * Goes through the parent's variants endpoint rather than PUT
   * /api/admin/products, because that is the only place that derives the
   * child's display name from the label and rejects a label that collides with
   * a sibling. Editing the child directly would leave a "Foo (2g)" row labelled
   * 5g.
   */
  const saveVariantEdit = async () => {
    if (!variantEditor) return;

    const label = variantEditor.label.trim();
    const price = parseFloat(variantEditor.price);
    if (!label) {
      setVariantEditor({ ...variantEditor, error: "Give the option a label, e.g. \"2g\"." });
      return;
    }
    if (!Number.isFinite(price) || price <= 0) {
      setVariantEditor({ ...variantEditor, error: "Price must be greater than 0." });
      return;
    }

    setVariantEditor({ ...variantEditor, error: null, saving: true });

    // Send the parent's whole option list with this one changed - the endpoint
    // treats a missing child as a deletion, so a partial list would wipe the
    // siblings.
    const rows = variantsOf(variantEditor.parentId).map((v) =>
      v.id === variantEditor.variantId
        ? { id: v.id, label, price }
        : { id: v.id, label: v.variantLabel || "", price: Number(v.price) }
    );

    try {
      const res = await fetch(`/api/admin/products/${variantEditor.parentId}/variants`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ variants: rows }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setVariantEditor({ ...variantEditor, saving: false, error: data.error || "Failed to save option" });
        return;
      }

      setVariantEditor(null);
      setMsg({ type: "success", text: `Option "${label}" updated.` });
      refreshProducts();
    } catch {
      setVariantEditor({ ...variantEditor, saving: false, error: "Error saving option" });
    }
  };

  const openVariantEditor = (parent: Product, variant: Product) => {
    setVariantEditor({
      parentId: parent.id,
      variantId: variant.id,
      parentName: parent.name,
      label: variant.variantLabel || "",
      price: Number(variant.price).toString(),
      error: null,
      saving: false,
    });
  };

  /**
   * Delete one quantity option.
   *
   * The API refuses when the option has been ordered - deleting it would
   * cascade through the OrderItem rows and erase real order history - so the
   * refusal is surfaced verbatim rather than reported as a generic failure.
   */
  const handleDeleteVariant = async (parent: Product, variant: Product) => {
    const label = variant.variantLabel || "this option";
    if (!confirm(`Delete the "${label}" option of ${parent.name}? This cannot be undone.`)) return;

    const result = await requestDelete(variant.id);

    if (result.ok) {
      setMsg({ type: "success", text: `Option "${label}" deleted.` });
      refreshProducts();
      return;
    }

    if (result.requiresForce) {
      setForceDelete({
        targets: [
          { id: variant.id, name: `${parent.name} (${label})`, orderCount: result.orderCount || 0 },
        ],
        password: "",
        error: null,
        running: false,
      });
      return;
    }

    setMsg({ type: "error", text: result.error || "Failed to delete option" });
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
    setVariants(
      variantsOf(product.id).map((v) => ({
        id: v.id,
        label: v.variantLabel || "",
        price: Number(v.price).toString(),
      }))
    );
    setAddingNewType(false);
    setShowEditModal(true);
  };

  const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
  const MAX_VIDEO_BYTES = 50 * 1024 * 1024;
  const UPLOAD_TIMEOUT_MS = 10 * 60 * 1000;

  /**
   * Upload one file with real progress.
   *
   * XHR rather than fetch: fetch cannot report upload progress, so a large
   * video over a phone connection looked identical to a hung request - which
   * is exactly how it was reported. It also lets a stalled request be aborted
   * instead of leaving the form stuck on "Uploading…" forever.
   */
  const uploadOneFile = (file: File, onProgress: (percent: number) => void) =>
    new Promise<DeliveryMedia>((resolve, reject) => {
      const body = new FormData();
      body.append("file", file);

      const xhr = new XMLHttpRequest();
      xhr.open("POST", "/api/admin/upload-media");
      xhr.timeout = UPLOAD_TIMEOUT_MS;

      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
      };

      xhr.onload = () => {
        // A reverse proxy that rejects the body (nginx client_max_body_size)
        // answers with an HTML error page, not JSON. Parsing blindly threw and
        // surfaced as a meaningless "network error", so report the status.
        let data: any = null;
        try {
          data = JSON.parse(xhr.responseText);
        } catch {
          reject(
            new Error(
              xhr.status === 413
                ? `rejected as too large by the server (HTTP 413) — raise nginx client_max_body_size`
                : `unexpected server response (HTTP ${xhr.status})`
            )
          );
          return;
        }
        if (xhr.status >= 200 && xhr.status < 300 && data?.url) {
          resolve({ url: data.url, type: data.type });
        } else {
          reject(new Error(data?.error || `upload failed (HTTP ${xhr.status})`));
        }
      };

      xhr.onerror = () => reject(new Error("network error — connection dropped"));
      xhr.ontimeout = () => reject(new Error("timed out — the file may be too large for this connection"));
      xhr.onabort = () => reject(new Error("cancelled"));

      xhr.send(body);
    });

  const handleMediaUpload = async (
    files: FileList | null,
    slotKey: string,
    onUploaded: (media: DeliveryMedia[]) => void
  ) => {
    if (!files || files.length === 0) return;

    // Copy out of the live FileList straight away: clearing the input later
    // empties it, and these are read across awaits.
    const picked = Array.from(files);
    const uploaded: DeliveryMedia[] = [];
    const failures: string[] = [];

    setUploadingMediaFor(slotKey);
    try {
      for (let i = 0; i < picked.length; i++) {
        const file = picked[i];
        const isVideo = file.type.startsWith("video/");
        const limit = isVideo ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;

        // Checked here as well as on the server: an over-size file would
        // otherwise be pushed all the way up a phone connection only to be
        // refused on arrival.
        if (file.size > limit) {
          failures.push(
            `${file.name}: ${(file.size / 1024 / 1024).toFixed(1)}MB exceeds the ` +
              `${isVideo ? "50MB video" : "8MB image"} limit`
          );
          continue;
        }

        const position = picked.length > 1 ? ` (${i + 1}/${picked.length})` : "";
        setUploadProgress(`Uploading${position} 0%`);
        try {
          const media = await uploadOneFile(file, (percent) =>
            setUploadProgress(`Uploading${position} ${percent}%`)
          );
          uploaded.push(media);
        } catch (err) {
          failures.push(`${file.name}: ${err instanceof Error ? err.message : "upload failed"}`);
        }
      }
    } finally {
      // Always clears, whatever happened above - the button must never be left
      // reading "Uploading…" with no way back.
      setUploadingMediaFor(null);
      setUploadProgress(null);
    }

    if (uploaded.length > 0) onUploaded(uploaded);

    if (failures.length > 0) {
      setSaveState({ status: "error", text: failures.join(" • ") });
    } else if (uploaded.length > 0) {
      setSaveState({
        status: "success",
        text: `${uploaded.length} file(s) uploaded — press Save to apply`,
      });
    }
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

  /**
   * Stock a customer can actually buy under this listing.
   *
   * Stock lives on the rows that are sold. For a product with quantity options
   * that is the variants, and the parent's own counter stays 0 - so summing the
   * children is the only number that means anything to the admin.
   */
  const sellableStock = (product: Product) => {
    const children = variantsOf(product.id);
    return children.length > 0
      ? children.reduce((sum, c) => sum + c.stockQuantity, 0)
      : product.stockQuantity;
  };

  // Variants are shown nested under their parent, never as separate top-level
  // rows - the parent is the thing being managed.
  const topLevelProducts = products.filter((p) => !p.parentProductId);

  const filteredProducts = topLevelProducts
    .filter((p) => {
      const term = searchTerm.toLowerCase();
      const matchesSearch =
        !term ||
        p.name.toLowerCase().includes(term) ||
        p.description?.toLowerCase().includes(term) ||
        p.productType?.toLowerCase().includes(term) ||
        variantsOf(p.id).some((v) => (v.variantLabel || "").toLowerCase().includes(term));

      const matchesCategory = filterCategory === "ALL" || p.categoryId === filterCategory;

      const stock = sellableStock(p);
      const matchesStock =
        filterStock === "ALL" ||
        (filterStock === "IN_STOCK" && stock > 0) ||
        (filterStock === "OUT_OF_STOCK" && stock === 0) ||
        (filterStock === "LOW_STOCK" && stock > 0 && stock <= 10);

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
          return sellableStock(a) - sellableStock(b);
        case "stock-desc":
          return sellableStock(b) - sellableStock(a);
        case "newest":
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        default:
          return 0;
      }
    });

  const stats = {
    total: topLevelProducts.length,
    inStock: topLevelProducts.filter((p) => sellableStock(p) > 0).length,
    outOfStock: topLevelProducts.filter((p) => sellableStock(p) === 0).length,
    lowStock: topLevelProducts.filter((p) => sellableStock(p) > 0 && sellableStock(p) <= 10).length,
    // Every sellable row counts here, variants included - that is where the
    // stock and the real price both live.
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

  const isSaving = saveState?.status === "saving";

  /** One row of the product-type listbox. */
  const typeRowStyle = (selected: boolean): React.CSSProperties => ({
    display: "block",
    width: "100%",
    padding: "9px 12px",
    textAlign: "left",
    background: selected ? "var(--accent-light)" : "transparent",
    border: "none",
    borderRadius: "8px",
    color: selected ? "var(--accent)" : "var(--text-primary)",
    fontWeight: selected ? 600 : 400,
    fontSize: "14px",
    cursor: "pointer",
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      {/* Save status, pinned bottom-right. The old flow only reported a save via
          the alert at the very top of the page, which is off-screen once the
          admin has scrolled down the edit modal - so a save looked like it did
          nothing until a message appeared somewhere they were not looking. */}
      <style>{`@keyframes pm-spin { to { transform: rotate(360deg); } }
        @keyframes pm-rise { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }`}</style>
      {saveState && (
        <div
          role="status"
          aria-live="polite"
          style={{
            position: "fixed",
            right: "24px",
            bottom: "24px",
            zIndex: 2000,
            display: "flex",
            alignItems: "center",
            gap: "10px",
            padding: "12px 18px",
            borderRadius: "10px",
            maxWidth: "min(420px, calc(100vw - 48px))",
            background: "var(--bg-primary)",
            border: `1px solid ${
              saveState.status === "error"
                ? "var(--red)"
                : saveState.status === "success"
                ? "var(--green)"
                : "var(--border)"
            }`,
            boxShadow: "0 8px 28px rgba(0,0,0,0.35)",
            animation: "pm-rise 160ms ease-out",
            fontSize: "14px",
          }}
        >
          {saveState.status === "saving" ? (
            <span
              aria-hidden
              style={{
                width: "16px",
                height: "16px",
                borderRadius: "50%",
                border: "2px solid var(--border)",
                borderTopColor: "var(--accent)",
                animation: "pm-spin 700ms linear infinite",
                flexShrink: 0,
              }}
            />
          ) : (
            <span aria-hidden style={{ flexShrink: 0 }}>
              {saveState.status === "success" ? "✅" : "⚠️"}
            </span>
          )}
          <span>{saveState.text}</span>
        </div>
      )}

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "16px" }}>
        <div>
          <h2 style={{ fontSize: "28px", fontWeight: "700", marginBottom: "4px" }}>
            {isStaff ? "Inventory" : "Product Management"}
          </h2>
          <p style={{ color: "var(--text-secondary)", fontSize: "14px" }}>
            {isStaff
              ? "Manage stock levels, areas, and per-unit delivery details"
              : "Manage your product catalog, inventory, and pricing"}
          </p>
        </div>
        {!isStaff && (
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
        )}
      </div>

      {isStaff && (
        <div className="alert" style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)", fontSize: "13px" }}>
          ℹ️ Product details and pricing are set by administrators. You can adjust stock quantities,
          area availability, per-unit location &amp; video links, cooldown, and the pickup message.
        </div>
      )}

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
                {!isStaff && (
                  <th style={{ padding: "16px", textAlign: "left", width: "40px" }}>
                    <input
                      type="checkbox"
                      checked={selectedProducts.size === filteredProducts.length && filteredProducts.length > 0}
                      onChange={toggleSelectAll}
                      style={{ cursor: "pointer" }}
                    />
                  </th>
                )}
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
                  <td colSpan={isStaff ? 5 : 6} style={{ padding: "48px", textAlign: "center", color: "var(--text-secondary)" }}>
                    <div style={{ fontSize: "48px", marginBottom: "16px" }}>📦</div>
                    <p>No products found</p>
                  </td>
                </tr>
              ) : (
                filteredProducts.flatMap((product) => {
                  const children = variantsOf(product.id);
                  const stock = sellableStock(product);
                  const symbol =
                    product.currency === "EUR" ? "€" : product.currency === "GBP" ? "£" : "$";

                  const parentRow = (
                    <tr
                      key={product.id}
                      style={{
                        borderBottom: children.length > 0 ? "none" : "1px solid var(--border)",
                        background: selectedProducts.has(product.id) ? "var(--bg-secondary)" : "transparent",
                      }}
                    >
                      {!isStaff && (
                        <td style={{ padding: "16px" }}>
                          <input
                            type="checkbox"
                            checked={selectedProducts.has(product.id)}
                            onChange={() => toggleProductSelection(product.id)}
                            style={{ cursor: "pointer" }}
                          />
                        </td>
                      )}
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
                              <span className="badge badge-purple" style={{ fontSize: "11px" }}>
                                {product.productType}
                              </span>
                            )}
                            {(product.formula || product.casNumber) && (
                              <div
                                style={{
                                  fontSize: "11px",
                                  color: "var(--text-secondary)",
                                  marginTop: "4px",
                                  fontFamily: "var(--font-mono, monospace)",
                                }}
                              >
                                {product.formula}
                                {product.formula && product.casNumber ? " · " : ""}
                                {product.casNumber && `CAS ${product.casNumber}`}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: "16px" }}>
                        {children.length > 0 ? (
                          <span style={{ fontSize: "13px", color: "var(--text-tertiary)" }}>
                            {children.length} option{children.length === 1 ? "" : "s"}
                          </span>
                        ) : (
                          <span style={{ fontWeight: "600", color: "var(--green)", fontSize: "16px" }}>
                            {symbol}
                            {Number(product.price).toFixed(2)}
                          </span>
                        )}
                      </td>
                      <td style={{ padding: "16px" }}>
                        <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                          <span
                            className={`badge ${
                              stock === 0 ? "badge-red" : stock <= 10 ? "badge-orange" : "badge-green"
                            }`}
                          >
                            {stock === 0 ? "Out of Stock" : `${stock} units`}
                          </span>
                          {children.length === 0 && product.areaDetails && product.areaDetails.length > 0 && (
                            <div style={{ fontSize: "11px", color: "var(--text-tertiary)" }}>
                              {product.areaDetails.filter((d) => d.stockQuantity > 0).length} area(s) with stock
                            </div>
                          )}
                          {children.length > 0 && (
                            <div style={{ fontSize: "11px", color: "var(--text-tertiary)" }}>
                              across {children.length} option{children.length === 1 ? "" : "s"}
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
                            {isStaff ? "📦 Manage Stock" : "✏️ Edit"}
                          </button>
                          {!isStaff && (
                            <button
                              onClick={() => handleDeleteProduct(product.id)}
                              className="btn btn-ghost btn-sm"
                              style={{ color: "var(--red)" }}
                            >
                              🗑️ Delete
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );

                  // Each quantity option carries its own stock and delivery
                  // media, so it gets its own row to open the stock editor with.
                  const variantRows = children.map((variant, idx) => (
                    <tr
                      key={variant.id}
                      style={{
                        borderBottom:
                          idx === children.length - 1 ? "1px solid var(--border)" : "1px solid var(--border-subtle, rgba(128,128,128,0.15))",
                        background: "var(--bg-secondary)",
                      }}
                    >
                      {!isStaff && <td />}
                      <td style={{ padding: "10px 16px 10px 76px" }}>
                        <span style={{ fontSize: "13px", color: "var(--text-secondary)" }}>
                          ↳ <strong style={{ color: "var(--text-primary)" }}>{variant.variantLabel}</strong>
                        </span>
                      </td>
                      <td style={{ padding: "10px 16px" }}>
                        <span style={{ fontWeight: "600", color: "var(--green)" }}>
                          {symbol}
                          {Number(variant.price).toFixed(2)}
                        </span>
                      </td>
                      <td style={{ padding: "10px 16px" }}>
                        <span
                          className={`badge ${
                            variant.stockQuantity === 0
                              ? "badge-red"
                              : variant.stockQuantity <= 10
                              ? "badge-orange"
                              : "badge-green"
                          }`}
                        >
                          {variant.stockQuantity === 0 ? "Out of Stock" : `${variant.stockQuantity} units`}
                        </span>
                      </td>
                      <td style={{ padding: "10px 16px", fontSize: "12px", color: "var(--text-tertiary)" }}>
                        {variant.areas.length} area{variant.areas.length === 1 ? "" : "s"}
                      </td>
                      <td style={{ padding: "10px 16px", textAlign: "right" }}>
                        {/* An option is a product in its own right - its own
                            price, stock and delivery media - so it gets the
                            same actions as one. Previously the only way to
                            rename, reprice or remove an option was to open the
                            parent and edit its option list. */}
                        <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end", flexWrap: "wrap" }}>
                          <button
                            onClick={() => openEditModal(variant)}
                            className="btn btn-ghost btn-sm"
                            style={{ color: "var(--accent)" }}
                          >
                            📦 Stock &amp; Delivery
                          </button>
                          {!isStaff && (
                            <>
                              <button
                                onClick={() => openVariantEditor(product, variant)}
                                className="btn btn-ghost btn-sm"
                                style={{ color: "var(--accent)" }}
                              >
                                ✏️ Edit
                              </button>
                              <button
                                onClick={() => handleDeleteVariant(product, variant)}
                                className="btn btn-ghost btn-sm"
                                style={{ color: "var(--red)" }}
                              >
                                🗑️ Delete
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ));

                  return [parentRow, ...variantRows];
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Single-option editor (label + price), opened from an option's row */}
      {variantEditor && (
        <div
          style={{
            position: "fixed", inset: 0, zIndex: 250,
            display: "flex", alignItems: "center", justifyContent: "center", padding: "16px",
          }}
        >
          <div
            style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}
            onClick={() => !variantEditor.saving && setVariantEditor(null)}
          />
          <div className="card" style={{ position: "relative", zIndex: 251, width: "100%", maxWidth: "440px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
              <h3 style={{ fontSize: "18px" }}>Edit Option</h3>
              <button
                type="button"
                onClick={() => setVariantEditor(null)}
                disabled={variantEditor.saving}
                style={{ background: "none", border: "none", color: "var(--text-secondary)", cursor: "pointer", fontSize: "24px" }}
              >
                &times;
              </button>
            </div>
            <p style={{ color: "var(--text-secondary)", fontSize: "13px", marginBottom: "18px" }}>
              {variantEditor.parentName} — the option name shown to customers becomes
              “{variantEditor.parentName} ({variantEditor.label.trim() || "…"})”.
            </p>

            {variantEditor.error && (
              <div className="alert alert-error" style={{ marginBottom: "14px" }}>{variantEditor.error}</div>
            )}

            <label style={{ display: "block", marginBottom: "14px" }}>
              <span className="form-label">Label</span>
              <input
                className="form-input"
                value={variantEditor.label}
                placeholder="e.g. 2g"
                maxLength={40}
                onChange={(e) => setVariantEditor({ ...variantEditor, label: e.target.value })}
              />
            </label>

            <label style={{ display: "block", marginBottom: "20px" }}>
              <span className="form-label">Price</span>
              <input
                className="form-input"
                type="number"
                min="0"
                step="0.01"
                value={variantEditor.price}
                onChange={(e) => setVariantEditor({ ...variantEditor, price: e.target.value })}
              />
            </label>

            <p style={{ color: "var(--text-tertiary)", fontSize: "12px", marginBottom: "16px" }}>
              Stock, pickup locations and delivery media for this option are edited from
              <strong> Stock &amp; Delivery</strong> on the same row.
            </p>

            <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setVariantEditor(null)}
                disabled={variantEditor.saving}
              >
                Cancel
              </button>
              <button type="button" className="btn btn-primary" onClick={saveVariantEdit} disabled={variantEditor.saving}>
                {variantEditor.saving ? "Saving…" : "Save Option"}
              </button>
            </div>
          </div>
        </div>
      )}

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
            // Never tear the form down mid-save - the request is already in
            // flight and the admin would be left unsure what actually landed.
            if (isSaving) return;
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
                if (isSaving) return;
                setShowAddModal(false);
                setShowEditModal(false);
                setSelectedProduct(null);
                resetForm();
              }}
            >
              ×
            </button>

            <h2 style={{ fontSize: "24px", marginBottom: "24px" }}>
              {showAddModal ? "Add New Product" : isStaff ? `Manage Stock — ${selectedProduct?.name ?? ""}` : "Edit Product"}
            </h2>

            <form onSubmit={showAddModal ? handleAddProduct : handleEditProduct}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))", gap: "20px" }}>
                {/* Basic Info */}
                <div style={{ gridColumn: "1 / -1" }}>
                  <h3 style={{ fontSize: "16px", marginBottom: "16px", color: "var(--accent)" }}>Basic Information</h3>
                  {isStaff && (
                    <p style={{ fontSize: "12px", color: "var(--text-secondary)", marginTop: "-8px", marginBottom: "16px" }}>
                      🔒 Read-only — product details are managed by administrators.
                    </p>
                  )}
                </div>

                <div className="form-group">
                  <label className="form-label">Product Name *</label>
                  <input
                    type="text"
                    className="form-input"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required
                    {...adminOnlyField}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Product Type</label>
                  {addingNewType ? (
                    <div style={{ display: "flex", gap: "8px" }}>
                      <input
                        type="text"
                        className="form-input"
                        placeholder="e.g. Stone, Burial, Cache, Liquid"
                        value={formData.productType}
                        onChange={(e) => setFormData({ ...formData, productType: e.target.value })}
                        autoFocus
                        {...adminOnlyField}
                      />
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => setAddingNewType(false)}
                        style={{ whiteSpace: "nowrap" }}
                      >
                        ✓ Done
                      </button>
                    </div>
                  ) : (
                    /* A custom listbox rather than a native <select>: an
                       <option> cannot hold a delete button, and types
                       accumulate from every product ever created, so there has
                       to be a way to clear the stale ones out. */
                    <div ref={typeMenuRef} style={{ position: "relative" }}>
                      <button
                        type="button"
                        className="form-input"
                        onClick={() => setTypeMenuOpen(!typeMenuOpen)}
                        disabled={isStaff}
                        aria-haspopup="listbox"
                        aria-expanded={typeMenuOpen}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: "8px",
                          textAlign: "left",
                          cursor: isStaff ? "not-allowed" : "pointer",
                          opacity: isStaff ? 0.6 : 1,
                        }}
                      >
                        <span
                          style={{
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                            color: formData.productType ? "var(--text-primary)" : "var(--text-tertiary)",
                          }}
                        >
                          {formData.productType || "— No type —"}
                        </span>
                        <span aria-hidden style={{ flexShrink: 0, color: "var(--text-tertiary)" }}>
                          ▾
                        </span>
                      </button>

                      {typeMenuOpen && (
                        <div
                          role="listbox"
                          style={{
                            position: "absolute",
                            top: "calc(100% + 4px)",
                            left: 0,
                            right: 0,
                            zIndex: 30,
                            // The modal around this scrolls, so the panel caps
                            // its own height instead of running off the card.
                            maxHeight: "260px",
                            overflowY: "auto",
                            padding: "4px",
                            background: "var(--bg-primary)",
                            border: "1px solid var(--border)",
                            borderRadius: "12px",
                            boxShadow: "0 10px 30px rgba(0,0,0,0.35)",
                          }}
                        >
                          <button
                            type="button"
                            role="option"
                            aria-selected={!formData.productType}
                            onClick={() => {
                              setFormData({ ...formData, productType: "" });
                              setTypeMenuOpen(false);
                            }}
                            style={{
                              ...typeRowStyle(!formData.productType),
                              color: "var(--text-tertiary)",
                            }}
                          >
                            — No type —
                          </button>

                          {/* A type saved before it existed anywhere else still
                              needs to show as the current selection, or
                              reopening the form would silently blank it. */}
                          {formData.productType && !productTypeOptions.includes(formData.productType) && (
                            <button
                              type="button"
                              role="option"
                              aria-selected
                              onClick={() => setTypeMenuOpen(false)}
                              style={typeRowStyle(true)}
                            >
                              {formData.productType}
                            </button>
                          )}

                          {productTypeOptions.map((type) => {
                            const selected = formData.productType === type;
                            const inUse = productTypeCounts.get(type) || 0;
                            const busy = deletingType === type;
                            return (
                              <div
                                key={type}
                                style={{ display: "flex", alignItems: "center", gap: "4px" }}
                              >
                                <button
                                  type="button"
                                  role="option"
                                  aria-selected={selected}
                                  onClick={() => {
                                    setFormData({ ...formData, productType: type });
                                    setTypeMenuOpen(false);
                                  }}
                                  style={{ ...typeRowStyle(selected), flex: 1, minWidth: 0 }}
                                >
                                  <span
                                    style={{
                                      display: "block",
                                      overflow: "hidden",
                                      textOverflow: "ellipsis",
                                      whiteSpace: "nowrap",
                                    }}
                                  >
                                    {type}
                                    <span style={{ color: "var(--text-tertiary)", fontSize: "12px" }}>
                                      {" "}· {inUse}
                                    </span>
                                  </span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteType(type)}
                                  disabled={busy || deletingType !== null}
                                  title={`Remove "${type}"${inUse > 0 ? ` (used by ${inUse} product(s))` : ""}`}
                                  aria-label={`Remove ${type}`}
                                  style={{
                                    flexShrink: 0,
                                    width: "32px",
                                    height: "32px",
                                    display: "inline-flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    background: "transparent",
                                    border: "none",
                                    borderRadius: "8px",
                                    color: "var(--red)",
                                    cursor: deletingType !== null ? "not-allowed" : "pointer",
                                    opacity: deletingType !== null && !busy ? 0.4 : 1,
                                    fontSize: "14px",
                                  }}
                                >
                                  {busy ? "…" : "🗑️"}
                                </button>
                              </div>
                            );
                          })}

                          <button
                            type="button"
                            onClick={() => {
                              setFormData({ ...formData, productType: "" });
                              setAddingNewType(true);
                              setTypeMenuOpen(false);
                            }}
                            style={{
                              ...typeRowStyle(false),
                              borderTop: "1px solid var(--border)",
                              borderRadius: 0,
                              marginTop: "4px",
                              color: "var(--accent)",
                            }}
                          >
                            ➕ Add new type…
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                  <small style={{ color: "var(--text-secondary)", fontSize: "12px" }}>
                    Shown to customers on the shop and in the Telegram bot.
                    {!isStaff && " 🗑️ removes a type from this list and clears it off the products using it."}
                  </small>
                </div>

                <div className="form-group">
                  <label className="form-label">Chemical Formula</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="e.g. NaCl, H2SO4"
                    list="formula-options"
                    value={formData.formula}
                    onChange={(e) => setFormData({ ...formData, formula: e.target.value })}
                    {...adminOnlyField}
                  />
                  {/* Suggestions only - the field stays free text, so a formula
                      that has never been used before can still be typed in. */}
                  <datalist id="formula-options">
                    {formulaOptions.map((f) => (
                      <option key={f} value={f} />
                    ))}
                  </datalist>
                  <small style={{ color: "var(--text-secondary)", fontSize: "12px" }}>
                    Shown to customers on the shop and in the Telegram bot
                  </small>
                </div>

                <div className="form-group">
                  <label className="form-label">CAS Number</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="e.g. 7647-14-5"
                    list="cas-options"
                    value={formData.casNumber}
                    onChange={(e) => setFormData({ ...formData, casNumber: e.target.value })}
                    {...adminOnlyField}
                  />
                  <datalist id="cas-options">
                    {casNumberOptions.map((c) => (
                      <option key={c} value={c} />
                    ))}
                  </datalist>
                  <small style={{ color: "var(--text-secondary)", fontSize: "12px" }}>
                    CAS Registry Number, shown next to the formula
                  </small>
                </div>

                <div className="form-group">
                  <label className="form-label">
                    {variants.length > 0 ? "Base Price (USD)" : "Price (USD) *"}
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    className="form-input"
                    value={formData.price}
                    onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                    required
                    {...adminOnlyField}
                  />
                  {variants.length > 0 && (
                    <small style={{ color: "var(--text-secondary)", fontSize: "12px" }}>
                      Not charged — each quantity option below has its own price
                    </small>
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
                    {...adminOnlyField}
                  />
                  <small style={{ color: "var(--text-secondary)", fontSize: "12px" }}>
                    Set higher than the sale price to show a strikethrough discount on the storefront
                  </small>
                </div>

                <div className="form-group" style={{ gridColumn: "1 / -1" }}>
                  <label className="form-label">Description</label>
                  <textarea
                    className="form-input"
                    rows={3}
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    {...adminOnlyField}
                  />
                </div>

                {/* Image Upload */}
                <div className="form-group" style={{ gridColumn: "1 / -1" }}>
                  <label className="form-label">Product Image</label>
                  <div style={{ display: "flex", gap: "16px", alignItems: "center" }}>
                    {!isStaff && (
                      <label className="btn btn-secondary" style={{ cursor: "pointer", margin: 0 }}>
                        📷 Upload Image
                        <input type="file" accept="image/*" onChange={handleImageUpload} style={{ display: "none" }} />
                      </label>
                    )}
                    {formData.imageUrl && (
                      <img
                        src={formData.imageUrl}
                        alt="Preview"
                        style={{ width: "80px", height: "80px", objectFit: "cover", borderRadius: "8px" }}
                      />
                    )}
                  </div>
                </div>

                {/* Quantity / weight options */}
                {!isStaff && !selectedProduct?.parentProductId && (
                  <div style={{ gridColumn: "1 / -1", marginTop: "16px" }}>
                    <h3 style={{ fontSize: "16px", marginBottom: "4px", color: "var(--accent)" }}>
                      Quantity Options
                    </h3>
                    <p style={{ fontSize: "12px", color: "var(--text-secondary)", marginBottom: "16px" }}>
                      Sell the same product in several sizes — e.g. <strong>2g → $70</strong>, <strong>3g → $100</strong>.
                      Each option gets its own stock, areas and delivery media, managed from its own row in the
                      product list after saving. Leave empty to sell this product as a single fixed-price item.
                    </p>

                    <div
                      style={{
                        border: "1px solid var(--border)",
                        borderRadius: "8px",
                        padding: "16px",
                        background: "var(--bg-secondary)",
                        display: "flex",
                        flexDirection: "column",
                        gap: "12px",
                      }}
                    >
                      {variants.length === 0 ? (
                        <p style={{ fontSize: "13px", color: "var(--text-tertiary)", margin: 0 }}>
                          No quantity options — this product is sold at its single price above.
                        </p>
                      ) : (
                        variants.map((variant, idx) => {
                          const existing = variant.id
                            ? products.find((p) => p.id === variant.id)
                            : undefined;
                          return (
                            <div
                              key={variant.id || `new-${idx}`}
                              style={{ display: "flex", gap: "12px", alignItems: "flex-end", flexWrap: "wrap" }}
                            >
                              <div className="form-group" style={{ marginBottom: 0, flex: "1 1 140px" }}>
                                <label className="form-label" style={{ fontSize: "11px" }}>
                                  Quantity / Weight *
                                </label>
                                <input
                                  type="text"
                                  className="form-input"
                                  placeholder="e.g. 2g"
                                  value={variant.label}
                                  maxLength={40}
                                  onChange={(e) => {
                                    const next = [...variants];
                                    next[idx] = { ...next[idx], label: e.target.value };
                                    setVariants(next);
                                  }}
                                />
                              </div>
                              <div className="form-group" style={{ marginBottom: 0, flex: "1 1 140px" }}>
                                <label className="form-label" style={{ fontSize: "11px" }}>
                                  Price (USD) *
                                </label>
                                <input
                                  type="number"
                                  step="0.01"
                                  min="0.01"
                                  className="form-input"
                                  placeholder="70.00"
                                  value={variant.price}
                                  onChange={(e) => {
                                    const next = [...variants];
                                    next[idx] = { ...next[idx], price: e.target.value };
                                    setVariants(next);
                                  }}
                                />
                              </div>
                              <div style={{ flex: "0 0 auto", display: "flex", alignItems: "center", gap: "8px", paddingBottom: "2px" }}>
                                {existing && (
                                  <span
                                    className={`badge ${existing.stockQuantity > 0 ? "badge-green" : "badge-red"}`}
                                    style={{ fontSize: "11px" }}
                                  >
                                    {existing.stockQuantity} in stock
                                  </span>
                                )}
                                <button
                                  type="button"
                                  className="btn btn-ghost btn-sm"
                                  style={{ color: "var(--red)" }}
                                  onClick={() => setVariants(variants.filter((_, i) => i !== idx))}
                                  title={
                                    existing
                                      ? "Removes this option on save. Blocked if customers have ordered it."
                                      : "Remove this option"
                                  }
                                >
                                  ✕
                                </button>
                              </div>
                            </div>
                          );
                        })
                      )}

                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        style={{ alignSelf: "flex-start" }}
                        onClick={() => setVariants([...variants, { label: "", price: "" }])}
                      >
                        ➕ Add quantity option
                      </button>
                    </div>
                  </div>
                )}

                {/* Stock */}
                {variants.length > 0 && !selectedProduct?.parentProductId ? (
                  <div style={{ gridColumn: "1 / -1", marginTop: "16px" }}>
                    <h3 style={{ fontSize: "16px", marginBottom: "8px", color: "var(--accent)" }}>Inventory</h3>
                    <div
                      className="alert"
                      style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)", fontSize: "13px" }}
                    >
                      📦 Stock, delivery areas and pickup media are set per quantity option. Save this form, then
                      use <strong>Stock &amp; Delivery</strong> on each option's row in the product list.
                    </div>
                    {/* A product that used to sell on its own keeps its old units
                        after options are added, but nothing can buy them any more -
                        say so plainly instead of letting the stock quietly vanish
                        from the storefront. */}
                    {(selectedProduct?.stockQuantity ?? 0) > 0 && (
                      <div className="alert alert-error" style={{ fontSize: "13px" }}>
                        ⚠️ This product still holds <strong>{selectedProduct?.stockQuantity} unit(s)</strong> of its own
                        stock from before it had quantity options. Customers can no longer buy those — move the stock
                        onto an option, or set this product's area stock to 0 to clear it.
                      </div>
                    )}
                  </div>
                ) : (
                  <>
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
                                 cooldownMinutes: DEFAULT_COOLDOWN_MINUTES,
                                 stockItems: [] as Array<StockItemDraft>,
                               };

                         const qty = parseInt(detail.stockQuantity, 10) || 0;
                         let stockItems: Array<StockItemDraft> = Array.isArray(detail.stockItems)
                           ? [...detail.stockItems]
                           : [];
                         // Seed from legacy single location/video if present and no items yet.
                         if (stockItems.length === 0 && (detail.locationUrl || detail.videoUrl)) {
                           stockItems = [{
                             locationUrl: detail.locationUrl || "",
                             videoUrl: detail.videoUrl || "",
                             mediaUrls: Array.isArray(detail.mediaUrls) ? detail.mediaUrls : [],
                           }];
                         }
                         // Rows loaded from the API may predate the media column.
                         stockItems = stockItems.map((it) => ({
                           ...it,
                           mediaUrls: Array.isArray(it.mediaUrls) ? it.mediaUrls : [],
                         }));
                         // Grow to match the quantity, but NEVER discard extras here.
                         // Truncating in state is what used to wipe the delivery links
                         // the moment someone backspaced the quantity field to empty.
                         // normalizeAreaDetails() trims to quantity at save time instead,
                         // so lowering and re-raising the number restores the links.
                         while (stockItems.length < qty) stockItems.push({ locationUrl: "", videoUrl: "", mediaUrls: [] });
                         const visibleItems = stockItems.slice(0, qty);
                         const preservedCount = Math.max(0, stockItems.length - qty);

                         const setQuantity = (next: number) => {
                           const safe = Math.max(0, next);
                           const grown = [...stockItems];
                           while (grown.length < safe) grown.push({ locationUrl: "", videoUrl: "", mediaUrls: [] });
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

                         const writeStockItems = (newItems: Array<StockItemDraft>) => {
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

                         const updateStockItem = (itemIdx: number, field: "locationUrl" | "videoUrl", value: string) => {
                           const newItems = [...stockItems];
                           newItems[itemIdx] = { ...newItems[itemIdx], [field]: value };
                           writeStockItems(newItems);
                         };

                         const addStockItemMedia = (itemIdx: number, added: DeliveryMedia[]) => {
                           const newItems = [...stockItems];
                           const current = newItems[itemIdx]?.mediaUrls || [];
                           // Six is what the API stores per unit; trimming here
                           // keeps the form honest about what will be saved.
                           newItems[itemIdx] = { ...newItems[itemIdx], mediaUrls: [...current, ...added].slice(0, 6) };
                           writeStockItems(newItems);
                         };

                         const removeStockItemMedia = (itemIdx: number, mediaIdx: number) => {
                           const newItems = [...stockItems];
                           const current = newItems[itemIdx]?.mediaUrls || [];
                           newItems[itemIdx] = {
                             ...newItems[itemIdx],
                             mediaUrls: current.filter((_, i) => i !== mediaIdx),
                           };
                           writeStockItems(newItems);
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
                                  value={detail.cooldownMinutes ?? DEFAULT_COOLDOWN_MINUTES}
                                  onChange={(e) => updateDetail("cooldownMinutes", Math.max(0, parseInt(e.target.value) || 0))}
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
                                        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
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

                                          {/* Uploaded pickup media. Sent to the customer as real
                                              files on Telegram and shown on their order page once
                                              the cooldown finishes. */}
                                          <div className="form-group" style={{ marginBottom: 0 }}>
                                            <label className="form-label" style={{ fontSize: "11px" }}>
                                              🖼️ Pickup Photos &amp; Videos
                                            </label>

                                            {(item.mediaUrls || []).length > 0 && (
                                              <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginBottom: "8px" }}>
                                                {(item.mediaUrls || []).map((media, mediaIdx) => (
                                                  <div
                                                    key={`${media.url}-${mediaIdx}`}
                                                    style={{
                                                      position: "relative",
                                                      width: "72px",
                                                      height: "72px",
                                                      borderRadius: "6px",
                                                      overflow: "hidden",
                                                      border: "1px solid var(--border)",
                                                      background: "var(--bg-primary)",
                                                    }}
                                                  >
                                                    {media.type === "video" ? (
                                                      <video
                                                        src={media.url}
                                                        muted
                                                        playsInline
                                                        preload="metadata"
                                                        style={{ width: "100%", height: "100%", objectFit: "cover" }}
                                                      />
                                                    ) : (
                                                      <img
                                                        src={media.url}
                                                        alt=""
                                                        style={{ width: "100%", height: "100%", objectFit: "cover" }}
                                                      />
                                                    )}
                                                    {media.type === "video" && (
                                                      <span
                                                        style={{
                                                          position: "absolute",
                                                          bottom: "2px",
                                                          left: "4px",
                                                          fontSize: "12px",
                                                          textShadow: "0 1px 3px rgba(0,0,0,0.8)",
                                                        }}
                                                      >
                                                        🎥
                                                      </span>
                                                    )}
                                                    <button
                                                      type="button"
                                                      onClick={() => removeStockItemMedia(itemIdx, mediaIdx)}
                                                      aria-label="Remove file"
                                                      style={{
                                                        position: "absolute",
                                                        top: "2px",
                                                        right: "2px",
                                                        width: "20px",
                                                        height: "20px",
                                                        borderRadius: "50%",
                                                        border: "none",
                                                        background: "rgba(0,0,0,0.65)",
                                                        color: "#fff",
                                                        cursor: "pointer",
                                                        fontSize: "12px",
                                                        lineHeight: 1,
                                                      }}
                                                    >
                                                      ×
                                                    </button>
                                                  </div>
                                                ))}
                                              </div>
                                            )}

                                            <label
                                              className="btn btn-secondary btn-sm"
                                              style={{
                                                cursor: uploadingMediaFor ? "wait" : "pointer",
                                                display: "inline-block",
                                                opacity: uploadingMediaFor ? 0.6 : 1,
                                              }}
                                            >
                                              {uploadingMediaFor === `${areaId}-${itemIdx}`
                                                ? uploadProgress || "Uploading…"
                                                : "📤 Upload image / video"}
                                              <input
                                                type="file"
                                                accept="image/jpeg,image/png,image/gif,image/webp,video/mp4,video/webm,video/quicktime"
                                                multiple
                                                disabled={!!uploadingMediaFor}
                                                style={{ display: "none" }}
                                                onChange={(e) => {
                                                  const input = e.target;
                                                  handleMediaUpload(input.files, `${areaId}-${itemIdx}`, (uploaded) =>
                                                    addStockItemMedia(itemIdx, uploaded)
                                                  ).finally(() => {
                                                    // Allow re-picking the same file after a removal.
                                                    input.value = "";
                                                  });
                                                }}
                                              />
                                            </label>
                                            <small style={{ fontSize: "11px", color: "var(--text-tertiary)", display: "block", marginTop: "6px" }}>
                                              Images up to 8MB, videos up to 50MB. Delivered on the website and Telegram after the cooldown.
                                            </small>
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
                  </>
                )}
              </div>

              <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end", marginTop: "32px" }}>
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={() => {
                    setShowAddModal(false);
                    setShowEditModal(false);
                    setSelectedProduct(null);
                    resetForm();
                  }}
                  className="btn btn-secondary"
                  style={{ opacity: isSaving ? 0.6 : 1 }}
                >
                  Cancel
                </button>
                {/* Disabled while in flight: a second submit would re-run the
                    whole save and rebuild the per-unit rows a second time. */}
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={isSaving || !!uploadingMediaFor}
                  style={{
                    opacity: isSaving || uploadingMediaFor ? 0.6 : 1,
                    cursor: isSaving || uploadingMediaFor ? "wait" : "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "8px",
                  }}
                >
                  {isSaving && (
                    <span
                      aria-hidden
                      style={{
                        width: "14px",
                        height: "14px",
                        borderRadius: "50%",
                        border: "2px solid rgba(255,255,255,0.35)",
                        borderTopColor: "#fff",
                        animation: "pm-spin 700ms linear infinite",
                      }}
                    />
                  )}
                  {isSaving
                    ? "Saving…"
                    : showAddModal
                    ? "Add Product"
                    : isStaff
                    ? "Save Stock Changes"
                    : "Save Changes"}
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
              {/* Stock is per-area and per-unit, so it has no meaningful bulk
                  form - it is edited product by product in the modal above. */}
              <select className="form-input" value={bulkAction} onChange={(e) => setBulkAction(e.target.value)}>
                <option value="">Select Action</option>
                <option value="update-price">Update Price</option>
                <option value="delete">Delete Products</option>
              </select>
            </div>

            {bulkAction === "update-price" && (
              <div className="form-group">
                <label className="form-label">New Price (USD)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  className="form-input"
                  value={bulkValue}
                  onChange={(e) => setBulkValue(e.target.value)}
                  placeholder="Enter new price"
                />
              </div>
            )}

            <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end", marginTop: "24px" }}>
              <button onClick={() => setShowBulkModal(false)} className="btn btn-secondary" disabled={bulkRunning}>
                Cancel
              </button>
              <button onClick={handleBulkAction} className="btn btn-primary" disabled={bulkRunning}>
                {bulkRunning ? "Applying..." : "Apply"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Force delete — the override for products the API held back because
          they carry order history. Gated on the admin's own password, the same
          way permanent user deletion is. */}
      {forceDelete && (
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
            zIndex: 1100,
            padding: "20px",
          }}
          onClick={() => {
            if (!forceDelete.running) setForceDelete(null);
          }}
        >
          <div
            className="card"
            style={{ width: "100%", maxWidth: "520px", border: "1px solid var(--red)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ fontSize: "20px", marginBottom: "8px", color: "var(--red)" }}>
              ⚠️ Delete with order history
            </h2>
            <p style={{ color: "var(--text-secondary)", fontSize: "13px", marginBottom: "16px" }}>
              {forceDelete.targets.length === 1
                ? "This product has been ordered. Deleting it also erases those order records."
                : `${forceDelete.targets.length} of these products have been ordered. Deleting them also erases those order records.`}{" "}
              Orders left with nothing in them are removed, and any coupon they used is handed back.
              This <strong>cannot be undone</strong>.
            </p>

            <div
              style={{
                maxHeight: "180px",
                overflowY: "auto",
                marginBottom: "16px",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-sm)",
              }}
            >
              {forceDelete.targets.map((target) => (
                <div
                  key={target.id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: "12px",
                    padding: "10px 12px",
                    borderBottom: "1px solid var(--border)",
                    fontSize: "13px",
                  }}
                >
                  <span style={{ fontWeight: 600, overflowWrap: "anywhere" }}>{target.name}</span>
                  <span className="badge badge-red" style={{ flexShrink: 0, fontSize: "11px" }}>
                    {target.orderCount} order{target.orderCount === 1 ? "" : "s"}
                  </span>
                </div>
              ))}
            </div>

            {forceDelete.error && (
              <div className="alert alert-error" style={{ marginBottom: "16px" }}>
                {forceDelete.error}
              </div>
            )}

            <form onSubmit={submitForceDelete} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label" htmlFor="force-delete-password" style={{ fontSize: "12px" }}>
                  Enter <strong>your</strong> admin password to confirm
                </label>
                <input
                  id="force-delete-password"
                  type="password"
                  className="form-input"
                  autoComplete="current-password"
                  placeholder="Your password"
                  value={forceDelete.password}
                  onChange={(e) => setForceDelete({ ...forceDelete, password: e.target.value, error: null })}
                  autoFocus
                  required
                />
              </div>

              <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end" }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={forceDelete.running}
                  onClick={() => setForceDelete(null)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn"
                  disabled={forceDelete.running}
                  style={{ background: "var(--red)", color: "#fff", opacity: forceDelete.running ? 0.6 : 1 }}
                >
                  {forceDelete.running
                    ? "Deleting…"
                    : `Delete ${forceDelete.targets.length} product${forceDelete.targets.length === 1 ? "" : "s"} anyway`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
