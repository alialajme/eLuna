export const hasFtaAccessPoint = () =>
  !!process.env.FTA_ACCESS_POINT_URL && !!process.env.FTA_API_KEY;
