export default function Spinner({ text = "Loading…" }) {
  return (
    <div className="loading-wrap">
      <span className="spinner" />
      <span>{text}</span>
    </div>
  );
}
