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

Use case: render the app inside a container of another platform, e.g. a TYPO3 backend dashboard widget, instead of owning the whole page.

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
3. **npm library** (`mount(element, options)` for React hosts): same work as option 2 minus the custom-element wrapper; not useful for TYPO3, which is not React.

### Decision (2026-11-06)

A smaller build with core features and exactly one connection is enough. TYPO3 configures that connection and hands over the key. The full app stays as it is.

### Proposal: embed mode

**Delivery: iframe, a separate entry point.** A second Vite entry (`embed.html`) next to `index.html`, in the same build and served by `apps/server` or shipped inside the TYPO3 extension. The TYPO3 widget renders `<iframe src=".../embed.html">`. An iframe needs no style isolation work, no portal changes and no TYPO3 build integration. A custom element can follow later on the same config (option 2) if the iframe is too limiting.

**Configuration: `postMessage` handshake, nothing in the URL.**
1. The embed page posts `{type: 'typesense-studio:ready'}` to `window.parent`.
2. The host answers with `{type: 'typesense-studio:config', connection: {protocol, host, port, path, transport}, apiKey, language?, theme?, collection?}`.
3. The embed page accepts the message only from `window.parent` and validates its shape (trust boundary). The key is kept in memory only: no local/session storage, no URL.
4. The host may send a new config at any time (e.g. a refreshed key); queries are reset.

The host restricts who may frame the page with a `frame-ancestors` CSP header.

**Features (core):**
- Collection switcher, or a single fixed collection when `collection` is set.
- Search page with facets and JSON mode.
- Document editor: open, create, edit, delete.
- Schema: read-only view.

Not in the embed build: connections page, API keys, server status and operations, schema editing, creating/cloning/deleting collections, sets, aliases, presets. Each can become a feature flag later if TYPO3 needs it.

**Keys without admin rights.** TYPO3 should hand out a key limited to what editors need (e.g. `documents:*` and `collections:get` for the allowed collections), not the admin key. The embed mode therefore skips the admin check (`GET /keys`, `isKeyRejected`) and shows a 401/403 per action as "not allowed with this key" instead of logging out.

**Layout.** The embed layout has no sidebar: a top bar with the collection switcher and Search / Document / Schema tabs, sized to the iframe. Optional `typesense-studio:resize` messages to the host with the content height, so the widget can grow instead of scrolling twice.

**Code impact (estimate).**
- `embed.html` + `embed.tsx`: own router (memory history, only the core routes), own `ActiveConnection` provider fed by the handshake instead of `stores/connections.ts`.
- `connection-layout.tsx`: split so the pages get `useActiveConnection()` from either provider; pages themselves stay unchanged.
- Pages hide actions that are not in the embed build (one `useEmbed()` flag), e.g. "Delete collection".
- Pure module for validating the config message, with tests.

### Acceptance criteria

- A plain test host page (not TYPO3) with an iframe sends the config and can search and edit documents in `demo_books`, in direct and in proxy mode.
- With a key limited to `documents:*` on `demo_books`, search and edit work, and forbidden actions show a clear message.
- The key never appears in storage, the URL or the server log of `apps/server`.
- The full app is unchanged; `pnpm check` passes.

### Open points

1. Does TYPO3 serve the embed files itself (same origin, extension `Resources/Public`) or does it frame a separately deployed Typesense Studio? Both work; it only changes the CSP and the deployment docs.
2. Is the schema view needed in the widget, or are search and documents enough?
3. Should the TYPO3 extension itself live in this repo (`apps/typo3`) or separately?
