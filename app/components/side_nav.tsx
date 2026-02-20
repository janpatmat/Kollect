"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { getUserRole } from "../../lib/auth";

interface NavItem {
  name: string;
  href: string;
  adminOnly?: boolean;
  icon: React.ReactNode;
}

const navItems: NavItem[] = [
  {
    name: "Point of Sales",
    href: "/dashboard",
    icon: (
      <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
        <circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/>
        <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>
      </svg>
    ),
  },
  {
    name: "Menu",
    href: "/dashboard/menu",
    adminOnly: true,
    icon: (
      <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
        <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2"/>
      </svg>
    ),
  },
   {
    name: "Sales",
    href: "/dashboard/sales",
    adminOnly: true,
    icon: (
      <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
        <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2"/>
      </svg>
    ),
  },
];

export default function SideNav() {
  const [role, setRole] = useState<string | null>(null);
  const pathname = usePathname();

  useEffect(() => {
    setRole(getUserRole());
  }, []);

  return (
    <aside
      className="w-56 bg-slate-900 h-screen flex-shrink-0 hidden md:flex flex-col"
      style={{ fontFamily: "'DM Sans', system-ui, sans-serif" }}
    >
      {/* Brand */}
      <div className="px-5 py-5 border-b border-slate-800">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-indigo-500 flex items-center justify-center flex-shrink-0">
            <svg width="14" height="14" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
              <path d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm-8 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4z"/>
            </svg>
          </div>
          <div>
            <p className="text-[13px] text-white leading-none">K Steak</p>
            <p className="text-[10px] text-slate-500 mt-0.5 uppercase tracking-widest">POS System</p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5">
        <p className="text-[10px] text-slate-600 uppercase tracking-widest px-3 mb-2">Navigation</p>

        {navItems.map((item) => {
          if (item.adminOnly && role !== "admin") return null;

          const isActive = pathname === item.href;

          return (
            <Link
              key={item.name}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-[12px] transition-all ${
                isActive
                  ? "bg-indigo-600 text-white"
                  : "text-slate-400 hover:bg-slate-800 hover:text-slate-200"
              }`}
            >
              <span className={isActive ? "text-white" : "text-slate-500"}>{item.icon}</span>
              {item.name}
              {isActive && (
                <span className="ml-auto w-1.5 h-1.5 rounded-full bg-indigo-300" />
              )}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="px-3 py-4 border-t border-slate-800">
        <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg">
          <div className="w-7 h-7 rounded-full bg-slate-700 border border-slate-600 flex items-center justify-center text-[10px] text-slate-300 flex-shrink-0">
            JD
          </div>
          <div className="min-w-0">
            <p className="text-[12px] text-slate-300 truncate">Staff</p>
            <p className="text-[10px] text-slate-600 capitalize">{role ?? "—"}</p>
          </div>
        </div>
      </div>
    </aside>
  );
}