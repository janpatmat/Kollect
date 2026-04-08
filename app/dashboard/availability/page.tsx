"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import axios from "axios";
import { useSession } from "@/context/SessionContext";

interface SteakItem {
  menu_id: number;
  menu_name: string;
  price: number;
  branch_id: number;
  category_id: number;
  category_name: string;
  availability: number | null;
}

const API = "http://localhost:5000";
const authHeader = (token: string | undefined) => ({ Authorization: `Bearer ${token}` });

function AvailabilityBadge({ value }: { value: number | null }) {
  if (value === null)
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] bg-slate-100 text-slate-400">
        <span className="w-1.5 h-1.5 rounded-full bg-slate-300 inline-block" />
        Not set
      </span>
    );
  if (value === 0)
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] bg-red-50 text-red-500 border border-red-100">
        <span className="w-1.5 h-1.5 rounded-full bg-red-400 inline-block" />
        Sold out
      </span>
    );
  if (value <= 3)
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] bg-amber-50 text-amber-600 border border-amber-100">
        <span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block" />
        Low — {value} left
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] bg-emerald-50 text-emerald-600 border border-emerald-100">
      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />
      {value} available
    </span>
  );
}

export default function SteakAvailabilityPage() {
  const router = useRouter();
  const { user, branch } = useSession();

  const [steaks, setSteaks]   = useState<SteakItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [drafts, setDrafts]   = useState<Record<number, string>>({});
  const [saving, setSaving]   = useState<Record<number, boolean>>({});
  const [saved, setSaved]     = useState<Record<number, boolean>>({});
  const [error, setError]     = useState<string | null>(null);

  const fetchSteaks = useCallback(async () => {
    if (!branch || !user) return;
    setLoading(true);
    try {
      const res = await axios.get(`${API}/menu/steaks?branch_id=${branch.branch_id}`, {
        headers: authHeader(user.token),
      });
      const data: SteakItem[] = res.data.data;
      setSteaks(data);
      const initial: Record<number, string> = {};
      data.forEach((s) => { initial[s.menu_id] = s.availability != null ? String(s.availability) : ""; });
      setDrafts(initial);
    } catch (e) {
      console.error("Failed to fetch steaks:", e);
      setError("Could not load steak items. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [branch, user]);

  useEffect(() => { fetchSteaks(); }, [fetchSteaks]);

  const handleSave = async (menuId: number) => {
    if (!user || !branch) return;
    const raw = drafts[menuId]?.trim();
    if (raw === "" || isNaN(Number(raw)) || Number(raw) < 0) {
      setError("Please enter a valid non-negative number.");
      return;
    }
    setError(null);
    setSaving((p) => ({ ...p, [menuId]: true }));
    try {
      await axios.patch(
        `${API}/menu/${menuId}/availability`,
        { availability: parseInt(raw), branch_id: branch.branch_id },
        { headers: authHeader(user.token) }
      );
      setSteaks((prev) => prev.map((s) => s.menu_id === menuId ? { ...s, availability: parseInt(raw) } : s));
      setSaved((p) => ({ ...p, [menuId]: true }));
      setTimeout(() => setSaved((p) => ({ ...p, [menuId]: false })), 2000);
    } catch (e) {
      console.error("Failed to update availability:", e);
      setError("Failed to save. Please try again.");
    } finally {
      setSaving((p) => ({ ...p, [menuId]: false }));
    }
  };

  const quickSet = (menuId: number, value: number) =>
    setDrafts((p) => ({ ...p, [menuId]: String(value) }));

  if (!user || !branch) return null;

  return (
    // h-screen + overflow-hidden on root, overflow-y-auto only on the body — header stays fixed
    <div
      className="h-screen flex flex-col bg-slate-50 text-slate-700 overflow-hidden"
      style={{ fontFamily: "'DM Sans', system-ui, sans-serif" }}
    >
      {/* ── Sticky header ── */}
      <header className="h-[52px] bg-white border-b border-slate-200 flex items-center px-5 gap-3 flex-shrink-0">
        <button
          onClick={() => router.push("/dashboard")}
          className="w-7 h-7 rounded-lg border border-slate-200 flex items-center justify-center text-slate-400 hover:bg-slate-50 transition-colors"
        >
          <svg width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
            <path d="m15 18-6-6 6-6" />
          </svg>
        </button>

        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-orange-100 flex items-center justify-center">
            <svg width="12" height="12" fill="none" stroke="#ea580c" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
              <path d="M18 8h1a4 4 0 0 1 0 8h-1M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8zM6 1v3M10 1v3M14 1v3" />
            </svg>
          </div>
          <h1 className="text-[13px] text-slate-700">Steak Availability</h1>
          <span className="text-slate-300">·</span>
          <span className="text-[11px] text-slate-400">{branch.branch_name}</span>
        </div>

        <button
          onClick={fetchSteaks}
          disabled={loading}
          className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-[11px] text-slate-500 hover:bg-slate-50 disabled:opacity-40 transition"
        >
          <svg width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" className={loading ? "animate-spin" : ""}>
            <path d="M23 4v6h-6M1 20v-6h6" />
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
          </svg>
          Refresh
        </button>
      </header>

      {/* ── Scrollable body ── */}
      <div
        className="flex-1 overflow-y-auto"
        style={{ scrollbarWidth: "thin", scrollbarColor: "#e2e8f0 transparent" }}
      >
        <div className="max-w-2xl mx-auto px-5 py-8">

          {/* Info banner */}
          <div className="flex items-start gap-3 bg-orange-50 border border-orange-100 rounded-xl px-4 py-3 mb-6">
            <svg width="14" height="14" fill="none" stroke="#ea580c" strokeWidth="2" viewBox="0 0 24 24" className="mt-0.5 flex-shrink-0">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <div>
              <p className="text-[12px] text-orange-700 font-medium">Steaks only</p>
              <p className="text-[11px] text-orange-600 mt-0.5">
                Availability applies exclusively to steak items (category: Steak). Items set to{" "}
                <strong>0</strong> will be automatically disabled on the POS and cannot be added to orders.
                All other menu categories are unaffected.
              </p>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-100 rounded-xl px-4 py-3 mb-4">
              <svg width="13" height="13" fill="none" stroke="#ef4444" strokeWidth="2" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <p className="text-[11px] text-red-600">{error}</p>
              <button onClick={() => setError(null)} className="ml-auto text-red-300 hover:text-red-500 transition">
                <svg width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" viewBox="0 0 24 24"><path d="M18 6 6 18M6 6l12 12" /></svg>
              </button>
            </div>
          )}

          {/* Loading */}
          {loading ? (
            <div className="flex items-center justify-center gap-3 py-20 text-slate-400">
              <svg className="animate-spin" width="16" height="16" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8v4a4 4 0 0 0-4 4H4z" />
              </svg>
              <span className="text-[13px]">Loading steak items...</span>
            </div>
          ) : steaks.length === 0 ? (
            <div className="text-center py-20">
              <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-3">
                <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.25" viewBox="0 0 24 24" className="text-slate-300">
                  <path d="M18 8h1a4 4 0 0 1 0 8h-1M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8zM6 1v3M10 1v3M14 1v3" />
                </svg>
              </div>
              <p className="text-[13px] text-slate-400">No steak items found for {branch.branch_name}.</p>
              <p className="text-[11px] text-slate-300 mt-1">Add steak items (category_id = 1) from the menu manager.</p>
            </div>
          ) : (
            <>
              {/* Summary row */}
              <div className="flex items-center gap-4 mb-4">
                <p className="text-[11px] text-slate-400">
                  {steaks.length} steak {steaks.length === 1 ? "item" : "items"} ·{" "}
                  <span className="text-red-500">{steaks.filter((s) => s.availability === 0).length} sold out</span>
                  {" · "}
                  <span className="text-emerald-600">{steaks.filter((s) => s.availability != null && s.availability > 0).length} available</span>
                </p>
              </div>

              {/* Steak cards */}
              <div className="space-y-3 pb-8">
                {steaks.map((steak) => {
                  const draft    = drafts[steak.menu_id] ?? "";
                  const isSaving = saving[steak.menu_id] ?? false;
                  const isSaved  = saved[steak.menu_id] ?? false;
                  const isDirty  = draft !== (steak.availability != null ? String(steak.availability) : "");

                  return (
                    <div
                      key={steak.menu_id}
                      className={`bg-white rounded-xl border transition-all ${
                        steak.availability === 0 ? "border-red-200 shadow-sm shadow-red-50" : "border-slate-200"
                      }`}
                    >
                      <div className="px-5 py-4">
                        <div className="flex items-start justify-between gap-3 mb-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="text-[13px] text-slate-800 font-medium truncate">{steak.menu_name}</p>
                              <AvailabilityBadge value={steak.availability} />
                            </div>
                            <p className="text-[11px] text-slate-400 mt-0.5">
                              PHP {steak.price.toFixed(2)} · ID #{steak.menu_id}
                            </p>
                          </div>
                        </div>

                        {/* Input row */}
                        <div className="flex items-center gap-2">
                          <div className="flex gap-1">
                            {[0, 5, 10, 20].map((v) => (
                              <button
                                key={v}
                                onClick={() => quickSet(steak.menu_id, v)}
                                className={`px-2 py-1 rounded-md text-[10px] border transition-all ${
                                  draft === String(v)
                                    ? "bg-indigo-600 border-indigo-600 text-white"
                                    : "border-slate-200 text-slate-400 hover:border-slate-300 hover:text-slate-600"
                                }`}
                              >
                                {v}
                              </button>
                            ))}
                          </div>

                          <div className="relative flex-1">
                            <input
                              type="number"
                              min="0"
                              step="1"
                              placeholder="Enter count"
                              value={draft}
                              onChange={(e) => setDrafts((p) => ({ ...p, [steak.menu_id]: e.target.value }))}
                              onKeyDown={(e) => { if (e.key === "Enter") handleSave(steak.menu_id); }}
                              className="w-full px-3 py-2 text-[12px] bg-slate-50 border border-slate-200 rounded-lg placeholder-slate-300 text-slate-700 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition"
                            />
                          </div>

                          <button
                            onClick={() => handleSave(steak.menu_id)}
                            disabled={isSaving || !isDirty}
                            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-[12px] transition-all flex-shrink-0 ${
                              isSaved
                                ? "bg-emerald-600 text-white border border-emerald-600"
                                : isDirty
                                ? "bg-indigo-600 text-white hover:bg-indigo-700 border border-indigo-600"
                                : "bg-slate-50 text-slate-300 border border-slate-200 cursor-not-allowed"
                            }`}
                          >
                            {isSaving ? (
                              <>
                                <svg className="animate-spin" width="11" height="11" fill="none" viewBox="0 0 24 24">
                                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8v4a4 4 0 0 0-4 4H4z" />
                                </svg>
                                Saving
                              </>
                            ) : isSaved ? (
                              <>
                                <svg width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" viewBox="0 0 24 24">
                                  <path d="M20 6 9 17l-5-5" />
                                </svg>
                                Saved
                              </>
                            ) : (
                              "Save"
                            )}
                          </button>
                        </div>

                        {draft === "0" && isDirty && (
                          <p className="text-[10px] text-red-500 mt-2">
                            ⚠ Setting to 0 will disable this steak on the POS — customers cannot order it.
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}