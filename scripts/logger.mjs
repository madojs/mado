const LEVELS = { debug: 10, info: 20, warn: 30, error: 40, silent: 50 };
const COLORS = {
  debug: "\u001b[2m",
  info: "\u001b[36m",
  warn: "\u001b[33m",
  error: "\u001b[31m",
};

let level = normaliseLevel(process.env.MADO_LOG_LEVEL) ?? "info";
let format = normaliseFormat(process.env.MADO_LOG_FORMAT) ?? "auto";

export function configureLogger(argv) {
  const clean = [];
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    const [name, inline] = arg.split("=", 2);
    if (name === "--log-level" || name === "--log-format") {
      const value = inline ?? argv[++index];
      if (!value) throw new Error(`${name} requires a value`);
      if (name === "--log-level") {
        const next = normaliseLevel(value);
        if (!next) throw new Error(`invalid log level: ${value}`);
        level = next;
      } else {
        const next = normaliseFormat(value);
        if (!next) throw new Error(`invalid log format: ${value}`);
        format = next;
      }
      continue;
    }
    if (arg === "--no-color") {
      format = "plain";
      continue;
    }
    clean.push(arg);
  }
  return clean;
}

export function diagnostic(levelName, scope, code, message, data) {
  if (LEVELS[levelName] < LEVELS[level]) return;
  const record = {
    timestamp: new Date().toISOString(),
    level: levelName,
    scope,
    code,
    message,
    ...(data === undefined ? {} : { data }),
  };
  const stream = levelName === "warn" || levelName === "error"
    ? process.stderr
    : process.stdout;
  if (resolvedFormat(stream) === "json") {
    stream.write(`${JSON.stringify(record, safeJson)}\n`);
    return;
  }
  const prefix = scope === "mado" ? "[mado]" : `[${scope}]`;
  const suffix = data === undefined ? "" : ` ${safePreview(data)}`;
  const line = `${prefix}${code ? ` ${code}` : ""} ${message}${suffix}`;
  if (resolvedFormat(stream) === "pretty") {
    stream.write(`${COLORS[levelName] ?? ""}${line}\u001b[0m\n`);
  } else {
    stream.write(`${line}\n`);
  }
}

export const logger = {
  debug(scope, code, message, data) {
    diagnostic("debug", scope, code, message, data);
  },
  info(scope, code, message, data) {
    diagnostic("info", scope, code, message, data);
  },
  warn(scope, code, message, data) {
    diagnostic("warn", scope, code, message, data);
  },
  error(scope, code, message, data) {
    diagnostic("error", scope, code, message, data);
  },
};

function resolvedFormat(stream) {
  if (format !== "auto") return format;
  if (process.env.NO_COLOR !== undefined || !stream.isTTY) return "plain";
  return "pretty";
}

function normaliseLevel(value) {
  if (!value) return null;
  const candidate = String(value).toLowerCase();
  return Object.hasOwn(LEVELS, candidate) ? candidate : null;
}

function normaliseFormat(value) {
  if (!value) return null;
  const candidate = String(value).toLowerCase();
  return ["auto", "pretty", "plain", "json"].includes(candidate)
    ? candidate
    : null;
}

function safeJson(_key, value) {
  if (typeof value === "bigint") return `${value}n`;
  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack };
  }
  return value;
}

function safePreview(value) {
  try {
    const text = JSON.stringify(value, safeJson);
    return text.length > 500 ? `${text.slice(0, 497)}...` : text;
  } catch {
    return String(value);
  }
}
