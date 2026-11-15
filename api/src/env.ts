export interface Env {
  DATABASE_URL: string;
  ALLOWED_ORIGIN: string;
}

export interface AppEnv {
  Bindings: Env;
  Variables: { userId: string; sessionId: string };
}
