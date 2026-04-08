"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import axios from "axios";
import * as XLSX from "xlsx";
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
  category:             "official" | "others" | null;
  pax:                  number | null;
}

interface ActivityLog {
  id:       number;
  action:   string;
  date:     string;
  order_id: number;
}

const API = "http://localhost:5000";

const PAYMENT_METHODS  = ["All", "Cash", "Credit / Debit", "E-Wallet", "Bank Transfer"];
const ORDER_STATUSES   = ["All", "Dine In", "Take Out", "Grab"];
const ORDER_CATEGORIES = ["All", "official", "others"];

const OS_PASSWORD = "orchange321";

// ── Print helper (unchanged) ──────────────────────────────────────────────────
function printSales(params: {
  filtered:       SaleRecord[];
  totalRevenue:   number;
  totalDiscount:  number;
  netRevenue:     number;
  totalPaxDay:    number;
  branchName:     string;
  dateStr:        string;
  filterPayment:  string;
  filterStatus:   string;
  filterCategory: string;
}) {
  const {
    filtered, totalRevenue, totalDiscount, netRevenue,
    totalPaxDay, branchName, dateStr,
    filterPayment, filterStatus, filterCategory,
  } = params;

  const activeFilters = [
    filterPayment  !== "All" && `Payment: ${filterPayment}`,
    filterStatus   !== "All" && `Status: ${filterStatus}`,
    filterCategory !== "All" && `Category: ${filterCategory}`,
  ].filter(Boolean);

  const rows = filtered.map((sale) => {
    const time = new Date(sale.order_datetime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const net  = Number(sale.total_bill) - Number(sale.total_discount);
    const hasDiscount = Number(sale.total_discount) > 0;
    return `
      <tr>
        <td>
          <span class="order-id">#${sale.order_id}</span>
          ${sale.osNum ? `<span class="sub">OS #${sale.osNum}</span>` : ""}
        </td>
        <td>${time}</td>
        <td>${sale.cashier_name ?? "—"}</td>
        <td><span class="badge badge-${sale.status.toLowerCase().replace(" ", "-")}">${sale.status}</span></td>
        <td>${sale.category ? `<span class="badge badge-${sale.category}">${sale.category}</span>` : "—"}</td>
        <td>${sale.pax ?? "—"}</td>
        <td>${sale.order_payment_method}</td>
        <td class="amount">PHP ${Number(sale.total_bill).toFixed(2)}</td>
        <td class="amount discount">${hasDiscount ? `− PHP ${Number(sale.total_discount).toFixed(2)}` : "—"}</td>
        <td class="amount net">PHP ${net.toFixed(2)}</td>
      </tr>`;
  }).join("");

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <title>Daily Sales Report — ${dateStr}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'DM Sans', 'Segoe UI', system-ui, sans-serif; font-size: 11px; color: #1e293b; background: #fff; padding: 32px 36px; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; padding-bottom: 16px; border-bottom: 2px solid #e2e8f0; }
    .header-left h1 { font-size: 20px; font-weight: 600; color: #0f172a; letter-spacing: -0.3px; }
    .header-left .meta { display: flex; gap: 12px; margin-top: 4px; color: #64748b; font-size: 11px; }
    .header-right { text-align: right; color: #94a3b8; font-size: 10px; line-height: 1.6; }
    .summary { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 20px; }
    .card { border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px 14px; }
    .card .label { font-size: 9px; text-transform: uppercase; letter-spacing: 0.07em; color: #94a3b8; margin-bottom: 4px; }
    .card .value { font-size: 17px; font-weight: 600; }
    .value-default { color: #0f172a; } .value-red { color: #ef4444; } .value-indigo { color: #4f46e5; } .value-emerald { color: #059669; }
    .table-wrap { border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; }
    table { width: 100%; border-collapse: collapse; }
    thead tr { background: #f8fafc; border-bottom: 1px solid #e2e8f0; }
    th { padding: 8px 12px; text-align: left; font-size: 9px; font-weight: 500; text-transform: uppercase; letter-spacing: 0.07em; color: #94a3b8; }
    td { padding: 9px 12px; vertical-align: middle; border-bottom: 1px solid #f1f5f9; color: #475569; font-size: 11px; }
    tr:last-child td { border-bottom: none; }
    .order-id { color: #1e293b; font-weight: 500; display: block; }
    .sub { display: block; font-size: 9px; color: #94a3b8; margin-top: 1px; }
    .amount { color: #334155; font-variant-numeric: tabular-nums; }
    .discount { color: #ef4444; } .net { color: #1e293b; font-weight: 600; }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 100px; font-size: 10px; font-weight: 500; border: 1px solid transparent; }
    .badge-dine-in { color: #4338ca; background: #eef2ff; border-color: #c7d2fe; }
    .badge-take-out { color: #059669; background: #ecfdf5; border-color: #a7f3d0; }
    .badge-cancelled { color: #ef4444; background: #fef2f2; border-color: #fecaca; }
    .badge-grab { color: #ea580c; background: #fff7ed; border-color: #fed7aa; }
    .badge-official { color: #7c3aed; background: #f5f3ff; border-color: #ddd6fe; }
    .badge-others { color: #64748b; background: #f8fafc; border-color: #e2e8f0; }
    .totals-row td { border-top: 2px solid #e2e8f0; border-bottom: none; font-weight: 600; color: #0f172a; background: #f8fafc; padding-top: 10px; padding-bottom: 10px; }
    .footer { margin-top: 20px; display: flex; justify-content: space-between; color: #94a3b8; font-size: 9px; padding-top: 12px; border-top: 1px solid #f1f5f9; }
    @media print { body { padding: 18px 20px; } @page { margin: 12mm; size: A4 landscape; } }
  </style>
</head>
<body>
  <div class="header">
    <div class="header-left">
      <h1>Daily Sales Report</h1>
      <div class="meta">
        <span>📍 ${branchName}</span><span>📅 ${dateStr}</span>
        <span>🧾 ${filtered.length} transaction${filtered.length !== 1 ? "s" : ""}</span>
      </div>
    </div>
    <div class="header-right">Printed ${new Date().toLocaleString()}<br/>${branchName}</div>
  </div>
  ${activeFilters.length > 0 ? `<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:7px 12px;font-size:10px;color:#64748b;margin-bottom:16px;"><strong>Active filters:</strong> ${activeFilters.join(" &nbsp;·&nbsp; ")}</div>` : ""}
  <div class="summary">
    <div class="card"><div class="label">Gross Sales</div><div class="value value-default">PHP ${totalRevenue.toFixed(2)}</div></div>
    <div class="card"><div class="label">Total Discounts</div><div class="value value-red">− PHP ${totalDiscount.toFixed(2)}</div></div>
    <div class="card"><div class="label">Net Sales</div><div class="value value-indigo">PHP ${netRevenue.toFixed(2)}</div></div>
    <div class="card"><div class="label">Total Pax Today</div><div class="value value-emerald">${totalPaxDay}</div></div>
  </div>
  <div class="table-wrap">
    <table>
      <thead><tr><th>Order</th><th>Time</th><th>Cashier</th><th>Status</th><th>Category</th><th>Pax</th><th>Payment</th><th>Bill</th><th>Discount</th><th>Net</th></tr></thead>
      <tbody>
        ${rows}
        <tr class="totals-row">
          <td colspan="7">Totals (${filtered.length} transaction${filtered.length !== 1 ? "s" : ""})</td>
          <td class="amount">PHP ${totalRevenue.toFixed(2)}</td>
          <td class="amount discount">${totalDiscount > 0 ? `− PHP ${totalDiscount.toFixed(2)}` : "—"}</td>
          <td class="amount net">PHP ${netRevenue.toFixed(2)}</td>
        </tr>
      </tbody>
    </table>
  </div>
  <div class="footer"><span>Generated by POS System · ${branchName}</span><span>${dateStr} · ${filtered.length} transaction${filtered.length !== 1 ? "s" : ""}</span></div>
</body></html>`;

  const win = window.open("", "_blank", "width=1100,height=800");
  if (!win) return;
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => { win.print(); }, 350);
}

// ── Password Modal ────────────────────────────────────────────────────────────
interface PasswordModalProps {
  onConfirm: (password: string) => void;
  onCancel:  () => void;
  error:     string;
}

function PasswordModal({ onConfirm, onCancel, error }: PasswordModalProps) {
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(15,23,42,0.45)", backdropFilter: "blur(2px)" }}>
      <div className="bg-white rounded-2xl shadow-2xl w-[340px] overflow-hidden" style={{ fontFamily: "'DM Sans', system-ui, sans-serif" }}>
        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b border-slate-100">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-8 h-8 rounded-lg bg-amber-50 border border-amber-100 flex items-center justify-center flex-shrink-0">
              <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" className="text-amber-500">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
              </svg>
            </div>
            <div>
              <p className="text-[13px] font-semibold text-slate-800">Authorization Required</p>
              <p className="text-[11px] text-slate-400">Enter password to edit OS/OR number</p>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4">
          <div>
            <label className="text-[10px] uppercase tracking-widest text-slate-400 block mb-1.5">Password</label>
            <input
              ref={inputRef}
              type="password"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") onConfirm(value); }}
              placeholder="Enter password"
              className="w-full text-[13px] text-slate-700 border border-slate-200 rounded-lg px-3 py-2.5 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-50 transition-all placeholder:text-slate-300"
            />
            {error && (
              <p className="text-[11px] text-red-500 mt-1.5 flex items-center gap-1">
                <svg width="11" height="11" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd"/></svg>
                {error}
              </p>
            )}
          </div>

          <div className="flex gap-2">
            <button onClick={onCancel} className="flex-1 text-[12px] text-slate-500 border border-slate-200 hover:bg-slate-50 py-2 rounded-lg transition-colors">
              Cancel
            </button>
            <button onClick={() => onConfirm(value)} className="flex-1 text-[12px] text-white bg-indigo-600 hover:bg-indigo-700 py-2 rounded-lg transition-colors font-medium">
              Confirm
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Edit OS Number Modal ──────────────────────────────────────────────────────
interface EditOsModalProps {
  orderId:    number;
  currentOs:  number | null;
  onSave:     (newOs: number) => Promise<void>;
  onCancel:   () => void;
  isSaving:   boolean;
  saveError:  string;
}

function EditOsModal({ orderId, currentOs, onSave, onCancel, isSaving, saveError }: EditOsModalProps) {
  const [value, setValue] = useState(currentOs?.toString() ?? "");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const handleSave = () => {
    const parsed = parseInt(value);
    if (isNaN(parsed) || parsed < 1) return;
    onSave(parsed);
  };

  const isValid = !isNaN(parseInt(value)) && parseInt(value) >= 1;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(15,23,42,0.45)", backdropFilter: "blur(2px)" }}>
      <div className="bg-white rounded-2xl shadow-2xl w-[360px] overflow-hidden" style={{ fontFamily: "'DM Sans', system-ui, sans-serif" }}>
        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-indigo-50 border border-indigo-100 flex items-center justify-center flex-shrink-0">
              <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" className="text-indigo-500">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
            </div>
            <div>
              <p className="text-[13px] font-semibold text-slate-800">Edit OS/OR Number</p>
              <p className="text-[11px] text-slate-400">Order #{orderId}</p>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4">
          {currentOs !== null && (
            <div className="bg-slate-50 border border-slate-100 rounded-lg px-3 py-2.5 flex items-center gap-2">
              <span className="text-[10px] uppercase tracking-widest text-slate-400">Current</span>
              <span className="text-[13px] text-slate-600 font-medium ml-auto">#{currentOs}</span>
            </div>
          )}
          <div>
            <label className="text-[10px] uppercase tracking-widest text-slate-400 block mb-1.5">New OS/OR Number</label>
            <input
              ref={inputRef}
              type="number"
              min={1}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && isValid && !isSaving) handleSave(); }}
              placeholder="e.g. 1042"
              className="w-full text-[13px] text-slate-700 border border-slate-200 rounded-lg px-3 py-2.5 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-50 transition-all placeholder:text-slate-300"
            />
            {saveError && (
              <p className="text-[11px] text-red-500 mt-1.5 flex items-center gap-1">
                <svg width="11" height="11" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd"/></svg>
                {saveError}
              </p>
            )}
          </div>

          <div className="flex gap-2">
            <button onClick={onCancel} disabled={isSaving} className="flex-1 text-[12px] text-slate-500 border border-slate-200 hover:bg-slate-50 py-2 rounded-lg transition-colors disabled:opacity-50">
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={!isValid || isSaving}
              className="flex-1 text-[12px] text-white bg-indigo-600 hover:bg-indigo-700 py-2 rounded-lg transition-colors font-medium disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
            >
              {isSaving ? (
                <>
                  <svg className="animate-spin" width="12" height="12" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8v4a4 4 0 0 0-4 4H4z"/></svg>
                  Saving…
                </>
              ) : "Save"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Activity Log Modal ────────────────────────────────────────────────────────
interface ActivityLogModalProps {
  orderId:  number;
  logs:     ActivityLog[];
  loading:  boolean;
  onClose:  () => void;
}

function ActivityLogModal({ orderId, logs, loading, onClose }: ActivityLogModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(15,23,42,0.45)", backdropFilter: "blur(2px)" }}>
      <div className="bg-white rounded-2xl shadow-2xl w-[480px] max-h-[70vh] flex flex-col overflow-hidden" style={{ fontFamily: "'DM Sans', system-ui, sans-serif" }}>
        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b border-slate-100 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-violet-50 border border-violet-100 flex items-center justify-center flex-shrink-0">
              <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" className="text-violet-500">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>
              </svg>
            </div>
            <div>
              <p className="text-[13px] font-semibold text-slate-800">Activity Log</p>
              <p className="text-[11px] text-slate-400">Order #{orderId}</p>
            </div>
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-lg border border-slate-200 flex items-center justify-center text-slate-400 hover:bg-slate-50 transition-colors">
            <svg width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path d="M18 6 6 18M6 6l12 12"/></svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-2" style={{ scrollbarWidth: "thin", scrollbarColor: "#e2e8f0 transparent" }}>
          {loading ? (
            <div className="flex items-center justify-center py-10 gap-2 text-slate-400">
              <svg className="animate-spin" width="16" height="16" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8v4a4 4 0 0 0-4 4H4z"/></svg>
              <span className="text-[12px]">Loading logs…</span>
            </div>
          ) : logs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 gap-2 text-slate-300">
              <svg width="28" height="28" fill="none" stroke="currentColor" strokeWidth="1.25" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
              <p className="text-[12px] text-slate-400">No activity logs found for this order</p>
            </div>
          ) : (
            logs.map((log, i) => {
              const logDate = new Date(log.date);
              const timeStr = logDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
              const dateStr = logDate.toLocaleDateString([], { month: "short", day: "numeric" });
              const isFirst = i === 0;
              return (
                <div
                  key={log.id}
                  className="flex gap-3 items-start py-3 px-3.5 rounded-xl border transition-colors"
                  style={{
                    borderColor: isFirst ? "#e0e7ff" : "#f1f5f9",
                    background:  isFirst ? "#f5f7ff" : "#fafafa",
                  }}
                >
                  <div className="flex-shrink-0 mt-0.5">
                    <div className="w-6 h-6 rounded-full flex items-center justify-center" style={{ background: isFirst ? "#e0e7ff" : "#f1f5f9" }}>
                      <svg width="10" height="10" fill="none" stroke={isFirst ? "#6366f1" : "#94a3b8"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                        <polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
                      </svg>
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] text-slate-700 leading-relaxed">{log.action}</p>
                  </div>
                  <div className="flex-shrink-0 text-right">
                    <p className="text-[11px] text-slate-500">{timeStr}</p>
                    <p className="text-[10px] text-slate-400">{dateStr}</p>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-100 flex-shrink-0">
          <p className="text-[10px] text-slate-400 text-center">
            {logs.length} log entr{logs.length !== 1 ? "ies" : "y"} found
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function SalesPage() {
  const { branch, hydrated } = useSession();
  const router = useRouter();

  const [sales,          setSales]          = useState<SaleRecord[]>([]);
  const [loading,        setLoading]        = useState(true);
  const [filterPayment,  setFilterPayment]  = useState("All");
  const [filterStatus,   setFilterStatus]   = useState("All");
  const [filterCategory, setFilterCategory] = useState("All");
  const [totalPaxDay,    setTotalPaxDay]    = useState<number>(0);

  // Tracks which order_ids have been permanently highlighted (OS edited this session)
  const [highlightedIds, setHighlightedIds] = useState<Set<number>>(new Set());

  // ── Password modal state ──────────────────────────────────────────────────
  type PasswordStep = { phase: "password"; targetOrderId: number; targetCurrentOs: number | null };
  type EditStep     = { phase: "edit";     targetOrderId: number; targetCurrentOs: number | null };
  type ModalState   = PasswordStep | EditStep | null;

  const [modalState,     setModalState]     = useState<ModalState>(null);
  const [passwordError,  setPasswordError]  = useState("");
  const [isSaving,       setIsSaving]       = useState(false);
  const [saveError,      setSaveError]      = useState("");

  // ── Activity log modal state ──────────────────────────────────────────────
  const [logModal,       setLogModal]       = useState<{ orderId: number } | null>(null);
  const [activityLogs,   setActivityLogs]   = useState<ActivityLog[]>([]);
  const [logsLoading,    setLogsLoading]    = useState(false);

  useEffect(() => {
    if (!hydrated) return;
    if (!branch) { router.replace("/branchchoice"); return; }

    (async () => {
      try {
        const [salesRes, statsRes] = await Promise.all([
          axios.get(`${API}/orders/sales/daily?branch_id=${branch.branch_id}`),
          axios.get(`${API}/orders/stats/daily?branch_id=${branch.branch_id}`),
        ]);
        setSales(salesRes.data.data);
        setTotalPaxDay(Number(statsRes.data.data.total_pax) || 0);
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    })();
  }, [hydrated, branch]);

  const filtered = useMemo(() => {
    return sales.filter((s) => {
      const matchPayment  = filterPayment  === "All" || s.order_payment_method === filterPayment;
      const matchStatus   = filterStatus   === "All" || s.status               === filterStatus;
      const matchCategory = filterCategory === "All" || s.category             === filterCategory;
      return matchPayment && matchStatus && matchCategory;
    });
  }, [sales, filterPayment, filterStatus, filterCategory]);

  const totalRevenue  = filtered.reduce((s, r) => s + Number(r.total_bill), 0);
  const totalDiscount = filtered.reduce((s, r) => s + Number(r.total_discount), 0);
  const netRevenue    = totalRevenue - totalDiscount;

  // ── Password flow ─────────────────────────────────────────────────────────
  const openEditFlow = (orderId: number, currentOs: number | null) => {
    setPasswordError("");
    setModalState({ phase: "password", targetOrderId: orderId, targetCurrentOs: currentOs });
  };

  const handlePasswordConfirm = (pw: string) => {
    if (pw !== OS_PASSWORD) {
      setPasswordError("Incorrect password. Please try again.");
      return;
    }
    if (!modalState) return;
    setPasswordError("");
    setModalState({ phase: "edit", targetOrderId: modalState.targetOrderId, targetCurrentOs: modalState.targetCurrentOs });
  };

  const handlePasswordCancel = () => {
    setModalState(null);
    setPasswordError("");
  };

  // ── Save OS number ────────────────────────────────────────────────────────
  const handleSaveOs = async (newOs: number) => {
    if (!modalState) return;
    const { targetOrderId } = modalState;
    setIsSaving(true);
    setSaveError("");
    try {
      await axios.patch(`${API}/activity/orders/${targetOrderId}/osnumber`, { os_num: newOs });

      // Update local sales state
      setSales((prev) =>
        prev.map((s) => s.order_id === targetOrderId ? { ...s, osNum: newOs } : s)
      );

      // Permanently highlight the row
      setHighlightedIds((prev) => new Set(prev).add(targetOrderId));

      setModalState(null);
    } catch (err: any) {
      const msg = err?.response?.data?.error ?? "Failed to update OS/OR number.";
      setSaveError(msg);
    } finally {
      setIsSaving(false);
    }
  };

  const handleEditCancel = () => {
    setModalState(null);
    setSaveError("");
  };

  // ── Activity log ──────────────────────────────────────────────────────────
  const openActivityLog = async (orderId: number) => {
    setLogModal({ orderId });
    setLogsLoading(true);
    setActivityLogs([]);
    try {
      const res = await axios.get(`${API}/activity/logs?order_id=${orderId}`);
      setActivityLogs(res.data.data);
    } catch (e) { console.error(e); }
    finally { setLogsLoading(false); }
  };

  const closeActivityLog = () => {
    setLogModal(null);
    setActivityLogs([]);
  };

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
    "Grab":      "text-orange-600 bg-orange-50 border-orange-100",
  };

  const categoryColors: Record<string, string> = {
    "official": "text-violet-600 bg-violet-50 border-violet-100",
    "others":   "text-slate-500 bg-slate-50 border-slate-200",
  };

  const paymentIcon: Record<string, string> = {
    "Cash":           "M17 9V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2m2 4h10a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2H9a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2zm7-5a2 2 0 1 1-4 0 2 2 0 0 1 4 0z",
    "Credit / Debit": "M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 0 0 3-3V8a3 3 0 0 0-3-3H6a3 3 0 0 0-3 3v8a3 3 0 0 0 3 3z",
    "E-Wallet":       "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z",
    "Bank Transfer":  "M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM9 22V12h6v10",
  };

  const handlePrint = () => {
    printSales({
      filtered, totalRevenue, totalDiscount, netRevenue, totalPaxDay,
      branchName: branch?.branch_name ?? "Branch",
      dateStr, filterPayment, filterStatus, filterCategory,
    });
  };

  const handleExportExcel = () => {
    const rows = filtered.map((sale) => ({
      "Order ID":       `#${sale.order_id}`,
      "OS #":           sale.osNum ?? "",
      "Time":           new Date(sale.order_datetime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      "Cashier":        sale.cashier_name ?? "",
      "Status":         sale.status,
      "Category":       sale.category ?? "",
      "Pax":            sale.pax ?? "",
      "Payment Method": sale.order_payment_method,
      "Bill (PHP)":     Number(sale.total_bill),
      "Discount (PHP)": Number(sale.total_discount),
      "Net (PHP)":      Number(sale.total_bill) - Number(sale.total_discount),
    }));
    const summary = [
      {},
      { "Order ID": "SUMMARY",  "Bill (PHP)": "Gross Sales",     "Net (PHP)": totalRevenue },
      { "Order ID": "",         "Bill (PHP)": "Total Discounts", "Net (PHP)": -totalDiscount },
      { "Order ID": "",         "Bill (PHP)": "Net Sales",       "Net (PHP)": netRevenue },
      { "Order ID": "",         "Bill (PHP)": "Total Pax Today", "Net (PHP)": totalPaxDay },
    ];
    const ws = XLSX.utils.json_to_sheet([...rows, ...summary]);
    ws["!cols"] = [{ wch: 10 }, { wch: 8 }, { wch: 8 }, { wch: 16 }, { wch: 10 }, { wch: 10 }, { wch: 6 }, { wch: 16 }, { wch: 12 }, { wch: 14 }, { wch: 12 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Daily Sales");
    const filename = `sales_${new Date().toISOString().slice(0, 10)}_${branch?.branch_name ?? "branch"}.xlsx`;
    XLSX.writeFile(wb, filename);
  };

  return (
    <div className="flex flex-col h-screen bg-slate-50 overflow-hidden" style={{ fontFamily: "'DM Sans', system-ui, sans-serif" }}>

      {/* ── Modals ── */}
      {modalState?.phase === "password" && (
        <PasswordModal
          onConfirm={handlePasswordConfirm}
          onCancel={handlePasswordCancel}
          error={passwordError}
        />
      )}
      {modalState?.phase === "edit" && (
        <EditOsModal
          orderId={modalState.targetOrderId}
          currentOs={modalState.targetCurrentOs}
          onSave={handleSaveOs}
          onCancel={handleEditCancel}
          isSaving={isSaving}
          saveError={saveError}
        />
      )}
      {logModal && (
        <ActivityLogModal
          orderId={logModal.orderId}
          logs={activityLogs}
          loading={logsLoading}
          onClose={closeActivityLog}
        />
      )}

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
          <button onClick={handleExportExcel} disabled={loading || filtered.length === 0}
            className="flex items-center gap-1.5 text-[11px] text-emerald-700 border border-emerald-200 hover:border-emerald-300 hover:bg-emerald-50 bg-white px-2.5 py-1 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
            <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg>
            Export Excel
          </button>
          <button onClick={handlePrint} disabled={loading || filtered.length === 0}
            className="flex items-center gap-1.5 text-[11px] text-slate-600 border border-slate-200 hover:border-slate-300 hover:bg-slate-50 bg-white px-2.5 py-1 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
            <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
            Print / Save PDF
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-6 space-y-5" style={{ scrollbarWidth: "thin", scrollbarColor: "#e2e8f0 transparent" }}>

        {/* Summary cards */}
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: "Gross Sales",     value: `PHP ${totalRevenue.toFixed(2)}`,    color: "text-slate-800"   },
            { label: "Total Discounts", value: `− PHP ${totalDiscount.toFixed(2)}`, color: "text-red-500"     },
            { label: "Net Sales",       value: `PHP ${netRevenue.toFixed(2)}`,      color: "text-indigo-600"  },
            { label: "Total Pax Today", value: totalPaxDay.toString(),              color: "text-emerald-600", sub: "across all paid orders" },
          ].map((c) => (
            <div key={c.label} className="bg-white border border-slate-200 rounded-xl px-5 py-4">
              <p className="text-[11px] text-slate-400 mb-1">{c.label}</p>
              <p className={`text-[20px] font-medium ${c.color}`}>{c.value}</p>
              {"sub" in c && c.sub && <p className="text-[10px] text-slate-300 mt-1">{c.sub}</p>}
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="flex gap-4 flex-wrap">
          <div>
            <p className="text-[10px] text-slate-400 uppercase tracking-widest mb-1.5">Payment Method</p>
            <div className="flex gap-1.5 flex-wrap">
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
          <div>
            <p className="text-[10px] text-slate-400 uppercase tracking-widest mb-1.5">Category</p>
            <div className="flex gap-1.5">
              {ORDER_CATEGORIES.map((c) => (
                <button key={c} onClick={() => setFilterCategory(c)}
                  className={`text-[12px] px-3 py-1.5 rounded-lg border capitalize transition-all ${filterCategory === c ? "bg-indigo-600 border-indigo-600 text-white" : "bg-white border-slate-200 text-slate-500 hover:border-slate-300"}`}>
                  {c}
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
                  {["Order", "Time", "Cashier", "Status", "Category", "Pax", "Payment", "Bill", "Discount", "Net", "Actions"].map((h) => (
                    <th key={h} className="text-left text-[10px] text-slate-400 font-normal uppercase tracking-widest px-5 py-3">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((sale) => {
                  const timeStr  = new Date(sale.order_datetime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
                  const net      = Number(sale.total_bill) - Number(sale.total_discount);
                  const isHighlighted = highlightedIds.has(sale.order_id);

                  return (
                    <tr
                      key={sale.order_id}
                      className="transition-colors"
                      style={{
                        background: isHighlighted
                          ? "linear-gradient(90deg, #f0fdf4 0%, #f8faff 100%)"
                          : undefined,
                      }}
                    >
                      {/* Order */}
                      <td className="px-5 py-3.5">
                        <p className="text-[13px] text-slate-700">#{sale.order_id}</p>
                        <div className="flex items-center gap-1 mt-0.5">
                          {sale.osNum ? (
                            <p className="text-[10px] text-slate-400">OS #{sale.osNum}</p>
                          ) : (
                            <p className="text-[10px] text-slate-300 italic">No OS #</p>
                          )}
                          {/* Edit OS button */}
                          <button
                            onClick={() => openEditFlow(sale.order_id, sale.osNum)}
                            title="Edit OS/OR number"
                            className="w-4 h-4 rounded flex items-center justify-center text-slate-300 hover:text-indigo-500 hover:bg-indigo-50 transition-colors ml-0.5"
                          >
                            <svg width="9" height="9" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                            </svg>
                          </button>
                          {/* Highlight badge */}
                          {isHighlighted && (
                            <span className="text-[9px] text-emerald-600 bg-emerald-50 border border-emerald-100 px-1.5 py-0.5 rounded-full font-medium">
                              updated
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Time */}
                      <td className="px-5 py-3.5 text-[12px] text-slate-500">{timeStr}</td>

                      {/* Cashier */}
                      <td className="px-5 py-3.5 text-[12px] text-slate-600">{sale.cashier_name ?? "—"}</td>

                      {/* Status */}
                      <td className="px-5 py-3.5">
                        <span className={`text-[11px] border px-2.5 py-1 rounded-full ${statusColors[sale.status] ?? "text-slate-500 bg-slate-50 border-slate-100"}`}>
                          {sale.status}
                        </span>
                      </td>

                      {/* Category */}
                      <td className="px-5 py-3.5">
                        {sale.category ? (
                          <span className={`text-[11px] border px-2.5 py-1 rounded-full capitalize ${categoryColors[sale.category] ?? "text-slate-500 bg-slate-50 border-slate-100"}`}>
                            {sale.category}
                          </span>
                        ) : (
                          <span className="text-[11px] text-slate-300">—</span>
                        )}
                      </td>

                      {/* Pax */}
                      <td className="px-5 py-3.5 text-[12px] text-slate-600">
                        {sale.pax ?? <span className="text-slate-300">—</span>}
                      </td>

                      {/* Payment */}
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-1.5 text-[12px] text-slate-600">
                          <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                            <path d={paymentIcon[sale.order_payment_method] ?? "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z"}/>
                          </svg>
                          {sale.order_payment_method}
                        </div>
                      </td>

                      {/* Bill */}
                      <td className="px-5 py-3.5 text-[13px] text-slate-700">PHP {Number(sale.total_bill).toFixed(2)}</td>

                      {/* Discount */}
                      <td className="px-5 py-3.5 text-[12px] text-red-500">
                        {Number(sale.total_discount) > 0 ? `− PHP ${Number(sale.total_discount).toFixed(2)}` : "—"}
                      </td>

                      {/* Net */}
                      <td className="px-5 py-3.5 text-[13px] text-slate-800 font-medium">PHP {net.toFixed(2)}</td>

                      {/* Actions */}
                      <td className="px-5 py-3.5">
                        <button
                          onClick={() => openActivityLog(sale.order_id)}
                          className="flex items-center gap-1.5 text-[11px] text-violet-600 border border-violet-200 hover:bg-violet-50 hover:border-violet-300 bg-white px-2.5 py-1 rounded-lg transition-colors"
                        >
                          <svg width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
                          </svg>
                          Activity
                        </button>
                      </td>
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