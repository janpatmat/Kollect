"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import axios from "axios";
import { useSession } from "@/context/SessionContext";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const { setUser } = useSession();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await axios.post("http://localhost:5000/auth/login", {
        email,
        password,
      });
      const { token, user } = res.data;

      localStorage.setItem("token", token);

      setUser({
        id:        user.id,
        full_name: user.full_name,
        role:      user.role,
        token,
      });

      router.push("/branchchoice");
    } catch (err: any) {
      setError(err.response?.data?.error || "Invalid email or password");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main
      className="min-h-screen bg-slate-950 flex items-center justify-center px-6"
      style={{ fontFamily: "'DM Sans', system-ui, sans-serif" }}
    >
      <div className="w-full max-w-sm">

        {/* Logo */}
        <div className="flex flex-col items-center mb-10">
          <div className="w-10 h-10 rounded-xl bg-indigo-500 flex items-center justify-center mb-4">
            
            
          </div>
          <h1 className="text-6xl font-semibold text-white leading-none">Kollect</h1>
          <p className="text-lg text-slate-600 mt-1 uppercase tracking-widest">POS System</p>
        </div>

        {/* Card */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-7">

          {/* Heading */}
          <div className="mb-6">
            <h2 className="text-[15px] font-medium text-white">Sign in to your account</h2>
            <p className="text-[12px] text-slate-500 mt-0.5">Enter your credentials below</p>
          </div>

          {/* Form */}
          <form onSubmit={handleLogin} className="space-y-4">

            {/* Email */}
            <div className="space-y-1.5">
              <label className="text-[11px] text-slate-500 uppercase tracking-wider">Email address</label>
              <input
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3.5 py-2.5 text-[13px] text-white placeholder-slate-700 focus:outline-none focus:border-indigo-500 transition-colors"
              />
            </div>

            {/* Password */}
            <div className="space-y-1.5">
              <label className="text-[11px] text-slate-500 uppercase tracking-wider">Password</label>
              <input
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3.5 py-2.5 text-[13px] text-white placeholder-slate-700 focus:outline-none focus:border-indigo-500 transition-colors"
              />
            </div>

            {/* Error */}
            {error && (
              <div className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-lg bg-red-500/10 border border-red-500/20">
                <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24" className="text-red-400 flex-shrink-0">
                  <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
                <p className="text-[12px] text-red-400">{error}</p>
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="w-full mt-1 flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-[13px] font-medium py-2.5 rounded-lg transition-colors"
            >
              {loading ? (
                <>
                  <svg className="animate-spin" width="14" height="14" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8v4a4 4 0 0 0-4 4H4z"/>
                  </svg>
                  Signing in...
                </>
              ) : (
                "Sign in"
              )}
            </button>
          </form>
        </div>

        {/* Footer */}
        <p className="text-[11px] text-slate-700 text-center mt-6">
          © {new Date().getFullYear()} Kollect · Contact your administrator if you've lost access
        </p>
      </div>
    </main>
  );
}