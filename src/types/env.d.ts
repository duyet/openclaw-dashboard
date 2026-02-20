declare global {
  interface CloudflareEnv {
    DB: D1Database;
    KV: KVNamespace;
    WEBHOOK_QUEUE: Queue;
    // Auth
    CLERK_SECRET_KEY: string;
    CLERK_PUBLISHABLE_KEY: string;
    LOCAL_AUTH_TOKEN: string;
    AUTH_MODE: 'clerk' | 'local';
    // Gateway
    GATEWAY_URL: string;
    GATEWAY_TOKEN: string;
  }
}
export {};
