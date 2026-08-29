export function securityHeaders(): { key: string; value: string }[];
export function securityHeadersConfig(): Promise<
  Array<{ source: string; headers: { key: string; value: string }[] }>
>;
