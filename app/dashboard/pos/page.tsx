"use client";

import { Suspense, useState, useEffect, useRef } from "react";
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
  grab_price:    number | null;
  branch_id:     number;
  availability:  number | null;
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
type DiscountType   = "Senior" | "PWD" | "Custom";
interface DiscountRow { id: number; type: DiscountType; count: string; customRate: string; }
type OrderType      = "Dine In" | "Take Out" | "Grab";
type OrderCategory  = "official" | "others";
// OrModalState: false = closed | "yesno" = ask OS/OR | "slip" = enter slip no | "credit" = credit/debit slip
type OrModalState   = false | "yesno" | "slip" | "credit";

// ── Split payment ─────────────────────────────────────────────────────────────
type PaymentMethodLabel = "Cash" | "E-Wallet" | "Bank Transfer" | "Credit / Debit";

interface SplitEntry {
  method: PaymentMethodLabel | "";
  amount: string; // string for controlled input
}

const EMPTY_SPLIT: [SplitEntry, SplitEntry] = [
  { method: "", amount: "" },
  { method: "", amount: "" },
];

// Returns true if either split method is Credit/Debit — forces automatic OR
const splitHasCard = (entries: [SplitEntry, SplitEntry]): boolean =>
  entries.some((e) => e.method === "Credit / Debit");

// Returns true if either split method is Cash or Bank Transfer — used for
// OR/OS question logic. Mirrors single-payment behaviour for those methods.
const splitNeedsOrOsQuestion = (entries: [SplitEntry, SplitEntry]): boolean =>
  !splitHasCard(entries) &&
  entries.some((e) => e.method === "Cash" || e.method === "Bank Transfer");

const STEAK_CATEGORY_ID = 1;

const isSteakSoldOut = (item: MenuItem): boolean =>
  item.category_id === STEAK_CATEGORY_ID && item.availability === 0;

const getItemPrice = (item: MenuItem, orderType: OrderType): number =>
  orderType === "Grab" && item.grab_price != null
    ? Number(item.grab_price)
    : Number(item.price);

function calcMultiDiscount(totalBill: number, headcount: number, rows: DiscountRow[]) {
  if (headcount <= 0) return { perPerson: 0, rows: [], totalDiscount: 0, amountDue: totalBill, discountedPeopleTotal: 0 };
  const perPerson = totalBill / headcount;
  let totalDiscountedPax = 0;
  const rowResults: { id: number; rowDiscount: number }[] = [];
  for (const row of rows) {
    const count = parseInt(row.count) || 0;
    const rate  = row.type === "PWD" ? 0.80 : row.type === "Senior" ? 0.80 : ((100 - (parseFloat(row.customRate) || 0)) / 100);
    const rowDiscountedAmount = row.type === "Custom"
      ? perPerson * rate * count
      : (perPerson / 1.12) * rate * count;
    const rowFullAmount = perPerson * count;
    const rowDiscount = rowFullAmount - rowDiscountedAmount;
    totalDiscountedPax += count;
    rowResults.push({ id: row.id, rowDiscount });
  }
  const remainingPax          = headcount - totalDiscountedPax;
  const fullPricedAmount      = perPerson * remainingPax;
  const discountedPortionsSum = rowResults.reduce((sum, r) => {
    const row   = rows.find((ro) => ro.id === r.id)!;
    const count = parseInt(row.count) || 0;
    const rate  = row.type === "PWD" ? 0.80 : row.type === "Senior" ? 0.80 : ((100 - (parseFloat(row.customRate) || 0)) / 100);
    return sum + (row.type === "Custom"
      ? perPerson * rate * count
      : (perPerson / 1.12) * rate * count);
  }, 0);
  const totalDiscountedBill = discountedPortionsSum + fullPricedAmount;
  const totalDiscount       = totalBill - totalDiscountedBill;
  return {
    perPerson,
    rows:                  rowResults,
    totalDiscount:         Math.max(0, totalDiscount),
    amountDue:             Math.max(0, totalDiscountedBill),
    discountedPeopleTotal: totalDiscountedPax,
  };
}

const API = "http://localhost:5000";
const authHeader = (token: string | undefined) => ({ Authorization: `Bearer ${token}` });
const TABLE_KEY  = (id: string | number) => `table:${id}`;
const saveTableNumber = (orderId: string | number, num: string) => {
  if (num.trim()) localStorage.setItem(TABLE_KEY(orderId), num.trim());
  else            localStorage.removeItem(TABLE_KEY(orderId));
};

const PAYMENT_METHODS: { label: PaymentMethodLabel; d: string }[] = [
  { label: "Cash",           d: "M17 9V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2m2 4h10a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2H9a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2zm7-5a2 2 0 1 1-4 0 2 2 0 0 1 4 0z" },
  { label: "E-Wallet",       d: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" },
  { label: "Bank Transfer",  d: "M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM9 22V12h6v10" },
  { label: "Credit / Debit", d: "M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 0 0 3-3V8a3 3 0 0 0-3-3H6a3 3 0 0 0-3 3v8a3 3 0 0 0 3 3z" },
];

const UPDATE_PASSWORD = "ksuchange321";

function UpdatePasswordModal({ onSuccess, onCancel }: { onSuccess: () => void; onCancel: () => void }) {
  const [input, setInput]     = useState("");
  const [error, setError]     = useState(false);
  const [shaking, setShaking] = useState(false);
  const inputRef              = useRef<HTMLInputElement>(null);
  useEffect(() => { inputRef.current?.focus(); }, []);
  const handleSubmit = () => {
    if (input === UPDATE_PASSWORD) { onSuccess(); }
    else {
      setError(true); setShaking(true); setInput("");
      setTimeout(() => setShaking(false), 400);
      inputRef.current?.focus();
    }
  };
  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl shadow-2xl shadow-slate-900/15 w-[320px] p-6"
        style={shaking ? { animation: "shake 0.4s ease-in-out" } : {}}>
        <h3 className="text-[14px] text-slate-800 mb-1">Enter Password</h3>
        <p className="text-[12px] text-slate-500 mb-4">A password is required to update this order.</p>
        <input ref={inputRef} type="password" placeholder="Password" value={input}
          onChange={(e) => { setInput(e.target.value); setError(false); }}
          onKeyDown={(e) => { if (e.key === "Enter") handleSubmit(); if (e.key === "Escape") onCancel(); }}
          className={`w-full px-3 py-2 text-[13px] bg-slate-50 border rounded-lg placeholder-slate-300 text-slate-700 outline-none transition mb-1 ${
            error ? "border-red-300 focus:border-red-400 focus:ring-2 focus:ring-red-100"
                  : "border-slate-200 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"}`}/>
        {error && <p className="text-[11px] text-red-500 mb-3">Incorrect password. Please try again.</p>}
        {!error && <div className="mb-3" />}
        <div className="flex gap-2">
          <button onClick={onCancel} className="flex-1 py-2.5 rounded-xl border border-slate-200 text-[12px] text-slate-600 hover:bg-slate-50 transition">Cancel</button>
          <button onClick={handleSubmit} disabled={!input.trim()}
            className="flex-[2] py-2.5 rounded-xl bg-indigo-600 text-white text-[13px] hover:bg-indigo-700 disabled:opacity-30 disabled:cursor-not-allowed transition">Confirm</button>
        </div>
      </div>
      <style>{`@keyframes shake { 0%,100%{transform:translateX(0)} 20%{transform:translateX(-6px)} 40%{transform:translateX(6px)} 60%{transform:translateX(-4px)} 80%{transform:translateX(4px)} }`}</style>
    </div>
  );
}

// ── Split Payment UI ──────────────────────────────────────────────────────────
function SplitPaymentPanel({
  entries,
  amountDue,
  onChange,
}: {
  entries: [SplitEntry, SplitEntry];
  amountDue: number;
  onChange: (updated: [SplitEntry, SplitEntry]) => void;
}) {
  const updateEntry = (idx: 0 | 1, patch: Partial<SplitEntry>) => {
    const next: [SplitEntry, SplitEntry] = [{ ...entries[0] }, { ...entries[1] }];
    next[idx] = { ...next[idx], ...patch };
    onChange(next);
  };

  const sum    = (parseFloat(entries[0].amount) || 0) + (parseFloat(entries[1].amount) || 0);
  const sumOk  = Math.abs(sum - amountDue) < 0.01;
  const sumErr = entries[0].amount !== "" && entries[1].amount !== "" && !sumOk;

  // Each selector should exclude the method already chosen by the other entry
  const otherMethod = (idx: 0 | 1) => entries[idx === 0 ? 1 : 0].method;

  return (
    <div className="space-y-3">
      {([0, 1] as const).map((idx) => {
        const entry      = entries[idx];
        const amtInvalid = entry.amount !== "" && (parseFloat(entry.amount) || 0) <= 0;
        return (
          <div key={idx} className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-2.5">
            <p className="text-[10px] text-slate-400 uppercase tracking-widest">Payment {idx + 1}</p>

            {/* Method selector */}
            <div>
              <label className="text-[11px] text-slate-500 block mb-1">Method</label>
              <div className="grid grid-cols-2 gap-1.5">
                {PAYMENT_METHODS.map((m) => {
                  const isChosen  = entry.method === m.label;
                  const isBlocked = otherMethod(idx) === m.label;
                  return (
                    <button
                      key={m.label}
                      disabled={isBlocked}
                      onClick={() => updateEntry(idx, { method: m.label })}
                      className={`flex items-center gap-2 px-2.5 py-2 rounded-lg border text-[11px] transition-all text-left ${
                        isChosen
                          ? "border-indigo-300 bg-indigo-50 text-indigo-700"
                          : isBlocked
                          ? "border-slate-100 bg-slate-50 text-slate-300 cursor-not-allowed opacity-50"
                          : "border-slate-200 text-slate-500 hover:border-slate-300 hover:bg-white"
                      }`}>
                      <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.75"
                        strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                        <path d={m.d}/>
                      </svg>
                      {m.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Amount input */}
            <div>
              <label className="text-[11px] text-slate-500 block mb-1">Amount (PHP)</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[12px] text-slate-400">₱</span>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  placeholder="0.00"
                  value={entry.amount}
                  onChange={(e) => updateEntry(idx, { amount: e.target.value })}
                  className={`w-full pl-7 pr-3 py-2 text-[13px] bg-white border rounded-lg placeholder-slate-300 outline-none transition ${
                    amtInvalid
                      ? "border-red-300 focus:ring-2 focus:ring-red-100"
                      : "border-slate-200 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                  }`}
                />
              </div>
            </div>
          </div>
        );
      })}

      {/* Running total validation */}
      <div className={`flex justify-between items-center px-3 py-2 rounded-lg border text-[12px] transition-colors ${
        sumErr
          ? "bg-red-50 border-red-100 text-red-600"
          : sumOk && sum > 0
          ? "bg-emerald-50 border-emerald-100 text-emerald-700"
          : "bg-slate-50 border-slate-100 text-slate-500"
      }`}>
        <span>Total entered</span>
        <span className="font-medium">
          PHP {sum.toFixed(2)}
          {sumErr && ` · needs PHP ${amountDue.toFixed(2)}`}
          {sumOk && sum > 0 && " ✓"}
        </span>
      </div>
    </div>
  );
}

// ── Main POS component ────────────────────────────────────────────────────────
function POSContent() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const orderId      = searchParams.get("order_id");
  const isExisting   = !!orderId;

  const { user, branch } = useSession();

  const [menuItems, setMenuItems]               = useState<MenuItem[]>([]);
  const [categories, setCategories]             = useState<Category[]>([]);
  const [filteredMenu, setFilteredMenu]         = useState<MenuItem[]>([]);
  const [search, setSearch]                     = useState("");
  const [selectedCategory, setSelectedCategory] = useState<number | null>(null);

  const [orders, setOrders]             = useState<OrderItem[]>([]);
  const [currentItem, setCurrentItem]   = useState<MenuItem | null>(null);
  const [quantity, setQuantity]         = useState(1);
  const [orderType, setOrderType]       = useState<OrderType>("Dine In");
  const [step, setStep]                 = useState<"select" | "quantity" | "checkout">("select");
  const [loadingOrder, setLoadingOrder] = useState(isExisting);
  const [saving, setSaving]             = useState(false);

  const [orderCategory]               = useState<OrderCategory>("others");
  const [pax, setPax]                 = useState("");
  const [osNum, setOsNum]             = useState("");
  const [paymentMethod, setPaymentMethod]   = useState<PaymentMethodLabel>("Cash");
  const [amountReceived, setAmountReceived] = useState("");
  const [headcount, setHeadcount]           = useState("");
  const [tableNumber, setTableNumber]       = useState("");
  const [discountRows, setDiscountRows]     = useState<DiscountRow[]>([]);
  const [nextRowId, setNextRowId]           = useState(1);
  const [showOrModal, setShowOrModal]       = useState<OrModalState>(false);
  const [orSlipNumber, setOrSlipNumber]     = useState("");
  const [existingCategory, setExistingCategory] = useState<OrderCategory | null>(null);
  const [existingPax, setExistingPax]           = useState<number | null>(null);
  const [originalOrderSnapshot, setOriginalOrderSnapshot] = useState<{ menu_id: number; quantity: number }[]>([]);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [showCategoryMenu, setShowCategoryMenu]   = useState(false);

  // ── Split payment state ────────────────────────────────────────────────────
  const [isSplitPayment, setIsSplitPayment]   = useState(false);
  const [splitEntries, setSplitEntries]       = useState<[SplitEntry, SplitEntry]>(EMPTY_SPLIT);

  const totalBill           = orders.reduce((s, o) => s + o.subtotal, 0);
  const hc                  = parseInt(headcount) || 0;
  const discCalc            = calcMultiDiscount(totalBill, hc, discountRows);
  const discountedOverLimit = hc > 0 && discCalc.discountedPeopleTotal > hc;
  const discountValid       = !discountedOverLimit;

  // Split-specific derived values
  const splitSum   = (parseFloat(splitEntries[0].amount) || 0) + (parseFloat(splitEntries[1].amount) || 0);
  const splitSumOk = Math.abs(splitSum - discCalc.amountDue) < 0.01;
  const splitMethodsSelected = splitEntries[0].method !== "" && splitEntries[1].method !== "";

  // Single payment amount validation — exact match required (no change)
  const amountReceivedNum   = parseFloat(amountReceived);
  const amountReceivedValid = paymentMethod !== "Cash"
    ? true
    : amountReceived !== "" && Math.abs(amountReceivedNum - discCalc.amountDue) < 0.01;

  const canConfirm = isSplitPayment
    ? splitSumOk && splitMethodsSelected && discountValid
    : amountReceivedValid && discountValid;

  const allServed  = orders.length > 0 && orders.every((o) => o.served);
  const itemCount  = orders.reduce((s, o) => s + o.quantity, 0);

  // Toggle split: reset all payment-related state on mode switch
  const handleToggleSplit = (enable: boolean) => {
    setIsSplitPayment(enable);
    setSplitEntries(EMPTY_SPLIT);
    setPaymentMethod("Cash");
    setAmountReceived("");
  };

  const hasOrderContentChanged = (): boolean => {
    if (orders.length !== originalOrderSnapshot.length) return true;
    const current  = [...orders].sort((a, b) => a.menu_id - b.menu_id);
    const original = [...originalOrderSnapshot].sort((a, b) => a.menu_id - b.menu_id);
    return current.some((item, i) =>
      item.menu_id !== original[i].menu_id || item.quantity !== original[i].quantity
    );
  };

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

  useEffect(() => {
    if (!orderId || !user) return;
    (async () => {
      try {
        const res  = await axios.get(`${API}/orders/${orderId}`, { headers: authHeader(user.token) });
        const data = res.data.data;
        const loadedItems: OrderItem[] = data.items.map((i: any) => ({
          localId:       `db-${i.order_item_id}`,
          order_item_id: i.order_item_id,
          menu_id:       i.menu_id,
          menu_name:     i.menu_name,
          price:         Number(i.price_at_time),
          quantity:      i.quantity,
          subtotal:      Number(i.price_at_time) * i.quantity,
          served:        i.served,
        }));
        setOrders(loadedItems);
        setOriginalOrderSnapshot(loadedItems.map((i) => ({ menu_id: i.menu_id, quantity: i.quantity })));
        setPaymentMethod(data.order_payment_method || "Cash");
        setExistingCategory(data.category ?? null);
        setExistingPax(data.pax ?? null);
        if (data.pax) setHeadcount(String(data.pax));
        const saved = localStorage.getItem(TABLE_KEY(orderId));
        if (saved) setTableNumber(saved);
      } catch (e) { console.error("Failed to fetch order:", e); }
      finally { setLoadingOrder(false); }
    })();
  }, [orderId, user]);

  useEffect(() => {
    let f = menuItems;
    if (orderType === "Grab") f = f.filter((i) => i.grab_price != null);
    if (selectedCategory) f = f.filter((i) => i.category_id === selectedCategory);
    if (search) f = f.filter((i) => i.menu_name.toLowerCase().includes(search.toLowerCase()));
    setFilteredMenu(f);
  }, [search, selectedCategory, menuItems, orderType]);

  const selectItem = (item: MenuItem) => {
    if (isSteakSoldOut(item)) return;
    setCurrentItem(item);
    setQuantity(1);
    setStep("quantity");
  };

  const submitQuantity = () => {
    if (!currentItem) return;
    const priceToUse = getItemPrice(currentItem, orderType);
    setOrders((prev) => {
      const ex = prev.find((o) => o.menu_id === currentItem.menu_id);
      if (ex) return prev.map((o) =>
        o.menu_id === currentItem.menu_id
          ? { ...o, quantity: o.quantity + quantity, subtotal: (o.quantity + quantity) * priceToUse }
          : o
      );
      return [...prev, {
        localId:   `new-${currentItem.menu_id}-${Date.now()}`,
        menu_id:   currentItem.menu_id,
        menu_name: currentItem.menu_name,
        price:     priceToUse,
        quantity,
        subtotal:  quantity * priceToUse,
        served:    false,
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

  const removeItem   = (localId: string) => setOrders((p) => p.filter((o) => o.localId !== localId));
  const toggleServed = (localId: string) =>
    setOrders((prev) => prev.map((o) => o.localId === localId ? { ...o, served: !o.served } : o));

  const addDiscountRow = () => {
    if (hc === 0) return;
    setDiscountRows((p) => [...p, { id: nextRowId, type: "Senior", count: "1", customRate: "" }]);
    setNextRowId((n) => n + 1);
  };
  const updateDiscountRow = (id: number, patch: Partial<DiscountRow>) =>
    setDiscountRows((p) => p.map((r) => r.id === id ? { ...r, ...patch } : r));
  const removeDiscountRow = (id: number) =>
    setDiscountRows((p) => p.filter((r) => r.id !== id));

  const buildItemsPayload = () =>
    orders.map((o) => ({
      menu_id:  o.menu_id,
      quantity: o.quantity,
      ...(o.order_item_id ? { order_item_id: o.order_item_id, served: o.served } : {}),
    }));

  const decrementSteakAvailability = async (items: { menu_id: number; quantity: number }[]) => {
    if (!user || !branch) return;
    const steakItems = items.filter((item) => {
      const menuItem = menuItems.find((m) => m.menu_id === item.menu_id);
      return menuItem?.category_id === STEAK_CATEGORY_ID;
    });
    if (steakItems.length === 0) return;
    await Promise.allSettled(
      steakItems.map((item) => {
        const menuItem = menuItems.find((m) => m.menu_id === item.menu_id);
        const current  = menuItem?.availability ?? 0;
        const next     = Math.max(0, current - item.quantity);
        return axios
          .patch(`${API}/menu/${item.menu_id}/availability`,
            { availability: next, branch_id: branch.branch_id },
            { headers: authHeader(user.token) })
          .then(() => {
            setMenuItems((prev) =>
              prev.map((m) => m.menu_id === item.menu_id ? { ...m, availability: next } : m)
            );
          })
          .catch((e) => console.error(`Failed to decrement availability for menu_id ${item.menu_id}:`, e));
      })
    );
  };

  const getSteakQuantityDeltas = (): { menu_id: number; quantity: number }[] => {
    const deltas: { menu_id: number; quantity: number }[] = [];
    for (const order of orders) {
      const menuItem = menuItems.find((m) => m.menu_id === order.menu_id);
      if (menuItem?.category_id !== STEAK_CATEGORY_ID) continue;
      const original = originalOrderSnapshot.find((s) => s.menu_id === order.menu_id);
      const prevQty  = original?.quantity ?? 0;
      const delta    = order.quantity - prevQty;
      if (delta > 0) deltas.push({ menu_id: order.menu_id, quantity: delta });
    }
    return deltas;
  };

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
          category:       orderCategory,
          pax:            pax ? parseInt(pax) : null,
          items:          orders.map((o) => ({ menu_id: o.menu_id, quantity: o.quantity })),
        },
        { headers: authHeader(user.token) }
      );
      const newOrderId = res.data.data?.order_id ?? res.data.order_id;
      if (newOrderId && orderType === "Dine In") saveTableNumber(newOrderId, tableNumber);
      await decrementSteakAvailability(orders.map((o) => ({ menu_id: o.menu_id, quantity: o.quantity })));
      router.push("/dashboard");
    } catch (e) { console.error("Failed to place order:", e); }
    finally { setSaving(false); }
  };

  const handleUpdateOrder = async () => {
    if (!orderId || !user) return;
    setSaving(true);
    try {
      await axios.put(`${API}/orders/${orderId}`,
        { payment_method: paymentMethod, items: buildItemsPayload() },
        { headers: authHeader(user.token) });
      saveTableNumber(orderId, tableNumber);
      const deltas = getSteakQuantityDeltas();
      if (deltas.length > 0) await decrementSteakAvailability(deltas);
      router.push("/dashboard");
    } catch (e) { console.error("Failed to update order:", e); }
    finally { setSaving(false); }
  };

  const handleUpdateOrderClick = () => {
    if (hasOrderContentChanged()) setShowPasswordModal(true);
    else handleUpdateOrder();
  };
  const handlePasswordSuccess = () => { setShowPasswordModal(false); handleUpdateOrder(); };
  const handlePasswordCancel  = () => setShowPasswordModal(false);

  // ── Payment execution ──────────────────────────────────────────────────────
  // Handles both single and split payment. The `splitPayments` arg is only
  // present when isSplitPayment is true; otherwise the single-payment path runs.

  const _executePayment = async (
    finalCategory: OrderCategory | null,
    slipOsNum: number | null = null,
    splitPayments?: { method: string; amount: number }[]
  ) => {
    if (!orderId || !user) return;
    setSaving(true);
    try {
      // Always sync items first (update order)
      await axios.put(`${API}/orders/${orderId}`,
        { payment_method: isSplitPayment ? splitEntries[0].method : paymentMethod, items: buildItemsPayload() },
        { headers: authHeader(user.token) });

      const paxToSend = hc > 0 ? hc : existingPax !== null ? existingPax : undefined;

      if (splitPayments && splitPayments.length === 2) {
        // Split payment path
        await axios.patch(`${API}/orders/${orderId}/pay`,
          {
            payments:       splitPayments,
            total_bill:     discCalc.amountDue,
            total_discount: discCalc.totalDiscount,
            ...(finalCategory      ? { category: finalCategory } : {}),
            ...(slipOsNum !== null ? { os_num: slipOsNum }       : {}),
            ...(paxToSend !== undefined ? { pax: paxToSend }     : {}),
          },
          { headers: authHeader(user.token) });
      } else {
        // Single payment path (unchanged)
        await axios.patch(`${API}/orders/${orderId}/pay`,
          {
            payment_method: paymentMethod,
            total_bill:     totalBill,
            total_discount: discCalc.totalDiscount,
            ...(finalCategory      ? { category: finalCategory } : {}),
            ...(slipOsNum !== null ? { os_num: slipOsNum }       : {}),
            ...(paxToSend !== undefined ? { pax: paxToSend }     : {}),
          },
          { headers: authHeader(user.token) });
      }

      localStorage.removeItem(TABLE_KEY(orderId));
      router.push("/dashboard");
    } catch (e) { console.error("Failed to confirm payment:", e); }
    finally { setSaving(false); }
  };

  // ── OR/OS routing logic ────────────────────────────────────────────────────
  // Determines which modal flow to enter based on payment method(s).
  //
  // Split rules:
  //   - Any Credit/Debit in split → automatic OR, go straight to slip entry
  //   - Otherwise (Cash/BankTransfer mix) → ask yesno
  //
  // Single rules (unchanged):
  //   - Credit/Debit → automatic OR (credit modal)
  //   - Cash / E-Wallet / Bank Transfer → ask yesno

  const handleConfirmPayment = async () => {
    if (!orderId || !canConfirm || !user) return;

    const cat = existingCategory;

    // Already official — pay immediately, no OR/OS question
    if (cat === "official") {
      if (isSplitPayment) {
        await _executePayment(null, null, [
          { method: splitEntries[0].method, amount: parseFloat(splitEntries[0].amount) },
          { method: splitEntries[1].method, amount: parseFloat(splitEntries[1].amount) },
        ]);
      } else {
        await _executePayment(null);
      }
      return;
    }

    // "others" category — determine OR/OS flow
    if (isSplitPayment) {
      if (splitHasCard(splitEntries)) {
        // Credit/Debit in split → automatic OR, enter slip number
        setOrSlipNumber("");
        setShowOrModal("credit");
      } else {
        // Cash/BankTransfer only in split → ask yesno
        setOrSlipNumber("");
        setShowOrModal("yesno");
      }
    } else {
      // Single payment — original logic preserved exactly
      if (paymentMethod === "Credit / Debit") {
        setOrSlipNumber("");
        setShowOrModal("credit");
        return;
      }
      if (["Cash", "E-Wallet", "Bank Transfer"].includes(paymentMethod)) {
        setOrSlipNumber("");
        setShowOrModal("yesno");
        return;
      }
      await _executePayment(null);
    }
  };

  // OR/OS modal handlers — pass splitPayments when in split mode
  const handleOrNo = async () => {
    setShowOrModal(false);
    if (isSplitPayment) {
      await _executePayment(null, null, [
        { method: splitEntries[0].method, amount: parseFloat(splitEntries[0].amount) },
        { method: splitEntries[1].method, amount: parseFloat(splitEntries[1].amount) },
      ]);
    } else {
      await _executePayment(null, null);
    }
  };

  const handleOrYes = () => { setShowOrModal("slip"); };

  const handleOrSlipConfirm = async () => {
    const parsedSlip = parseInt(orSlipNumber.trim());
    if (!parsedSlip || parsedSlip < 1) return;
    setShowOrModal(false);
    if (isSplitPayment) {
      await _executePayment("official", parsedSlip, [
        { method: splitEntries[0].method, amount: parseFloat(splitEntries[0].amount) },
        { method: splitEntries[1].method, amount: parseFloat(splitEntries[1].amount) },
      ]);
    } else {
      await _executePayment("official", parsedSlip);
    }
  };

  const handleCancel = async () => {
    if (!orderId || !user || !confirm("Cancel this order?")) return;
    try {
      await axios.patch(`${API}/orders/${orderId}/cancel`, {}, { headers: authHeader(user.token) });
      localStorage.removeItem(TABLE_KEY(orderId));
      router.push("/dashboard");
    } catch (e) { console.error("Failed to cancel order:", e); }
  };

  const canPlaceOrder =
    orders.length > 0 &&
    !saving &&
    !!osNum &&
    (orderType !== "Dine In" || !!tableNumber);

  const now     = new Date();
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
          <div className="relative flex items-center gap-2 flex-1 max-w-[320px]">
            <div className="relative flex-1">
              <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
              <input type="text" placeholder="Search items..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-full pl-8 pr-3 py-1.5 text-[13px] bg-slate-50 border border-slate-200 rounded-lg placeholder-slate-400 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition"/>
            </div>
            <div className="relative flex-shrink-0">
              <button onClick={() => setShowCategoryMenu((p) => !p)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-[12px] font-medium transition-all ${
                  selectedCategory !== null
                    ? "bg-indigo-600 border-indigo-600 text-white shadow-sm shadow-indigo-200"
                    : "bg-white border-slate-200 text-slate-600 hover:border-indigo-300 hover:text-indigo-600 hover:bg-indigo-50"}`}>
                <svg width="13" height="13" fill={selectedCategory !== null ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
                <span>{selectedCategory !== null ? categories.find((c) => c.id === selectedCategory)?.category_name ?? "Category" : "Category"}</span>
                <svg width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" viewBox="0 0 24 24" className={`transition-transform ${showCategoryMenu ? "rotate-180" : ""}`}><path d="m6 9 6 6 6-6"/></svg>
                {selectedCategory !== null && <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-amber-400 border border-white" />}
              </button>
              {showCategoryMenu && (
                <>
                  <div className="fixed inset-0 z-20" onClick={() => setShowCategoryMenu(false)} />
                  <div className="absolute left-0 top-full mt-2 z-30 bg-white border border-slate-200 rounded-xl shadow-xl shadow-slate-900/10 py-1.5 min-w-[180px] overflow-hidden">
                    <p className="px-3.5 pb-1.5 pt-0.5 text-[10px] text-slate-400 uppercase tracking-wider border-b border-slate-100 mb-1">Filter by category</p>
                    {[{ id: null, category_name: "All Items" }, ...categories].map((cat) => (
                      <button key={cat.id ?? "all"} onClick={() => { setSelectedCategory(cat.id); setShowCategoryMenu(false); }}
                        className={`w-full flex items-center justify-between gap-3 px-3.5 py-2.5 text-[12px] text-left transition-colors ${
                          selectedCategory === cat.id ? "bg-indigo-50 text-indigo-600 font-medium" : "text-slate-600 hover:bg-slate-50"}`}>
                        <span>{cat.category_name}</span>
                        {selectedCategory === cat.id && <svg width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5"/></svg>}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
          <div className="ml-auto flex items-center gap-3">
            {isExisting && (
              <button onClick={handleCancel} className="text-[11px] text-red-400 hover:text-red-600 border border-red-100 hover:border-red-200 bg-red-50 px-2.5 py-1 rounded-lg transition-colors">Cancel Order</button>
            )}
            <div className="flex items-center gap-1.5 bg-slate-100 px-2.5 py-1 rounded-full">
              <svg width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" className="text-slate-400"><path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/></svg>
              <span className="text-[11px] text-slate-600">{branch.branch_name}</span>
              <span className="text-slate-300">·</span>
              <span className="text-[11px] text-slate-400">{user.full_name}</span>
            </div>
          </div>
        </header>

        {/* Menu grid */}
        <div className="flex-1 overflow-y-auto p-5" style={{ scrollbarWidth: "thin", scrollbarColor: "#e2e8f0 transparent" }}>
          {filteredMenu.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-slate-300">
              <svg width="34" height="34" fill="none" stroke="currentColor" strokeWidth="1.25" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
              <p className="text-sm">No items found for {branch.branch_name}</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
              {filteredMenu.map((item) => {
                const soldOut     = isSteakSoldOut(item);
                const priceToShow = getItemPrice(item, orderType);
                return (
                  <button key={item.menu_id} onClick={() => selectItem(item)} disabled={soldOut}
                    title={soldOut ? "Sold out" : undefined}
                    className={`group border rounded-xl p-4 text-left transition-all duration-150 ${
                      soldOut
                        ? "bg-slate-50 border-slate-200 opacity-50 cursor-not-allowed"
                        : "bg-white border-slate-200 hover:border-indigo-300 hover:shadow-md hover:shadow-indigo-100/50 active:scale-[0.97]"}`}>
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center mb-3 transition-colors ${soldOut ? "bg-slate-100" : "bg-slate-100 group-hover:bg-indigo-50"}`}>
                      <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"
                        className={`transition-colors ${soldOut ? "text-slate-300" : "text-slate-400 group-hover:text-indigo-500"}`}>
                        <path d="M18 8h1a4 4 0 0 1 0 8h-1M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8zM6 1v3M10 1v3M14 1v3"/>
                      </svg>
                    </div>
                    <p className="text-[10px] text-slate-400 uppercase tracking-wide mb-1">{item.category_name}</p>
                    <p className={`text-[13px] leading-snug mb-2 line-clamp-2 ${soldOut ? "text-slate-400" : "text-slate-700"}`}>{item.menu_name}</p>
                    {soldOut ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] bg-red-50 text-red-400 border border-red-100">Sold out</span>
                    ) : (
                      <div className="flex items-center justify-between">
                        <p className="text-[15px] text-slate-900 font-medium">
                          PHP {priceToShow.toFixed(2)}
                          {orderType === "Grab" && item.grab_price != null && (
                            <span className="ml-1.5 text-[10px] text-orange-400 font-normal">grab</span>
                          )}
                        </p>
                        {item.category_id === STEAK_CATEGORY_ID && item.availability != null && item.availability > 0 && (
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                            item.availability <= 3
                              ? "bg-amber-50 text-amber-500 border border-amber-100"
                              : "bg-emerald-50 text-emerald-500 border border-emerald-100"}`}>
                            {item.availability} left
                          </span>
                        )}
                      </div>
                    )}
                  </button>
                );
              })}
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
                  <div className="flex gap-1.5 mb-3">
                    {(["Dine In", "Take Out", "Grab"] as const).map((t) => (
                      <button key={t}
                        onClick={() => {
                          setOrderType(t);
                          if (t !== "Dine In") setTableNumber("");
                          if (orders.length > 0) setOrders([]);
                        }}
                        className={`flex-1 py-1.5 rounded-lg text-[11px] border transition-all ${
                          orderType === t
                            ? t === "Grab"
                              ? "bg-orange-500 border-orange-500 text-white"
                              : "bg-indigo-600 border-indigo-600 text-white"
                            : "bg-slate-50 border-slate-200 text-slate-500 hover:border-slate-300"}`}>
                        {t}
                      </button>
                    ))}
                  </div>

                  {orderType === "Grab" && (
                    <div className="flex items-center gap-2 bg-orange-50 border border-orange-100 rounded-lg px-3 py-2 mb-3">
                      <svg width="13" height="13" fill="none" stroke="#f97316" strokeWidth="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                      <p className="text-[11px] text-orange-700">Grab prices are applied to all items.</p>
                    </div>
                  )}

                  <div className="mb-3">
                    <label className="text-[10px] text-slate-400 uppercase tracking-widest block mb-1.5">
                      No. of Pax <span className="normal-case text-slate-300">(optional)</span>
                    </label>
                    <input type="number" min="1" placeholder="e.g. 4" value={pax} onChange={(e) => setPax(e.target.value)}
                      className="w-full px-3 py-2 text-[13px] bg-slate-50 border border-slate-200 rounded-lg placeholder-slate-300 text-slate-700 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition"/>
                  </div>

                  {orderType === "Dine In" && (
                    <div className="mb-3">
                      <label className="text-[10px] text-slate-400 uppercase tracking-widest block mb-1.5">
                        Table No. <span className="normal-case text-red-400">*</span>
                      </label>
                      <div className="relative">
                        <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M3 10h18M3 14h18M10 4v16M14 4v16"/></svg>
                        <input type="number" min="1" placeholder="e.g. 5" value={tableNumber} onChange={(e) => setTableNumber(e.target.value)}
                          className="w-full pl-8 pr-3 py-2 text-[13px] bg-slate-50 border border-slate-200 rounded-lg placeholder-slate-300 text-slate-700 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition"/>
                      </div>
                    </div>
                  )}
                </>
              )}

              {isExisting && (
                <div className="mt-2">
                  <label className="text-[10px] text-slate-400 uppercase tracking-widest block mb-1.5">
                    Table No. <span className="normal-case text-red-400">*</span>
                  </label>
                  <div className="relative">
                    <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M3 10h18M3 14h18M10 4v16M14 4v16"/></svg>
                    <input type="number" min="1" placeholder="e.g. 5" value={tableNumber} onChange={(e) => setTableNumber(e.target.value)}
                      className="w-full pl-8 pr-3 py-2 text-[13px] bg-slate-50 border border-slate-200 rounded-lg placeholder-slate-300 text-slate-700 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition"/>
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
                          <input type="checkbox" checked={order.served} onChange={() => toggleServed(order.localId)} className="accent-emerald-500 w-3.5 h-3.5 flex-shrink-0"/>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className={`text-[12px] truncate ${order.served ? "text-emerald-600" : "text-slate-700"}`}>{order.menu_name}</p>
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
                  <button onClick={handleUpdateOrderClick} disabled={saving}
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
                      Order Slip No. <span className="normal-case text-red-400">*</span>
                    </label>
                    <div className="relative">
                      <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2"/></svg>
                      <input type="number" min="1" placeholder="e.g. 42" value={osNum} onChange={(e) => setOsNum(e.target.value)}
                        className="w-full pl-8 pr-3 py-2 text-[13px] bg-slate-50 border border-slate-200 rounded-lg placeholder-slate-300 text-slate-700 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition"/>
                    </div>
                  </div>
                  <button onClick={handlePlaceOrder} disabled={!canPlaceOrder}
                    className="w-full bg-indigo-600 text-white text-[13px] py-2.5 rounded-xl hover:bg-indigo-700 disabled:opacity-30 disabled:cursor-not-allowed transition tracking-wide flex items-center justify-center gap-2">
                    {saving
                      ? (<><svg className="animate-spin" width="13" height="13" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8v4a4 4 0 0 0-4 4H4z"/></svg>Placing...</>)
                      : "Place Order"}
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
              <div>
                <h2 className="text-[13px] text-slate-700">Payment</h2>
                <p className="text-[11px] text-slate-400">Apply discounts & confirm</p>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5" style={{ scrollbarWidth: "thin" }}>
              {/* Order summary */}
              <div className="bg-slate-50 rounded-xl border border-slate-100 overflow-hidden">
                {orders.map((order) => (
                  <div key={order.localId} className="px-4 py-2.5 flex justify-between items-center border-b border-slate-100 last:border-0">
                    <div>
                      <p className="text-[12px] text-slate-700">{order.menu_name}</p>
                      <p className="text-[11px] text-slate-400">×{order.quantity}</p>
                    </div>
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
                  <label className="text-[11px] text-slate-500 block mb-1.5">
                    No. of Pax
                    <span className="ml-1 text-slate-400 font-normal">(edits will update the record)</span>
                  </label>
                  <input type="number" min="1" placeholder="e.g. 4" value={headcount}
                    onChange={(e) => { setHeadcount(e.target.value); setDiscountRows([]); }}
                    className="w-full px-3 py-2 text-[13px] bg-white border border-slate-200 rounded-lg placeholder-slate-300 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition"/>
                  {hc > 0 && (
                    <p className="text-[11px] text-slate-400 mt-1">
                      Share per person: <span className="text-slate-600">PHP {discCalc.perPerson.toFixed(2)}</span>
                    </p>
                  )}
                </div>

                {discountRows.length > 0 && (
                  <div className="space-y-2 mb-3">
                    {discountRows.map((row, idx) => {
                      const rowResult     = discCalc.rows.find((r) => r.id === row.id);
                      const rowDiscount   = rowResult?.rowDiscount ?? 0;
                      const effectiveRate = row.type === "PWD" ? 0.2 : row.type === "Senior" ? 0.2 : (parseFloat(row.customRate) / 100 || 0);
                      const count         = parseInt(row.count) || 0;
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
                              {count > 0 && effectiveRate > 0
                                ? `${count} × PHP ${discCalc.perPerson.toFixed(2)} × ${(effectiveRate * 100).toFixed(0)}%`
                                : "Enter count & rate"}
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

              {/* ── Payment method section ── */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[10px] text-slate-400 uppercase tracking-widest">Payment Method</p>
                  {/* Split payment toggle */}
                  <button
                    onClick={() => handleToggleSplit(!isSplitPayment)}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] transition-all ${
                      isSplitPayment
                        ? "bg-indigo-600 border-indigo-600 text-white"
                        : "bg-white border-slate-200 text-slate-500 hover:border-indigo-300 hover:text-indigo-600 hover:bg-indigo-50"
                    }`}>
                    <svg width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24">
                      <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>
                    </svg>
                    Split
                  </button>
                </div>

                {isSplitPayment ? (
                  // ── Split payment UI ────────────────────────────────────────
                  <>
                    <div className="flex items-center gap-2 bg-indigo-50 border border-indigo-100 rounded-lg px-3 py-2 mb-3">
                      <svg width="13" height="13" fill="none" stroke="#6366f1" strokeWidth="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                      <p className="text-[11px] text-indigo-700">
                        {splitHasCard(splitEntries)
                          ? "Credit/Debit detected — OR will be issued automatically."
                          : "Enter exact amounts. Total must match amount due."}
                      </p>
                    </div>
                    <SplitPaymentPanel
                      entries={splitEntries}
                      amountDue={discCalc.amountDue}
                      onChange={setSplitEntries}
                    />
                  </>
                ) : (
                  // ── Single payment UI (unchanged) ───────────────────────────
                  <>
                    <div className="space-y-1.5">
                      {PAYMENT_METHODS.map((m) => (
                        <button key={m.label} onClick={() => { setPaymentMethod(m.label); setAmountReceived(""); }}
                          className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl border text-[12px] transition-all ${paymentMethod === m.label ? "border-indigo-300 bg-indigo-50 text-indigo-700" : "border-slate-200 text-slate-500 hover:border-slate-300 hover:bg-slate-50"}`}>
                          <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d={m.d}/></svg>
                          {m.label}
                          {paymentMethod === m.label && <span className="ml-auto text-[10px] text-indigo-400">Selected</span>}
                        </button>
                      ))}
                    </div>

                    {/* Cash: exact amount input — no change shown */}
                    {paymentMethod === "Cash" && (
                      <div className="mt-3 bg-slate-50 border border-slate-100 rounded-xl p-3.5">
                        <label className="text-[11px] text-slate-500 block mb-1">
                          Amount Received (PHP)
                          <span className="ml-1 text-slate-400 font-normal">— exact amount required</span>
                        </label>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[12px] text-slate-400">₱</span>
                          <input
                            type="number"
                            min="0.01"
                            step="0.01"
                            placeholder={discCalc.amountDue.toFixed(2)}
                            value={amountReceived}
                            onChange={(e) => setAmountReceived(e.target.value)}
                            className={`w-full pl-7 pr-3 py-2 text-[13px] bg-white border rounded-lg placeholder-slate-300 outline-none transition ${
                              amountReceived !== "" && !amountReceivedValid
                                ? "border-red-300 focus:ring-2 focus:ring-red-100"
                                : "border-slate-200 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                            }`}
                          />
                        </div>
                        {amountReceived !== "" && !amountReceivedValid && (
                          <p className="text-[11px] text-red-500 mt-1">
                            Amount must be exactly PHP {discCalc.amountDue.toFixed(2)}
                          </p>
                        )}
                        {amountReceived !== "" && amountReceivedValid && (
                          <p className="text-[11px] text-emerald-600 mt-1">✓ Amount matches</p>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* Confirm button */}
            <div className="border-t border-slate-100 px-5 py-4 space-y-2 flex-shrink-0">
              <button onClick={handleConfirmPayment} disabled={!canConfirm || saving}
                className="w-full bg-indigo-600 text-white text-[13px] py-2.5 rounded-xl hover:bg-indigo-700 disabled:opacity-30 disabled:cursor-not-allowed transition tracking-wide flex items-center justify-center gap-2">
                {saving
                  ? (<><svg className="animate-spin" width="13" height="13" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8v4a4 4 0 0 0-4 4H4z"/></svg>Processing...</>)
                  : `Confirm Payment · PHP ${discCalc.amountDue.toFixed(2)}`
                }
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
            <p className="text-[13px] text-indigo-600 mb-5">
              PHP {getItemPrice(currentItem, orderType).toFixed(2)} per item
              {orderType === "Grab" && currentItem.grab_price != null && (
                <span className="ml-1.5 text-[11px] text-orange-400">(grab price)</span>
              )}
            </p>
            <div className="flex items-center justify-between bg-slate-50 rounded-xl p-1.5 mb-5 border border-slate-100">
              <button onClick={() => setQuantity((q) => Math.max(1, q - 1))} className="w-10 h-10 rounded-lg bg-white border border-slate-200 text-slate-600 text-lg flex items-center justify-center hover:bg-slate-100 transition shadow-sm">−</button>
              <span className="text-[20px] text-slate-800 font-medium w-14 text-center">{quantity}</span>
              <button onClick={() => setQuantity((q) => q + 1)} className="w-10 h-10 rounded-lg bg-white border border-slate-200 text-slate-600 text-lg flex items-center justify-center hover:bg-slate-100 transition shadow-sm">+</button>
            </div>
            <div className="flex gap-2">
              <button onClick={() => { setCurrentItem(null); setStep("select"); }} className="flex-1 py-2.5 rounded-xl border border-slate-200 text-[12px] text-slate-500 hover:bg-slate-50 transition">Cancel</button>
              <button onClick={submitQuantity} className="flex-[2] py-2.5 rounded-xl bg-indigo-600 text-white text-[13px] hover:bg-indigo-700 transition">
                Add · PHP {(getItemPrice(currentItem, orderType) * quantity).toFixed(2)}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── OR MODAL: Yes / No ── */}
      {showOrModal === "yesno" && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-2xl shadow-slate-900/15 w-[320px] p-6">
            <h3 className="text-[14px] text-slate-800 mb-2">Official Receipt</h3>
            <p className="text-[12px] text-slate-500 mb-5">Does the customer want an Official Receipt (OR)?</p>
            <div className="flex gap-2">
              <button onClick={handleOrNo} className="flex-1 py-2.5 rounded-xl border border-slate-200 text-[12px] text-slate-600 hover:bg-slate-50 transition">No</button>
              <button onClick={handleOrYes} className="flex-[2] py-2.5 rounded-xl bg-indigo-600 text-white text-[13px] hover:bg-indigo-700 transition">Yes</button>
            </div>
          </div>
        </div>
      )}

      {/* ── OR MODAL: Slip number ── */}
      {(showOrModal === "slip" || showOrModal === "credit") && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-2xl shadow-slate-900/15 w-[320px] p-6">
            <h3 className="text-[14px] text-slate-800 mb-2">Order Slip Number</h3>
            <p className="text-[12px] text-slate-500 mb-4">Enter the order slip number for the Official Receipt.</p>
            <input type="number" min="1" placeholder="e.g. 123" value={orSlipNumber} onChange={(e) => setOrSlipNumber(e.target.value)}
              className="w-full px-3 py-2 text-[13px] bg-slate-50 border border-slate-200 rounded-lg placeholder-slate-300 text-slate-700 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition mb-4"/>
            <div className="flex gap-2">
              <button onClick={() => { setShowOrModal(false); setOrSlipNumber(""); }}
                className="flex-1 py-2.5 rounded-xl border border-slate-200 text-[12px] text-slate-600 hover:bg-slate-50 transition">Cancel</button>
              <button onClick={handleOrSlipConfirm} disabled={!orSlipNumber.trim() || parseInt(orSlipNumber.trim()) < 1 || saving}
                className="flex-[2] py-2.5 rounded-xl bg-indigo-600 text-white text-[13px] hover:bg-indigo-700 disabled:opacity-30 disabled:cursor-not-allowed transition flex items-center justify-center gap-2">
                {saving
                  ? (<><svg className="animate-spin" width="13" height="13" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8v4a4 4 0 0 0-4 4H4z"/></svg>Processing...</>)
                  : "Confirm Payment"
                }
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── PASSWORD MODAL ── */}
      {showPasswordModal && (
        <UpdatePasswordModal onSuccess={handlePasswordSuccess} onCancel={handlePasswordCancel} />
      )}
    </div>
  );
}

export default function POSPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center h-screen bg-slate-50 gap-3 text-slate-400" style={{ fontFamily: "'DM Sans', system-ui, sans-serif" }}>
        <svg className="animate-spin" width="18" height="18" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8v4a4 4 0 0 0-4 4H4z"/></svg>
        <span className="text-[13px]">Loading...</span>
      </div>
    }>
      <POSContent />
    </Suspense>
  );
}