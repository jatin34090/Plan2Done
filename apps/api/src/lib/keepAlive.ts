/**
 * Keeps a free-tier host (e.g. Render) awake by pinging its own /health
 * endpoint on an interval shorter than the idle-sleep window.
 *
 * Only runs when a public URL is known:
 *  - Render sets RENDER_EXTERNAL_URL automatically, or
 *  - set KEEP_ALIVE_URL explicitly (e.g. a custom API domain).
 * It stays off in local dev, where neither is set.
 *
 * Note: this keeps the instance alive while it is already awake. If it does
 * sleep (a deploy, a crash, or a gap longer than the interval), the next real
 * request wakes it. For guaranteed uptime, add an external pinger too.
 */
export function startKeepAlive() {
  const base = process.env.KEEP_ALIVE_URL || process.env.RENDER_EXTERNAL_URL;
  if (!base) return;

  const target = `${base.replace(/\/+$/, "")}/health`;
  // Render free tier sleeps after ~15 min idle; ping a bit sooner.
  const intervalMs = Number(process.env.KEEP_ALIVE_INTERVAL_MS ?? 14 * 60 * 1000);

  const timer = setInterval(async () => {
    try {
      const res = await fetch(target, { headers: { "user-agent": "plan2done-keepalive" } });
      if (!res.ok) console.warn(`Keep-alive ping returned ${res.status}`);
    } catch (error) {
      console.warn("Keep-alive ping failed:", (error as Error).message);
    }
  }, intervalMs);

  // Don't let the ping timer keep the process alive on its own.
  timer.unref?.();
  console.log(`Keep-alive: pinging ${target} every ${Math.round(intervalMs / 60000)}m`);
}
