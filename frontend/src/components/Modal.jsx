/**
 * Generic modal wrapper.
 *
 * Layout:
 *   ┌──────────────────────┐
 *   │ header (fixed)       │
 *   ├──────────────────────┤
 *   │ body   (scrollable)  │  ← max-height: 90vh, overflows here
 *   ├──────────────────────┤
 *   │ footer (fixed)       │
 *   └──────────────────────┘
 *
 * Usage:
 *   <Modal title="Add Device" onClose={() => setOpen(false)}
 *          footer={<><button>Cancel</button><button>Save</button></>}>
 *     <form>…</form>
 *   </Modal>
 */
export default function Modal({ title, onClose, children, footer }) {
  return (
    <div
      className="modal-overlay"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="modal">
        {/* Fixed header */}
        <div className="modal-header">
          <span className="modal-title">{title}</span>
          <button className="modal-close" onClick={onClose} aria-label="Close">×</button>
        </div>

        {/* Scrollable body */}
        <div className="modal-body">
          {children}
        </div>

        {/* Fixed footer */}
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  );
}
