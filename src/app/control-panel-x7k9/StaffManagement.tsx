"use client";

import React, { useState, useEffect } from "react";

interface StaffMember {
  id: string;
  username: string;
  createdAt: string;
  failedLoginAttempts: number;
  lockUntil: string | null;
  lastLoginAt?: string | null;
  isActive?: boolean;
}

interface StaffActivity {
  id: string;
  staffId: string;
  action: string;
  details: string;
  createdAt: string;
}

export default function StaffManagement() {
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showActivityModal, setShowActivityModal] = useState(false);
  const [selectedStaff, setSelectedStaff] = useState<StaffMember | null>(null);
  const [staffActivity, setStaffActivity] = useState<StaffActivity[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState<"ALL" | "ACTIVE" | "LOCKED">("ALL");

  // Form states
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [editPassword, setEditPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  useEffect(() => {
    fetchStaff();
  }, []);

  const fetchStaff = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/admin/employees");
      const data = await res.json();
      if (data.staff) {
        setStaff(data.staff);
      }
    } catch (e) {
      console.error("Failed to fetch staff:", e);
      setMsg({ type: "error", text: "Failed to load staff members" });
    } finally {
      setLoading(false);
    }
  };

  const fetchStaffActivity = async (staffId: string) => {
    try {
      const res = await fetch(`/api/admin/staff-activity?staffId=${staffId}`);
      const data = await res.json();
      if (data.activity) {
        setStaffActivity(data.activity);
      }
    } catch (e) {
      console.error("Failed to fetch staff activity:", e);
    }
  };

  const handleAddStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);

    if (newPassword.length < 6) {
      setMsg({ type: "error", text: "Password must be at least 6 characters" });
      return;
    }

    try {
      const res = await fetch("/api/admin/employees", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: newUsername, password: newPassword }),
      });

      const data = await res.json();

      if (res.ok) {
        setMsg({ type: "success", text: "Staff member added successfully!" });
        setNewUsername("");
        setNewPassword("");
        setShowAddModal(false);
        fetchStaff();
      } else {
        setMsg({ type: "error", text: data.error || "Failed to add staff member" });
      }
    } catch (e) {
      setMsg({ type: "error", text: "Error adding staff member" });
    }
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);

    if (!selectedStaff) return;

    if (editPassword.length < 6) {
      setMsg({ type: "error", text: "Password must be at least 6 characters" });
      return;
    }

    if (editPassword !== confirmPassword) {
      setMsg({ type: "error", text: "Passwords do not match" });
      return;
    }

    try {
      const res = await fetch("/api/admin/employees", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ staffId: selectedStaff.id, newPassword: editPassword }),
      });

      const data = await res.json();

      if (res.ok) {
        setMsg({ type: "success", text: "Password updated successfully!" });
        setEditPassword("");
        setConfirmPassword("");
        setShowEditModal(false);
        setSelectedStaff(null);
      } else {
        setMsg({ type: "error", text: data.error || "Failed to update password" });
      }
    } catch (e) {
      setMsg({ type: "error", text: "Error updating password" });
    }
  };

  const handleDeleteStaff = async (staffId: string, username: string) => {
    if (!confirm(`Are you sure you want to delete staff member "${username}"? This action cannot be undone.`)) {
      return;
    }

    try {
      const res = await fetch("/api/admin/employees", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ staffId }),
      });

      if (res.ok) {
        setMsg({ type: "success", text: "Staff member deleted successfully!" });
        fetchStaff();
      } else {
        const data = await res.json();
        setMsg({ type: "error", text: data.error || "Failed to delete staff member" });
      }
    } catch (e) {
      setMsg({ type: "error", text: "Error deleting staff member" });
    }
  };

  const handleUnlockStaff = async (staffId: string) => {
    try {
      const res = await fetch("/api/admin/staff-unlock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ staffId }),
      });

      if (res.ok) {
        setMsg({ type: "success", text: "Staff account unlocked successfully!" });
        fetchStaff();
      } else {
        const data = await res.json();
        setMsg({ type: "error", text: data.error || "Failed to unlock account" });
      }
    } catch (e) {
      setMsg({ type: "error", text: "Error unlocking account" });
    }
  };

  const openEditModal = (staffMember: StaffMember) => {
    setSelectedStaff(staffMember);
    setEditPassword("");
    setConfirmPassword("");
    setShowEditModal(true);
  };

  const openActivityModal = async (staffMember: StaffMember) => {
    setSelectedStaff(staffMember);
    await fetchStaffActivity(staffMember.id);
    setShowActivityModal(true);
  };

  const isLocked = (staffMember: StaffMember) => {
    return staffMember.lockUntil && new Date(staffMember.lockUntil) > new Date();
  };

  const filteredStaff = staff.filter((s) => {
    const matchesSearch = s.username.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesFilter =
      filterStatus === "ALL" ||
      (filterStatus === "LOCKED" && isLocked(s)) ||
      (filterStatus === "ACTIVE" && !isLocked(s));
    return matchesSearch && matchesFilter;
  });

  const stats = {
    total: staff.length,
    active: staff.filter((s) => !isLocked(s)).length,
    locked: staff.filter((s) => isLocked(s)).length,
  };

  if (loading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "400px" }}>
        <div style={{ textAlign: "center" }}>
          <div className="skeleton" style={{ width: "60px", height: "60px", borderRadius: "50%", margin: "0 auto 16px" }}></div>
          <p style={{ color: "var(--text-secondary)" }}>Loading staff members...</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "16px" }}>
        <div>
          <h2 style={{ fontSize: "28px", marginBottom: "8px" }}>Staff Management</h2>
          <p style={{ color: "var(--text-secondary)", fontSize: "14px" }}>
            Manage staff accounts, permissions, and monitor activity
          </p>
        </div>
        <button onClick={() => setShowAddModal(true)} className="btn btn-primary">
          + Add Staff Member
        </button>
      </div>

      {/* Message Alert */}
      {msg && (
        <div className={`alert ${msg.type === "error" ? "alert-error" : "alert-success"}`} style={{ animation: "fadeIn 0.3s ease" }}>
          {msg.text}
        </div>
      )}

      {/* Stats Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "16px" }}>
        <div className="card" style={{ padding: "20px" }}>
          <div style={{ fontSize: "14px", color: "var(--text-secondary)", marginBottom: "8px" }}>Total Staff</div>
          <div style={{ fontSize: "32px", fontWeight: "700", color: "var(--accent)" }}>{stats.total}</div>
        </div>
        <div className="card" style={{ padding: "20px" }}>
          <div style={{ fontSize: "14px", color: "var(--text-secondary)", marginBottom: "8px" }}>Active</div>
          <div style={{ fontSize: "32px", fontWeight: "700", color: "var(--green)" }}>{stats.active}</div>
        </div>
        <div className="card" style={{ padding: "20px" }}>
          <div style={{ fontSize: "14px", color: "var(--text-secondary)", marginBottom: "8px" }}>Locked</div>
          <div style={{ fontSize: "32px", fontWeight: "700", color: "var(--red)" }}>{stats.locked}</div>
        </div>
      </div>

      {/* Filters */}
      <div className="card" style={{ padding: "16px" }}>
        <div style={{ display: "flex", gap: "16px", flexWrap: "wrap", alignItems: "center" }}>
          <input
            type="text"
            className="form-input"
            placeholder="Search by username..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{ flex: 1, minWidth: "200px" }}
          />
          <div style={{ display: "flex", gap: "8px" }}>
            <button
              onClick={() => setFilterStatus("ALL")}
              className={`btn btn-sm ${filterStatus === "ALL" ? "btn-primary" : "btn-secondary"}`}
            >
              All
            </button>
            <button
              onClick={() => setFilterStatus("ACTIVE")}
              className={`btn btn-sm ${filterStatus === "ACTIVE" ? "btn-primary" : "btn-secondary"}`}
            >
              Active
            </button>
            <button
              onClick={() => setFilterStatus("LOCKED")}
              className={`btn btn-sm ${filterStatus === "LOCKED" ? "btn-primary" : "btn-secondary"}`}
            >
              Locked
            </button>
          </div>
        </div>
      </div>

      {/* Staff Table */}
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)", background: "var(--bg-secondary)" }}>
                <th style={{ textAlign: "left", padding: "16px", color: "var(--text-secondary)", fontWeight: "600", fontSize: "13px" }}>
                  Username
                </th>
                <th style={{ textAlign: "left", padding: "16px", color: "var(--text-secondary)", fontWeight: "600", fontSize: "13px" }}>
                  Status
                </th>
                <th style={{ textAlign: "left", padding: "16px", color: "var(--text-secondary)", fontWeight: "600", fontSize: "13px" }}>
                  Failed Logins
                </th>
                <th style={{ textAlign: "left", padding: "16px", color: "var(--text-secondary)", fontWeight: "600", fontSize: "13px" }}>
                  Created
                </th>
                <th style={{ textAlign: "right", padding: "16px", color: "var(--text-secondary)", fontWeight: "600", fontSize: "13px" }}>
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredStaff.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ padding: "40px", textAlign: "center", color: "var(--text-secondary)" }}>
                    {searchTerm || filterStatus !== "ALL" ? "No staff members match your filters" : "No staff members found"}
                  </td>
                </tr>
              ) : (
                filteredStaff.map((staffMember) => {
                  const locked = isLocked(staffMember);
                  return (
                    <tr key={staffMember.id} style={{ borderBottom: "1px solid var(--border)" }}>
                      <td style={{ padding: "16px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                          <div
                            style={{
                              width: "40px",
                              height: "40px",
                              borderRadius: "50%",
                              background: "var(--accent)",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              color: "white",
                              fontWeight: "600",
                              fontSize: "16px",
                            }}
                          >
                            {staffMember.username.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <div style={{ fontWeight: "600", fontSize: "15px" }}>{staffMember.username}</div>
                            <div style={{ fontSize: "12px", color: "var(--text-tertiary)" }}>Staff Member</div>
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: "16px" }}>
                        {locked ? (
                          <span className="badge badge-red">🔒 Locked</span>
                        ) : (
                          <span className="badge badge-green">✓ Active</span>
                        )}
                      </td>
                      <td style={{ padding: "16px" }}>
                        {staffMember.failedLoginAttempts > 0 ? (
                          <span
                            style={{
                              color: staffMember.failedLoginAttempts >= 5 ? "var(--red)" : "var(--accent)",
                              fontWeight: "600",
                            }}
                          >
                            {staffMember.failedLoginAttempts}
                          </span>
                        ) : (
                          <span style={{ color: "var(--text-tertiary)" }}>0</span>
                        )}
                      </td>
                      <td style={{ padding: "16px", color: "var(--text-secondary)", fontSize: "14px" }}>
                        {new Date(staffMember.createdAt).toLocaleDateString()}
                      </td>
                      <td style={{ padding: "16px" }}>
                        <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end", flexWrap: "wrap" }}>
                          {locked && (
                            <button
                              onClick={() => handleUnlockStaff(staffMember.id)}
                              className="btn btn-secondary btn-sm"
                              style={{ color: "var(--green)" }}
                            >
                              🔓 Unlock
                            </button>
                          )}
                          <button onClick={() => openActivityModal(staffMember)} className="btn btn-secondary btn-sm">
                            📊 Activity
                          </button>
                          <button onClick={() => openEditModal(staffMember)} className="btn btn-secondary btn-sm">
                            ✏️ Edit
                          </button>
                          <button
                            onClick={() => handleDeleteStaff(staffMember.id, staffMember.username)}
                            className="btn btn-secondary btn-sm"
                            style={{ color: "var(--red)" }}
                          >
                            🗑️ Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Staff Modal */}
      {showAddModal && (
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
          onClick={() => setShowAddModal(false)}
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
              onClick={() => setShowAddModal(false)}
            >
              ×
            </button>
            <h2 style={{ fontSize: "24px", marginBottom: "24px" }}>Add New Staff Member</h2>
            <form onSubmit={handleAddStaff} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <div className="form-group">
                <label className="form-label">Username</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Enter username"
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label">Password</label>
                <input
                  type="password"
                  className="form-input"
                  placeholder="Enter password (min 6 characters)"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  minLength={6}
                />
              </div>
              <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end", marginTop: "8px" }}>
                <button type="button" onClick={() => setShowAddModal(false)} className="btn btn-secondary">
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Add Staff Member
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Password Modal */}
      {showEditModal && selectedStaff && (
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
          onClick={() => setShowEditModal(false)}
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
              onClick={() => setShowEditModal(false)}
            >
              ×
            </button>
            <h2 style={{ fontSize: "24px", marginBottom: "8px" }}>Update Password</h2>
            <p style={{ color: "var(--text-secondary)", marginBottom: "24px" }}>
              Change password for <strong>{selectedStaff.username}</strong>
            </p>
            <form onSubmit={handleUpdatePassword} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <div className="form-group">
                <label className="form-label">New Password</label>
                <input
                  type="password"
                  className="form-input"
                  placeholder="Enter new password (min 6 characters)"
                  value={editPassword}
                  onChange={(e) => setEditPassword(e.target.value)}
                  required
                  minLength={6}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Confirm Password</label>
                <input
                  type="password"
                  className="form-input"
                  placeholder="Confirm new password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  minLength={6}
                />
              </div>
              <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end", marginTop: "8px" }}>
                <button type="button" onClick={() => setShowEditModal(false)} className="btn btn-secondary">
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Update Password
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Activity Modal */}
      {showActivityModal && selectedStaff && (
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
          onClick={() => setShowActivityModal(false)}
        >
          <div
            className="card"
            style={{ width: "100%", maxWidth: "700px", maxHeight: "80vh", overflow: "hidden", display: "flex", flexDirection: "column", position: "relative" }}
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
                zIndex: 1,
              }}
              onClick={() => setShowActivityModal(false)}
            >
              ×
            </button>
            <h2 style={{ fontSize: "24px", marginBottom: "8px" }}>Staff Activity Log</h2>
            <p style={{ color: "var(--text-secondary)", marginBottom: "24px" }}>
              Recent activity for <strong>{selectedStaff.username}</strong>
            </p>
            <div style={{ flex: 1, overflowY: "auto", padding: "4px" }}>
              {staffActivity.length === 0 ? (
                <div style={{ textAlign: "center", padding: "40px", color: "var(--text-secondary)" }}>
                  <p>No activity recorded yet</p>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                  {staffActivity.map((activity) => (
                    <div
                      key={activity.id}
                      style={{
                        padding: "16px",
                        background: "var(--bg-secondary)",
                        borderRadius: "var(--radius-md)",
                        border: "1px solid var(--border)",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", marginBottom: "8px" }}>
                        <span style={{ fontWeight: "600", color: "var(--accent)" }}>{activity.action}</span>
                        <span style={{ fontSize: "12px", color: "var(--text-tertiary)" }}>
                          {new Date(activity.createdAt).toLocaleString()}
                        </span>
                      </div>
                      <p style={{ fontSize: "14px", color: "var(--text-secondary)", margin: 0 }}>{activity.details}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
