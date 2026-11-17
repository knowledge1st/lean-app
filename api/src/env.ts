export interface Env {
  DATABASE_URL: string;
  OPENROUTER_API_KEY?: string;
  TEXT_LOG_PREFERRED_MODELS?: string;
  TEXT_LOG_MODEL_DENYLIST?: string;
  TEXT_LOG_MAX_CANDIDATES?: string;
  ALLOWED_ORIGIN: string;
}

export interface AppEnv {
  Bindings: Env;
  Variables: { userId: string; sessionId: string };
}
