// Instant loading UI shown inside the persistent app shell (header + nav) while a
// route segment loads. Keeps navigation seamless: the shell stays, only the content
// area shows a loader instead of blanking out between pages.
export default function Loading() {
  return (
    <div className="centerLoading">
      <div className="spinner" />
    </div>
  );
}
