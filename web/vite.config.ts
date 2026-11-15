import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';

export default defineConfig(({ command, mode, isPreview }) => {
  const env = loadEnv(mode, import.meta.dirname, 'VITE_');
  const isDev = command === 'serve' && !isPreview;
  // React Refresh needs a script nonce only in the dev server.
  const nonce = isDev ? crypto.randomUUID() : undefined;
  const apiOrigin = env.VITE_API_URL ? new URL(env.VITE_API_URL).origin : '';

  return {
    base: env.VITE_BASE || '/',
    ...(nonce ? { html: { cspNonce: nonce } } : {}),
    plugins: [
      react(),
      tailwindcss(),
      {
        name: 'lean-csp',
        transformIndexHtml: {
          order: 'post',
          handler(_html, context) {
            const wsOrigins = isDev
              ? (context.server?.resolvedUrls?.local ?? ['http://localhost:5173/']).map((url) => {
                  const origin = new URL(url);
                  origin.protocol = origin.protocol === 'https:' ? 'wss:' : 'ws:';
                  return origin.origin;
                })
              : [];
            const nonceSource = nonce ? ` 'nonce-${nonce}'` : '';
            const connections = ["'self'", apiOrigin, ...wsOrigins].filter(Boolean).join(' ');
            const policy = [
              "default-src 'self'",
              `script-src 'self'${nonceSource}`,
              // Radix/react-remove-scroll injects <style> elements without a nonce.
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: https:",
              `connect-src ${connections}`,
              "font-src 'self'",
              "object-src 'none'",
              "base-uri 'self'",
              "form-action 'self'",
            ].join('; ');
            return [
              {
                tag: 'meta',
                attrs: { 'http-equiv': 'Content-Security-Policy', content: policy },
                injectTo: 'head-prepend',
              },
            ];
          },
        },
      },
    ],
    server: { host: 'localhost', port: 5173, strictPort: true },
    test: { environment: 'node' },
  };
});
