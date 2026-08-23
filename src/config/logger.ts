export interface LogContext {
  request_id?: string;
  user_id?: string;
  [key: string]: unknown;
}

function write(level: string, message: string, context: LogContext = {}, error?: unknown) {
  const record: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...context,
  };

  if (error instanceof Error) {
    record.error = { name: error.name, message: error.message, stack: error.stack };
  } else if (error !== undefined) {
    record.error = error;
  }

  const output = JSON.stringify(record);
  if (level === 'error') console.error(output);
  else if (level === 'warn') console.warn(output);
  else console.info(output);
}

export const logger = {
  info: (message: string, context?: LogContext) => write('info', message, context),
  warn: (message: string, context?: LogContext) => write('warn', message, context),
  error: (message: string, context?: LogContext, error?: unknown) =>
    write('error', message, context, error),
};
