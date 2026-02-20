"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import axios from "axios";
import { useSession } from "@/context/SessionContext";

interface SaleRecord {
  order_id:             number;
  order_payment_method: string;
  order_datetime:       string;
  status:               string;
  total_bill:           number;
  total_discount:       number;
  osNum:                number | null;
  cashier_name:         string | null;
}

const API = "http://localhost:5000";

const PAYMENT_METHODS = ["All", "Cash", "Credit / Debit", "E-Wallet"];
const ORDER_STATUSES  = ["All", "Dine In", "Take Out", "Foodpanda", "Grab"];

export default function SalesPage() {
  const { branch, hydrated } = useSession();
  const router = useRouter();

  const [sales,         setSales]         = useState<SaleRecord[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [filterPayment, setFilterPayment] = useState("All");
  const [filterStatus,  setFilterStatus]  = useState("All");

  useEffect(() => {
    if (!hydrated) return;
    if (!branch) { router.replace("/branchchoice"); return; }

    (async () => {
      try {
        const res = await axios.get(`${API}/orders/sales/daily?branch_id=${branch.branch_id}`);
        setSales(res.data.data);
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    })();
  }, [hydrated, branch]);

  // ── All hooks must be called before any early return ─────────────────────
  const filtered = useMemo(() => {
    return sales.filter((s) => {
      const matchPayment = filterPayment === "All" || s.order_payment_method === filterPayment;
      const matchStatus  = filterStatus  === "All" || s.status === filterStatus;
      return matchPayment && matchStatus;
    });
  }, [sales, filterPayment, filterStatus]);

  const totalRevenue  = filtered.reduce((s, r) => s + Number(r.total_bill), 0);
  const totalDiscount = filtered.reduce((s, r) => s + Number(r.total_discount), 0);
  const netRevenue    = totalRevenue - totalDiscount;

  // ── Early return AFTER all hooks ──────────────────────────────────────────
  if (!hydrated) return (
    <div className="flex items-center justify-center h-screen bg-slate-50 gap-3 text-slate-400" style={{ fontFamily: "'DM Sans', system-ui, sans-serif" }}>
      <svg className="animate-spin" width="18" height="18" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8v4a4 4 0 0 0-4 4H4z"/></svg>
      <span className="text-[13px]">Loading session...</span>
    </div>
  );

  const dateStr = new Date().toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" });

  const statusColors: Record<string, string> = {
    "Dine In":   "text-indigo-600 bg-indigo-50 border-indigo-100",
    "Take Out":  "text-emerald-600 bg-emerald-50 border-emerald-100",
    "Cancelled": "text-red-500 bg-red-50 border-red-100",
    "Foodpanda": "text-pink-600 bg-pink-50 border-pink-100",
    "Grab":      "text-green-600 bg-green-50 border-green-100",
  };

  const paymentIcon: Record<string, string> = {
    "Cash":           "M17 9V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2m2 4h10a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2H9a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2zm7-5a2 2 0 1 1-4 0 2 2 0 0 1 4 0z",
    "Credit / Debit": "M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 0 0 3-3V8a3 3 0 0 0-3-3H6a3 3 0 0 0-3 3v8a3 3 0 0 0 3 3z",
    "E-Wallet":       "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z",
  };

  return (
    <div className="flex flex-col h-screen bg-slate-50 overflow-hidden" style={{ fontFamily: "'DM Sans', system-ui, sans-serif" }}>

      {/* Topbar */}
      <header className="h-[52px] bg-white border-b border-slate-200 flex items-center px-6 gap-4 flex-shrink-0">
        <button onClick={() => router.push("/dashboard")} className="w-7 h-7 rounded-lg border border-slate-200 flex items-center justify-center text-slate-400 hover:bg-slate-50 transition-colors">
          <svg width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path d="m15 18-6-6 6-6"/></svg>
        </button>
        <p className="text-[13px] text-slate-700">Daily Sales</p>
        <p className="text-[11px] text-slate-400 ml-2">{dateStr}</p>
        <div className="ml-auto flex items-center gap-2">
          {branch && (
            <div className="flex items-center gap-1.5 bg-slate-100 px-2.5 py-1 rounded-full">
              <svg width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" className="text-slate-400"><path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/></svg>
              <span className="text-[11px] text-slate-600">{branch.branch_name}</span>
            </div>
          )}
          <span className="text-[11px] text-slate-400 bg-slate-100 px-2.5 py-1 rounded-full">
            {filtered.length} transaction{filtered.length !== 1 ? "s" : ""}
          </span>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-6 space-y-5" style={{ scrollbarWidth: "thin", scrollbarColor: "#e2e8f0 transparent" }}>

        {/* Summary cards */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Gross Sales",     value: `PHP ${totalRevenue.toFixed(2)}`,    color: "text-slate-800"  },
            { label: "Total Discounts", value: `− PHP ${totalDiscount.toFixed(2)}`, color: "text-red-500"    },
            { label: "Net Sales",       value: `PHP ${netRevenue.toFixed(2)}`,      color: "text-indigo-600" },
          ].map((c) => (
            <div key={c.label} className="bg-white border border-slate-200 rounded-xl px-5 py-4">
              <p className="text-[11px] text-slate-400 mb-1">{c.label}</p>
              <p className={`text-[20px] font-medium ${c.color}`}>{c.value}</p>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="flex gap-4 flex-wrap">
          <div>
            <p className="text-[10px] text-slate-400 uppercase tracking-widest mb-1.5">Payment Method</p>
            <div className="flex gap-1.5">
              {PAYMENT_METHODS.map((m) => (
                <button key={m} onClick={() => setFilterPayment(m)}
                  className={`text-[12px] px-3 py-1.5 rounded-lg border transition-all ${filterPayment === m ? "bg-indigo-600 border-indigo-600 text-white" : "bg-white border-slate-200 text-slate-500 hover:border-slate-300"}`}>
                  {m}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="text-[10px] text-slate-400 uppercase tracking-widest mb-1.5">Order Status</p>
            <div className="flex gap-1.5">
              {ORDER_STATUSES.map((s) => (
                <button key={s} onClick={() => setFilterStatus(s)}
                  className={`text-[12px] px-3 py-1.5 rounded-lg border transition-all ${filterStatus === s ? "bg-indigo-600 border-indigo-600 text-white" : "bg-white border-slate-200 text-slate-500 hover:border-slate-300"}`}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100">
            <p className="text-[11px] text-slate-400">Showing {filtered.length} of {sales.length} transactions</p>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-16 gap-3 text-slate-400">
              <svg className="animate-spin" width="18" height="18" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8v4a4 4 0 0 0-4 4H4z"/></svg>
              <span className="text-[13px]">Loading sales...</span>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-slate-300">
              <svg width="32" height="32" fill="none" stroke="currentColor" strokeWidth="1.25" viewBox="0 0 24 24"><path d="M9 14l6-6M9 14H4M9 14v5M20 10h-5M20 10V5M20 10l-6 6"/></svg>
              <p className="text-[13px] text-slate-400">No transactions match your filters</p>
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-100">
                  {["Order", "Time", "Cashier", "Status", "Payment", "Bill", "Discount", "Net"].map((h) => (
                    <th key={h} className="text-left text-[10px] text-slate-400 font-normal uppercase tracking-widest px-5 py-3">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((sale) => {
                  const timeStr = new Date(sale.order_datetime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
                  const net = Number(sale.total_bill) - Number(sale.total_discount);
                  return (
                    <tr key={sale.order_id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-5 py-3.5">
                        <p className="text-[13px] text-slate-700">#{sale.order_id}</p>
                        {sale.osNum && <p className="text-[10px] text-slate-400">OS #{sale.osNum}</p>}
                      </td>
                      <td className="px-5 py-3.5 text-[12px] text-slate-500">{timeStr}</td>
                      <td className="px-5 py-3.5 text-[12px] text-slate-600">{sale.cashier_name ?? "—"}</td>
                      <td className="px-5 py-3.5">
                        <span className={`text-[11px] border px-2.5 py-1 rounded-full ${statusColors[sale.status] ?? "text-slate-500 bg-slate-50 border-slate-100"}`}>
                          {sale.status}
                        </span>
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-1.5 text-[12px] text-slate-600">
                          <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                            <path d={paymentIcon[sale.order_payment_method] ?? "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z"}/>
                          </svg>
                          {sale.order_payment_method}
                        </div>
                      </td>
                      <td className="px-5 py-3.5 text-[13px] text-slate-700">PHP {Number(sale.total_bill).toFixed(2)}</td>
                      <td className="px-5 py-3.5 text-[12px] text-red-500">
                        {Number(sale.total_discount) > 0 ? `− PHP ${Number(sale.total_discount).toFixed(2)}` : "—"}
                      </td>
                      <td className="px-5 py-3.5 text-[13px] text-slate-800 font-medium">PHP {net.toFixed(2)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}