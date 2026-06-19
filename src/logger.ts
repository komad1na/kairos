import { appendSessionLog } from "./api";

type LogLevel = "debug" | "info" | "warn" | "error";

export function logDebug(message: string, data?: unknown) {
  writeLog("debug", message, data);
}

export function logInfo(message: string, data?: unknown) {
  writeLog("info", message, data);
}

export function logWarn(message: string, data?: unknown) {
  writeLog("warn", message, data);
}

export function logError(message: string, data?: unknown) {
  writeLog("error", message, data);
}

function writeLog(level: LogLevel, message: string, data?: unknown) {
  const line = data == null ? message : `${message} ${serializeLogData(data)}`;
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else if (level === "debug") console.debug(line);
  else console.info(line);
  void appendSessionLog(level, line).catch(() => undefined);
}

function serializeLogData(data: unknown): string {
  if (data instanceof Error) return `${data.name}: ${data.message}\n${data.stack ?? ""}`.trim();
  if (typeof data === "string") return data;
  try {
    return JSON.stringify(data);
  } catch {
    return String(data);
  }
}
