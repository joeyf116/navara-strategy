/**
 * Structured logger for the Navara portal.
 *
 * In production (Lambda / CloudWatch) every call writes a single JSON line to
 * stdout so log lines are easy to query with CloudWatch Insights.
 *
 * Sensitive values (passwords, full connection strings, tokens) are masked
 * before they reach the output.
 */

type Level = "debug" | "info" | "warn" | "error";

export interface LogRecord {
	level: Level;
	service: string;
	message: string;
	timestamp: string;
	[key: string]: unknown;
}

// Redact secrets from a DATABASE_URL before logging it.
// e.g. postgres://user:secret@host:5432/db?sslmode=require
//      → postgres://user:[REDACTED]@host:5432/db?sslmode=require
function redactConnectionString(raw: string): string {
	try {
		const url = new URL(raw);
		if (url.password) url.password = "[REDACTED]";
		return url.toString();
	} catch {
		// Not a valid URL — mask anything that looks like :something@
		return raw.replace(/:[^:@/]+@/, ":[REDACTED]@");
	}
}

function redactValue(value: unknown): unknown {
	if (typeof value === "string") {
		if (value.startsWith("postgresql://") || value.startsWith("postgres://")) {
			return redactConnectionString(value);
		}
		return value;
	}
	if (value && typeof value === "object" && !Array.isArray(value)) {
		return Object.fromEntries(
			Object.entries(value as Record<string, unknown>).map(([k, v]) => [
				k,
				redactValue(v),
			]),
		);
	}
	return value;
}

function emit(
	level: Level,
	service: string,
	message: string,
	meta?: Record<string, unknown>,
	error?: unknown,
): void {
	const record: LogRecord = {
		level,
		service,
		message,
		timestamp: new Date().toISOString(),
		...(meta ? (redactValue(meta) as Record<string, unknown>) : {}),
	};

	if (error !== undefined) {
		if (error instanceof Error) {
			const extra = error as unknown as Record<string, unknown>;
			record.error = {
				name: error.name,
				message: error.message,
				stack: error.stack,
				// Prisma attaches extra fields like `code`, `meta`, `clientVersion`
				...extra,
			};
		} else {
			record.error = String(error);
		}
	}

	const line = JSON.stringify(record);

	if (level === "error" || level === "warn") {
		console.error(line);
	} else {
		console.log(line);
	}
}

export const logger = {
	debug(
		service: string,
		message: string,
		meta?: Record<string, unknown>,
	): void {
		if (process.env.NODE_ENV !== "production") {
			emit("debug", service, message, meta);
		}
	},

	info(service: string, message: string, meta?: Record<string, unknown>): void {
		emit("info", service, message, meta);
	},

	warn(service: string, message: string, meta?: Record<string, unknown>): void {
		emit("warn", service, message, meta);
	},

	error(
		service: string,
		message: string,
		error?: unknown,
		meta?: Record<string, unknown>,
	): void {
		emit("error", service, message, meta, error);
	},
};
