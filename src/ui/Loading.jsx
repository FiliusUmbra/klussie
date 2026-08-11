// The placeholder every screen shows while its first fetch is in flight.
//
// Six call sites wrote this same markup inline before the split. It is deliberately
// wordless: a spinner or a translated "Loading…" would both be more presence than a
// screen that is about to appear in a few hundred milliseconds deserves.
export function LoadingScreen() {
  return <div className="pad"><div className="empty-block"><p>...</p></div></div>;
}
