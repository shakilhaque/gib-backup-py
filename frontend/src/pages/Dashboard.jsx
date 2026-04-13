/**
 * Dashboard page
 *
 * Features:
 *  1. Stat cards (clickable – filter logs on click)
 *  2. Failed Backups panel (only when failures exist)
 *  3. Backup Logs table with:
 *       • Date picker  – filter logs to a specific backup date
 *       • Status tabs  – All / Success / Failed
 *       • Latest Only  – show only the most recent log per device
 *       • Date grouping – rows grouped under a date header
 *       • Clear Date    – delete all logs for the selected date
 *
 * Auto-refreshes every 10 seconds.
 */
import { useEffect, useState, useCallback, useRef } from "react";
import { getDashboardStats, getLogs, getLogDates, deleteLog } from "../api/logs";
import { downloadBackup } from "../api/backup";
import Spinner from "../components/Spinner";
import ClearLogsModal from "../components/ClearLogsModal";

const POLL_INTERVAL = 10_000;

/* ── helpers ─────────────────────────────────────────────────────────────── */
function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a   = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

/**
 * Parse a timestamp string from the backend.
 * The backend stores UTC via datetime.utcnow() but does NOT append 'Z'.
 * Without 'Z', JavaScript treats the string as LOCAL time → wrong hour shown.
 * Appending 'Z' forces JS to interpret it as UTC and auto-converts to the
 * browser's local timezone (e.g. UTC+6 Bangladesh = correct local time).
 */
function parseUTC(d) {
  if (!d) return new Date();
  // Already has timezone info — use as-is
  if (d.endsWith("Z") || d.includes("+")) return new Date(d);
  // No timezone suffix — backend sent UTC without 'Z', so add it
  return new Date(d + "Z");
}

/** Format → "12 Apr 2026" */
function fmtDate(d) {
  return parseUTC(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

/** Format → "01:25 PM" (local time) */
function fmtTime(d) {
  return parseUTC(d).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: true });
}

/** Group an array of logs by local calendar date (YYYY-MM-DD) */
function groupByDate(logs) {
  const groups = {};
  logs.forEach((log) => {
    // Use parseUTC so grouping is based on local date, not UTC date
    const key = parseUTC(log.timestamp).toLocaleDateString("en-CA"); // YYYY-MM-DD
    if (!groups[key]) groups[key] = [];
    groups[key].push(log);
  });
  // Return sorted newest-first
  return Object.entries(groups).sort(([a], [b]) => b.localeCompare(a));
}

/** Keep only the most recent log per device_ip */
function latestPerDevice(logs) {
  const seen = new Map();
  logs.forEach((log) => {
    if (!seen.has(log.device_ip) || parseUTC(log.timestamp) > parseUTC(seen.get(log.device_ip).timestamp)) {
      seen.set(log.device_ip, log);
    }
  });
  return Array.from(seen.values()).sort((a, b) => parseUTC(b.timestamp) - parseUTC(a.timestamp));
}

/* ══════════════════════════════════════════════════════════════════════════ */
export default function Dashboard() {
  const [stats,      setStats]      = useState(null);
  const [logs,       setLogs]       = useState([]);
  const [dates,      setDates]      = useState([]);   // all distinct backup dates
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState(null);

  // Filters
  const [selectedDate, setSelectedDate] = useState("");      // "" = all dates
  const [filter,       setFilter]       = useState("all");   // all|success|failure
  const [latestOnly,   setLatestOnly]   = useState(false);

  // Clear modal
  const [showClear, setShowClear] = useState(false);
  const [groups,    setGroups]    = useState([]);

  const logsRef = useRef(null);

  // ── Fetch ──────────────────────────────────────────────────────────────
  const fetchAll = useCallback(async () => {
    try {
      const params = { limit: 500 };
      if (selectedDate) params.log_date = selectedDate;

      const [s, l, d] = await Promise.all([
        getDashboardStats(),
        getLogs(params),
        getLogDates(),
      ]);
      setStats(s);
      setLogs(l);
      setDates(d);
      // Collect distinct group names from logs for the clear modal
      setGroups([...new Set(l.map((log) => log.group_name).filter(Boolean))].sort());
      setError(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [selectedDate]);

  useEffect(() => {
    fetchAll();
    const id = setInterval(fetchAll, POLL_INTERVAL);
    return () => clearInterval(id);
  }, [fetchAll]);

  // ── Derived ────────────────────────────────────────────────────────────
  const failedLogs = logs.filter((l) => l.status === "failure");

  // Apply status filter
  let displayLogs =
    filter === "success" ? logs.filter((l) => l.status === "success") :
    filter === "failure" ? failedLogs :
    logs;

  // Apply latest-only toggle
  if (latestOnly) displayLogs = latestPerDevice(displayLogs);

  // Group by date for rendering
  const groupedLogs = groupByDate(displayLogs);

  // ── Actions ────────────────────────────────────────────────────────────
  const scrollToLogs = (f) => {
    setFilter(f);
    setTimeout(() => logsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  };

  const handleDelete = async (id) => {
    if (!confirm("Delete this log entry?")) return;
    await deleteLog(id);
    setLogs((prev) => prev.filter((l) => l.id !== id));
  };

  const handleClearDate = async () => {
    if (!selectedDate) return;
    if (!confirm(`Delete ALL logs for ${fmtDate(selectedDate + "T00:00:00")}?`)) return;
    await clearLogsByDate(selectedDate);
    fetchAll();
  };

  const handleDownload = async (log) => {
    try {
      const blob     = await downloadBackup(log.id);
      const filename = log.backup_path ? log.backup_path.split(/[\\/]/).pop() : `${log.device_ip}_backup.txt`;
      triggerDownload(blob, filename);
    } catch {
      alert("File not available for download.");
    }
  };

  if (loading) return <Spinner text="Loading dashboard…" />;

  /* ── Render ─────────────────────────────────────────────────────────── */
  return (
    <>
      {/* Page header */}
      <div className="page-header">
        <div>
          <div className="page-title">Dashboard</div>
          <div className="page-sub">Auto-refreshes every 10 seconds</div>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {/* ── Stat cards ── */}
      {stats && (
        <div className="stats-grid">
          <StatCard label="Total Devices" value={stats.total_devices} color="blue" />
          <StatCard label="Total Backups" value={stats.total_backups} color="blue" />
          <StatCard
            label="Successful" value={stats.success_count} color="green"
            clickable onClick={() => scrollToLogs("success")}
          />
          <StatCard
            label="Failed" value={stats.failed_count} color="red"
            pulse={stats.failed_count > 0}
            clickable onClick={() => scrollToLogs("failure")}
          />
        </div>
      )}

      {/* ── Failed panel ── */}
      {failedLogs.length > 0 && (
        <div className="card" style={{ border: "1px solid rgba(239,68,68,.5)", background: "rgba(239,68,68,.05)", marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ width: 10, height: 10, borderRadius: "50%", background: "var(--error)", display: "inline-block", animation: "pulse 1.5s ease-in-out infinite" }} />
              <span style={{ fontWeight: 700, fontSize: 15, color: "var(--error)" }}>Failed Backups</span>
            </div>
            <span className="badge badge-error">{failedLogs.length} device(s) failed</span>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>#</th><th>Device IP</th><th>Group</th><th>Auth Type</th><th>Error Reason</th><th>Date</th><th>Time</th><th></th>
                </tr>
              </thead>
              <tbody>
                {failedLogs.map((log, i) => (
                  <tr key={log.id} style={{ background: "rgba(239,68,68,.04)" }}>
                    <td style={{ color: "var(--text-muted)" }}>{i + 1}</td>
                    <td className="monospace" style={{ color: "var(--error)", fontWeight: 600 }}>{log.device_ip || "—"}</td>
                    <td>{log.group_name}</td>
                    <td><span className={`badge badge-${log.auth_type}`}>{log.auth_type === "non_tacacs" ? "Non-Tacacs" : "Tacacs"}</span></td>
                    <td style={{ color: "var(--error)" }} title={log.message}>{log.message || "Unknown error"}</td>
                    <td style={{ whiteSpace: "nowrap", color: "var(--text-muted)" }}>{fmtDate(log.timestamp)}</td>
                    <td style={{ whiteSpace: "nowrap", color: "var(--text-muted)" }}>{fmtTime(log.timestamp)}</td>
                    <td><button className="btn btn-danger btn-sm" onClick={() => handleDelete(log.id)}>×</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          BACKUP LOGS TABLE
         ══════════════════════════════════════════════════════════════════ */}
      <div className="card" ref={logsRef}>

        {/* ── Toolbar ── */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", marginBottom: 16 }}>

          {/* Title + Clear button */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, flex: "0 0 auto" }}>
            <div style={{ fontWeight: 700, fontSize: 15 }}>Backup Logs</div>
            <button
              className="btn btn-danger btn-sm"
              onClick={() => setShowClear(true)}
              title="Clear log entries"
            >
              🗑 Clear Logs
            </button>
          </div>

          {/* Date picker */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, flex: "0 0 auto" }}>
            <label style={{ fontSize: 12, color: "var(--text-muted)", whiteSpace: "nowrap" }}>📅 Filter Date:</label>
            <select
              className="form-control"
              style={{ width: 160, padding: "5px 10px", fontSize: 12 }}
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
            >
              <option value="">All Dates</option>
              {dates.map((d) => (
                <option key={d} value={d}>
                  {fmtDate(d + "T00:00:00")}
                </option>
              ))}
            </select>
            {selectedDate && (
              <button
                className="btn btn-danger btn-sm"
                title={`Delete all logs for ${fmtDate(selectedDate + "T00:00:00")}`}
                onClick={handleClearDate}
              >
                🗑 Clear Date
              </button>
            )}
          </div>

          {/* Spacer */}
          <div style={{ flex: 1 }} />

          {/* Latest Only toggle */}
          <label style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12, color: "var(--text-muted)", cursor: "pointer", userSelect: "none" }}>
            <input
              type="checkbox"
              checked={latestOnly}
              onChange={(e) => setLatestOnly(e.target.checked)}
              style={{ width: 14, height: 14, accentColor: "var(--primary)", cursor: "pointer" }}
            />
            Latest only (1 per device)
          </label>

          {/* Status filter tabs */}
          <div style={{ display: "flex", gap: 5 }}>
            {[
              { key: "all",     label: `All (${logs.length})`,                                  cls: "btn-primary"  },
              { key: "success", label: `✓ Success (${logs.filter(l=>l.status==="success").length})`, cls: "btn-success" },
              { key: "failure", label: `✗ Failed (${failedLogs.length})`,                        cls: "btn-danger"  },
            ].map((tab) => (
              <button
                key={tab.key}
                className={`btn btn-sm ${filter === tab.key ? tab.cls : "btn-ghost"}`}
                onClick={() => setFilter(tab.key)}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* ── Log count summary ── */}
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 12 }}>
          Showing <strong style={{ color: "var(--text)" }}>{displayLogs.length}</strong> log(s)
          {selectedDate && <> for <strong style={{ color: "var(--primary)" }}>{fmtDate(selectedDate + "T00:00:00")}</strong></>}
          {latestOnly    && <> · <strong style={{ color: "var(--primary)" }}>Latest only</strong></>}
        </div>

        {/* ── Table grouped by date ── */}
        {displayLogs.length === 0 ? (
          <div className="empty">No logs found for the selected filters.</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Device IP</th>
                  <th>Group</th>
                  <th>Auth</th>
                  <th>Status</th>
                  <th>Message</th>
                  <th>Time</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {groupedLogs.map(([dateKey, dateLogs]) => (
                  <>
                    {/* ── Date separator row ── */}
                    <tr key={`sep-${dateKey}`}>
                      <td
                        colSpan={7}
                        style={{
                          background: "var(--surface2)",
                          padding: "6px 14px",
                          fontWeight: 700,
                          fontSize: 12,
                          color: "var(--primary)",
                          letterSpacing: "0.5px",
                          borderTop: "2px solid var(--border)",
                        }}
                      >
                        📅 {fmtDate(dateKey + "T00:00:00")}
                        <span style={{ fontWeight: 400, color: "var(--text-muted)", marginLeft: 12 }}>
                          {dateLogs.length} log(s) · {dateLogs.filter(l => l.status === "success").length} success · {dateLogs.filter(l => l.status === "failure").length} failed
                        </span>
                      </td>
                    </tr>

                    {/* ── Log rows for this date ── */}
                    {dateLogs.map((log) => (
                      <tr
                        key={log.id}
                        style={log.status === "failure" ? { background: "rgba(239,68,68,.03)" } : {}}
                      >
                        <td
                          className="monospace"
                          style={log.status === "failure" ? { color: "var(--error)", fontWeight: 600 } : {}}
                        >
                          {log.device_ip || "—"}
                        </td>
                        <td>{log.group_name}</td>
                        <td>
                          <span className={`badge badge-${log.auth_type}`}>
                            {log.auth_type === "non_tacacs" ? "Non-Tacacs" : "Tacacs"}
                          </span>
                        </td>
                        <td>
                          <span className={`badge badge-${log.status === "success" ? "success" : "error"}`}>
                            {log.status}
                          </span>
                        </td>
                        <td
                          title={log.message || ""}
                          style={{
                            maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                            cursor: log.message ? "help" : "default",
                            color: log.status === "failure" ? "var(--error)" : "inherit",
                          }}
                        >
                          {log.message || "—"}
                        </td>
                        <td style={{ whiteSpace: "nowrap", color: "var(--text-muted)", fontSize: 12 }}>
                          {fmtTime(log.timestamp)}
                        </td>
                        <td>
                          <div className="flex-gap">
                            {log.backup_path && log.status === "success" && (
                              <button className="btn btn-ghost btn-sm" onClick={() => handleDownload(log)} title="Download">↓</button>
                            )}
                            <button className="btn btn-danger btn-sm" onClick={() => handleDelete(log.id)} title="Delete">×</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50%       { opacity: 0.5; transform: scale(1.4); }
        }
      `}</style>

      {/* ── Clear Logs Modal ── */}
      {showClear && (
        <ClearLogsModal
          dates={dates}
          groups={groups}
          onClose={() => setShowClear(false)}
          onCleared={() => { setShowClear(false); fetchAll(); }}
        />
      )}
    </>
  );
}

/* ── StatCard ─────────────────────────────────────────────────────────────── */
function StatCard({ label, value, color, pulse, onClick, clickable }) {
  return (
    <div
      className="stat-card"
      onClick={onClick}
      style={{
        ...(pulse     ? { border: "1px solid rgba(239,68,68,.4)", background: "rgba(239,68,68,.06)" } : {}),
        ...(clickable ? { cursor: "pointer", transition: "transform .15s" } : {}),
      }}
      onMouseEnter={(e) => { if (clickable) e.currentTarget.style.transform = "translateY(-2px)"; }}
      onMouseLeave={(e) => { if (clickable) e.currentTarget.style.transform = ""; }}
      title={clickable ? `Click to filter by ${label}` : undefined}
    >
      <div className="stat-label">
        {label}
        {clickable && <span style={{ fontSize: 10, marginLeft: 5, color: "var(--text-muted)" }}>▼</span>}
      </div>
      <div className={`stat-value ${color}`}>{value}</div>
    </div>
  );
}
