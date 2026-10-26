import { useState } from "react";
import { KeyRound, RefreshCw, LogOut, BarChart2, Users, ImageIcon, Loader2 } from "lucide-react";
import { useAdminData } from "@/admin/useAdminData";
import { OverviewTab } from "@/admin/OverviewTab";
import { ParticipantsTab } from "@/admin/ParticipantsTab";
import { CaseBrowserTab } from "@/admin/CaseBrowserTab";
import { CASE_POOL, BASELINE_CASES, ATTENTION_CHECK_CASE } from "@/data/mockData";

// Set VITE_ADMIN_PASSWORD in your environment (e.g. frontend/.env.local) to enable the admin dashboard.
const ADMIN_PASSWORD = (import.meta.env.VITE_ADMIN_PASSWORD ?? "").toUpperCase();
const STORAGE_KEY = "chex_admin_auth";

const ALL_CASES = [...BASELINE_CASES, ATTENTION_CHECK_CASE, ...CASE_POOL];

type Tab = "overview" | "participants" | "cases";

// ---------------------------------------------------------------------------
// Password gate
// ---------------------------------------------------------------------------
function PasswordGate({ onAuth }: { onAuth: () => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (ADMIN_PASSWORD && password.trim().toUpperCase() === ADMIN_PASSWORD) {
      sessionStorage.setItem(STORAGE_KEY, "1");
      onAuth();
    } else {
      setError(true);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-5">
      <div className="glass-panel p-8 max-w-sm w-full space-y-5 animate-fade-in">
        <div className="text-center space-y-1">
          <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-primary/10 mb-2">
            <KeyRound className="w-5 h-5 text-primary" />
          </div>
          <h1 className="text-lg font-semibold text-foreground">Admin Panel</h1>
          <p className="text-sm text-muted-foreground">CheXStudy — Researcher Access</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <input
              type="password"
              value={password}
              onChange={e => { setPassword(e.target.value); setError(false); }}
              placeholder="Admin password"
              autoFocus
              className={`w-full h-10 px-3 rounded bg-secondary border text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-primary transition-shadow ${error ? "border-destructive ring-1 ring-destructive" : "border-border"}`}
            />
            {error && <p className="text-xs text-destructive mt-1">Incorrect password.</p>}
          </div>
          <button
            type="submit"
            className="w-full h-10 rounded bg-primary text-primary-foreground text-sm font-medium hover:brightness-110 transition-all"
          >
            Enter
          </button>
        </form>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------
function Dashboard() {
  const [tab, setTab] = useState<Tab>("overview");
  const adminData = useAdminData();

  const handleLogout = () => {
    sessionStorage.removeItem(STORAGE_KEY);
    window.location.reload();
  };

  const tabs: { id: Tab; label: string; icon: typeof BarChart2; count?: number }[] = [
    { id: "overview", label: "Overview", icon: BarChart2 },
    { id: "participants", label: "Participants", icon: Users, count: adminData.sessions.length },
    { id: "cases", label: "Cases", icon: ImageIcon, count: ALL_CASES.length },
  ];

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Top bar */}
      <header className="border-b border-border bg-background/95 sticky top-0 z-30 px-5 py-3 flex items-center gap-4">
        <div className="flex items-center gap-2.5">
          <div className="w-6 h-6 rounded bg-primary/20 flex items-center justify-center">
            <BarChart2 className="w-3.5 h-3.5 text-primary" />
          </div>
          <span className="text-sm font-semibold text-foreground">CheXStudy Admin</span>
        </div>

        <nav className="flex gap-1 ml-4">
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 h-8 px-3 rounded text-xs font-medium transition-colors ${tab === t.id ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-secondary"}`}
            >
              <t.icon className="w-3.5 h-3.5" />
              {t.label}
              {t.count != null && (
                <span className="ml-0.5 text-[10px] bg-secondary text-muted-foreground px-1.5 py-0.5 rounded-full font-mono">
                  {t.count}
                </span>
              )}
            </button>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          {adminData.loading && <Loader2 className="w-4 h-4 text-muted-foreground animate-spin" />}
          <button
            onClick={adminData.refresh}
            disabled={adminData.loading}
            className="flex items-center gap-1.5 h-8 px-3 rounded bg-secondary text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </button>
          <button
            onClick={handleLogout}
            className="flex items-center gap-1.5 h-8 px-3 rounded bg-secondary text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" /> Logout
          </button>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-5 py-6">
        {adminData.error && (
          <div className="mb-4 bg-destructive/10 border border-destructive/30 text-destructive rounded p-3 text-sm">
            Error loading data: {adminData.error}
          </div>
        )}

        {adminData.loading && !adminData.sessions.length ? (
          <div className="flex items-center justify-center py-32 gap-2 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-sm">Loading study data…</span>
          </div>
        ) : (
          <>
            {tab === "overview" && <OverviewTab data={adminData} />}
            {tab === "participants" && <ParticipantsTab data={adminData} />}
            {tab === "cases" && <CaseBrowserTab data={adminData} allCases={ALL_CASES} />}
          </>
        )}
      </main>
    </div>
  );
}

// ---------------------------------------------------------------------------
// AdminPage — checks sessionStorage auth
// ---------------------------------------------------------------------------
export default function AdminPage() {
  const [authed, setAuthed] = useState(() => sessionStorage.getItem(STORAGE_KEY) === "1");

  if (!authed) return <PasswordGate onAuth={() => setAuthed(true)} />;
  return <Dashboard />;
}
