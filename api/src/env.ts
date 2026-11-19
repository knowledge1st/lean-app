export interface Env {
  DATABASE_URL: string;
  OPENROUTER_API_KEY?: string;
  TEXT_LOG_PREFERRED_MODELS?: string;
  TEXT_LOG_MODEL_DENYLIST?: string;
  TEXT_LOG_MAX_CANDIDATES?: string;
  PHOTO_LOG_PREFERRED_MODELS?: string;
  PHOTO_LOG_MODEL_DENYLIST?: string;
  PHOTO_LOG_MAX_CANDIDATES?: string;
  ALLOWED_ORIGIN: string;
  /** Web Push (VAPID). Without the keys, push routes answer 503 and reminders do not run. */
  VAPID_PUBLIC_KEY?: string;
  VAPID_PRIVATE_KEY?: string;
  VAPID_SUBJECT?: string;
  /** Web app URL that notifications open, e.g. https://knowledge1st.github.io/lean-app/ */
  APP_URL?: string;
  /** Cached reminder schedule, so the cron only wakes the database when something is due. */
  PUSH_SCHEDULE?: KVNamespace;
}

export interface AppEnv {
  Bindings: Env;
  Variables: { userId: string; sessionId: string };
}
