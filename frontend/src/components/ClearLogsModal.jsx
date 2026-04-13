/**
 * ClearLogsModal
 *
 * Lets the user choose WHAT to clear before deleting anything:
 *   • All Logs
 *   • Failed logs only
 *   • Success logs only
 *   • A specific date
 *   • A specific date + status combo
 *   • A specific group
 *
 * Shows a live preview count so the user knows exactly how many
 * rows will be deleted before they confirm.
 */
import { useEffect, useState } from "react";
import Modal from "./Modal";
import { countLogs, clearLogs } from "../api/logs";

const STATUS_OPTIONS = [
  { value: "",          label: "Any status" },
  { value: "failure",   label: "Failed only" },
  { value: "success",   label: "Success only" },
];

export default function ClearLogsModal({ onClose, onCleared, dates = [], groups = [] }) {
  const [clearType, setClearType] = useState("failed");   // preset|date|group|all
  const [selDate,   setSelDate]   = useState("");
  const [selStatus, setSelStatus] = useState("failure");
  const [selGroup,  setSelGroup]  = useState("");
  const [preview,   setPreview]   = useState(null);       // { count }
  const [loading,   setLoading]   = useState(false);
  const [clearing,  setClearing]  = useState(false);
  const [done,      setDone]      = useState(null);       // result message

  // ── Build filter params from current UI state ───────────────────────────
  const buildParams = () => {
    if (clearType === "all") return { clear_all: true };

    const p = {};
    if (clearType === "failed")  { p.status = "failure"; }
    if (clearType === "success") { p.status = "success"; }
    if (clearType === "date")    {
      if (selDate)   p.log_date = selDate;
      if (selStatus) p.status   = selStatus;
    }
    if (clearType === "group") {
      if (selGroup)  p.group_name = selGroup;
      if (selStatus) p.status     = selStatus;
    }
    return p;
  };

  // ── Live preview: count matching logs whenever filters change ───────────
  useEffect(() => {
    let cancelled = false;
    setPreview(null);
    setLoading(true);

    const params = buildParams();

    countLogs(params)
      .then((r) => { if (!cancelled) setPreview(r); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [clearType, selDate, selStatus, selGroup]);

  // ── Execute clear ───────────────────────────────────────────────────────
  const handleClear = async () => {
    if (!preview || preview.count === 0) return;
    setClearing(true);
    try {
      const result = await clearLogs(buildParams());
      setDone(result.message || `Deleted ${result.deleted} log(s).`);
      onCleared();          // tell Dashboard to refresh
    } catch (e) {
      setDone(`Error: ${e.message}`);
    } finally {
      setClearing(false);
    }
  };

  const previewCount = preview?.count ?? "…";
  const isDangerous  = clearType === "all" || previewCount > 50;

  return (
    <Modal
      title="🗑 Clear Logs"
      onClose={onClose}
      footer={
        done ? (
          <button className="btn btn-primary" onClick={onClose}>Close</button>
        ) : (
          <>
            <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button
              className={`btn ${isDangerous ? "btn-danger" : "btn-primary"}`}
              onClick={handleClear}
              disabled={clearing || loading || previewCount === 0}
            >
              {clearing ? "Clearing…" : `Delete ${loading ? "…" : previewCount} Log(s)`}
            </button>
          </>
        )
      }
    >
      {done ? (
        <div className="alert alert-success">{done}</div>
      ) : (
        <>
          {/* ── Preset quick-clear options ── */}
          <div className="form-group">
            <label className="form-label">What do you want to clear?</label>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {[
                { key: "failed",  label: "🔴  Failed logs only",           sub: "Remove all failure entries" },
                { key: "success", label: "🟢  Successful logs only",        sub: "Remove all success entries" },
                { key: "date",    label: "📅  Logs for a specific date",    sub: "Choose a backup date below" },
                { key: "group",   label: "📁  Logs for a specific group",   sub: "Choose a group below" },
                { key: "all",     label: "⚠️  ALL logs (complete wipe)",    sub: "Removes every log entry" },
              ].map((opt) => (
                <label
                  key={opt.key}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "10px 14px",
                    borderRadius: "var(--radius)",
                    border: `1px solid ${clearType === opt.key ? "var(--primary)" : "var(--border)"}`,
                    background: clearType === opt.key ? "rgba(59,130,246,.08)" : "var(--surface2)",
                    cursor: "pointer",
                    transition: "border-color .15s",
                  }}
                >
                  <input
                    type="radio"
                    name="clearType"
                    value={opt.key}
                    checked={clearType === opt.key}
                    onChange={() => { setClearType(opt.key); setSelDate(""); setSelStatus(opt.key === "all" ? "" : "failure"); }}
                    style={{ accentColor: "var(--primary)" }}
                  />
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{opt.label}</div>
                    <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 1 }}>{opt.sub}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* ── Date selector ── */}
          {clearType === "date" && (
            <div style={{ background: "var(--surface2)", borderRadius: "var(--radius)", padding: "14px 16px", marginBottom: 16 }}>
              <div className="form-group">
                <label className="form-label">Select Date *</label>
                <select
                  className="form-control"
                  value={selDate}
                  onChange={(e) => setSelDate(e.target.value)}
                >
                  <option value="">— Choose a date —</option>
                  {dates.map((d) => (
                    <option key={d} value={d}>
                      {new Date(d + "T00:00:00").toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Status filter</label>
                <select className="form-control" value={selStatus} onChange={(e) => setSelStatus(e.target.value)}>
                  {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
            </div>
          )}

          {/* ── Group selector ── */}
          {clearType === "group" && (
            <div style={{ background: "var(--surface2)", borderRadius: "var(--radius)", padding: "14px 16px", marginBottom: 16 }}>
              <div className="form-group">
                <label className="form-label">Select Group *</label>
                <select
                  className="form-control"
                  value={selGroup}
                  onChange={(e) => setSelGroup(e.target.value)}
                >
                  <option value="">— Choose a group —</option>
                  {groups.map((g) => <option key={g} value={g}>{g}</option>)}
                </select>
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Status filter</label>
                <select className="form-control" value={selStatus} onChange={(e) => setSelStatus(e.target.value)}>
                  {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
            </div>
          )}

          {/* ── ALL logs warning ── */}
          {clearType === "all" && (
            <div className="alert alert-error" style={{ marginBottom: 16 }}>
              ⚠️ This will permanently delete <strong>every</strong> log entry. This cannot be undone.
            </div>
          )}

          {/* ── Live preview ── */}
          <div
            style={{
              padding: "12px 16px",
              borderRadius: "var(--radius)",
              border: `1px solid ${previewCount > 0 ? (isDangerous ? "rgba(239,68,68,.4)" : "rgba(59,130,246,.3)") : "var(--border)"}`,
              background: previewCount > 0 ? (isDangerous ? "rgba(239,68,68,.08)" : "rgba(59,130,246,.08)") : "var(--surface2)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <span style={{ fontSize: 13, color: "var(--text-muted)" }}>Matching logs to delete:</span>
            <span
              style={{
                fontSize: 22,
                fontWeight: 700,
                color: loading ? "var(--text-muted)" : previewCount > 0 ? (isDangerous ? "var(--error)" : "var(--primary)") : "var(--success)",
              }}
            >
              {loading ? "…" : previewCount}
            </span>
          </div>
        </>
      )}
    </Modal>
  );
}
