"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import axios from "axios";
import { useSession } from "@/context/SessionContext";

interface Branch {
  branch_id:   number;
  branch_name: string;
  location:    string;
}

const API = "http://localhost:5000";

export default function BranchChoice() {
  const router = useRouter();
  const { user, branch: activeBranch, setBranch } = useSession();

  const [branches, setBranches]     = useState<Branch[]>([]);
  const [selected, setSelected]     = useState<Branch | null>(null);
  const [loading, setLoading]       = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [hydrated, setHydrated]     = useState(false);

  // Wait one tick for SessionContext to rehydrate from localStorage
  // before checking auth — prevents false redirect on first render
  useEffect(() => {
    setHydrated(true);
  }, []);

//   useEffect(() => {
//     if (!hydrated) return;
//     if (!user) router.replace("/login");
//   }, [hydrated, user, router]);

  useEffect(() => {
    (async () => {
      try {
        const res = await axios.get(`${API}/branches`);
        setBranches(res.data.data);
        // Pre-select previously chosen branch if still in list
        if (activeBranch) {
          const match = res.data.data.find(
            (b: Branch) => b.branch_id === activeBranch.branch_id
          );
          if (match) setSelected(match);
        }
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    })();
  }, []);

  const handleConfirm = () => {
    if (!selected) return;
    setConfirming(true);
     console.log("selected branch:", selected);
    setBranch(selected);
    console.log("localStorage after setBranch:", localStorage.getItem("session_branch")); // did it save?
    router.push("/dashboard");
  };

  return (
    <div
      className="min-h-screen bg-slate-50 flex items-center justify-center p-6"
      style={{ fontFamily: "'DM Sans', system-ui, sans-serif" }}
    >
      <div className="w-full max-w-md">

        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <svg width="22" height="22" fill="none" stroke="white" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
              <polyline points="9 22 9 12 15 12 15 22"/>
            </svg>
          </div>
          <h1 className="text-[20px] text-slate-800">Select Branch</h1>
          {user && (
            <p className="text-[13px] text-slate-400 mt-1">
              Welcome, <span className="text-slate-600">{user.full_name}</span>
            </p>
          )}
        </div>

        {/* Branch list */}
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden mb-4">
          {loading ? (
            <div className="flex items-center justify-center py-12 gap-3 text-slate-400">
              <svg className="animate-spin" width="18" height="18" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8v4a4 4 0 0 0-4 4H4z"/>
              </svg>
              <span className="text-[13px]">Loading branches...</span>
            </div>
          ) : branches.length === 0 ? (
            <div className="py-12 text-center text-slate-400">
              <p className="text-[13px]">No branches found. Contact your administrator.</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {branches.map((branch) => {
                const isSelected = selected?.branch_id === branch.branch_id;
                return (
                  <button
                    key={branch.branch_id}
                    onClick={() => setSelected(branch)}
                    className={`w-full text-left px-5 py-4 flex items-center gap-4 transition-colors ${
                      isSelected ? "bg-indigo-50" : "hover:bg-slate-50"
                    }`}
                  >
                    {/* Branch icon */}
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 transition-colors ${
                      isSelected ? "bg-indigo-600" : "bg-slate-100"
                    }`}>
                      <svg
                        width="15" height="15" fill="none" stroke={isSelected ? "white" : "currentColor"}
                        strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"
                        className={isSelected ? "" : "text-slate-400"}
                      >
                        <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z"/>
                        <circle cx="12" cy="10" r="3"/>
                      </svg>
                    </div>

                    {/* Branch info */}
                    <div className="flex-1 min-w-0">
                      <p className={`text-[13px] ${isSelected ? "text-indigo-700" : "text-slate-700"}`}>
                        {branch.branch_name}
                      </p>
                      <p className="text-[11px] text-slate-400 truncate mt-0.5">{branch.location}</p>
                    </div>

                    {/* Selection indicator */}
                    <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                      isSelected ? "border-indigo-600 bg-indigo-600" : "border-slate-300"
                    }`}>
                      {isSelected && (
                        <svg width="8" height="8" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" viewBox="0 0 24 24">
                          <path d="M20 6 9 17l-5-5"/>
                        </svg>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Confirm button */}
        <button
          onClick={handleConfirm}
          disabled={!selected || confirming}
          className="w-full bg-indigo-600 hover:bg-indigo-700 text-white text-[13px] py-3 rounded-xl disabled:opacity-30 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
        >
          {confirming ? (
            <>
              <svg className="animate-spin" width="13" height="13" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8v4a4 4 0 0 0-4 4H4z"/>
              </svg>
              Entering Branch...
            </>
          ) : selected ? (
            `Continue as ${selected.branch_name} →`
          ) : (
            "Select a Branch to Continue"
          )}
        </button>

        {/* Logout link */}
        <p className="text-center mt-4 text-[11px] text-slate-400">
          Wrong account?{" "}
          <button
            onClick={() => {
              localStorage.clear();
              router.push("/login");
            }}
            className="text-indigo-500 hover:text-indigo-700 transition-colors"
          >
            Sign out
          </button>
        </p>
      </div>
    </div>
  );
}