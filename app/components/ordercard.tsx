"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

interface OrderItem { order_item_id: number; menu_name: string; quantity: number; price_at_time: number; served: boolean; }
interface Order { order_id: number; order_payment_method: string; order_datetime: string; status: string; total_bill: number; items: OrderItem[]; }

export default function OrderCard({ order }: { order: Order }) {
  const router = useRouter();

  // ── Read table number from localStorage (Dine In only) ───────────────────
  const [tableNumber, setTableNumber] = useState<string | null>(null);
  useEffect(() => {
    const saved = localStorage.getItem(`table:${order.order_id}`);
    setTableNumber(saved);
  }, [order.order_id]);

  const total = order.items.reduce((s, i) => s + Number(i.price_at_time) * i.quantity, 0);
  const timeStr = new Date(order.order_datetime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const dateStr = new Date(order.order_datetime).toLocaleDateString([], { month: "short", day: "numeric" });

  const statusStyle: Record<string, string> = {
    "Dine In":  "text-indigo-600 bg-indigo-50 border-indigo-100",
    "Take Out": "text-emerald-600 bg-emerald-50 border-emerald-100",
  };

  // ── Served color logic ────────────────────────────────────────────────────
  const totalItems  = order.items.length;
  const servedCount = order.items.filter((i) => i.served).length;

  const cardBg =
    totalItems > 0 && servedCount === totalItems
      ? "bg-emerald-50 border-emerald-200 hover:border-emerald-300 hover:shadow-emerald-100/50"
      : servedCount > 0
      ? "bg-amber-50 border-amber-200 hover:border-amber-300 hover:shadow-amber-100/50"
      : "bg-white border-slate-200 hover:border-indigo-300 hover:shadow-indigo-100/50";

  return (
    <button
      onClick={() => router.push(`/dashboard/pos?order_id=${order.order_id}`)}
      className={`w-full text-left rounded-xl p-4 hover:shadow-md transition-all duration-150 active:scale-[0.98] group border ${cardBg}`}
      style={{ fontFamily: "'DM Sans', system-ui, sans-serif" }}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-[13px] text-slate-800 font-medium">Order #{order.order_id}</span>
            <span className={`text-[10px] border px-2 py-0.5 rounded-full ${statusStyle[order.status] ?? "text-slate-500 bg-slate-50 border-slate-100"}`}>
              {order.status}
            </span>
          </div>
          <p className="text-[11px] text-slate-400">{dateStr} · {timeStr}</p>
        </div>

        <div className="flex flex-col items-end gap-1.5">
          {/* Table number badge — only shown for Dine In with a saved table */}
          {order.status === "Dine In" && tableNumber && (
            <div className="flex items-center gap-1 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded-full">
              <svg width="9" height="9" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24" className="text-indigo-400">
                <path d="M3 10h18M3 14h18M10 4v16M14 4v16"/>
              </svg>
              <span className="text-[10px] text-indigo-600">Table {tableNumber}</span>
            </div>
          )}
          <div className="w-7 h-7 rounded-lg border border-slate-100 group-hover:border-indigo-200 group-hover:bg-indigo-50 flex items-center justify-center transition-colors">
            <svg width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" className="text-slate-300 group-hover:text-indigo-500 transition-colors">
              <path d="m9 18 6-6-6-6"/>
            </svg>
          </div>
        </div>
      </div>

      {/* Items */}
      <div className="space-y-1 mb-3">
        {order.items.slice(0, 3).map((item) => (
          <div key={item.order_item_id} className="flex items-center justify-between">
            <span className={`text-[12px] truncate max-w-[160px] ${item.served ? "text-slate-400 line-through" : "text-slate-600"}`}>
              {item.menu_name}
            </span>
            <span className="text-[11px] text-slate-400 flex-shrink-0">×{item.quantity}</span>
          </div>
        ))}
        {order.items.length > 3 && (
          <p className="text-[11px] text-slate-400">+{order.items.length - 3} more item{order.items.length - 3 > 1 ? "s" : ""}</p>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between pt-3 border-t border-slate-100">
        <span className="text-[11px] text-slate-400">{servedCount}/{totalItems} served</span>
        <span className="text-[13px] text-slate-800 font-medium">PHP {total.toFixed(2)}</span>
      </div>
    </button>
  );
}