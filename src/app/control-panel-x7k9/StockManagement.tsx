"use client";

import React, { useState, useEffect } from "react";

interface StockEntry {
  id: string;
  quantity: number;
  type: string;
  notes: string | null;
  createdAt: string;
  productAreaDetail: {
    product: { id: string; name: string };
    area: { id: string; name: string };
  };
}

interface Product {
  id: string;
  name: string;
  stockQuantity: number;
  areaDetails: Array<{
    id: string;
    areaId: string;
    stockQuantity: number;
    area: { id: string; name: string };
  }>;
}

interface Area {
  id: string;
  name: string;
  cityId: string;
}

export default function StockManagement() {
  const [products, setProducts] = useState<Product[]>([]);
  const [areas, setAreas] = useState<Area[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<string>("");
  const [selectedArea, setSelectedArea] = useState<string>("");
  const [quantity, setQuantity] = useState<string>("");
  const [entryType, setEntryType] = useState<string>("RESTOCK");
  const [notes, setNotes] = useState<string>("");
  const [stockEntries, setStockEntries] = useState<StockEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    fetchProducts();
    fetchAreas();
  }, []);

  useEffect(() => {
    if (selectedProduct) {
      fetchStockEntries();
    }
  }, [selectedProduct, selectedArea]);

  const fetchProducts = async () => {
    try {
      const res = await fetch("/api/admin/products");
      const data = await res.json();
      if (data.products) {
        setProducts(data.products);
      }
    } catch (error) {
      console.error("Error fetching products:", error);
    }
  };

  const fetchAreas = async () => {
    try {
      const res = await fetch("/api/admin/locations");
      const data = await res.json();
      if (data.areas) {
        setAreas(data.areas);
      }
    } catch (error) {
      console.error("Error fetching areas:", error);
    }
  };

  const fetchStockEntries = async () => {
    try {
      let url = `/api/admin/stock-entries?productId=${selectedProduct}`;
      if (selectedArea) {
        url += `&areaId=${selectedArea}`;
      }
      const res = await fetch(url);
      const data = await res.json();
      if (data.entries) {
        setStockEntries(data.entries);
      }
    } catch (error) {
      console.error("Error fetching stock entries:", error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProduct || !selectedArea || !quantity) {
      setMessage({ type: "error", text: "Please fill in all required fields" });
      return;
    }

    setLoading(true);
    setMessage(null);

    try {
      const res = await fetch("/api/admin/stock-entries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId: selectedProduct,
          areaId: selectedArea,
          quantity: parseInt(quantity),
          type: entryType,
          notes: notes || undefined,
        }),
      });

      const data = await res.json();

      if (res.ok) {
        setMessage({ type: "success", text: `Stock entry created successfully. New area stock: ${data.newAreaStock}` });
        setQuantity("");
        setNotes("");
        fetchStockEntries();
        fetchProducts(); // Refresh products to update stock quantities
      } else {
        setMessage({ type: "error", text: data.error || "Failed to create stock entry" });
      }
    } catch (error) {
      setMessage({ type: "error", text: "An error occurred while creating the stock entry" });
    } finally {
      setLoading(false);
    }
  };

  const getSelectedProductAreaStock = () => {
    if (!selectedProduct || !selectedArea) return null;
    const product = products.find(p => p.id === selectedProduct);
    if (!product) return null;
    const areaDetail = product.areaDetails.find(ad => ad.areaId === selectedArea);
    return areaDetail ? areaDetail.stockQuantity : 0;
  };

  const getEntryTypeColor = (type: string) => {
    switch (type) {
      case "RESTOCK": return "text-green-600 bg-green-50";
      case "SALE": return "text-blue-600 bg-blue-50";
      case "ADJUSTMENT": return "text-yellow-600 bg-yellow-50";
      case "DAMAGE": return "text-red-600 bg-red-50";
      case "RETURN": return "text-purple-600 bg-purple-50";
      default: return "text-gray-600 bg-gray-50";
    }
  };

  return (
    <div className="p-6 bg-white rounded-lg shadow">
      <h2 className="text-2xl font-bold mb-6">Stock Management</h2>

      {message && (
        <div className={`mb-4 p-3 rounded ${message.type === "success" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
          {message.text}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Stock Entry Form */}
        <div className="bg-gray-50 p-4 rounded-lg">
          <h3 className="text-lg font-semibold mb-4">Add Stock Entry</h3>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Product *</label>
              <select
                value={selectedProduct}
                onChange={(e) => setSelectedProduct(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              >
                <option value="">Select a product</option>
                {products.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.name} (Total: {product.stockQuantity})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Area *</label>
              <select
                value={selectedArea}
                onChange={(e) => setSelectedArea(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              >
                <option value="">Select an area</option>
                {areas.map((area) => (
                  <option key={area.id} value={area.id}>
                    {area.name}
                  </option>
                ))}
              </select>
            </div>

            {selectedProduct && selectedArea && (
              <div className="bg-blue-50 p-3 rounded">
                <p className="text-sm text-blue-700">
                  Current stock in this area: <strong>{getSelectedProductAreaStock()}</strong>
                </p>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Entry Type *</label>
              <select
                value={entryType}
                onChange={(e) => setEntryType(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              >
                <option value="RESTOCK">Restock (+)</option>
                <option value="SALE">Sale (-)</option>
                <option value="ADJUSTMENT">Adjustment (+/-)</option>
                <option value="DAMAGE">Damage (-)</option>
                <option value="RETURN">Return (+)</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Quantity *</label>
              <input
                type="number"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Enter quantity (positive or negative)"
                required
              />
              <p className="text-xs text-gray-500 mt-1">
                Use positive numbers for additions, negative for removals
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                rows={3}
                placeholder="Optional notes about this stock entry"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "Creating..." : "Create Stock Entry"}
            </button>
          </form>
        </div>

        {/* Stock Entries History */}
        <div className="bg-gray-50 p-4 rounded-lg">
          <h3 className="text-lg font-semibold mb-4">Stock Entry History</h3>
          {!selectedProduct ? (
            <p className="text-gray-500 text-center py-8">Select a product to view stock entries</p>
          ) : stockEntries.length === 0 ? (
            <p className="text-gray-500 text-center py-8">No stock entries found</p>
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {stockEntries.map((entry) => (
                <div key={entry.id} className="bg-white p-3 rounded border">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <span className={`inline-block px-2 py-1 rounded text-xs font-medium ${getEntryTypeColor(entry.type)}`}>
                        {entry.type}
                      </span>
                      <span className="ml-2 text-sm font-medium">
                        {entry.quantity > 0 ? "+" : ""}{entry.quantity}
                      </span>
                    </div>
                    <span className="text-xs text-gray-500">
                      {new Date(entry.createdAt).toLocaleString()}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600">
                    {entry.productAreaDetail.product.name} - {entry.productAreaDetail.area.name}
                  </p>
                  {entry.notes && (
                    <p className="text-xs text-gray-500 mt-1">{entry.notes}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Current Stock Overview */}
      {selectedProduct && (
        <div className="mt-6 bg-gray-50 p-4 rounded-lg">
          <h3 className="text-lg font-semibold mb-4">Current Stock Overview</h3>
          <div className="overflow-x-auto">
            <table className="min-w-full bg-white border border-gray-200">
              <thead>
                <tr className="bg-gray-100">
                  <th className="px-4 py-2 text-left text-sm font-medium text-gray-700">Area</th>
                  <th className="px-4 py-2 text-left text-sm font-medium text-gray-700">Stock Quantity</th>
                </tr>
              </thead>
              <tbody>
                {products
                  .find(p => p.id === selectedProduct)
                  ?.areaDetails.map((areaDetail) => (
                    <tr key={areaDetail.id} className="border-t">
                      <td className="px-4 py-2 text-sm">{areaDetail.area.name}</td>
                      <td className="px-4 py-2 text-sm font-medium">{areaDetail.stockQuantity}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
