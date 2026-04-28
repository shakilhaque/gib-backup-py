/**
 * Users Management page — Admin only
 *
 * Features:
 *  - List all users with role, status, last login
 *  - Create new user (admin or staff)
 *  - Edit user (name, email, role, status, password)
 *  - Delete user (cannot delete yourself)
 *  - Pagination (20 per page)
 */
import { useEffect, useState } from "react";
import { getUsers, createUser, updateUser, deleteUser } from "../api/users";
import Spinner from "../components/Spinner";
import Modal from "../components/Modal";

const ROLE_OPTIONS = [
  { value: "admin", label: "Admin" },
  { value: "staff", label: "IT Staff" },
];

const EMPTY_FORM = {
  username: "", full_name: "", email: "",
  password: "", role: "staff", is_active: true,
};

const PAGE_SIZE = 20;

function parseUTC(d) {
  if (!d) return null;
  if (d.endsWith("Z") || d.includes("+")) return new Date(d);
  return new Date(d + "Z");
}
function fmtDateTime(d) {
  const dt = parseUTC(d);
  if (!dt) return "Never";
  return dt.toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: true });
}

export default function UsersPage({ currentUser }) {
  const [users,   setUsers]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);

  // Pagination
  const [page, setPage] = useState(1);

  // Modal state
  const [modal,   setModal]   = useState(null);  // null | "create" | "edit"
  const [editTarget, setEditTarget] = useState(null);
  const [form,    setForm]    = useState(EMPTY_FORM);
  const [saving,  setSaving]  = useState(false);
  const [formErr, setFormErr] = useState(null);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const fetchUsers = async () => {
    setLoading(true);
    try {
      setUsers(await getUsers());
      setError(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchUsers(); }, []);

  /* ── Pagination ── */
  const totalUsers = users.length;
  const totalPages = Math.max(1, Math.ceil(totalUsers / PAGE_SIZE));
  const safePage   = Math.min(page, totalPages);
  const pagedUsers = users.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const goToPage   = (p) => setPage(Math.max(1, Math.min(p, totalPages)));

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setFormErr(null);
    setEditTarget(null);
    setModal("create");
  };

  const openEdit = (user) => {
    setForm({
      username:  user.username,
      full_name: user.full_name || "",
      email:     user.email || "",
      password:  "",
      role:      user.role,
      is_active: user.is_active,
    });
    setFormErr(null);
    setEditTarget(user);
    setModal("edit");
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setFormErr(null);
    try {
      if (modal === "create") {
        await createUser(form);
      } else {
        const payload = { ...form };
        if (!payload.password) delete payload.password; // don't send empty password
        delete payload.username; // username is immutable
        await updateUser(editTarget.id, payload);
      }
      setModal(null);
      fetchUsers();
    } catch (e) {
      setFormErr(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (user) => {
    if (!confirm(`Delete user "${user.username}"? This cannot be undone.`)) return;
    try {
      await deleteUser(user.id);
      fetchUsers();
    } catch (e) {
      alert(e.message);
    }
  };

  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-title">User Management</div>
          <div className="page-sub">Create and manage admin and IT staff accounts.</div>
        </div>
        <button className="btn btn-primary" onClick={openCreate}>+ Create User</button>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="card">
        {loading ? <Spinner text="Loading users…" /> : (
          <>
            {/* Count summary */}
            {totalUsers > 0 && (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
                <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                  Showing <strong style={{ color: "var(--text)" }}>
                    {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, totalUsers)}
                  </strong> of <strong style={{ color: "var(--text)" }}>{totalUsers}</strong> user(s)
                </div>
                {totalPages > 1 && (
                  <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                    Page <strong style={{ color: "var(--text)" }}>{safePage}</strong> of <strong style={{ color: "var(--text)" }}>{totalPages}</strong>
                  </div>
                )}
              </div>
            )}

            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Username</th>
                    <th>Full Name</th>
                    <th>Email</th>
                    <th>Role</th>
                    <th>Status</th>
                    <th>Last Login</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedUsers.map((u, i) => (
                    <tr key={u.id}>
                      <td style={{ color: "var(--text-muted)" }}>{(safePage - 1) * PAGE_SIZE + i + 1}</td>
                      <td>
                        <strong>{u.username}</strong>
                        {u.id === currentUser?.id && (
                          <span style={{ fontSize: 10, marginLeft: 6, color: "var(--primary)", background: "rgba(99,102,241,.15)", padding: "1px 6px", borderRadius: 4 }}>You</span>
                        )}
                      </td>
                      <td>{u.full_name || <span style={{ color: "var(--text-muted)" }}>—</span>}</td>
                      <td style={{ fontSize: 12 }}>{u.email || <span style={{ color: "var(--text-muted)" }}>—</span>}</td>
                      <td>
                        <span className={`badge ${u.role === "admin" ? "badge-tacacs" : "badge-gray"}`}>
                          {u.role === "admin" ? "👑 Admin" : "🔧 IT Staff"}
                        </span>
                      </td>
                      <td>
                        <span className={`badge ${u.is_active ? "badge-success" : "badge-error"}`}>
                          {u.is_active ? "● Active" : "○ Disabled"}
                        </span>
                      </td>
                      <td style={{ fontSize: 12, color: "var(--text-muted)", whiteSpace: "nowrap" }}>
                        {fmtDateTime(u.last_login)}
                      </td>
                      <td>
                        <div className="flex-gap">
                          <button className="btn btn-ghost btn-sm" onClick={() => openEdit(u)}>✎ Edit</button>
                          {u.id !== currentUser?.id && (
                            <button className="btn btn-danger btn-sm" onClick={() => handleDelete(u)}>× Delete</button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <Pagination current={safePage} total={totalPages} onChange={goToPage} />
            )}
          </>
        )}
      </div>

      {/* ── Create / Edit Modal ── */}
      {modal && (
        <Modal
          title={modal === "create" ? "Create New User" : `Edit User: ${editTarget?.username}`}
          onClose={() => setModal(null)}
          footer={
            <>
              <button className="btn btn-ghost" onClick={() => setModal(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? "Saving…" : modal === "create" ? "Create User" : "Save Changes"}
              </button>
            </>
          }
        >
          {formErr && <div className="alert alert-error" style={{ marginBottom: 16 }}>{formErr}</div>}
          <form onSubmit={handleSave}>
            {/* Username – only shown when creating */}
            {modal === "create" && (
              <div className="form-group">
                <label className="form-label">Username *</label>
                <input
                  className="form-control"
                  value={form.username}
                  onChange={e => set("username", e.target.value)}
                  required
                  placeholder="e.g. john.doe"
                  autoComplete="off"
                />
              </div>
            )}

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Full Name</label>
                <input
                  className="form-control"
                  value={form.full_name}
                  onChange={e => set("full_name", e.target.value)}
                  placeholder="John Doe"
                />
              </div>
              <div className="form-group">
                <label className="form-label">Email</label>
                <input
                  className="form-control"
                  type="email"
                  value={form.email}
                  onChange={e => set("email", e.target.value)}
                  placeholder="john@example.com"
                />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">
                {modal === "create" ? "Password *" : "New Password"}
                {modal === "edit" && <span style={{ fontWeight: 400, color: "var(--text-muted)" }}> — leave blank to keep current</span>}
              </label>
              <input
                className="form-control"
                type="password"
                value={form.password}
                onChange={e => set("password", e.target.value)}
                required={modal === "create"}
                placeholder="••••••••"
                autoComplete="new-password"
              />
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Role *</label>
                <select className="form-control" value={form.role} onChange={e => set("role", e.target.value)}>
                  {ROLE_OPTIONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Status</label>
                <select className="form-control" value={form.is_active ? "1" : "0"} onChange={e => set("is_active", e.target.value === "1")}>
                  <option value="1">Active</option>
                  <option value="0">Disabled</option>
                </select>
              </div>
            </div>

            {/* Role info */}
            <div style={{ background: "rgba(59,130,246,.06)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "10px 14px", fontSize: 12, color: "var(--text-muted)" }}>
              <strong style={{ color: "var(--text)" }}>👑 Admin:</strong> Full access — manage users, devices, backups, schedules<br />
              <strong style={{ color: "var(--text)" }}>🔧 IT Staff:</strong> Run backups, view logs and devices (cannot manage users)
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}

/* ── Pagination component ────────────────────────────────────────────────── */
function Pagination({ current, total, onChange }) {
  const pages = [];
  if (total <= 7) {
    for (let i = 1; i <= total; i++) pages.push(i);
  } else {
    pages.push(1);
    if (current > 3)         pages.push("…");
    for (let i = Math.max(2, current - 1); i <= Math.min(total - 1, current + 1); i++) pages.push(i);
    if (current < total - 2) pages.push("…");
    pages.push(total);
  }

  const btn = (content, page, disabled = false, active = false) => (
    <button
      key={content + "-" + page}
      onClick={() => !disabled && page && onChange(page)}
      disabled={disabled}
      style={{
        minWidth: 34, height: 34, padding: "0 10px",
        borderRadius: "var(--radius)",
        border: active ? "none" : "1px solid var(--border)",
        background: active ? "var(--primary)" : disabled ? "transparent" : "var(--surface2)",
        color: active ? "#fff" : disabled ? "var(--text-muted)" : "var(--text)",
        fontWeight: active ? 700 : 400, fontSize: 13,
        cursor: disabled ? "default" : "pointer",
        transition: "background .15s",
      }}
    >
      {content}
    </button>
  );

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 20, paddingTop: 16, borderTop: "1px solid var(--border)" }}>
      {btn("← Prev", current - 1, current === 1)}
      {pages.map((p, i) =>
        p === "…"
          ? <span key={`ellipsis-${i}`} style={{ color: "var(--text-muted)", fontSize: 13, padding: "0 4px" }}>…</span>
          : btn(p, p, false, p === current)
      )}
      {btn("Next →", current + 1, current === total)}
    </div>
  );
}
