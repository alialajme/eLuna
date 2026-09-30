// Structured logging for AYVANA.
//
// One JSON object per line (stdout/stderr) so logs are machine-parseable by
// Azure Log Analytics / Application Insights. Loggers carry bound context
// (correlationId, orderId, paymentId, vendorId, …) via `child()` so every line
// in a flow is correlatable. Sensitive keys are redacted before emission.
//
// This is a thin, dependency-free core. An OpenTelemetry / App Insights exporter
// can wrap `write` without changing call sites (tracked in PRODUCTION-HARDENING §21).

export type LogLevel = "debug" | "info" | "warn" | "error";

export type LogFields = Record<string, unknown>;

const LEVEL_WEIGHT: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

const REDACT_KEYS = new Set([
  "password",
  "secret",
  "token",
  "apikey",
  "api_key",
  "authorization",
  "card",
  "cardnumber",
  "cvv",
  "pan",
  "clientsecret",
  "client_secret",
]);

function redact(fields: LogFields): LogFields {
  const out: LogFields = {};
  for (const [k, v] of Object.entries(fields)) {
    out[k] = REDACT_KEYS.has(k.toLowerCase()) ? "[redacted]" : v;
  }
  return out;
}

export interface Logger {
  debug(msg: string, fields?: LogFields): void;
  info(msg: string, fields?: LogFields): void;
  warn(msg: string, fields?: LogFields): void;
  error(msg: string, fields?: LogFields): void;
  /** Return a new logger with additional bound context merged in. */
  child(bindings: LogFields): Logger;
}

export type LoggerOptions = {
  level?: LogLevel;
  service?: string;
  env?: string;
  /** Sink for a finished JSON line. Defaults to console by level. Injectable for tests. */
  write?: (level: LogLevel, line: string) => void;
  now?: () => string;
};

function defaultWrite(level: LogLevel, line: string): void {
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export function createLogger(opts: LoggerOptions = {}): Logger {
  const minWeight = LEVEL_WEIGHT[opts.level ?? "info"];
  const service = opts.service ?? process.env.SERVICE_NAME ?? "e-luna";
  const env = opts.env ?? process.env.NODE_ENV ?? "development";
  const write = opts.write ?? defaultWrite;
  const now = opts.now ?? (() => new Date().toISOString());

  function make(bound: LogFields): Logger {
    function emit(level: LogLevel, msg: string, fields?: LogFields) {
      if (LEVEL_WEIGHT[level] < minWeight) return;
      const record = {
        ts: now(),
        level,
        service,
        env,
        msg,
        ...redact({ ...bound, ...(fields ?? {}) }),
      };
      write(level, JSON.stringify(record));
    }
    return {
      debug: (m, f) => emit("debug", m, f),
      info: (m, f) => emit("info", m, f),
      warn: (m, f) => emit("warn", m, f),
      error: (m, f) => emit("error", m, f),
      child: (bindings) => make({ ...bound, ...bindings }),
    };
  }

  return make({});
}

/** Default process-wide logger. Prefer a `child()` with request context at call sites. */
export const logger = createLogger();
