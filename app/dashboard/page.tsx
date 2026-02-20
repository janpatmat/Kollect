"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import axios from "axios";
import OrderCard from "../components/ordercard";
import { useSession } from "@/context/SessionContext";

// ── served: boolean added to match OrderCard's expected interface ─────────────
interface OrderItem { order_item_id: number; menu_name: string; quantity: number; price_at_time: number; served: boolean; }
interface Order { order_id: number; order_payment_method: string; order_datetime: string; status: string; total_bill: number; items: OrderItem[]; }
interface DailyStats { dine_in: string; take_out: string; cancelled: string; }

const API = "http://localhost:5000";

export default function Dashboard() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [stats, setStats] = useState<DailyStats>({ dine_in: "0", take_out: "0", cancelled: "0" });
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const { user, branch, hydrated } = useSession();

  const fetchAll = async () => {
    if (!branch) return;
    try {
      const [ordersRes, statsRes] = await Promise.all([
        axios.get(`${API}/orders/unpaid?branch_id=${branch.branch_id}`),
        axios.get(`${API}/orders/stats/daily?branch_id=${branch.branch_id}`),
      ]);
      setOrders(ordersRes.data.data);
      setStats(statsRes.data.data);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    if (!hydrated) return;
    if (!branch) {
      router.replace("/branchchoice");
      return;
    }
    fetchAll();
    const interval = setInterval(fetchAll, 15000);
    return () => clearInterval(interval);
  }, [hydrated, branch]);

  if (!hydrated) return (
    <div className="flex items-center justify-center h-screen bg-slate-50 gap-3 text-slate-400" style={{ fontFamily: "'DM Sans', system-ui, sans-serif" }}>
      <svg className="animate-spin" width="18" height="18" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8v4a4 4 0 0 0-4 4H4z"/></svg>
      <span className="text-[13px]">Loading session...</span>
    </div>
  );

  const dateStr = new Date().toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" });

  const statCards = [
    {
      label: "Dine In",
      value: stats.dine_in,
      color: "text-indigo-600",
      bg: "bg-indigo-50",
      border: "border-indigo-100",
      icon: "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 0 0 1 1h3m10-11 2 2m-2-2v10a1 1 0 0 1-1 1h-3m-6 0a1 1 0 0 0 1-1v-4a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v4a1 1 0 0 0 1 1m-6 0h6",
    },
    {
      label: "Take Out",
      value: stats.take_out,
      color: "text-emerald-600",
      bg: "bg-emerald-50",
      border: "border-emerald-100",
      icon: "M16 11V7a4 4 0 0 0-8 0v4M5 9h14l1 12H4L5 9z",
    },
    {
      label: "Cancelled",
      value: stats.cancelled,
      color: "text-red-500",
      bg: "bg-red-50",
      border: "border-red-100",
      icon: "M18.364 18.364A9 9 0 0 0 5.636 5.636m12.728 12.728A9 9 0 0 1 5.636 5.636m12.728 12.728L5.636 5.636",
    },
  ];

  return (
    <div className="flex flex-col h-screen bg-slate-50 overflow-hidden" style={{ fontFamily: "'DM Sans', system-ui, sans-serif" }}>

      {/* Topbar */}
      <header className="h-[52px] bg-white border-b border-slate-200 flex items-center px-6 gap-4 flex-shrink-0">
        <p className="text-[13px] text-slate-700">Dashboard</p>
        <p className="text-[11px] text-slate-400 ml-2">{dateStr}</p>
        {branch && (
          <div className="flex items-center gap-1.5 bg-slate-100 px-2.5 py-1 rounded-full">
            <svg width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" className="text-slate-400"><path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/></svg>
            <span className="text-[11px] text-slate-600">{branch.branch_name}</span>
            {user && <><span className="text-slate-300">·</span><span className="text-[11px] text-slate-400">{user.full_name}</span></>}
          </div>
        )}
        <div className="ml-auto flex items-center gap-2">
          <button onClick={() => router.push("/dashboard/sales")}
            className="text-[12px] text-slate-500 border border-slate-200 px-3 py-1.5 rounded-lg hover:bg-slate-50 transition-colors">
            View Sales
          </button>
          <button onClick={() => router.push("/dashboard/pos")}
            className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-[12px] px-3.5 py-1.5 rounded-lg transition-colors">
            <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>
            New Order
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-6 space-y-6" style={{ scrollbarWidth: "thin", scrollbarColor: "#e2e8f0 transparent" }}>

        {/* Daily stats */}
        <div className="grid grid-cols-3 gap-3">
          {statCards.map((s) => (
            <div key={s.label} className={`bg-white border ${s.border} rounded-xl px-5 py-4 flex items-center gap-4`}>
              <div className={`w-9 h-9 rounded-xl ${s.bg} flex items-center justify-center flex-shrink-0`}>
                <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" className={s.color}>
                  <path d={s.icon}/>
                </svg>
              </div>
              <div>
                <p className="text-[11px] text-slate-400">{s.label} · Today</p>
                <p className={`text-[22px] font-medium ${s.color} leading-tight`}>{s.value}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Order queue */}
        {loading ? (
          <div className="flex items-center justify-center py-20 gap-3 text-slate-400">
            <svg className="animate-spin" width="18" height="18" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8v4a4 4 0 0 0-4 4H4z"/></svg>
            <span className="text-[13px]">Loading orders...</span>
          </div>
        ) : orders.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-slate-300">
            <svg width="36" height="36" fill="none" stroke="currentColor" strokeWidth="1.25" viewBox="0 0 24 24"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>
            <p className="text-[14px] text-slate-400">No unpaid orders</p>
            <p className="text-[12px] text-slate-300">New orders will appear here automatically</p>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <p className="text-[11px] text-slate-400 uppercase tracking-widest">Active Orders</p>
              <span className="text-[11px] text-amber-600 bg-amber-50 border border-amber-100 px-2.5 py-1 rounded-full">{orders.length} unpaid</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {orders.map((order) => (
                <OrderCard key={order.order_id} order={order} />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}