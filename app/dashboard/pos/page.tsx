"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import axios from "axios";
import { useSession } from "@/context/SessionContext";

// ── Types ─────────────────────────────────────────────────────────────────────
interface MenuItem {
  menu_id:       number;
  menu_name:     string;
  category_id:   number;
  category_name: string;
  price:         number;
  branch_id:     number;
}
interface Category { id: number; category_name: string; }
interface OrderItem {
  localId:        string;
  order_item_id?: number;
  menu_id:        number;
  menu_name:      string;
  price:          number;
  quantity:       number;
  subtotal:       number;
  served:         boolean;
}
type DiscountType = "Senior" | "PWD" | "Custom";
interface DiscountRow { id: number; type: DiscountType; count: string; customRate: string; }

// ── Multi-row discount calculation ────────────────────────────────────────────
function calcMultiDiscount(totalBill: number, headcount: number, rows: DiscountRow[]) {
  if (headcount <= 0) return { perPerson: 0, rows: [], totalDiscount: 0, amountDue: totalBill, discountedPeopleTotal: 0 };
  const perPerson = totalBill / headcount;
  let totalDiscount = 0;
  let discountedPeopleTotal = 0;
  const rowResults: { id: number; rowDiscount: number }[] = [];

  for (const row of rows) {
    const count = parseInt(row.count) || 0;
    const rate  = row.type === "PWD" ? 0.2 : row.type === "Senior" ? 0.2 : (parseFloat(row.customRate) / 100 || 0);
    const rowDiscount = perPerson * rate * count;
    totalDiscount += rowDiscount;
    discountedPeopleTotal += count;
    rowResults.push({ id: row.id, rowDiscount });
  }
  return { perPerson, rows: rowResults, totalDiscount, amountDue: Math.max(0, totalBill - totalDiscount), discountedPeopleTotal };
}

const API = "http://localhost:5000";
const authHeader = (token: string | undefined) => ({ Authorization: `Bearer ${token}` });

// ── localStorage helper for table numbers ─────────────────────────────────────
const TABLE_KEY = (id: string | number) => `table:${id}`;
const saveTableNumber  = (orderId: string | number, num: string) => {
  if (num.trim()) localStorage.setItem(TABLE_KEY(orderId), num.trim());
  else            localStorage.removeItem(TABLE_KEY(orderId));
};

// ── Component ─────────────────────────────────────────────────────────────────
export default function POS() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const orderId  = searchParams.get("order_id");
  const isExisting = !!orderId;

  const { user, branch } = useSession();

  // Menu state
  const [menuItems, setMenuItems]       = useState<MenuItem[]>([]);
  const [categories, setCategories]     = useState<Category[]>([]);
  const [filteredMenu, setFilteredMenu] = useState<MenuItem[]>([]);
  const [search, setSearch]             = useState("");
  const [selectedCategory, setSelectedCategory] = useState<number | null>(null);

  // Order state
  const [orders, setOrders]           = useState<OrderItem[]>([]);
  const [currentItem, setCurrentItem] = useState<MenuItem | null>(null);
  const [quantity, setQuantity]       = useState(1);
  const [orderType, setOrderType]     = useState<"Dine In" | "Take Out" | "Foodpanda" | "Grab">("Dine In");
  const [step, setStep]               = useState<"select" | "quantity" | "checkout">("select");
  const [loadingOrder, setLoadingOrder] = useState(isExisting);
  const [saving, setSaving]           = useState(false);

  // Payment state
  const [paymentMethod, setPaymentMethod] = useState("Cash");
  const [amountReceived, setAmountReceived] = useState("");
  const [headcount, setHeadcount] = useState("");
  const [osNum, setOsNum] = useState("");

  // ── Table number — local only, never sent to API ──────────────────────────
  const [tableNumber, setTableNumber] = useState("");

  // Discount rows
  const [discountRows, setDiscountRows] = useState<DiscountRow[]>([]);
  const [nextRowId, setNextRowId] = useState(1);

  const totalBill = orders.reduce((s, o) => s + o.subtotal, 0);
  const hc = parseInt(headcount) || 0;
  const discCalc = calcMultiDiscount(totalBill, hc, discountRows);
  const discountedOverLimit = hc > 0 && discCalc.discountedPeopleTotal > hc;
  const discountValid = !discountedOverLimit;
  const change = parseFloat(amountReceived) - discCalc.amountDue;
  const amountReceivedValid = paymentMethod !== "Cash" || parseFloat(amountReceived) >= discCalc.amountDue;
  const canConfirm = amountReceivedValid && discountValid;
  const allServed  = orders.length > 0 && orders.every((o) => o.served);
  const itemCount  = orders.reduce((s, o) => s + o.quantity, 0);

  // ── Fetch menu ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!branch) return;
    (async () => {
      try {
        const [m, c] = await Promise.all([
          axios.get(`${API}/menu?branch_id=${branch.branch_id}`),
          axios.get(`${API}/categories`),
        ]);
        setMenuItems(m.data.data);
        setFilteredMenu(m.data.data);
        setCategories(c.data.data);
      } catch (e) { console.error("Failed to fetch menu:", e); }
    })();
  }, [branch]);

  // ── Fetch existing order + load saved table number from localStorage ──────
  useEffect(() => {
    if (!orderId || !user) return;
    (async () => {
      try {
        const res = await axios.get(`${API}/orders/${orderId}`, { headers: authHeader(user.token) });
        const data = res.data.data;
        setOrders(
          data.items.map((i: any) => ({
            localId:       `db-${i.order_item_id}`,
            order_item_id: i.order_item_id,
            menu_id:       i.menu_id,
            menu_name:     i.menu_name,
            price:         Number(i.price_at_time),
            quantity:      i.quantity,
            subtotal:      Number(i.price_at_time) * i.quantity,
            served:        i.served,
          }))
        );
        setPaymentMethod(data.order_payment_method || "Cash");
        // Restore table number from localStorage if it was previously saved
        const saved = localStorage.getItem(TABLE_KEY(orderId));
        if (saved) setTableNumber(saved);
      } catch (e) { console.error("Failed to fetch order:", e); }
      finally { setLoadingOrder(false); }
    })();
  }, [orderId, user]);

  // ── Filter menu ───────────────────────────────────────────────────────────
  useEffect(() => {
    let f = menuItems;
    if (selectedCategory) f = f.filter((i) => i.category_id === selectedCategory);
    if (search) f = f.filter((i) => i.menu_name.toLowerCase().includes(search.toLowerCase()));
    setFilteredMenu(f);
  }, [search, selectedCategory, menuItems]);

  // ── Order helpers ─────────────────────────────────────────────────────────
  const selectItem = (item: MenuItem) => { setCurrentItem(item); setQuantity(1); setStep("quantity"); };

  const submitQuantity = () => {
    if (!currentItem) return;
    setOrders((prev) => {
      const ex = prev.find((o) => o.menu_id === currentItem.menu_id);
      if (ex) return prev.map((o) =>
        o.menu_id === currentItem.menu_id
          ? { ...o, quantity: o.quantity + quantity, subtotal: (o.quantity + quantity) * currentItem.price }
          : o
      );
      return [...prev, {
        localId: `new-${currentItem.menu_id}-${Date.now()}`,
        menu_id: currentItem.menu_id, menu_name: currentItem.menu_name,
        price: currentItem.price, quantity, subtotal: quantity * currentItem.price, served: false,
      }];
    });
    setCurrentItem(null); setStep("select");
  };

  const adjustQty = (localId: string, delta: number) =>
    setOrders((prev) =>
      prev.map((o) => o.localId === localId
        ? { ...o, quantity: o.quantity + delta, subtotal: (o.quantity + delta) * o.price }
        : o
      ).filter((o) => o.quantity > 0)
    );

  const removeItem = (localId: string) => setOrders((p) => p.filter((o) => o.localId !== localId));
  const toggleServed = (localId: string) =>
    setOrders((prev) => prev.map((o) => o.localId === localId ? { ...o, served: !o.served } : o));

  // ── Discount row helpers ──────────────────────────────────────────────────
  const addDiscountRow = () => {
    if (hc === 0) return;
    setDiscountRows((p) => [...p, { id: nextRowId, type: "Senior", count: "1", customRate: "" }]);
    setNextRowId((n) => n + 1);
  };
  const updateDiscountRow = (id: number, patch: Partial<DiscountRow>) =>
    setDiscountRows((p) => p.map((r) => r.id === id ? { ...r, ...patch } : r));
  const removeDiscountRow = (id: number) =>
    setDiscountRows((p) => p.filter((r) => r.id !== id));

  // ── API actions ───────────────────────────────────────────────────────────

  const handlePlaceOrder = async () => {
    if (!user || !branch) return;
    setSaving(true);
    try {
      const res = await axios.post(
        `${API}/orders`,
        {
          payment_method: paymentMethod,
          status:         orderType,
          branch_id:      branch.branch_id,
          user_id:        user.id,
          os_num:         osNum ? parseInt(osNum) : null,
          items: orders.map((o) => ({ menu_id: o.menu_id, quantity: o.quantity })),
        },
        { headers: authHeader(user.token) }
      );
      // Save table number locally using the new order_id returned from the API
      const newOrderId = res.data.data?.order_id ?? res.data.order_id;
      if (newOrderId && orderType === "Dine In") {
        saveTableNumber(newOrderId, tableNumber);
      }
      router.push("/dashboard");
    } catch (e) { console.error("Failed to place order:", e); }
    finally { setSaving(false); }
  };

  const handleUpdateOrder = async () => {
    if (!orderId || !user) return;
    setSaving(true);
    try {
      await axios.put(
        `${API}/orders/${orderId}`,
        {
          payment_method: paymentMethod,
          items: orders.map((o) => ({
            menu_id: o.menu_id, quantity: o.quantity,
            ...(o.order_item_id ? { order_item_id: o.order_item_id, served: o.served } : {}),
          })),
        },
        { headers: authHeader(user.token) }
      );
      // Persist any changes to the table number
      saveTableNumber(orderId, tableNumber);
      router.push("/dashboard");
    } catch (e) { console.error("Failed to update order:", e); }
    finally { setSaving(false); }
  };

  const handleConfirmPayment = async () => {
    if (!orderId || !canConfirm || !user) return;
    setSaving(true);
    try {
      await axios.put(
        `${API}/orders/${orderId}`,
        {
          payment_method: paymentMethod,
          items: orders.map((o) => ({
            menu_id: o.menu_id, quantity: o.quantity,
            ...(o.order_item_id ? { order_item_id: o.order_item_id, served: o.served } : {}),
          })),
        },
        { headers: authHeader(user.token) }
      );
      await axios.patch(
        `${API}/orders/${orderId}/pay`,
        { payment_method: paymentMethod, total_bill: totalBill, total_discount: discCalc.totalDiscount },
        { headers: authHeader(user.token) }
      );
      // Clean up table number from localStorage once order is paid
      localStorage.removeItem(TABLE_KEY(orderId));
      router.push("/dashboard");
    } catch (e) { console.error("Failed to confirm payment:", e); }
    finally { setSaving(false); }
  };

  const handleCancel = async () => {
    if (!orderId || !user || !confirm("Cancel this order?")) return;
    try {
      await axios.patch(`${API}/orders/${orderId}/cancel`, {}, { headers: authHeader(user.token) });
      // Clean up table number from localStorage on cancel too
      localStorage.removeItem(TABLE_KEY(orderId));
      router.push("/dashboard");
    } catch (e) { console.error("Failed to cancel order:", e); }
  };

  const now = new Date();
  const timeStr = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const dateStr = now.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });

  if (!user || !branch) return null;

  if (loadingOrder) return (
    <div className="flex items-center justify-center h-screen bg-slate-50 gap-3 text-slate-400" style={{ fontFamily: "'DM Sans', system-ui, sans-serif" }}>
      <svg className="animate-spin" width="18" height="18" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8v4a4 4 0 0 0-4 4H4z"/></svg>
      <span className="text-[13px]">Loading order...</span>
    </div>
  );

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden text-slate-700" style={{ fontFamily: "'DM Sans', system-ui, sans-serif" }}>

      {/* ── LEFT: MENU ── */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">

        {/* Topbar */}
        <header className="h-[52px] bg-white border-b border-slate-200 flex items-center px-5 gap-3 flex-shrink-0">
          <button onClick={() => router.push("/dashboard")} className="w-7 h-7 rounded-lg border border-slate-200 flex items-center justify-center text-slate-400 hover:bg-slate-50 transition-colors flex-shrink-0">
            <svg width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path d="m15 18-6-6 6-6"/></svg>
          </button>
          <div className="flex items-center gap-2 text-[11px]">
            <span className="text-slate-400">{dateStr}</span>
            <span className="text-slate-200">|</span>
            <span className="text-slate-500">{timeStr}</span>
            {isExisting && <><span className="text-slate-200">|</span><span className="text-indigo-500">Order #{orderId}</span></>}
          </div>
          <div className="relative flex-1 max-w-[280px]">
            <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
            <input type="text" placeholder="Search items..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-full pl-8 pr-3 py-1.5 text-[13px] bg-slate-50 border border-slate-200 rounded-lg placeholder-slate-400 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition"/>
          </div>
          <div className="ml-auto flex items-center gap-3">
            {isExisting && (
              <button onClick={handleCancel} className="text-[11px] text-red-400 hover:text-red-600 border border-red-100 hover:border-red-200 bg-red-50 px-2.5 py-1 rounded-lg transition-colors">
                Cancel Order
              </button>
            )}
            <div className="flex items-center gap-1.5 bg-slate-100 px-2.5 py-1 rounded-full">
              <svg width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" className="text-slate-400"><path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/></svg>
              <span className="text-[11px] text-slate-600">{branch.branch_name}</span>
              <span className="text-slate-300">·</span>
              <span className="text-[11px] text-slate-400">{user.full_name}</span>
            </div>
          </div>
        </header>

        {/* Category tabs */}
        <div className="bg-white border-b border-slate-200 px-5 flex overflow-x-auto flex-shrink-0" style={{ scrollbarWidth: "none" }}>
          {[{ id: null, category_name: "All Items" }, ...categories].map((cat) => (
            <button key={cat.id ?? "all"} onClick={() => setSelectedCategory(cat.id)}
              className={`text-[12px] px-4 py-2.5 border-b-2 whitespace-nowrap transition-all font-normal ${selectedCategory === cat.id ? "border-indigo-500 text-indigo-600" : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300"}`}>
              {cat.category_name}
            </button>
          ))}
        </div>

        {/* Menu grid */}
        <div className="flex-1 overflow-y-auto p-5" style={{ scrollbarWidth: "thin", scrollbarColor: "#e2e8f0 transparent" }}>
          {filteredMenu.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-slate-300">
              <svg width="34" height="34" fill="none" stroke="currentColor" strokeWidth="1.25" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
              <p className="text-sm">No items found for {branch.branch_name}</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
              {filteredMenu.map((item) => (
                <button key={item.menu_id} onClick={() => selectItem(item)}
                  className="group bg-white border border-slate-200 rounded-xl p-4 text-left transition-all duration-150 hover:border-indigo-300 hover:shadow-md hover:shadow-indigo-100/50 active:scale-[0.97]">
                  <div className="w-8 h-8 rounded-lg bg-slate-100 group-hover:bg-indigo-50 flex items-center justify-center mb-3 transition-colors">
                    <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" className="text-slate-400 group-hover:text-indigo-500 transition-colors">
                      <path d="M18 8h1a4 4 0 0 1 0 8h-1M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8zM6 1v3M10 1v3M14 1v3"/>
                    </svg>
                  </div>
                  <p className="text-[10px] text-slate-400 uppercase tracking-wide mb-1">{item.category_name}</p>
                  <p className="text-[13px] text-slate-700 leading-snug mb-2 line-clamp-2">{item.menu_name}</p>
                  <p className="text-[15px] text-slate-900 font-medium">PHP {item.price.toFixed(2)}</p>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── RIGHT: ORDER PANEL ── */}
      <div className="w-[340px] bg-white border-l border-slate-200 flex flex-col flex-shrink-0">

        {step !== "checkout" ? (
          <>
            <div className="px-5 pt-4 pb-3 border-b border-slate-100 flex-shrink-0">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <h2 className="text-[13px] text-slate-700">{isExisting ? `Order #${orderId}` : "New Order"}</h2>
                  <p className="text-[11px] text-slate-400 mt-0.5">{itemCount > 0 ? `${itemCount} item${itemCount !== 1 ? "s" : ""}` : "Empty"}</p>
                </div>
                {orders.length > 0 && !isExisting && (
                  <button onClick={() => setOrders([])} className="text-[11px] text-slate-400 hover:text-red-500 transition-colors px-2 py-1 rounded-md hover:bg-red-50">Clear all</button>
                )}
              </div>

              {!isExisting && (
                <>
                  {/* Order type toggle */}
                  <div className="flex gap-1.5 mb-3 flex-wrap">
                    {(["Dine In", "Take Out", "Foodpanda", "Grab"] as const).map((t) => (
                      <button key={t} onClick={() => { setOrderType(t); if (t !== "Dine In") setTableNumber(""); }}
                        className={`flex-1 py-1.5 rounded-lg text-[11px] border transition-all ${orderType === t ? "bg-indigo-600 border-indigo-600 text-white" : "bg-slate-50 border-slate-200 text-slate-500 hover:border-slate-300"}`}>
                        {t}
                      </button>
                    ))}
                  </div>

                  {/* Table number — only shown for Dine In, required */}
                  {orderType === "Dine In" && (
                    <div>
                      <label className="text-[10px] text-slate-400 uppercase tracking-widest block mb-1.5">
                        Table No. <span className="normal-case text-red-400">*</span>
                      </label>
                      <div className="relative">
                        <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                          <path d="M3 10h18M3 14h18M10 4v16M14 4v16"/>
                        </svg>
                        <input
                          type="number" min="1" placeholder="e.g. 5" value={tableNumber}
                          onChange={(e) => setTableNumber(e.target.value)}
                          className="w-full pl-8 pr-3 py-2 text-[13px] bg-slate-50 border border-slate-200 rounded-lg placeholder-slate-300 text-slate-700 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition"
                        />
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* Table number field for existing Dine In orders */}
              {isExisting && (
                <div className="mt-2">
                  <label className="text-[10px] text-slate-400 uppercase tracking-widest block mb-1.5">
                    Table No. <span className="normal-case text-red-400">*</span>
                  </label>
                  <div className="relative">
                    <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path d="M3 10h18M3 14h18M10 4v16M14 4v16"/>
                    </svg>
                    <input
                      type="number" min="1" placeholder="e.g. 5" value={tableNumber}
                      onChange={(e) => setTableNumber(e.target.value)}
                      className="w-full pl-8 pr-3 py-2 text-[13px] bg-slate-50 border border-slate-200 rounded-lg placeholder-slate-300 text-slate-700 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition"
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: "thin", scrollbarColor: "#e2e8f0 transparent" }}>
              {orders.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-slate-300 gap-3 px-6 text-center">
                  <svg width="30" height="30" fill="none" stroke="currentColor" strokeWidth="1.25" viewBox="0 0 24 24"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>
                  <p className="text-[12px] leading-relaxed text-slate-400">Tap menu items to add them here</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {orders.map((order) => (
                    <div key={order.localId} className="px-5 py-3 space-y-2">
                      <div className="flex items-center gap-2">
                        {isExisting && (
                          <input
                            type="checkbox"
                            checked={order.served}
                            onChange={() => toggleServed(order.localId)}
                            className="accent-emerald-500 w-3.5 h-3.5 flex-shrink-0"
                          />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className={`text-[12px] truncate ${order.served ? "text-emerald-600" : "text-slate-700"}`}>
                            {order.menu_name}
                          </p>
                          <p className="text-[11px] text-slate-400 mt-0.5">PHP {order.price.toFixed(2)}</p>
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <button onClick={() => adjustQty(order.localId, -1)} className="w-6 h-6 rounded-md border border-slate-200 text-slate-500 hover:bg-slate-100 flex items-center justify-center text-[13px] transition-colors">−</button>
                          <span className="text-[12px] text-slate-700 w-5 text-center">{order.quantity}</span>
                          <button onClick={() => adjustQty(order.localId, 1)} className="w-6 h-6 rounded-md border border-slate-200 text-slate-500 hover:bg-slate-100 flex items-center justify-center text-[13px] transition-colors">+</button>
                        </div>
                        <p className="text-[12px] text-slate-700 w-14 text-right flex-shrink-0">PHP {order.subtotal.toFixed(2)}</p>
                        <button onClick={() => removeItem(order.localId)} className="text-slate-300 hover:text-red-400 transition-colors flex-shrink-0">
                          <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" viewBox="0 0 24 24"><path d="M18 6 6 18M6 6l12 12"/></svg>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="border-t border-slate-100 px-5 py-4 flex-shrink-0 space-y-3">
              <div className="flex justify-between items-baseline">
                <span className="text-[13px] text-slate-600">Total</span>
                <span className="text-[17px] text-slate-900 font-medium">PHP {totalBill.toFixed(2)}</span>
              </div>
              {isExisting && orders.length > 0 && !allServed && (
                <div className="flex items-center gap-2 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                  <svg width="13" height="13" fill="none" stroke="#d97706" strokeWidth="2" viewBox="0 0 24 24"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                  <p className="text-[11px] text-amber-700">Mark all items as served to proceed</p>
                </div>
              )}
              {isExisting ? (
                <div className="flex gap-2">
                  <button onClick={handleUpdateOrder} disabled={saving}
                    className="flex-1 py-2.5 rounded-xl border border-slate-200 text-[12px] text-slate-600 hover:bg-slate-50 disabled:opacity-30 transition">
                    {saving ? "Saving..." : "Update Order"}
                  </button>
                  <button onClick={() => setStep("checkout")} disabled={orders.length === 0 || !allServed}
                    className="flex-[2] bg-indigo-600 text-white text-[13px] py-2.5 rounded-xl hover:bg-indigo-700 disabled:opacity-30 disabled:cursor-not-allowed transition tracking-wide">
                    Proceed to Payment
                  </button>
                </div>
              ) : (
                <>
                  <div>
                    <label className="text-[10px] text-slate-400 uppercase tracking-widest block mb-1.5">
                      Order Slip No. <span className="normal-case text-slate-300">(optional)</span>
                    </label>
                    <div className="relative">
                      <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                        <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2"/>
                      </svg>
                      <input
                        type="number" min="1" placeholder="e.g. 42" value={osNum}
                        onChange={(e) => setOsNum(e.target.value)}
                        className="w-full pl-8 pr-3 py-2 text-[13px] bg-slate-50 border border-slate-200 rounded-lg placeholder-slate-300 text-slate-700 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition"
                      />
                    </div>
                  </div>
                  <button onClick={handlePlaceOrder} disabled={orders.length === 0 || saving || !osNum || (orderType === "Dine In" && !tableNumber)}
                    className="w-full bg-indigo-600 text-white text-[13px] py-2.5 rounded-xl hover:bg-indigo-700 disabled:opacity-30 disabled:cursor-not-allowed transition tracking-wide flex items-center justify-center gap-2">
                    {saving ? (<><svg className="animate-spin" width="13" height="13" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8v4a4 4 0 0 0-4 4H4z"/></svg>Placing...</>) : "Place Order"}
                  </button>
                </>
              )}
            </div>
          </>

        ) : (
          /* ── CHECKOUT ── */
          <>
            <div className="px-5 py-3.5 border-b border-slate-100 flex items-center gap-3 flex-shrink-0">
              <button onClick={() => setStep("select")} className="w-7 h-7 rounded-lg border border-slate-200 flex items-center justify-center text-slate-400 hover:bg-slate-50 transition-colors">
                <svg width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path d="m15 18-6-6 6-6"/></svg>
              </button>
              <div><h2 className="text-[13px] text-slate-700">Payment</h2><p className="text-[11px] text-slate-400">Apply discounts & confirm</p></div>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5" style={{ scrollbarWidth: "thin" }}>

              {/* Order summary */}
              <div className="bg-slate-50 rounded-xl border border-slate-100 overflow-hidden">
                {orders.map((order) => (
                  <div key={order.localId} className="px-4 py-2.5 flex justify-between items-center border-b border-slate-100 last:border-0">
                    <div><p className="text-[12px] text-slate-700">{order.menu_name}</p><p className="text-[11px] text-slate-400">×{order.quantity}</p></div>
                    <p className="text-[12px] text-slate-600">PHP {order.subtotal.toFixed(2)}</p>
                  </div>
                ))}
                <div className="px-4 py-2.5 bg-white border-t border-slate-200 flex justify-between items-center">
                  <span className="text-[11px] text-slate-500">Bill Total</span>
                  <span className="text-[13px] text-slate-800 font-medium">PHP {totalBill.toFixed(2)}</span>
                </div>
              </div>

              {/* Multi-row discount module */}
              <div>
                <p className="text-[10px] text-slate-400 uppercase tracking-widest mb-3">Discounts</p>
                <div className="mb-3">
                  <label className="text-[11px] text-slate-500 block mb-1.5">Total Number of People</label>
                  <input type="number" min="1" placeholder="e.g. 4" value={headcount}
                    onChange={(e) => { setHeadcount(e.target.value); setDiscountRows([]); }}
                    className="w-full px-3 py-2 text-[13px] bg-white border border-slate-200 rounded-lg placeholder-slate-300 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition"/>
                  {hc > 0 && <p className="text-[11px] text-slate-400 mt-1">Share per person: <span className="text-slate-600">PHP {discCalc.perPerson.toFixed(2)}</span></p>}
                </div>

                {discountRows.length > 0 && (
                  <div className="space-y-2 mb-3">
                    {discountRows.map((row, idx) => {
                      const rowResult = discCalc.rows.find((r) => r.id === row.id);
                      const rowDiscount = rowResult?.rowDiscount ?? 0;
                      const effectiveRate = row.type === "PWD" ? 0.2 : row.type === "Senior" ? 0.2 : (parseFloat(row.customRate) / 100 || 0);
                      const count = parseInt(row.count) || 0;
                      return (
                        <div key={row.id} className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-2.5">
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] text-slate-500 font-medium">Discount #{idx + 1}</span>
                            <button onClick={() => removeDiscountRow(row.id)} className="text-slate-300 hover:text-red-400 transition-colors">
                              <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" viewBox="0 0 24 24"><path d="M18 6 6 18M6 6l12 12"/></svg>
                            </button>
                          </div>
                          <div className="flex gap-2">
                            <div className="flex-1">
                              <label className="text-[10px] text-slate-400 block mb-1">Type</label>
                              <select value={row.type} onChange={(e) => updateDiscountRow(row.id, { type: e.target.value as DiscountType, customRate: "" })}
                                className="w-full px-2.5 py-1.5 text-[12px] bg-white border border-slate-200 rounded-lg text-slate-700 outline-none focus:border-indigo-400 transition appearance-none">
                                <option value="Senior">Senior Citizen</option>
                                <option value="PWD">PWD</option>
                                <option value="Custom">Custom</option>
                              </select>
                            </div>
                            <div className="w-20">
                              <label className="text-[10px] text-slate-400 block mb-1">People</label>
                              <input type="number" min="1" max={hc} value={row.count}
                                onChange={(e) => updateDiscountRow(row.id, { count: e.target.value })}
                                className="w-full px-2.5 py-1.5 text-[12px] bg-white border border-slate-200 rounded-lg text-slate-700 outline-none focus:border-indigo-400 transition"/>
                            </div>
                          </div>
                          {row.type === "Custom" && (
                            <div className="relative">
                              <input type="number" min="0" max="100" step="0.1" placeholder="e.g. 15" value={row.customRate}
                                onChange={(e) => updateDiscountRow(row.id, { customRate: e.target.value })}
                                className="w-full pl-3 pr-7 py-1.5 text-[12px] bg-white border border-slate-200 rounded-lg placeholder-slate-300 outline-none focus:border-indigo-400 transition"/>
                              <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] text-slate-400">%</span>
                            </div>
                          )}
                          <div className="flex items-center justify-between pt-1.5 border-t border-slate-200">
                            <span className="text-[11px] text-slate-400">
                              {count > 0 && effectiveRate > 0 ? `${count} × PHP ${discCalc.perPerson.toFixed(2)} × ${(effectiveRate * 100).toFixed(0)}%` : "Enter count & rate"}
                            </span>
                            <span className={`text-[11px] font-medium ${rowDiscount > 0 ? "text-red-500" : "text-slate-300"}`}>
                              {rowDiscount > 0 ? `− PHP ${rowDiscount.toFixed(2)}` : "—"}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {discountedOverLimit && (
                  <div className="flex items-center gap-2 bg-red-50 border border-red-100 rounded-lg px-3 py-2 mb-3">
                    <svg width="13" height="13" fill="none" stroke="#ef4444" strokeWidth="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                    <p className="text-[11px] text-red-600">Total discounted ({discCalc.discountedPeopleTotal}) exceeds headcount ({hc}).</p>
                  </div>
                )}

                <button onClick={addDiscountRow} disabled={hc === 0}
                  className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl border border-dashed border-slate-300 text-[12px] text-slate-400 hover:border-indigo-300 hover:text-indigo-500 hover:bg-indigo-50 disabled:opacity-30 disabled:cursor-not-allowed transition-all">
                  <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>
                  {hc === 0 ? "Enter headcount to add discounts" : "Add Discount"}
                </button>

                {discCalc.totalDiscount > 0 && discountValid && (
                  <div className="mt-3 bg-white border border-slate-200 rounded-xl px-4 py-3 space-y-1.5">
                    <div className="flex justify-between text-[11px] text-slate-500"><span>Bill Total</span><span>PHP {totalBill.toFixed(2)}</span></div>
                    <div className="flex justify-between text-[11px] text-red-500"><span>Total Discount ({discCalc.discountedPeopleTotal} pax)</span><span>− PHP {discCalc.totalDiscount.toFixed(2)}</span></div>
                    <div className="flex justify-between text-[13px] text-slate-800 font-medium pt-1.5 border-t border-slate-100"><span>Amount Due</span><span>PHP {discCalc.amountDue.toFixed(2)}</span></div>
                  </div>
                )}
              </div>

              {/* Payment method */}
              <div>
                <p className="text-[10px] text-slate-400 uppercase tracking-widest mb-2">Payment Method</p>
                <div className="space-y-1.5">
                  {[
                    { label: "Cash",           d: "M17 9V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2m2 4h10a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2H9a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2zm7-5a2 2 0 1 1-4 0 2 2 0 0 1 4 0z" },
                    { label: "Credit / Debit", d: "M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 0 0 3-3V8a3 3 0 0 0-3-3H6a3 3 0 0 0-3 3v8a3 3 0 0 0 3 3z" },
                    { label: "E-Wallet",       d: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" },
                  ].map((m) => (
                    <button key={m.label} onClick={() => setPaymentMethod(m.label)}
                      className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl border text-[12px] transition-all ${paymentMethod === m.label ? "border-indigo-300 bg-indigo-50 text-indigo-700" : "border-slate-200 text-slate-500 hover:border-slate-300 hover:bg-slate-50"}`}>
                      <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d={m.d}/></svg>
                      {m.label}
                      {paymentMethod === m.label && <span className="ml-auto text-[10px] text-indigo-400">Selected</span>}
                    </button>
                  ))}
                </div>
              </div>

              {/* Cash: amount received + change */}
              {paymentMethod === "Cash" && (
                <div className="bg-slate-50 border border-slate-100 rounded-xl p-3.5 space-y-3">
                  <div>
                    <label className="text-[11px] text-slate-500 block mb-1">Amount Received (PHP)</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[12px] text-slate-400">₱</span>
                      <input type="number" min={discCalc.amountDue} step="0.01" placeholder={discCalc.amountDue.toFixed(2)} value={amountReceived}
                        onChange={(e) => setAmountReceived(e.target.value)}
                        className={`w-full pl-7 pr-3 py-2 text-[13px] bg-white border rounded-lg placeholder-slate-300 outline-none transition ${!amountReceivedValid && amountReceived ? "border-red-300 focus:ring-red-100" : "border-slate-200 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"}`}/>
                    </div>
                    {!amountReceivedValid && amountReceived && (
                      <p className="text-[11px] text-red-500 mt-1">Must be at least PHP {discCalc.amountDue.toFixed(2)}</p>
                    )}
                  </div>
                  {amountReceived && amountReceivedValid && (
                    <div className="flex justify-between items-center pt-2 border-t border-slate-200">
                      <span className="text-[12px] text-slate-600">Change</span>
                      <span className="text-[16px] text-emerald-600 font-medium">PHP {change.toFixed(2)}</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Confirm */}
            <div className="border-t border-slate-100 px-5 py-4 space-y-2 flex-shrink-0">
              <button onClick={handleConfirmPayment} disabled={!canConfirm || saving}
                className="w-full bg-indigo-600 text-white text-[13px] py-2.5 rounded-xl hover:bg-indigo-700 disabled:opacity-30 disabled:cursor-not-allowed transition tracking-wide flex items-center justify-center gap-2">
                {saving ? (<><svg className="animate-spin" width="13" height="13" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8v4a4 4 0 0 0-4 4H4z"/></svg>Processing...</>) : `Confirm Payment · PHP ${discCalc.amountDue.toFixed(2)}`}
              </button>
              <button onClick={() => setStep("select")} className="w-full text-[11px] text-slate-400 hover:text-slate-600 py-1.5 transition">← Back to order</button>
            </div>
          </>
        )}
      </div>

      {/* ── QTY MODAL ── */}
      {step === "quantity" && currentItem && (
        <div className="fixed inset-0 bg-slate-900/30 backdrop-blur-sm flex items-center justify-center z-50" onClick={() => { setCurrentItem(null); setStep("select"); }}>
          <div className="bg-white rounded-2xl shadow-2xl shadow-slate-900/15 w-[300px] p-6" onClick={(e) => e.stopPropagation()}>
            <p className="text-[10px] text-slate-400 uppercase tracking-widest mb-1">{currentItem.category_name}</p>
            <h3 className="text-[15px] text-slate-800 mb-1">{currentItem.menu_name}</h3>
            <p className="text-[13px] text-indigo-600 mb-5">PHP {currentItem.price.toFixed(2)} per item</p>
            <div className="flex items-center justify-between bg-slate-50 rounded-xl p-1.5 mb-5 border border-slate-100">
              <button onClick={() => setQuantity((q) => Math.max(1, q - 1))} className="w-10 h-10 rounded-lg bg-white border border-slate-200 text-slate-600 text-lg flex items-center justify-center hover:bg-slate-100 transition shadow-sm">−</button>
              <span className="text-[20px] text-slate-800 font-medium w-14 text-center">{quantity}</span>
              <button onClick={() => setQuantity((q) => q + 1)} className="w-10 h-10 rounded-lg bg-white border border-slate-200 text-slate-600 text-lg flex items-center justify-center hover:bg-slate-100 transition shadow-sm">+</button>
            </div>
            <div className="flex gap-2">
              <button onClick={() => { setCurrentItem(null); setStep("select"); }} className="flex-1 py-2.5 rounded-xl border border-slate-200 text-[12px] text-slate-500 hover:bg-slate-50 transition">Cancel</button>
              <button onClick={submitQuantity} className="flex-[2] py-2.5 rounded-xl bg-indigo-600 text-white text-[13px] hover:bg-indigo-700 transition">Add · PHP {(currentItem.price * quantity).toFixed(2)}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}