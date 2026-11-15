# Lean

Web app para registrar comidas, agua, ejercicio y progreso corporal, con objetivos calculados. El diseño completo está en [`PLAN.md`](PLAN.md).

## Estructura

Monorepo con pnpm workspaces:

| Paquete        | Carpeta   | Contenido                                                              |
| -------------- | --------- | ---------------------------------------------------------------------- |
| `@lean/web`    | `web/`    | Frontend (React + Vite, a partir de T004)                              |
| `@lean/api`    | `api/`    | API en Cloudflare Workers (Hono, a partir de T002)                     |
| `@lean/shared` | `shared/` | Tipos, esquemas y lógica compartida; se consume como fuente TypeScript |

## Requisitos

- Node.js 22 (ver `.nvmrc`)
- pnpm 11 (`corepack enable` toma la versión de `packageManager`)

## Instalación

```bash
pnpm install
```

## Comandos

| Comando             | Qué hace                            |
| ------------------- | ----------------------------------- |
| `pnpm typecheck`    | `tsc --noEmit` en los tres paquetes |
| `pnpm lint`         | ESLint en los tres paquetes         |
| `pnpm test`         | Vitest en los tres paquetes         |
| `pnpm format`       | Formatea todo con Prettier          |
| `pnpm format:check` | Verifica el formato sin escribir    |

## Despliegue

`deploy-web.yml` publica la web en GitHub Pages y `deploy-api.yml` publica la API en
Cloudflare Workers. Corren tras CI verde de un push a `main`, si hubo cambios en su
carpeta (`web/` o `api/`), en `shared/` o en los archivos comunes de configuración y
su propio workflow desde el último despliegue publicado (tags `deployed-web` / `deployed-api`).
También se pueden ejecutar manualmente con **Run workflow**, que fuerza el despliegue.

Configurar en GitHub Actions los secretos `CLOUDFLARE_API_TOKEN` (permiso
**Edit Cloudflare Workers**) y `CLOUDFLARE_ACCOUNT_ID`, y la variable de repositorio
`API_URL` con el origen del Worker, por ejemplo `https://lean-api.<subdominio>.workers.dev`:

```bash
gh secret set CLOUDFLARE_API_TOKEN
gh secret set CLOUDFLARE_ACCOUNT_ID
gh variable set API_URL
```

Configurar GitHub Pages con origen **GitHub Actions**. La CSP se genera en el build a
partir de `VITE_API_URL`; `connect-src` incluye el origen del Worker.

El secreto del Worker `DATABASE_URL` debe apuntar a la rama `production` de Neon:

```bash
pnpm --filter @lean/api exec wrangler secret put DATABASE_URL
```

`ALLOWED_ORIGIN` vive en `[vars]` de `api/wrangler.toml`. En desarrollo, los valores
locales de `api/.dev.vars` pisan a `[vars]` durante `wrangler dev`.

Las migraciones de producción se ejecutan a mano; no se automatizan:

```bash
DATABASE_URL='<url de production con el rol dueño>' pnpm --filter @lean/api db:migrate
```

URL web: https://knowledge1st.github.io/lean-app/

URL API: https://lean-api.toferozo.workers.dev
