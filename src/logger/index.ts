import pino from "pino";
import {safeError, safeLogRecord, safeLogText} from './sanitize';

const isProduction = process.env.NODE_ENV === "production";
const logger = pino({
  serializers: {err: safeError, error: safeError},
  formatters: {log: safeLogRecord},
  hooks: {logMethod(args, method) {
    const safe = args.map(value => typeof value === 'string' ? safeLogText(value) : value);
    method.apply(this, safe as Parameters<typeof method>);
  }},
  redact: { paths: ["command.args", "err.command.args", "error.command.args"], censor: "[REDACTED]" },
  ...(!isProduction && {
    transport: {
      target: "pino-pretty",
      options: {
        colorize: true,
        singleLine: false, // Format logs over multiple lines for readability
        translateTime: true, // Show human-readable time
      },
    },
  }),
});

export default logger;
