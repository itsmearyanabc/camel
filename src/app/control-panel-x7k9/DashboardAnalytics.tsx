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
    return (
      <div style={{ padding: "100px 40px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "20px" }}>
        <div className="spinner" style={{ width: "40px", height: "40px", border: "4px solid var(--border)", borderTopColor: "var(--accent)", borderRadius: "50%", animation: "spin 1s linear infinite" }}></div>
        <h3 style={{ color: "var(--text-secondary)" }}>Aggregating Live Business Data...</h3>
      </div>
    );
  }

  const { kpis, sources, chartData, inventory, payments, customerAnalytics, topProducts, alerts, recentOrders, activityFeed } = data;

  const formatMoney = (val: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val || 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "32px", animation: "fadeIn 0.5s ease" }}>
      
      {/* Header & Quick Actions */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: "16px" }}>
        <div>
          <h2 style={{ fontSize: "2rem", fontWeight: "800", letterSpacing: "-0.5px", marginBottom: "8px" }}>Business Overview</h2>
          <p style={{ color: "var(--text-secondary)" }}>Your 15-second health check of Camel971.</p>
        </div>
        <div style={{ display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
          <select 
            className="form-input" 
            value={timeFilter} 
            onChange={(e) => setTimeFilter(e.target.value)}
            style={{ width: "auto", background: "var(--surface)", border: "1px solid var(--border)", fontWeight: "600", padding: "8px 16px" }}
          >
            <option value="today">Today</option>
            <option value="yesterday">Yesterday</option>
            <option value="last7">Last 7 Days</option>
            <option value="last30">Last 30 Days</option>
            <option value="thisMonth">This Month</option>
            <option value="all">All Time</option>
          </select>
          <button className="btn btn-primary btn-sm" style={{ padding: "8px 16px" }}>+ Add Product</button>
          <button className="btn btn-secondary btn-sm" style={{ padding: "8px 16px" }}>Manage Orders</button>
          <button className="btn btn-ghost btn-sm" style={{ padding: "8px 16px" }}>Export Report</button>
        </div>
      </div>

      {/* Row 1: KPI Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "16px" }}>
        <KpiCard title="Net Sales Revenue" value={formatMoney(kpis.revenue)} trend={`${kpis.revenueGrowth.toFixed(1)}% vs prior`} icon="💰" color="var(--accent)" />
        <KpiCard title="Total Orders" value={kpis.totalOrders} icon="🛍️" color="var(--blue)" />
        <KpiCard title="Active Orders" value={kpis.activeOrders} icon="⚡" color="var(--yellow)" />
        <KpiCard title="Completed Orders" value={kpis.completedOrders} icon="✅" color="var(--green)" />
        <KpiCard title="Cancelled Orders" value={kpis.cancelledOrders} icon="❌" color="var(--red)" />
        <KpiCard title="Registered Users" value={kpis.totalUsers} icon="👥" color="var(--purple)" />
        <KpiCard title="New Users Today" value={kpis.newUsersToday} icon="✨" color="var(--cyan)" />
        <KpiCard title="Avg Order Value" value={formatMoney(kpis.aov)} icon="📈" color="var(--accent)" />
      </div>

      {/* Row 2: Charts */}
      <div style={{ display: "grid", gridTemplateColumns: "2.5fr 1fr", gap: "24px" }}>
        <div className="card shadow-sm" style={{ padding: "24px", background: "var(--surface)" }}>
          <h3 style={{ marginBottom: "24px", fontSize: "1.1rem" }}>Revenue & Order Trend</h3>
          <div style={{ height: "320px" }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.1} vertical={false} />
                <XAxis dataKey="date" stroke="var(--text-secondary)" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="var(--text-secondary)" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(val) => `$${val}`} />
                <RechartsTooltip contentStyle={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)', borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                <Line type="monotone" dataKey="revenue" stroke="var(--accent)" strokeWidth={4} dot={false} activeDot={{ r: 8, fill: "var(--accent)", stroke: "var(--bg-primary)", strokeWidth: 2 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card shadow-sm" style={{ padding: "24px", background: "var(--surface)" }}>
          <h3 style={{ marginBottom: "24px", fontSize: "1.1rem" }}>Order Sources</h3>
          <div style={{ height: "320px" }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={sources} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={70} outerRadius={100} paddingAngle={5} stroke="none">
                  {sources.map((entry: any, index: number) => (
                    <Cell key={`cell-${index}`} fill={entry.fill} />
                  ))}
                </Pie>
                <RechartsTooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                <Legend iconType="circle" wrapperStyle={{ paddingTop: "20px" }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Row 3: Inventory + Top Products */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px" }}>
        <div className="card shadow-sm" style={{ padding: "24px" }}>
          <h3 style={{ marginBottom: "20px", fontSize: "1.1rem", borderBottom: "1px solid var(--border)", paddingBottom: "12px" }}>Inventory Health</h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
            <StatBox label="Products In Stock" value={inventory.inStock} color="var(--green)" />
            <StatBox label="Low Stock" value={inventory.lowStock} color="var(--yellow)" />
            <StatBox label="Out of Stock" value={inventory.outOfStock} color="var(--red)" />
            <StatBox label="Needing Restock" value={inventory.needingRestock} color="var(--orange)" />
          </div>
          <div style={{ marginTop: "16px", padding: "16px", background: "var(--bg-secondary)", borderRadius: "12px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontWeight: "600", color: "var(--text-secondary)" }}>Total Inventory Value</span>
            <span style={{ fontSize: "24px", fontWeight: "800", color: "var(--text-primary)" }}>{formatMoney(inventory.value)}</span>
          </div>
        </div>

        <div className="card shadow-sm" style={{ padding: "24px" }}>
          <h3 style={{ marginBottom: "20px", fontSize: "1.1rem", borderBottom: "1px solid var(--border)", paddingBottom: "12px" }}>Top Selling Products</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {topProducts.length === 0 ? <p style={{ color: "var(--text-secondary)", textAlign: "center", padding: "20px" }}>No product sales in this period.</p> : null}
            {topProducts.map((p: any, i: number) => (
              <div key={p.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px", background: "var(--bg-secondary)", borderRadius: "8px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                  <div style={{ width: "24px", height: "24px", borderRadius: "50%", background: "var(--accent)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "12px", fontWeight: "bold" }}>{i + 1}</div>
                  <strong style={{ fontSize: "15px" }}>{p.name}</strong>
                </div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
                  <span style={{ fontWeight: "800" }}>{p.quantity} sold</span>
                  <span style={{ fontSize: "12px", color: "var(--green)" }}>{formatMoney(p.revenue)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Row 4: Customer Analytics + Wallet & Payments */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px" }}>
        <div className="card shadow-sm" style={{ padding: "24px" }}>
          <h3 style={{ marginBottom: "20px", fontSize: "1.1rem", borderBottom: "1px solid var(--border)", paddingBottom: "12px" }}>Customer Analytics</h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "16px" }}>
            <StatBox label="Total Customers" value={customerAnalytics.totalCustomers} color="var(--purple)" />
            <StatBox label="Avg Customer Spend" value={formatMoney(customerAnalytics.avgSpend)} color="var(--green)" />
            <StatBox label="New vs Returning" value={`${customerAnalytics.newCustomers} / ${customerAnalytics.returningCustomers}`} color="var(--blue)" />
            <StatBox label="Inactive (30+ days)" value={customerAnalytics.inactiveCustomers} color="var(--red)" />
          </div>
          <div style={{ padding: "16px", background: "var(--bg-secondary)", borderRadius: "12px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontWeight: "600", color: "var(--text-secondary)" }}>Highest Spender</span>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: "16px", fontWeight: "800", color: "var(--text-primary)" }}>{customerAnalytics.highestSpendingCustomer.name}</div>
              <div style={{ fontSize: "13px", color: "var(--green)" }}>{formatMoney(customerAnalytics.highestSpendingCustomer.amount)}</div>
            </div>
          </div>
        </div>

        <div className="card shadow-sm" style={{ padding: "24px" }}>
          <h3 style={{ marginBottom: "20px", fontSize: "1.1rem", borderBottom: "1px solid var(--border)", paddingBottom: "12px" }}>Payments & Wallet</h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "16px" }}>
            <StatBox label="Total Wallet Balance" value={formatMoney(payments.totalWalletBalance)} color="var(--accent)" />
            <StatBox label="Wallet Deposits Today" value={formatMoney(payments.depositsToday)} color="var(--green)" />
            <StatBox label="Pending Crypto" value={payments.pendingCryptoPayments} color="var(--yellow)" />
            <StatBox label="Failed Payments" value={payments.failedPayments} color="var(--red)" />
          </div>
          {payments.breakdown.length > 0 && (
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", padding: "12px", background: "var(--bg-secondary)", borderRadius: "8px" }}>
              <span style={{ fontSize: "13px", color: "var(--text-secondary)", marginRight: "8px", alignSelf: "center" }}>Method Breakdown:</span>
              {payments.breakdown.map((b: any) => (
                <span key={b.name} className="badge badge-default" style={{ fontSize: "12px" }}>{b.name}: {b.value}</span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Row 5: Recent Orders */}
      <div className="card shadow-sm" style={{ padding: "24px" }}>
        <h3 style={{ marginBottom: "20px", fontSize: "1.1rem" }}>Recent Orders</h3>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "2px solid var(--border)", textAlign: "left" }}>
                <th style={{ padding: "16px 12px", color: "var(--text-secondary)", fontWeight: "600", fontSize: "13px" }}>ORDER ID</th>
                <th style={{ padding: "16px 12px", color: "var(--text-secondary)", fontWeight: "600", fontSize: "13px" }}>CUSTOMER</th>
                <th style={{ padding: "16px 12px", color: "var(--text-secondary)", fontWeight: "600", fontSize: "13px" }}>AMOUNT</th>
                <th style={{ padding: "16px 12px", color: "var(--text-secondary)", fontWeight: "600", fontSize: "13px" }}>STATUS</th>
                <th style={{ padding: "16px 12px", color: "var(--text-secondary)", fontWeight: "600", fontSize: "13px" }}>SOURCE</th>
                <th style={{ padding: "16px 12px", color: "var(--text-secondary)", fontWeight: "600", fontSize: "13px" }}>TIME</th>
              </tr>
            </thead>
            <tbody>
              {recentOrders.length === 0 && (
                <tr><td colSpan={6} style={{ textAlign: "center", padding: "30px", color: "var(--text-secondary)" }}>No recent orders.</td></tr>
              )}
              {recentOrders.map((order: any) => (
                <tr key={order.id} style={{ borderBottom: "1px solid var(--border)", transition: "background 0.2s" }} onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-secondary)'} onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}>
                  <td style={{ padding: "16px 12px", fontFamily: "monospace", fontSize: "13px", color: "var(--accent)" }}>#{order.id.slice(0,8)}</td>
                  <td style={{ padding: "16px 12px", fontWeight: "700" }}>{order.customer}</td>
                  <td style={{ padding: "16px 12px", fontWeight: "600" }}>{formatMoney(order.amount)}</td>
                  <td style={{ padding: "16px 12px" }}>
                    <span className={`badge badge-${order.status.toLowerCase()}`} style={{ padding: "4px 10px", borderRadius: "100px", fontSize: "11px", fontWeight: "bold" }}>{order.status}</span>
                  </td>
                  <td style={{ padding: "16px 12px", fontSize: "14px" }}>
                    {order.source === 'WEBSITE' ? '🌐 Website' : '📱 Telegram'}
                  </td>
                  <td style={{ padding: "16px 12px", color: "var(--text-secondary)", fontSize: "13px" }}>
                    {new Date(order.time).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Row 6: Alerts + Activity Feed */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: "24px" }}>
        <div className="card shadow-sm" style={{ padding: "24px" }}>
          <h3 style={{ marginBottom: "20px", fontSize: "1.1rem", borderBottom: "1px solid var(--border)", paddingBottom: "12px", display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ color: "var(--red)" }}>⚠️</span> Action Alerts
          </h3>
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {alerts.length === 0 ? (
              <div style={{ padding: "20px", textAlign: "center", color: "var(--green)", background: "var(--bg-secondary)", borderRadius: "8px" }}>
                ✓ All systems healthy. No action required.
              </div>
            ) : null}
            {alerts.map((a: any, i: number) => (
              <div key={i} style={{ padding: "16px", borderRadius: "8px", background: a.type === 'danger' ? 'rgba(239,68,68,0.1)' : a.type === 'warning' ? 'rgba(234,179,8,0.1)' : 'rgba(59,130,246,0.1)', border: `1px solid ${a.type === 'danger' ? 'var(--red)' : a.type === 'warning' ? 'var(--yellow)' : 'var(--blue)'}`, display: "flex", gap: "12px", alignItems: "flex-start" }}>
                <span style={{ fontSize: "18px" }}>{a.type === 'danger' ? '🔴' : a.type === 'warning' ? '🟠' : '🔵'}</span>
                <span style={{ fontSize: "14px", fontWeight: "500", color: "var(--text-primary)", lineHeight: "1.4" }}>{a.message}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="card shadow-sm" style={{ padding: "24px" }}>
          <h3 style={{ marginBottom: "20px", fontSize: "1.1rem", borderBottom: "1px solid var(--border)", paddingBottom: "12px", display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ color: "var(--green)" }}>⚡</span> Live Activity Feed
          </h3>
          <div style={{ display: "flex", flexDirection: "column", gap: "12px", maxHeight: "400px", overflowY: "auto", paddingRight: "8px" }}>
            {activityFeed.length === 0 ? <p style={{ color: "var(--text-secondary)" }}>No recent activity.</p> : null}
            {activityFeed.map((activity: any) => (
              <div key={activity.id} style={{ display: "flex", gap: "16px", padding: "16px", background: "var(--bg-secondary)", borderRadius: "8px", alignItems: "center", borderLeft: activity.type === 'USER_REGISTERED' ? "4px solid var(--purple)" : "4px solid var(--green)" }}>
                <div style={{ fontSize: "24px", background: "var(--surface)", width: "40px", height: "40px", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 2px 5px rgba(0,0,0,0.05)" }}>
                  {activity.type === 'USER_REGISTERED' ? '👤' : '🛒'}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: "700", fontSize: "15px" }}>{activity.title}</div>
                  <div style={{ color: "var(--text-secondary)", fontSize: "14px", marginTop: "2px" }}>{activity.description}</div>
                </div>
                <div style={{ color: "var(--text-secondary)", fontSize: "12px", fontWeight: "600", textAlign: "right" }}>
                  {new Date(activity.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  <div style={{ fontSize: "10px", marginTop: "2px" }}>{new Date(activity.time).toLocaleDateString()}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

    </div>
  );
}

function KpiCard({ title, value, trend, icon, color }: { title: string, value: string | number, trend?: string, icon: string, color: string }) {
  const isPositive = trend && !trend.startsWith("-") && trend !== "0% vs prior";
  return (
    <div className="card shadow-sm" style={{ padding: "24px", display: "flex", flexDirection: "column", gap: "16px", background: "var(--surface)", borderTop: `4px solid ${color}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ color: "var(--text-secondary)", fontSize: "13px", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.5px" }}>{title}</span>
        <div style={{ background: `${color}15`, width: "36px", height: "36px", borderRadius: "8px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "18px" }}>
          {icon}
        </div>
      </div>
      <div>
        <h3 style={{ fontSize: "28px", fontWeight: "800", margin: 0, color: "var(--text-primary)", letterSpacing: "-0.5px" }}>{value}</h3>
        {trend && (
          <div style={{ marginTop: "8px", fontSize: "13px", fontWeight: "600", display: "flex", alignItems: "center", gap: "4px" }}>
            <span style={{ color: isPositive ? "var(--green, #22c55e)" : "var(--text-secondary)", background: isPositive ? "rgba(34,197,94,0.1)" : "var(--bg-secondary)", padding: "2px 6px", borderRadius: "4px" }}>
              {isPositive ? "↑" : "−"} {trend}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function StatBox({ label, value, color }: { label: string, value: string | number, color: string }) {
  return (
    <div style={{ padding: "16px", background: "var(--bg-secondary)", borderRadius: "12px", borderLeft: `3px solid ${color}` }}>
      <div style={{ color: "var(--text-secondary)", fontSize: "12px", fontWeight: "700", textTransform: "uppercase", marginBottom: "4px" }}>{label}</div>
      <div style={{ fontSize: "20px", fontWeight: "800", color: "var(--text-primary)" }}>{value}</div>
    </div>
  );
}
