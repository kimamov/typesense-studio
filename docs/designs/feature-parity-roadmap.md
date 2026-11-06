# Feature Parity Roadmap

Status: draft for feedback (2026-11-06). Compared against [bfritscher/typesense-dashboard](https://github.com/bfritscher/typesense-dashboard) at `853dfdf` (2026-07-22). Target: Typesense 30+, no fallbacks for older servers.

## Goal

Cover everything the reference dashboard does, but correct for the Typesense 30 data model, built on our pure-module + query-key architecture, and usable as an embedded widget (e.g. a TYPO3 backend dashboard).

## Already tracked as issues

These are clear enough to implement without further discussion:

| Issue | Feature | Reference has it |
| --- | --- | --- |
| #23 | Import documents from a JSON/JSONL file | desktop only |
| #24 | Server operations: cache, compact, snapshot, slow request log, node role | yes |
| #25 | Export search results | yes |
| #26 | Aliases page | yes |
| #27 | Stopwords page | yes |
| #28 | Search presets page | yes |
| #29 | Stemming dictionaries page | yes |
| #30 | Delete documents by filter | no (listed as missing) |
| #31 | Scoped search key generation | no (listed as missing) |

Creating collections is done (#21, `create-collection.md`).

Suggested order: #23, #26 first (daily use), then #24, #25, the set pages, then #30, #31.

## Needs a decision (second iteration)

### 1. Synonym sets and curation sets

In Typesense 30, synonyms and curations are no longer stored per collection. They live in global, named sets (`/synonym_sets/:name`, `/curation_sets/:name`, each with `items`), and a collection lists the sets it uses (`synonym_sets`, `curation_sets` in its schema). A set can be shared by many collections.

What the reference does wrong:
- Creating an item without choosing a set creates a **new set named after the item** and links it to the collection. A collection ends up with one set per synonym.
- Per-collection views flatten all items of all linked sets, so editing an item from a shared set silently changes other collections.
- Version checks and code paths for pre-30 per-collection APIs, which we do not need.

Proposal:
- Two global pages, "Synonym sets" and "Curation sets": list of sets (name, item count, used by which collections), set detail page with an items table (search, add, edit, delete) and a JSON tab for the whole set.
- Item forms: synonyms (multi-way / one-way with `root`, `locale`, `symbols_to_index`); curations (rule `query` + `match` or `filter_by` or `tags`, `includes` with positions, `excludes`, `filter_by`, `sort_by`, `replace_query`, `remove_matched_tokens`, `filter_curated_hits`, `effective_from_ts`/`effective_to_ts`, `stop_processing`, `metadata`).
- Linking: on the set page, "used by" with add/remove collection; on the collection page, the existing set list becomes editable. Links go through `PATCH /collections/:name`. Shared sets show a "used by N collections" badge in the item editor.
- Pure modules for item validation and for "which collections use this set", with tests.

Open questions:
- Confirm that `PATCH` accepts `curation_sets` on 30 (`schema-editing.md` lists only `fields`, `metadata`, `synonym_sets`). Verify before building.
- Should curations get a live preview (run a search with and without the set)? Useful, but adds scope; proposal: later.

### 2. Analytics

The reference has an analytics rules page (types `popular_queries`, `nohits_queries`, `counter`, `log`; event types `search`, `click`, `conversion`, `visit`). Typesense 30 reworked analytics (rules carry `type`, `collection`, `event_type`, `params`; events via `POST /analytics/events`).

Proposal: rules page (table + form/JSON editor), plus a read-only view of the destination collections (popular/no-hit queries are documents, so a link to our search page may be enough). Needs: verifying the exact v30 rule schema against the compose server, and whether analytics must be enabled with a server flag (then show a hint instead of an error).

### 3. Search page extras

- Query history in JSON mode (reference keeps recent queries). Proposal: last 20 queries per connection + collection in localStorage, as a dropdown.
- Group by (`group_by`) and vector / hybrid search display. Not in the reference; only if you want it.

### 4. Cluster view

The reference groups saved servers by a "cluster tag" and shows all nodes side by side (role, memory, disk, network). We already have a `tag` on connections. Proposal: connections with the same tag form a cluster; the status page gets a "Cluster" tab polling all nodes in parallel. Needs: API keys for every node (they may differ, and keys are per tab by default), so every node needs a stored or entered key.

### 5. Deployment configuration (`config.json`)

The reference reads `config.json` for auto-login, preset connections ("history"), UI options and a `SAME` host mode. This overlaps with embedding (below), so design both together. Proposal: `apps/server` serves a `config.json` built from environment variables (connections without keys by default, keys only if explicitly set), and the web app reads it on start. A `SAME` equivalent is "relative to the page origin + path".

### 6. Beyond the reference (optional)

Typesense 30 features neither dashboard covers: conversational search models (`/conversations/models`), natural language search models (`/nl_search_models`), following schema changes (`/operations/schema_changes`, already noted in `schema-editing.md`). List here so they are not forgotten; no proposal yet.

## Embedding as a widget

Use case: render the app inside a container of another platform, e.g. as a CMS plugin (TYPO3 or any other), instead of owning the whole page.

### What blocks it today

| Assumption | Where | Effect when embedded |
| --- | --- | --- |
| Mounts on `#root` | `main.tsx` | Host cannot choose the container |
| Hash history | `router.tsx` | Fights with the host's own URL/hash |
| Global Tailwind base styles on `html`/`body`, CSS variables on `:root`, dark mode via `.dark` on `<html>` | `index.css`, `next-themes` | Styles leak into the host and the host's styles leak in |
| Sidebar is `fixed`, `h-svh`, layout uses `min-h-svh` | `components/ui/sidebar.tsx` | Covers the host page instead of filling the container |
| Dialogs, popovers, toasts portal to `document.body` | Base UI, sonner | Escape the container, lose scoped styles |
| Connections + keys from local/session storage, entered by the user | `stores/connections.ts` | Host already knows the server and should provide access |
| Language detected from the browser | `i18n/index.ts` | Should follow the host's backend language |

### Options

1. **iframe** (works almost today): the host renders `<iframe src="…/#/c/<id>/…">`. Full isolation, no style conflicts. Missing: a way for the host to pass the connection and key (URL fragment or `postMessage`), sizing, and a "chromeless" mode without the connection switcher. Small change.
2. **Custom element with Shadow DOM** (`<typesense-studio>`): one script tag, attributes/properties for connection, key, language, theme, initial route. Requires: memory history, all CSS inside the shadow root (Tailwind v4 output injected there, variables on `:host`), portal container inside the shadow root for Base UI and the toaster, sidebar `absolute`/container-height based, container queries instead of viewport breakpoints where layout depends on width. Larger change, touches every layer once.
3. **React component library** (`<TypesenseStudio {...config} />`, plus `mount(element, config)` for hosts without React): same work as option 2 minus the custom-element wrapper, without style isolation unless the component creates a shadow root itself. Chosen, see below.

### Decision (2026-11-06)

A smaller build with core features and exactly one connection is enough. The host configures that connection and hands over the key. It must not be tied to TYPO3: any CMS (or other app) should be able to use it as a plugin. The intended integration is that the CMS plugin has its own React entry point and renders the app as a child component, passing the config as props. The full app stays as it is.

### Rough plan: embeddable component

This is a rough plan to agree on direction. It gets its own design doc (`docs/designs/embed.md`) before implementation.

**Public API (sketch).** A second entry point, built as a library next to the app build (not published as a package for now):

```tsx
import { TypesenseStudio } from 'typesense-studio/embed'
import 'typesense-studio/embed.css'

<TypesenseStudio
  connection={{ protocol: 'https', host: 'search.example.com', port: 443, path: '', transport: 'direct' }}
  apiKey={key}            // or getApiKey: () => Promise<string>, for refreshed keys
  collection="pages"      // optional: fix one collection, hide the switcher
  language="de"           // optional, follows the host
  theme="light"           // optional: 'light' | 'dark' | 'system'
  onError={...}           // optional
/>
```

For hosts without their own React build, the same entry also exports `mount(element, config)` (and `unmount`), which bundles React. The iframe (`embed.html`) remains a possible third wrapper on top of the same component, if a CMS can only frame pages.

**Features (core):** collection switcher or one fixed collection; search with facets and JSON mode; document editor (open, create, edit, delete); schema read-only (confirmed 2026-11-06). Not included: connections, API keys, server status and operations, schema editing, collection create/clone/delete, sets, aliases, presets. Later as feature flags if a host needs them.

**What has to change (by layer):**

| Layer | Full app today | Embedded component |
| --- | --- | --- |
| Mount | `createRoot(#root)` in `main.tsx` | Host renders `<TypesenseStudio>`; `main.tsx` stays for the full app |
| Routing | Hash history | Memory history, only the core routes; never touches the host URL |
| Connection | `stores/connections.ts`, user enters key | Props feed `ActiveConnectionContext` directly; key only in memory |
| Admin check | `GET /keys` must succeed | Skipped; 401/403 per action shown as "not allowed with this key" |
| Providers | One global `QueryClient`, global i18n instance | Own `QueryClient` and `i18next.createInstance()` per mounted component |
| Theme | `next-themes`, `.dark` on `<html>` | `theme` prop, class on the component's root element |
| CSS | Tailwind base styles on `html`/`body`, variables on `:root` | Styles scoped to the component root; no global base styles |
| Portals | Dialogs, popovers, toasts on `document.body` | Portal container inside the component root |
| Layout | Sidebar `fixed`, `h-svh` | No sidebar; top bar with tabs, sized to the parent |

**Main risk: CSS without isolation.** As a child component there is no iframe or Shadow DOM boundary: CMS backend styles reach into the component, and our styles must not reach out. Options, to decide in the design doc:
- Scope everything under one root class and in a CSS layer, without Tailwind's global preflight (keeps the DOM normal; host styles with high specificity can still leak in).
- Render inside a shadow root created by the component (real isolation; portals and the CodeMirror chunk must target that root).

**React as a peer dependency.** A host with its own React must use React 19 (our version). `mount()` avoids this for hosts without React.

**Steps (each one PR):**
1. Design doc `docs/designs/embed.md`: API, CSS strategy, key handling, build output.
2. Make the existing app embeddable without changing its behavior: providers take their instance (QueryClient, i18n, router history) from props; portal container configurable; pages only rely on `useActiveConnection()`.
3. Embed entry point + library build (Vite library mode), core routes, embed layout, read-only schema.
4. Example host page in the repo that renders the component with a restricted key against the compose Typesense, as the acceptance test.
5. Docs for CMS plugin authors; a TYPO3 extension is then a thin wrapper, outside this repo or in a later step.

**Acceptance (for the finished feature):** the example host renders the component next to its own styled content, can search and edit `demo_books` with a key limited to `documents:*`, the host page's styles and URL are unaffected, nothing is written to storage, and the full app is unchanged (`pnpm check` passes).

### Decided / deferred

- Distribution (2026-11-06): no npm package for now. The embed entry point is part of this repo's build; the built files are what a CMS plugin uses. The import path in the API sketch is a placeholder.
- CSS strategy: deferred, decided in `docs/designs/embed.md` (see "Main risk" above).
