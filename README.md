# Typesense Studio

[![CI](https://github.com/kimamov/typesense-studio/actions/workflows/ci.yml/badge.svg)](https://github.com/kimamov/typesense-studio/actions/workflows/ci.yml)

A modern dashboard for managing [Typesense](https://typesense.org) 30+ servers — as a web app, a Docker image or a desktop app.

> Work in progress. Inspired by [bfritscher/typesense-dashboard](https://github.com/bfritscher/typesense-dashboard).

## Structure

| Path | What |
|---|---|
| `apps/web` | React 19 + Vite + shadcn/ui single-page app |
| `apps/server` | Node (Hono) server: serves the web app and the CORS proxy |
| `apps/desktop` | Tauri v2 shell (planned) |

## Development

```bash
pnpm install
pnpm dev:server   # proxy + API on http://localhost:8787 (allows localhost targets)
pnpm dev          # web app on http://localhost:5173, /proxy forwarded to the server
```

Before pushing, run the same checks as CI (typecheck, lint, tests, build):

```bash
pnpm check
```

A local Typesense for testing:

```bash
docker run -d -p 8108:8108 typesense/typesense:30.2 --data-dir /tmp --api-key=dev-key
```

## Connection modes

- **Direct** — the browser calls Typesense. Works when the server allows CORS for the dashboard's origin (Typesense's default).
- **Via proxy** — requests go through `apps/server`, which forwards them to the target in the `X-Typesense-Target` header.
- **Native** — used automatically in the desktop app; no CORS involved.

Connections, including API keys, are stored in the browser's `localStorage`.

## Server configuration

| Variable | Default | Description |
|---|---|---|
| `PORT` | `8787` | HTTP port |
| `HOST` | `0.0.0.0` | Bind address |
| `BASE_PATH` | *(empty)* | Serve under a sub-path, e.g. `/studio` |
| `STATIC_DIR` | `../web/dist` | Built web app |
| `PROXY_ALLOWED_TARGETS` | *(empty → proxy disabled)* | Comma-separated origins the proxy may reach, e.g. `https://search.example.com,https://*.internal:8108,http://localhost:*`. `*` allows everything — only for trusted, private deployments. |
| `BASIC_AUTH_USERNAME` / `BASIC_AUTH_PASSWORD` | *(unset)* | Protects the dashboard and proxy with HTTP Basic Auth |

The proxy only forwards the `X-TYPESENSE-API-KEY`, `Content-Type` and `Accept` headers, never follows redirects and streams request bodies, so large imports are not buffered in memory.
