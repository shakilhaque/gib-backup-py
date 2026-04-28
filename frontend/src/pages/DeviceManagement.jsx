/**
 * Device Management page
 *
 * Features:
 *  - List all devices (filterable by group / auth type)
 *  - Add single device via modal
 *  - Bulk paste multiple IPs
 *  - Edit / Delete
 *  - Pagination (25 per page)
 */
import { useEffect, useState, useCallback } from "react";
import {
  getDevices, getGroups, createDevice,
  updateDevice, deleteDevice, bulkCreateDevices,
} from "../api/devices";
import Modal from "../components/Modal";
import Spinner from "../components/Spinner";

const AUTH_TYPES = [
  { value: "tacacs",     label: "Tacacs" },
  { value: "non_tacacs", label: "Non-Tacacs" },
];

const EMPTY_FORM = { ip_addresses: "", device_name: "", group_name: "", auth_type: "tacacs" };
const PAGE_SIZE  = 25;

/** Parse a raw string of IPs (newlines, commas, semicolons) into a clean array. */
function parseIPs(raw) {
  return raw
    .split(/[\n,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export default function DeviceManagement() {
  const [devices, setDevices]     = useState([]);
  const [groups, setGroups]       = useState([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState(null);
  const [success, setSuccess]     = useState(null);

  // Filters
  const [filterGroup, setFilterGroup] = useState("");
  const [filterAuth, setFilterAuth]   = useState("");

  // Pagination
  const [page, setPage] = useState(1);

  // Single-device modal
  const [showModal, setShowModal]   = useState(false);
  const [editDevice, setEditDevice] = useState(null);
  const [form, setForm]             = useState(EMPTY_FORM);
  const [saving, setSaving]         = useState(false);

  // Bulk modal
  const [showBulk, setShowBulk]         = useState(false);
  const [bulkGroup, setBulkGroup]       = useState("");
  const [bulkAuth, setBulkAuth]         = useState("tacacs");
  const [bulkText, setBulkText]         = useState("");
  const [bulkSaving, setBulkSaving]     = useState(false);

  const fetchDevices = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (filterGroup) params.group_name = filterGroup;
      if (filterAuth)  params.auth_type  = filterAuth;
      const [devs, grps] = await Promise.all([getDevices(params), getGroups()]);
      setDevices(devs);
      setGroups(grps);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [filterGroup, filterAuth]);

  useEffect(() => { fetchDevices(); }, [fetchDevices]);

  // Reset to page 1 whenever filters change
  useEffect(() => { setPage(1); }, [filterGroup, filterAuth]);

  /* ── Pagination ─────────────────────────────────────────────────── */
  const totalDevices = devices.length;
  const totalPages   = Math.max(1, Math.ceil(totalDevices / PAGE_SIZE));
  const safePage     = Math.min(page, totalPages);
  const pagedDevices = devices.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const goToPage = (p) => setPage(Math.max(1, Math.min(p, totalPages)));

  /* ── Single device CRUD ─────────────────────────────────── */
  const openAdd = () => {
    setEditDevice(null);
    setForm(EMPTY_FORM);
    setShowModal(true);
  };

  /** Open Add modal pre-filled with the group + auth type of an existing device row. */
  const openAddToGroup = (device) => {
    setEditDevice(null);
    setForm({ ip_addresses: "", device_name: "", group_name: device.group_name, auth_type: device.auth_type });
    setShowModal(true);
  };

  const openEdit = (device) => {
    setEditDevice(device);
    setForm({ ip_addresses: device.ip_address, device_name: device.device_name || "", group_name: device.group_name, auth_type: device.auth_type });
    setShowModal(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      if (editDevice) {
        // Edit: always single IP
        await updateDevice(editDevice.id, {
          ip_address:  form.ip_addresses.trim(),
          device_name: form.device_name.trim() || null,
          group_name:  form.group_name,
          auth_type:   form.auth_type,
        });
        flash("Device updated.");
      } else {
        const ips = parseIPs(form.ip_addresses);
        if (ips.length === 0) { setError("Enter at least one IP address."); return; }

        if (ips.length === 1) {
          // Single device
          await createDevice({ ip_address: ips[0], device_name: form.device_name.trim() || null, group_name: form.group_name, auth_type: form.auth_type });
          flash("Device added.");
        } else {
          // Multiple IPs → bulk endpoint
          const devices = ips.map((ip) => ({
            ip_address: ip,
            group_name: form.group_name,
            auth_type: form.auth_type,
          }));
          const result = await bulkCreateDevices(devices);
          flash(`Added ${result.created} device(s). ${result.skipped > 0 ? `${result.skipped} skipped (duplicate).` : ""}`);
        }
      }
      setShowModal(false);
      fetchDevices();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (device) => {
    if (!confirm(`Delete device ${device.ip_address}?`)) return;
    try {
      await deleteDevice(device.id);
      flash("Device deleted.");
      fetchDevices();
    } catch (e) {
      setError(e.message);
    }
  };

  /* ── Bulk upload ─────────────────────────────────────────── */
  const handleBulkSave = async (e) => {
    e.preventDefault();
    setBulkSaving(true);
    setError(null);
    try {
      const ips = bulkText
        .split(/[\n,;]+/)
        .map((s) => s.trim())
        .filter(Boolean);

      if (ips.length === 0) {
        setError("No IPs found – paste one IP per line.");
        return;
      }

      const devices = ips.map((ip) => ({
        ip_address: ip,
        group_name: bulkGroup,
        auth_type: bulkAuth,
      }));

      const result = await bulkCreateDevices(devices);
      flash(`Bulk upload: ${result.created} created, ${result.skipped} skipped.`);
      setShowBulk(false);
      setBulkText("");
      fetchDevices();
    } catch (e) {
      setError(e.message);
    } finally {
      setBulkSaving(false);
    }
  };

  const flash = (msg) => {
    setSuccess(msg);
    setTimeout(() => setSuccess(null), 4000);
  };

  /* ── Render ─────────────────────────────────────────────── */
  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-title">Device Management</div>
          <div className="page-sub">All devices are stored in the database – no hardcoded IPs.</div>
        </div>
        <div className="flex-gap">
          <button className="btn btn-primary" onClick={openAdd}>+ Add Device</button>
        </div>
      </div>

      {error   && <div className="alert alert-error">{error}</div>}
      {success && <div className="alert alert-success">{success}</div>}

      {/* Filters */}
      <div className="card mb-4" style={{ marginBottom: 16 }}>
        <div className="form-row">
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Filter by Group</label>
            <select
              className="form-control"
              value={filterGroup}
              onChange={(e) => setFilterGroup(e.target.value)}
            >
              <option value="">All Groups</option>
              {groups.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Filter by Auth Type</label>
            <select
              className="form-control"
              value={filterAuth}
              onChange={(e) => setFilterAuth(e.target.value)}
            >
              <option value="">All Types</option>
              {AUTH_TYPES.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="card">
        {loading ? (
          <Spinner text="Loading devices…" />
        ) : devices.length === 0 ? (
          <div className="empty">No devices found. Add one to get started.</div>
        ) : (
          <>
            {/* Count summary */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
              <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                Showing <strong style={{ color: "var(--text)" }}>
                  {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, totalDevices)}
                </strong> of <strong style={{ color: "var(--text)" }}>{totalDevices}</strong> device(s)
              </div>
              {totalPages > 1 && (
                <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                  Page <strong style={{ color: "var(--text)" }}>{safePage}</strong> of <strong style={{ color: "var(--text)" }}>{totalPages}</strong>
                </div>
              )}
            </div>

            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>IP Address</th>
                    <th>Device Name</th>
                    <th>Group Name</th>
                    <th>Auth Type</th>
                    <th>Added</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedDevices.map((d, i) => (
                    <tr key={d.id}>
                      <td style={{ color: "var(--text-muted)" }}>{(safePage - 1) * PAGE_SIZE + i + 1}</td>
                      <td className="monospace">{d.ip_address}</td>
                      <td style={{ color: d.device_name ? "var(--text)" : "var(--text-muted)", fontSize: 13 }}>{d.device_name || "—"}</td>
                      <td>{d.group_name}</td>
                      <td>
                        <span className={`badge badge-${d.auth_type}`}>
                          {d.auth_type === "non_tacacs" ? "Non-Tacacs" : "Tacacs"}
                        </span>
                      </td>
                      <td>{new Date(d.created_at).toLocaleDateString()}</td>
                      <td>
                        <div className="flex-gap">
                          <button
                            className="btn btn-success btn-sm"
                            onClick={() => openAddToGroup(d)}
                            title={`Add new IP to group "${d.group_name}" (${d.auth_type})`}
                          >
                            + Add IP
                          </button>
                          <button className="btn btn-ghost btn-sm" onClick={() => openEdit(d)}>Edit</button>
                          <button className="btn btn-danger btn-sm" onClick={() => handleDelete(d)}>Delete</button>
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

      {/* ── Add / Edit modal ── */}
      {showModal && (() => {
        const ipCount = editDevice ? 1 : parseIPs(form.ip_addresses).length;
        const btnLabel = saving
          ? "Saving…"
          : editDevice
          ? "Save Changes"
          : ipCount > 1
          ? `Add ${ipCount} Devices`
          : "Add Device";

        return (
          <Modal
            title={editDevice ? "Edit Device" : "Add Device"}
            onClose={() => setShowModal(false)}
            footer={
              <>
                <button className="btn btn-ghost" onClick={() => setShowModal(false)}>Cancel</button>
                <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                  {btnLabel}
                </button>
              </>
            }
          >
            <form onSubmit={handleSave}>
              <div className="form-group">
                <label className="form-label">
                  IP Address(es) *{" "}
                  {!editDevice && (
                    <span style={{ color: "var(--text-muted)", fontWeight: 400 }}>
                      — one per line, or comma-separated
                    </span>
                  )}
                </label>
                {editDevice ? (
                  <input
                    className="form-control monospace"
                    value={form.ip_addresses}
                    onChange={(e) => setForm({ ...form, ip_addresses: e.target.value })}
                    required
                  />
                ) : (
                  <textarea
                    className="form-control monospace"
                    rows={5}
                    placeholder={"172.30.1.1\n172.30.1.2\n172.30.1.3"}
                    value={form.ip_addresses}
                    onChange={(e) => setForm({ ...form, ip_addresses: e.target.value })}
                    required
                  />
                )}
              </div>
              <div className="form-group">
                <label className="form-label">
                  Device Name
                  <span style={{ fontWeight: 400, color: "var(--text-muted)" }}> — optional label (e.g. Core-SW-01)</span>
                </label>
                <input
                  className="form-control"
                  placeholder="e.g. Core-Switch-01"
                  value={form.device_name}
                  onChange={(e) => setForm({ ...form, device_name: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Group Name *</label>
                <input
                  className="form-control"
                  placeholder="e.g. Branch Router"
                  list="group-list"
                  value={form.group_name}
                  onChange={(e) => setForm({ ...form, group_name: e.target.value })}
                  required
                />
                <datalist id="group-list">
                  {groups.map((g) => <option key={g} value={g} />)}
                </datalist>
              </div>
              <div className="form-group">
                <label className="form-label">Auth Type *</label>
                <select
                  className="form-control"
                  value={form.auth_type}
                  onChange={(e) => setForm({ ...form, auth_type: e.target.value })}
                >
                  {AUTH_TYPES.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
                </select>
              </div>
            </form>
          </Modal>
        );
      })()}

      {/* ── Bulk upload modal ── */}
      {showBulk && (
        <Modal
          title="Bulk Device Upload"
          onClose={() => setShowBulk(false)}
          footer={
            <>
              <button className="btn btn-ghost" onClick={() => setShowBulk(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleBulkSave} disabled={bulkSaving}>
                {bulkSaving ? "Uploading…" : "Upload Devices"}
              </button>
            </>
          }
        >
          <div className="form-group">
            <label className="form-label">Group Name *</label>
            <input
              className="form-control"
              placeholder="e.g. Branch Router"
              list="group-list-bulk"
              value={bulkGroup}
              onChange={(e) => setBulkGroup(e.target.value)}
              required
            />
            <datalist id="group-list-bulk">
              {groups.map((g) => <option key={g} value={g} />)}
            </datalist>
          </div>
          <div className="form-group">
            <label className="form-label">Auth Type *</label>
            <select
              className="form-control"
              value={bulkAuth}
              onChange={(e) => setBulkAuth(e.target.value)}
            >
              {AUTH_TYPES.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">IP Addresses (one per line)</label>
            <textarea
              className="form-control monospace"
              rows={8}
              placeholder={"172.30.1.1\n172.30.1.2\n172.30.1.3"}
              value={bulkText}
              onChange={(e) => setBulkText(e.target.value)}
            />
          </div>
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
