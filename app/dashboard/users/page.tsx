"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getUserRole } from "../../../lib/auth";

interface User {
  id: number;
  full_name: string;
  email: string;
  role: string;
  created_at: string;
}

export default function UsersPage() {
  const router = useRouter();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    full_name: "",
    email: "",
    password: "",
    role: "cashier",
  });
const API = "http://localhost:5000";
  // Admin guard
  useEffect(() => {
    if (getUserRole() !== "admin") {
      router.replace("/dashboard");
    }
  }, [router]);

  // Fetch users
  const fetchUsers = async () => {
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API}/users`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) setUsers(data.data);
    } catch {
      setError("Failed to load users.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    setSuccess("");

    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API}/users`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(form),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.message || "Failed to create user.");
      } else {
        setSuccess(`User "${data.data.full_name}" created successfully!`);
        setForm({ full_name: "", email: "", password: "", role: "cashier" });
        setShowForm(false);
        fetchUsers();
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: number, name: string) => {
    if (!confirm(`Delete user "${name}"? This cannot be undone.`)) return;

    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API}/users/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) {
        setSuccess("User deleted.");
        fetchUsers();
      } else {
        setError(data.message || "Failed to delete user.");
      }
    } catch {
      setError("Something went wrong.");
    }
  };

  return (
    <div
      className="flex-1 bg-slate-950 min-h-screen p-6"
      style={{ fontFamily: "'DM Sans', system-ui, sans-serif" }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-white text-lg font-semibold">User Management</h1>
          <p className="text-slate-500 text-xs mt-0.5">Manage staff accounts</p>
        </div>
        <button
          onClick={() => { setShowForm((v) => !v); setError(""); setSuccess(""); }}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs px-4 py-2.5 rounded-lg transition-all"
        >
          <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
            <path d="M12 5v14M5 12h14" strokeLinecap="round"/>
          </svg>
          {showForm ? "Cancel" : "Add User"}
        </button>
      </div>

      {/* Feedback banners */}
      {error && (
        <div className="mb-4 px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
          {error}
        </div>
      )}
      {success && (
        <div className="mb-4 px-4 py-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs">
          {success}
        </div>
      )}

      {/* Add User Form */}
      {showForm && (
        <div className="mb-6 bg-slate-900 border border-slate-800 rounded-xl p-5">
          <h2 className="text-white text-sm font-medium mb-4">New User</h2>
          <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Full Name */}
            <div className="flex flex-col gap-1.5">
              <label className="text-slate-400 text-[11px] uppercase tracking-wider">Full Name</label>
              <input
                name="full_name"
                value={form.full_name}
                onChange={handleChange}
                required
                placeholder="e.g. Jane Doe"
                className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-white text-xs placeholder-slate-600 focus:outline-none focus:border-indigo-500 transition-colors"
              />
            </div>

            {/* Email */}
            <div className="flex flex-col gap-1.5">
              <label className="text-slate-400 text-[11px] uppercase tracking-wider">Email</label>
              <input
                name="email"
                type="email"
                value={form.email}
                onChange={handleChange}
                required
                placeholder="e.g. jane@example.com"
                className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-white text-xs placeholder-slate-600 focus:outline-none focus:border-indigo-500 transition-colors"
              />
            </div>

            {/* Password */}
            <div className="flex flex-col gap-1.5">
              <label className="text-slate-400 text-[11px] uppercase tracking-wider">Password</label>
              <input
                name="password"
                type="password"
                value={form.password}
                onChange={handleChange}
                required
                minLength={6}
                placeholder="Min. 6 characters"
                className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-white text-xs placeholder-slate-600 focus:outline-none focus:border-indigo-500 transition-colors"
              />
            </div>

            {/* Role */}
            <div className="flex flex-col gap-1.5">
              <label className="text-slate-400 text-[11px] uppercase tracking-wider">Role</label>
              <select
                name="role"
                value={form.role}
                onChange={handleChange}
                className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-white text-xs focus:outline-none focus:border-indigo-500 transition-colors"
              >
                <option value="cashier">Cashier</option>
                <option value="admin">Admin</option>
              </select>
            </div>

            {/* Submit */}
            <div className="md:col-span-2 flex justify-end">
              <button
                type="submit"
                disabled={submitting}
                className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs px-6 py-2.5 rounded-lg transition-all"
              >
                {submitting ? "Creating..." : "Create User"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Users Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-800">
          <p className="text-slate-400 text-xs">{users.length} user{users.length !== 1 ? "s" : ""}</p>
        </div>

        {loading ? (
          <div className="px-5 py-10 text-center text-slate-600 text-xs">Loading...</div>
        ) : users.length === 0 ? (
          <div className="px-5 py-10 text-center text-slate-600 text-xs">No users found.</div>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-800">
                <th className="text-left text-slate-500 uppercase tracking-wider px-5 py-3 font-medium">Name</th>
                <th className="text-left text-slate-500 uppercase tracking-wider px-5 py-3 font-medium">Email</th>
                <th className="text-left text-slate-500 uppercase tracking-wider px-5 py-3 font-medium">Role</th>
                <th className="text-left text-slate-500 uppercase tracking-wider px-5 py-3 font-medium">Joined</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id} className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors">
                  <td className="px-5 py-3 text-white font-medium">{user.full_name}</td>
                  <td className="px-5 py-3 text-slate-400">{user.email}</td>
                  <td className="px-5 py-3">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${
                        user.role === "admin"
                          ? "bg-indigo-500/15 text-indigo-400"
                          : "bg-slate-700 text-slate-400"
                      }`}
                    >
                      {user.role}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-slate-500">
                    {new Date(user.created_at).toLocaleDateString("en-US", {
                      month: "short", day: "numeric", year: "numeric",
                    })}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <button
                      onClick={() => handleDelete(user.id, user.full_name)}
                      className="text-slate-600 hover:text-red-400 transition-colors"
                      title="Delete user"
                    >
                      <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                        <polyline points="3 6 5 6 21 6"/>
                        <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                        <path d="M10 11v6M14 11v6"/>
                        <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                      </svg>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}