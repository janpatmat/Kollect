"use client";

import SideNav from "../components/side_nav";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-screen bg-gray-100 overflow-hidden">
      <SideNav />
      <main className="flex-1 min-w-0 overflow-hidden">{children}</main>
    </div>
  );
}