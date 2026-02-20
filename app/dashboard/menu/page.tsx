"use client";

import { useState, useEffect } from "react";
import axios from "axios";
import { useSession } from "@/context/SessionContext";
import { useRouter } from "next/navigation";

interface MenuItem {
  menu_id:       number;
  menu_name:     string;
  category_name: string;
  price:         number;
}

interface Category {
  id:            number;
  category_name: string;
}

interface MenuForm {
  menu_name:   string;
  category_id: string;
  price:        string;
}

const API = "http://localhost:5000";

export default function MenuPage() {
  const { user, branch, hydrated } = useSession();
  const router = useRouter();

  const [menuItems,  setMenuItems]  = useState<MenuItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [showForm,   setShowForm]   = useState(false);
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState<string | null>(null);
  const [search,     setSearch]     = useState("");
  const [form,       setForm]       = useState<MenuForm>({
    menu_name: "", category_id: "", price: "",
  });

  // ── Fetch menu scoped to current branch ──────────────────────────────────
  const fetchMenu = async () => {
    if (!branch) return;
    try {
      const [menuRes, catRes] = await Promise.all([
        axios.get(`${API}/menu?branch_id=${branch.branch_id}`),
        axios.get(`${API}/categories`),
      ]);
      setMenuItems(menuRes.data.data);
      setCategories(catRes.data.data);
    } catch (err) {
      console.error("Failed to fetch menu items", err);
    }
  };

  useEffect(() => {
    if (!hydrated) return;
    if (!branch) { router.replace("/branchchoice"); return; }
    fetchMenu();
  }, [hydrated, branch]);

  if (!hydrated) return (
    <div className="flex items-center justify-center h-screen bg-slate-50 gap-3 text-slate-400" style={{ fontFamily: "'DM Sans', system-ui, sans-serif" }}>
      <svg className="animate-spin" width="18" height="18" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8v4a4 4 0 0 0-4 4H4z"/></svg>
      <span className="text-[13px]">Loading session...</span>
    </div>
  );

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (!user) throw new Error("Not authenticated");
      if (!branch) throw new Error("No branch selected");
      await axios.post(
        `${API}/menu`,
        {
          menu_name:   form.menu_name,
          category_id: Number(form.category_id),
          price:       Number(form.price),
          branch_id:   branch.branch_id,   // ✅ required by backend
        },
        {
          headers: {
            Authorization: `Bearer ${user.token}`,  // ✅ fixed template literal
            "Content-Type": "application/json",
          },
        }
      );
      setForm({ menu_name: "", category_id: "", price: "" });
      setShowForm(false);
      await fetchMenu();
    } catch (err: any) {
      setError(err.response?.data?.error || "Failed to add menu item (admin only)");
    } finally {
      setLoading(false);
    }
  };

  const filtered = menuItems.filter((item) =>
    item.menu_name.toLowerCase().includes(search.toLowerCase()) ||
    item.category_name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex flex-col h-screen bg-slate-50 overflow-hidden" style={{ fontFamily: "'DM Sans', system-ui, sans-serif" }}>

      {/* ── TOPBAR ── */}
      <header className="h-[52px] bg-white border-b border-slate-200 flex items-center px-6 gap-4 flex-shrink-0">
        <p className="text-[13px] text-slate-700">Menu Management</p>

        <div className="relative flex-1 max-w-[260px] ml-4">
          <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
          </svg>
          <input type="text" placeholder="Search items..." value={search} onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-[13px] bg-slate-50 border border-slate-200 rounded-lg placeholder-slate-400 text-slate-700 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition"/>
        </div>

        <div className="ml-auto flex items-center gap-2">
          {branch && (
            <div className="flex items-center gap-1.5 bg-slate-100 px-2.5 py-1 rounded-full">
              <svg width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" className="text-slate-400"><path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/></svg>
              <span className="text-[11px] text-slate-600">{branch.branch_name}</span>
            </div>
          )}
          <span className="text-[11px] text-slate-400 bg-slate-100 px-2.5 py-1 rounded-full">{menuItems.length} items</span>
          {user?.role === "admin" && (
            <button onClick={() => { setShowForm(true); setError(null); }}
              className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-[12px] px-3.5 py-1.5 rounded-lg transition-colors">
              <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>
              Add Item
            </button>
          )}
        </div>
      </header>

      {/* ── CONTENT ── */}
      <div className="flex-1 overflow-y-auto p-6" style={{ scrollbarWidth: "thin", scrollbarColor: "#e2e8f0 transparent" }}>

        {/* Stats row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          {[
            { label: "Total Items", value: menuItems.length, icon: "M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2" },
            { label: "Categories",  value: [...new Set(menuItems.map((i) => i.category_name))].length, icon: "M4 6h16M4 12h16M4 18h16" },
          ].map((stat) => (
            <div key={stat.label} className="bg-white border border-slate-200 rounded-xl px-4 py-3.5 flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center flex-shrink-0">
                <svg width="14" height="14" fill="none" stroke="#6366f1" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d={stat.icon}/></svg>
              </div>
              <div>
                <p className="text-[11px] text-slate-400">{stat.label}</p>
                <p className="text-[14px] text-slate-800 font-medium">{stat.value}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Table */}
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-100">
            <p className="text-[12px] text-slate-500">
              {filtered.length === menuItems.length ? `${menuItems.length} items` : `${filtered.length} of ${menuItems.length} items`}
            </p>
          </div>

          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-300 gap-3">
              <svg width="32" height="32" fill="none" stroke="currentColor" strokeWidth="1.25" viewBox="0 0 24 24"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2"/></svg>
              <p className="text-[13px] text-slate-400">No items found</p>
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="text-left text-[11px] text-slate-400 font-normal uppercase tracking-widest px-5 py-3">Name</th>
                  <th className="text-left text-[11px] text-slate-400 font-normal uppercase tracking-widest px-5 py-3">Category</th>
                  <th className="text-right text-[11px] text-slate-400 font-normal uppercase tracking-widest px-5 py-3">Price</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((item) => (
                  <tr key={item.menu_id} className="hover:bg-slate-50 transition-colors group">
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="w-7 h-7 rounded-lg bg-slate-100 group-hover:bg-indigo-50 flex items-center justify-center transition-colors flex-shrink-0">
                          <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" className="text-slate-400 group-hover:text-indigo-500 transition-colors">
                            <path d="M18 8h1a4 4 0 0 1 0 8h-1M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8zM6 1v3M10 1v3M14 1v3"/>
                          </svg>
                        </div>
                        <span className="text-[13px] text-slate-700">{item.menu_name}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="text-[11px] text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-full">{item.category_name}</span>
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <span className="text-[13px] text-slate-700">PHP {item.price.toFixed(2)}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* ── ADD ITEM MODAL ── */}
      {showForm && (
        <div className="fixed inset-0 bg-slate-900/30 backdrop-blur-sm flex items-center justify-center z-50" onClick={() => setShowForm(false)}>
          <div className="bg-white rounded-2xl shadow-2xl shadow-slate-900/15 w-[360px] p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="text-[14px] text-slate-800">Add Menu Item</h3>
                <p className="text-[11px] text-slate-400 mt-0.5">Fill in the details below</p>
              </div>
              <button onClick={() => setShowForm(false)} className="w-7 h-7 rounded-lg border border-slate-200 flex items-center justify-center text-slate-400 hover:bg-slate-50 transition-colors">
                <svg width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" viewBox="0 0 24 24"><path d="M18 6 6 18M6 6l12 12"/></svg>
              </button>
            </div>

            {error && (
              <div className="flex items-center gap-2 bg-red-50 border border-red-100 text-red-600 rounded-lg px-3 py-2.5 mb-4 text-[12px]">
                <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-[11px] text-slate-500 uppercase tracking-widest mb-1.5">Item Name</label>
                <input type="text" name="menu_name" value={form.menu_name} onChange={handleChange} placeholder="e.g. Ribeye Steak"
                  className="w-full px-3.5 py-2.5 text-[13px] bg-slate-50 border border-slate-200 rounded-xl placeholder-slate-300 text-slate-700 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition" required/>
              </div>

              <div>
                <label className="block text-[11px] text-slate-500 uppercase tracking-widest mb-1.5">Category</label>
                <select name="category_id" value={form.category_id} onChange={handleChange}
                  className="w-full px-3.5 py-2.5 text-[13px] bg-slate-50 border border-slate-200 rounded-xl text-slate-700 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition appearance-none" required>
                  <option value="">Select a category</option>
                  {categories.map((cat) => (
                    <option key={cat.id} value={cat.id}>{cat.category_name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] text-slate-500 uppercase tracking-widest mb-1.5">Price (PHP)</label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[12px] text-slate-400">₱</span>
                  <input type="number" name="price" step="0.01" value={form.price} onChange={handleChange} placeholder="0.00"
                    className="w-full pl-8 pr-3.5 py-2.5 text-[13px] bg-slate-50 border border-slate-200 rounded-xl placeholder-slate-300 text-slate-700 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition" required/>
                </div>
              </div>

              <div className="flex gap-2.5 pt-1">
                <button type="button" onClick={() => setShowForm(false)}
                  className="flex-1 py-2.5 rounded-xl border border-slate-200 text-[12px] text-slate-500 hover:bg-slate-50 transition">Cancel</button>
                <button type="submit" disabled={loading}
                  className="flex-[2] py-2.5 rounded-xl bg-indigo-600 text-white text-[13px] hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition flex items-center justify-center gap-2">
                  {loading ? (<><svg className="animate-spin" width="13" height="13" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8v4a4 4 0 0 0-4 4H4z"/></svg>Saving...</>) : "Save Item"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}