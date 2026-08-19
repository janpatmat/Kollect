"use client";

import { useState } from "react";
import SideNav from "../components/side_nav";
import { useSession } from "@/context/SessionContext";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [navOpen, setNavOpen] = useState(false);
  const { user, branch } = useSession();

  return (
    // 100dvh (not 100vh) so mobile browser chrome collapsing doesn't clip the
    // bottom of the app — critical for the POS cart bar, which sits at the edge.
    <div className="flex h-[100dvh] bg-gray-100 overflow-hidden">
      <SideNav open={navOpen} onClose={() => setNavOpen(false)} />

      <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
        {/* Mobile top bar — the only way to reach navigation below md */}
        <header
          className="md:hidden h-14 flex-shrink-0 bg-slate-900 flex items-center gap-3 px-3"
          style={{ fontFamily: "'DM Sans', system-ui, sans-serif" }}
        >
          <button
            onClick={() => setNavOpen(true)}
            aria-label="Open navigation menu"
            aria-expanded={navOpen}
            aria-controls="main-nav"
            className="w-10 h-10 rounded-lg flex items-center justify-center text-slate-300 hover:text-white hover:bg-slate-800 active:bg-slate-800 transition-colors flex-shrink-0"
          >
            <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24">
              <path d="M3 6h18M3 12h18M3 18h18" />
            </svg>
          </button>

          <div className="min-w-0 flex-1">
            <p className="text-[13px] text-white leading-none truncate">K Steak</p>
            <p className="text-[10px] text-slate-500 mt-1 truncate">
              {branch ? branch.branch_name : "No branch selected"}
            </p>
          </div>

          {user && (
            <div
              className="w-8 h-8 rounded-full bg-slate-700 border border-slate-600 flex items-center justify-center text-[11px] text-slate-200 flex-shrink-0"
              title={user.full_name}
            >
              {user.full_name?.trim()?.charAt(0)?.toUpperCase() ?? "?"}
            </div>
          )}
        </header>

        <main className="flex-1 min-w-0 overflow-hidden">{children}</main>
      </div>
    </div>
  );
}
