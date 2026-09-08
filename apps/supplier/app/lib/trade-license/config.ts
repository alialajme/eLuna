// A real UAE trade-licence registry (e.g. Basher / DED / Ministry of Economy)
// needs both an endpoint and an API key. Absent either, we fall back to the
// local simulated verifier.
export const hasTradeLicenseRegistry = () =>
  !!process.env.TRADE_LICENSE_REGISTRY_URL && !!process.env.TRADE_LICENSE_API_KEY;
