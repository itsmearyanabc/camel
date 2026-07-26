"use client";

import React, { useState, useEffect } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from "recharts";

export default function DashboardAnalytics() {
  const [timeFilter, setTimeFilter] = useState("last30");
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, [timeFilter]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/client-admin/dashboard?filter=${timeFilter}`);
      const json = await res.json();
      setData(json);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  if (loading || !data) {
    return <div style={{ padding: "40px", textAlign: "center" }}>Loading Analytics...</div>;
  }

  const { kpis, sources, chartData, inventory, payments, recentOrders, activityFeed } = data;

  const formatMoney = (val: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      {/* Header & Filter */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2 style={{ fontSize: "1.5rem", fontWeight: "700" }}>Dashboard Overview</h2>
        <div style={{ display: "flex", gap: "12px" }}>
          <select 
            className="form-input" 
            value={timeFilter} 
            onChange={(e) => setTimeFilter(e.target.value)}
            style={{ width: "auto" }}
          >
            <option value="today">Today</option>
            <option value="yesterday">Yesterday</option>
            <option value="last7">Last 7 Days</option>
            <option value="last30">Last 30 Days</option>
            <option value="thisMonth">This Month</option>
            <option value="all">All Time</option>
          </select>
          <button className="btn btn-secondary">Export Report</button>
        </div>
      </div>

      {/* Row 1: KPI Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "16px" }}>
        <KpiCard title="Net Sales Revenue" value={formatMoney(kpis.revenue)} trend={`${kpis.revenueGrowth.toFixed(1)}%`} icon="💰" />
        <KpiCard title="Total Orders" value={kpis.totalOrders} icon="🛍️" />
        <KpiCard title="Active Orders" value={kpis.activeOrders} icon="⚡" />
        <KpiCard title="Avg Order Value" value={formatMoney(kpis.aov)} icon="📈" />
        <KpiCard title="Completed Orders" value={kpis.completedOrders} icon="✅" />
        <KpiCard title="Cancelled Orders" value={kpis.cancelledOrders} icon="❌" />
        <KpiCard title="Total Users" value={kpis.totalUsers} icon="👥" />
        <KpiCard title="New Users" value={kpis.newUsers} icon="✨" />
      </div>

      {/* Row 2: Charts */}
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "16px" }}>
        <div className="card" style={{ padding: "20px" }}>
          <h3 style={{ marginBottom: "20px" }}>Revenue Trend</h3>
          <div style={{ height: "300px" }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis dataKey="date" stroke="var(--text-secondary)" fontSize={12} />
                <YAxis stroke="var(--text-secondary)" fontSize={12} />
                <RechartsTooltip contentStyle={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }} />
                <Line type="monotone" dataKey="revenue" stroke="var(--accent)" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card" style={{ padding: "20px" }}>
          <h3 style={{ marginBottom: "20px" }}>Order Sources</h3>
          <div style={{ height: "300px" }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={sources} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={5}>
                  {sources.map((entry: any, index: number) => (
                    <Cell key={`cell-${index}`} fill={entry.fill} />
                  ))}
                </Pie>
                <RechartsTooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Row 3: Inventory & Top Products */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
        <div className="card" style={{ padding: "20px" }}>
          <h3 style={{ marginBottom: "20px" }}>Inventory Health</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "12px", background: "var(--background)", borderRadius: "8px" }}>
              <span>Products In Stock</span><strong style={{ color: "var(--accent)" }}>{inventory.inStock}</strong>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "12px", background: "var(--background)", borderRadius: "8px" }}>
              <span>Low Stock Alerts</span><strong style={{ color: "var(--yellow)" }}>{inventory.lowStock}</strong>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "12px", background: "var(--background)", borderRadius: "8px" }}>
              <span>Out of Stock</span><strong style={{ color: "var(--red)" }}>{inventory.outOfStock}</strong>
            </div>
          </div>
        </div>

        <div className="card" style={{ padding: "20px" }}>
          <h3 style={{ marginBottom: "20px" }}>Wallet & Payments</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "12px", background: "var(--background)", borderRadius: "8px" }}>
              <span>Total Wallet Balance</span><strong>{formatMoney(payments.totalWalletBalance)}</strong>
            </div>
            {/* Can add more detailed payment stats here later based on the API */}
          </div>
        </div>
      </div>

      {/* Row 4: Recent Orders */}
      <div className="card" style={{ padding: "20px" }}>
        <h3 style={{ marginBottom: "20px" }}>Recent Orders</h3>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "2px solid var(--border)", textAlign: "left" }}>
                <th style={{ padding: "12px" }}>Order ID</th>
                <th style={{ padding: "12px" }}>Customer</th>
                <th style={{ padding: "12px" }}>Amount</th>
                <th style={{ padding: "12px" }}>Status</th>
                <th style={{ padding: "12px" }}>Source</th>
                <th style={{ padding: "12px" }}>Time</th>
              </tr>
            </thead>
            <tbody>
              {recentOrders.map((order: any) => (
                <tr key={order.id} style={{ borderBottom: "1px solid var(--border)" }}>
                  <td style={{ padding: "12px", fontFamily: "monospace", fontSize: "12px" }}>{order.id.slice(0,8)}</td>
                  <td style={{ padding: "12px", fontWeight: "bold" }}>{order.customer}</td>
                  <td style={{ padding: "12px" }}>{formatMoney(order.amount)}</td>
                  <td style={{ padding: "12px" }}><span className={`badge badge-${order.status.toLowerCase()}`}>{order.status}</span></td>
                  <td style={{ padding: "12px" }}>{order.source}</td>
                  <td style={{ padding: "12px", color: "var(--text-secondary)", fontSize: "13px" }}>{new Date(order.time).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Row 5: Activity Feed */}
      <div className="card" style={{ padding: "20px" }}>
        <h3 style={{ marginBottom: "20px" }}>Live Activity Feed</h3>
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {activityFeed.map((activity: any) => (
            <div key={activity.id} style={{ display: "flex", gap: "16px", padding: "12px", background: "var(--background)", borderRadius: "8px", alignItems: "center" }}>
              <div style={{ fontSize: "20px" }}>
                {activity.type === 'USER_REGISTERED' ? '👤' : '🛒'}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: "bold" }}>{activity.title}</div>
                <div style={{ color: "var(--text-secondary)", fontSize: "13px" }}>{activity.description}</div>
              </div>
              <div style={{ color: "var(--text-secondary)", fontSize: "12px" }}>
                {new Date(activity.time).toLocaleTimeString()}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function KpiCard({ title, value, trend, icon }: { title: string, value: string | number, trend?: string, icon: string }) {
  const isPositive = trend && !trend.startsWith("-");
  return (
    <div className="card" style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "12px", background: "var(--surface)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ color: "var(--text-secondary)", fontSize: "14px", fontWeight: "500" }}>{title}</span>
        <span style={{ fontSize: "20px" }}>{icon}</span>
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: "12px" }}>
        <h3 style={{ fontSize: "28px", fontWeight: "800", margin: 0 }}>{value}</h3>
        {trend && (
          <span style={{ fontSize: "13px", fontWeight: "600", color: isPositive ? "var(--green, #22c55e)" : "var(--red, #ef4444)" }}>
            {isPositive ? "↑" : "↓"} {trend}
          </span>
        )}
      </div>
    </div>
  );
}
