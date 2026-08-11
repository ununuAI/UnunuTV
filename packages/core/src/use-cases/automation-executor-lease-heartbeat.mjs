import { normalizeAutomationLeaseTtl } from "../automation-lease-policy.mjs";

export function startAutomationExecutorLeaseHeartbeat({ leaseTtlMs, renew }) {
  if (typeof renew !== "function") throw new TypeError("Automation executor lease heartbeat requires renew");
  const intervalMs = Math.max(50, Math.floor(normalizeAutomationLeaseTtl(leaseTtlMs) / 3));
  let failure = null;
  let latest = null;
  let pending = Promise.resolve();
  let stopped = false;
  let timer = null;

  function schedule() {
    if (stopped) return;
    timer = setTimeout(() => {
      timer = null;
      pending = Promise.resolve()
        .then(renew)
        .then((value) => { latest = value; })
        .catch((error) => {
          failure = error;
          stopped = true;
        })
        .finally(schedule);
    }, intervalMs);
    timer.unref?.();
  }

  schedule();
  return {
    intervalMs,
    async stop() {
      stopped = true;
      if (timer) clearTimeout(timer);
      timer = null;
      await pending;
      if (failure) throw failure;
      return latest;
    }
  };
}
