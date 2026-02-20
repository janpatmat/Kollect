"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from "react";

// ── Types ─────────────────────────────────────────────────────────────────────
interface Branch {
  branch_id:   number;
  branch_name: string;
  location:    string;
}

interface SessionUser {
  id:        number;
  full_name: string;
  role:      string;
  token:     string;
}

interface SessionState {
  user:         SessionUser | null;
  branch:       Branch | null;
  hydrated:     boolean;           // ← true once localStorage has been read
  setUser:      (user: SessionUser | null) => void;
  setBranch:    (branch: Branch | null) => void;
  clearSession: () => void;
}

// ── Context ───────────────────────────────────────────────────────────────────
const SessionContext = createContext<SessionState>({
  user:         null,
  branch:       null,
  hydrated:     false,
  setUser:      () => {},
  setBranch:    () => {},
  clearSession: () => {},
});

// ── Provider ──────────────────────────────────────────────────────────────────
export function SessionProvider({ children }: { children: ReactNode }) {
  const [user,     setUserState]   = useState<SessionUser | null>(null);
  const [branch,   setBranchState] = useState<Branch | null>(null);
  const [hydrated, setHydrated]    = useState(false);

  // Read localStorage once on mount, then mark as hydrated
  useEffect(() => {
    try {
      const storedUser   = localStorage.getItem("session_user");
      const storedBranch = localStorage.getItem("session_branch");
      console.log("STORED USER:", storedUser);      // ← add this
    console.log("STORED BRANCH:", storedBranch);  // ← add this
      if (storedUser)   setUserState(JSON.parse(storedUser));
      if (storedBranch) setBranchState(JSON.parse(storedBranch));
    } catch {
      localStorage.removeItem("session_user");
      localStorage.removeItem("session_branch");
    } finally {
      setHydrated(true);  // ← always fires after reading, whether data exists or not
    }
  }, []);

  const setUser = (u: SessionUser | null) => {
    setUserState(u);
    if (u) localStorage.setItem("session_user", JSON.stringify(u));
    else   localStorage.removeItem("session_user");
  };

  const setBranch = (b: Branch | null) => {
    setBranchState(b);
    if (b) localStorage.setItem("session_branch", JSON.stringify(b));
    else   localStorage.removeItem("session_branch");
  };

  const clearSession = () => {
    setUserState(null);
    setBranchState(null);
    localStorage.removeItem("session_user");
    localStorage.removeItem("session_branch");
    localStorage.removeItem("token");
  };

  return (
    <SessionContext.Provider value={{ user, branch, hydrated, setUser, setBranch, clearSession }}>
      {children}
    </SessionContext.Provider>
  );
}

// ── Hook ──────────────────────────────────────────────────────────────────────
export const useSession = () => useContext(SessionContext);