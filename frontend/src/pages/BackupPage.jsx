/**
 * Backup page
 *
 * Two tabs:
 *  1. Run Now  – immediate backup with live result display
 *  2. Schedule – create/manage recurring cron jobs
 */
import { useEffect, useState } from "react";
import { getGroups } from "../api/devices";
import { runBackup, scheduleBackup, getSchedules, deleteSchedule, toggleSchedule } from "../api/backup";
import Spinner from "../components/Spinner";

const AUTH_TYPES = [
  { value: "tacacs",     label: "Tacacs" },
  { value: "non_tacacs", label: "Non-Tacacs" },
];

const EMPTY_RUN = {
  group_name: "", auth_type: "tacacs",
  username: "", password: "",
  backup_mode: "local",
  local_path: "",
  ftp_ip: "10.69.10.11", ftp_username: "", ftp_password: "",
};

const EMPTY_SCHED = {
  group_name: "", auth_type: "tacacs",
  username: "", password: "",
  backup_mode: "local",
  local_path: "",
  ftp_ip: "10.69.10.11", ftp_username: "", ftp_password: "",
  cron_days: "1,15", cron_hour: 2, cron_minute: 0,
};

export default function BackupPage() {
  const [tab, setTab]       = useState("run");
  const [groups, setGroups] = useState([]);

  useEffect(() => {
    getGroups().then(setGroups).catch(() => {});
  }, []);

  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-title">Backup</div>
          <div className="page-sub">Run an immediate backup or schedule a recurring job.</div>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex-gap" style={{ marginBottom: 20 }}>
        <button
          className={`btn ${tab === "run" ? "btn-primary" : "btn-ghost"}`}
          onClick={() => setTab("run")}
        >
          ▶ Run Now
        </button>
        <button
          className={`btn ${tab === "schedule" ? "btn-primary" : "btn-ghost"}`}
          onClick={() => setTab("schedule")}
        >
          ⏰ Schedules
        </button>
      </div>

      {tab === "run"      && <RunNowTab groups={groups} />}
      {tab === "schedule" && <ScheduleTab groups={groups} />}
    </>
  );
}

/* ── Run Now tab ─────────────────────────────────────────────────────────── */
function RunNowTab({ groups }) {
  const [form, setForm]       = useState(EMPTY_RUN);
  const [running, setRunning] = useState(false);
  const [result, setResult]   = useState(null);
  const [error, setError]     = useState(null);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const handleRun = async (e) => {
    e.preventDefault();
    setRunning(true);
    setResult(null);
    setError(null);
    try {
      const payload = { ...form };
      if (form.backup_mode !== "ftp") {
        delete payload.ftp_ip;
        delete payload.ftp_username;
        delete payload.ftp_password;
      }
      const res = await runBackup(payload);
      setResult(res);
    } catch (e) {
      setError(e.message);
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="form-row" style={{ alignItems: "start", gap: 24 }}>
      {/* Form */}
      <div className="card" style={{ flex: "0 0 380px" }}>
        <form onSubmit={handleRun}>
          <BackupFormFields form={form} set={set} groups={groups} showFtp />
          <button className="btn btn-success" type="submit" disabled={running} style={{ width: "100%", marginTop: 8 }}>
            {running ? <><span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> Running…</> : "▶ Run Backup Now"}
          </button>
        </form>
      </div>

      {/* Results */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {error && <div className="alert alert-error">{error}</div>}

        {result && (
          <div className="card">
            <div className="page-header" style={{ marginBottom: 12 }}>
              <div className="page-title" style={{ fontSize: 15 }}>
                Results — {result.group_name} ({result.auth_type})
              </div>
              <div className="flex-gap">
                <span className="badge badge-success">{result.success} ✓</span>
                <span className="badge badge-error">{result.failed} ✗</span>
              </div>
            </div>

            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>IP Address</th>
                    <th>Status</th>
                    <th>Message / Path</th>
                  </tr>
                </thead>
                <tbody>
                  {result.results.map((r) => (
                    <tr key={r.ip_address}>
                      <td className="monospace">{r.ip_address}</td>
                      <td>
                        <span className={`badge badge-${r.status === "success" ? "success" : "error"}`}>
                          {r.status}
                        </span>
                      </td>
                      <td style={{ fontSize: 12, color: "var(--text-muted)" }}>
                        {r.backup_path || r.message}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {!result && !error && (
          <div className="card">
            <div className="empty">Fill the form and click "Run Backup Now" to start.</div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Schedule tab ───────────────────────────────────────────────────────── */
function ScheduleTab({ groups }) {
  const [form, setForm]         = useState(EMPTY_SCHED);
  const [schedules, setSchedules] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState(null);
  const [success, setSuccess]   = useState(null);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const fetchSchedules = async () => {
    setLoading(true);
    try {
      setSchedules(await getSchedules());
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchSchedules(); }, []);

  const handleSchedule = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const payload = { ...form, cron_hour: Number(form.cron_hour), cron_minute: Number(form.cron_minute) };
      if (form.backup_mode !== "ftp") {
        delete payload.ftp_ip;
        delete payload.ftp_username;
        delete payload.ftp_password;
      }
      await scheduleBackup(payload);
      setSuccess("Schedule created.");
      setTimeout(() => setSuccess(null), 4000);
      fetchSchedules();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm("Delete this schedule?")) return;
    await deleteSchedule(id);
    fetchSchedules();
  };

  const handleToggle = async (id) => {
    await toggleSchedule(id);
    fetchSchedules();
  };

  return (
    <div style={{ display: "flex", gap: 24, alignItems: "start" }}>
      {/* Create form */}
      <div className="card" style={{ flex: "0 0 380px" }}>
        <div style={{ fontWeight: 600, marginBottom: 16 }}>Create Schedule</div>
        {error   && <div className="alert alert-error">{error}</div>}
        {success && <div className="alert alert-success">{success}</div>}
        <form onSubmit={handleSchedule}>
          <BackupFormFields form={form} set={set} groups={groups} showFtp />

          {/* Cron settings */}
          <div style={{ borderTop: "1px solid var(--border)", paddingTop: 14, marginTop: 6 }}>
            <div className="form-group">
              <label className="form-label">Run on days of month (comma-separated)</label>
              <input
                className="form-control"
                value={form.cron_days}
                onChange={(e) => set("cron_days", e.target.value)}
                placeholder="1,15"
              />
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Hour (0–23)</label>
                <input
                  className="form-control"
                  type="number" min={0} max={23}
                  value={form.cron_hour}
                  onChange={(e) => set("cron_hour", e.target.value)}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Minute (0–59)</label>
                <input
                  className="form-control"
                  type="number" min={0} max={59}
                  value={form.cron_minute}
                  onChange={(e) => set("cron_minute", e.target.value)}
                />
              </div>
            </div>
          </div>

          <button className="btn btn-primary" type="submit" disabled={saving} style={{ width: "100%", marginTop: 4 }}>
            {saving ? "Saving…" : "⏰ Create Schedule"}
          </button>
        </form>
      </div>

      {/* Existing schedules */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="card">
          <div style={{ fontWeight: 600, marginBottom: 16 }}>Active Schedules</div>
          {loading ? <Spinner text="Loading…" /> : schedules.length === 0 ? (
            <div className="empty">No schedules yet.</div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Group</th>
                    <th>Auth</th>
                    <th>Mode</th>
                    <th>Cron Schedule</th>
                    <th>Next Run</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {schedules.map((s) => (
                    <tr key={s.id}>
                      <td>{s.group_name}</td>
                      <td>
                        <span className={`badge badge-${s.auth_type}`}>
                          {s.auth_type === "non_tacacs" ? "Non-Tacacs" : "Tacacs"}
                        </span>
                      </td>
                      <td>
                        <span className="badge badge-gray">{s.backup_mode}</span>
                      </td>
                      <td className="monospace" style={{ fontSize: 12 }}>
                        Day {s.cron_days} @ {String(s.cron_hour).padStart(2, "0")}:{String(s.cron_minute).padStart(2, "0")}
                      </td>
                      <td style={{ whiteSpace: "nowrap" }}>
                        {s.is_active
                          ? <NextRun cronDays={s.cron_days} hour={s.cron_hour} minute={s.cron_minute} />
                          : <span style={{ color: "var(--text-muted)", fontSize: 12 }}>Paused</span>
                        }
                      </td>
                      <td>
                        <span className={`badge ${s.is_active ? "badge-success" : "badge-gray"}`}>
                          {s.is_active ? "● Active" : "⏸ Paused"}
                        </span>
                      </td>
                      <td>
                        <div className="flex-gap">
                          <button
                            className="btn btn-ghost btn-sm"
                            onClick={() => handleToggle(s.id)}
                            title={s.is_active ? "Pause schedule" : "Resume schedule"}
                          >
                            {s.is_active ? "⏸ Pause" : "▶ Resume"}
                          </button>
                          <button
                            className="btn btn-danger btn-sm"
                            onClick={() => handleDelete(s.id)}
                            title="Delete schedule"
                          >
                            × Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ── Legend ── */}
        <div className="card" style={{ marginTop: 16, fontSize: 12, color: "var(--text-muted)", lineHeight: 1.8 }}>
          <div style={{ fontWeight: 600, color: "var(--text)", marginBottom: 8 }}>ℹ️ How Schedules Work</div>
          <div>● <strong style={{ color: "var(--success)" }}>Active</strong> — backup will run automatically on the Next Run date</div>
          <div>⏸ <strong>Paused</strong> — schedule is saved but will NOT run until resumed</div>
          <div>🔁 Schedules are <strong>permanent</strong> — create once, runs every month forever</div>
          <div>⚡ The backend must be <strong>running</strong> on the scheduled date/time for the backup to execute</div>
        </div>
      </div>
    </div>
  );
}

/* ── Next Run calculator ─────────────────────────────────────────────────── */
function NextRun({ cronDays, hour, minute }) {
  const next = calcNextRun(cronDays, hour, minute);
  if (!next) return <span style={{ color: "var(--text-muted)", fontSize: 12 }}>—</span>;

  const now      = new Date();
  const diffMs   = next - now;
  const diffDays = Math.floor(diffMs / 86_400_000);
  const diffHrs  = Math.floor((diffMs % 86_400_000) / 3_600_000);
  const diffMins = Math.floor((diffMs % 3_600_000) / 60_000);

  let countdown = "";
  if (diffDays > 0)       countdown = `in ${diffDays}d ${diffHrs}h`;
  else if (diffHrs > 0)   countdown = `in ${diffHrs}h ${diffMins}m`;
  else if (diffMins > 0)  countdown = `in ${diffMins} min`;
  else                    countdown = "running soon";

  return (
    <div>
      <div style={{ fontSize: 12, color: "var(--text)", fontWeight: 600 }}>
        {next.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
        {" "}
        {next.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: true })}
      </div>
      <div style={{ fontSize: 11, color: "var(--primary)", marginTop: 1 }}>{countdown}</div>
    </div>
  );
}

/** Calculate the next Date when the cron job will fire (local time). */
function calcNextRun(cronDays, hour, minute) {
  try {
    const days = cronDays.split(",").map((d) => parseInt(d.trim(), 10)).filter((d) => d >= 1 && d <= 31);
    if (days.length === 0) return null;

    const now = new Date();
    const candidates = [];

    // Check next 3 months to find the upcoming run date
    for (let monthOffset = 0; monthOffset <= 2; monthOffset++) {
      const year  = now.getFullYear() + Math.floor((now.getMonth() + monthOffset) / 12);
      const month = (now.getMonth() + monthOffset) % 12;

      for (const day of days) {
        const candidate = new Date(year, month, day, hour, minute, 0);
        if (candidate > now) {
          candidates.push(candidate);
        }
      }
    }

    if (candidates.length === 0) return null;
    return candidates.sort((a, b) => a - b)[0];
  } catch {
    return null;
  }
}

/* ── Shared form fields ─────────────────────────────────────────────────── */
function BackupFormFields({ form, set, groups, showFtp }) {
  return (
    <>
      <div className="form-group">
        <label className="form-label">Auth Type *</label>
        <select className="form-control" value={form.auth_type} onChange={(e) => set("auth_type", e.target.value)}>
          {AUTH_TYPES.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
        </select>
      </div>

      <div className="form-group">
        <label className="form-label">Group Name *</label>
        <select className="form-control" value={form.group_name} onChange={(e) => set("group_name", e.target.value)} required>
          <option value="">— Select Group —</option>
          {groups.map((g) => <option key={g} value={g}>{g}</option>)}
        </select>
      </div>

      <div className="form-group">
        <label className="form-label">SSH Username *</label>
        <input
          className="form-control"
          placeholder="admin"
          value={form.username}
          onChange={(e) => set("username", e.target.value)}
          required
          autoComplete="username"
        />
      </div>

      <div className="form-group">
        <label className="form-label">SSH Password *</label>
        <input
          className="form-control"
          type="password"
          placeholder="••••••••"
          value={form.password}
          onChange={(e) => set("password", e.target.value)}
          required
          autoComplete="current-password"
        />
      </div>

      <div className="form-group">
        <label className="form-label">Backup Mode *</label>
        <select className="form-control" value={form.backup_mode} onChange={(e) => set("backup_mode", e.target.value)}>
          <option value="local">Local (filesystem)</option>
          <option value="ftp">FTP</option>
        </select>
      </div>

      {/* Local path – shown when local mode is selected */}
      {form.backup_mode === "local" && (
        <div style={{ background: "rgba(34,197,94,.06)", border: "1px solid rgba(34,197,94,.2)", borderRadius: "var(--radius)", padding: "14px 16px", marginBottom: 16 }}>
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 10 }}>
            Local Folder Configuration
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">
              Backup Folder Path
              <span style={{ fontWeight: 400 }}> — leave blank to use default (<code style={{ fontSize: 11 }}>backups/</code> inside the backend folder)</span>
            </label>
            <input
              className="form-control monospace"
              placeholder={"e.g.  C:\\Backups\\Cisco   or   D:\\NetworkBackups"}
              value={form.local_path}
              onChange={(e) => set("local_path", e.target.value)}
            />
            {form.local_path && (
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 6 }}>
                Files will be saved to: <code style={{ color: "var(--success)" }}>{form.local_path}\{"{group}"}\{"{DD_MM_YYYY}"}\{"{ip}_DD_MM_YYYY.txt"}</code>
              </div>
            )}
          </div>
        </div>
      )}

      {showFtp && form.backup_mode === "ftp" && (
        <div style={{ background: "rgba(59,130,246,.06)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "14px 16px", marginBottom: 16 }}>
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 10 }}>FTP Server Configuration</div>
          <div className="form-group">
            <label className="form-label">FTP IP</label>
            <input
              className="form-control"
              value={form.ftp_ip}
              onChange={(e) => set("ftp_ip", e.target.value)}
              placeholder="10.69.10.11"
              required
            />
          </div>
          <div className="form-group">
            <label className="form-label">FTP Username</label>
            <input
              className="form-control"
              value={form.ftp_username}
              onChange={(e) => set("ftp_username", e.target.value)}
              required
            />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">FTP Password</label>
            <input
              className="form-control"
              type="password"
              value={form.ftp_password}
              onChange={(e) => set("ftp_password", e.target.value)}
              required
            />
          </div>
        </div>
      )}
    </>
  );
}
