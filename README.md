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
