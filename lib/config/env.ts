import { z } from "zod";

/**
 * All configuration comes from environment variables (see .env.example).
 * Nothing account-specific is hardcoded anywhere else.
 */

const flag = z
  .string()
  .optional()
  .transform((v) => v === "true" || v === "1");

const optionalString = z
  .string()
  .optional()
  .transform((v) => (v && v.trim() !== "" ? v.trim() : undefined));

const EnvSchema = z.object({
  NODE_ENV: z.string().optional().default("development"),
  NEXT_PHASE: optionalString,
  NEXT_PUBLIC_APP_URL: optionalString,
  NEXT_PUBLIC_SUPABASE_URL: optionalString,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: optionalString,
  DATABASE_URL: optionalString,
  CRON_SECRET: optionalString,
  INBOUND_WEBHOOK_SECRET: optionalString,
  BREVO_API_KEY: optionalString,
  REPLY_DOMAIN: optionalString,
  REPLY_TO_ADDRESS: optionalString,
  OPENROUTER_API_KEY: optionalString,
  OPENROUTER_MODEL: optionalString,
  OPENROUTER_FALLBACK_MODEL: optionalString,
  OPENROUTER_DAILY_LIMIT: optionalString,
  APP_TIMEZONE: optionalString,
  MOCK_EMAIL: flag,
  MOCK_AI: flag,
  MOCK_DB: flag,
  MOCK_DB_DIR: optionalString,
  MOCK_ADMIN_EMAIL: optionalString,
  MOCK_ADMIN_PASSWORD: optionalString,
  AUTO_MIGRATE: optionalString,
  ALLOWED_EMAILS: optionalString,
});

export type AppEnv = {
  nodeEnv: string;
  isBuildPhase: boolean;
  appUrl: string;
  supabaseUrl?: string;
  supabaseAnonKey?: string;
  databaseUrl?: string;
  cronSecret?: string;
  inboundWebhookSecret?: string;
  brevoApiKey?: string;
  replyDomain?: string;
  /** Fixed Reply-To used only when no reply domain is set (Gmail fallback). */
  replyToAddress?: string;
  openrouterApiKey?: string;
  openrouterModel: string;
  openrouterFallbackModel?: string;
  aiDailyLimit: number;
  timezone: string;
  mockEmail: boolean;
  mockAi: boolean;
  mockDb: boolean;
  mockDbDir: string;
  mockAdminEmail: string;
  mockAdminPassword?: string;
  autoMigrate: boolean;
  /** Only these emails may use the app (lower case). Empty = any signed-in Supabase user. */
  allowedEmails: string[];
};

export const DEFAULT_MODEL = "openai/gpt-oss-120b:free";
export const DEFAULT_FALLBACK_MODEL = "openrouter/free";

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

export function parseEnv(source: Record<string, string | undefined>): AppEnv {
  const e = EnvSchema.parse(source);
  const limit = Number.parseInt(e.OPENROUTER_DAILY_LIMIT ?? "45", 10);
  return {
    nodeEnv: e.NODE_ENV,
    isBuildPhase: e.NEXT_PHASE === "phase-production-build",
    appUrl: (e.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/+$/, ""),
    supabaseUrl: e.NEXT_PUBLIC_SUPABASE_URL,
    supabaseAnonKey: e.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    databaseUrl: e.DATABASE_URL,
    cronSecret: e.CRON_SECRET,
    inboundWebhookSecret: e.INBOUND_WEBHOOK_SECRET,
    brevoApiKey: e.BREVO_API_KEY,
    replyDomain: e.REPLY_DOMAIN,
    replyToAddress: e.REPLY_TO_ADDRESS,
    openrouterApiKey: e.OPENROUTER_API_KEY,
    openrouterModel: e.OPENROUTER_MODEL ?? DEFAULT_MODEL,
    openrouterFallbackModel: e.OPENROUTER_FALLBACK_MODEL ?? DEFAULT_FALLBACK_MODEL,
    aiDailyLimit: Number.isFinite(limit) && limit > 0 ? limit : 45,
    timezone: e.APP_TIMEZONE ?? "Asia/Kolkata",
    mockEmail: e.MOCK_EMAIL,
    mockAi: e.MOCK_AI,
    mockDb: e.MOCK_DB,
    mockDbDir: e.MOCK_DB_DIR ?? "./.data/pglite",
    mockAdminEmail: e.MOCK_ADMIN_EMAIL ?? "admin@example.com",
    mockAdminPassword: e.MOCK_ADMIN_PASSWORD,
    autoMigrate: e.AUTO_MIGRATE !== "false",
    allowedEmails: (e.ALLOWED_EMAILS ?? "")
      .split(",")
      .map((x) => x.trim().toLowerCase())
      .filter(Boolean),
  };
}

/**
 * Throws if the configuration is unsafe to run.
 * The in-memory/demo database must never be used in production.
 */
export function assertSafeToStart(env: AppEnv): void {
  if (env.nodeEnv === "production" && env.mockDb && !env.isBuildPhase) {
    throw new ConfigError(
      "MOCK_DB=true is not allowed when NODE_ENV=production. " +
        "The demo database lives in memory and would lose all data. " +
        "Set MOCK_DB=false and DATABASE_URL to your Supabase database.",
    );
  }
}

let cached: AppEnv | undefined;

export function env(): AppEnv {
  if (!cached) cached = parseEnv(process.env as Record<string, string | undefined>);
  return cached;
}

/** For tests only. */
export function resetEnvCache(): void {
  cached = undefined;
}

/** Lists configuration problems in plain English, for the Settings page. */
export function configProblems(e: AppEnv = env()): string[] {
  const problems: string[] = [];
  if (!e.mockDb) {
    if (!e.databaseUrl) problems.push("DATABASE_URL is missing, so the app cannot reach the database.");
    if (!e.supabaseUrl || !e.supabaseAnonKey)
      problems.push("NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY is missing, so login will not work.");
    if (e.allowedEmails.length === 0)
      problems.push("ALLOWED_EMAILS is empty: any Supabase account can log in. Set it to your own email address.");
  }
  if (!e.mockEmail && !e.brevoApiKey) problems.push("BREVO_API_KEY is missing, so emails cannot be sent.");
  if (!e.mockAi && !e.openrouterApiKey) problems.push("OPENROUTER_API_KEY is missing, so AI drafting will not work.");
  if (!e.cronSecret) problems.push("CRON_SECRET is missing, so the scheduled jobs cannot run.");
  if (!e.inboundWebhookSecret) problems.push("INBOUND_WEBHOOK_SECRET is missing, so replies cannot be received.");
  return problems;
}
