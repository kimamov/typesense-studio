# Schema Editing for the Collection Page

*   **Author:** kantemir
*   **Status:** Proposed
*   **Date:** 2026-10-30

--------------------------------------------------------------------------------

## Overview

The schema page of the selected collection (`/c/$connectionId/collections/$name`)
is read-only today. It shows a facts row, a fields table and the schema as JSON.
This feature adds an edit mode to that page. An admin can add fields, delete
fields, and change a field's type and its flags `optional`, `facet`, `index`,
`sort`, `infix` and `stem`, without leaving the dashboard.

Edits go into one draft that two views share: the existing fields table, made
editable, and a JSON editor that holds `fields`, `metadata` and `synonym_sets`.
On save, the dashboard compares the draft with the schema it started from, sends
only the changes to Typesense, and shows the request body before it is sent and
the server's answer after.

## The Problem

To change a collection's fields today, an admin leaves the dashboard and writes
a `PATCH /collections/:name` request by hand (curl, a script, or another tool).
The request format is not obvious:

*   Typesense has no "replace the schema" call. The body is a list of field
    operations: a new field definition adds a field, `{name, drop: true}`
    removes one, and a change is a drop followed by the new definition in the
    same request.
*   Only `fields`, `metadata` and `synonym_sets` can be changed. Any other key
    makes the server reject the whole request.
*   Every added or changed field is indexed again over all documents, and writes
    to the collection are blocked while that runs.

The dashboard most similar to ours (bfritscher/typesense-dashboard) avoids the
format problem by dropping and re-adding every field on each save. That makes
any small change a re-index of the whole collection. On a large collection,
each save blocks writes for that long.

The proposed solution keeps the editing as simple as editing a table or a JSON
document, and builds the smallest valid request from the difference between the
draft and the original schema.

## Goals

*   An admin can add a field, delete a field, and change the type and the six
    flags of an existing field on the schema page.
*   The fields table and the JSON editor edit the same draft. A change in one
    view is visible in the other.
*   The request contains only the fields that differ from the original schema.
    A save without real changes sends nothing.
*   A changed field keeps all its settings that the form does not show
    (`locale`, `stem_dictionary`, `store` and so on).
*   The exact request body is shown before it is sent.
*   The server's answer is shown as it comes back. After an error, the draft
    stays as it was.
*   After a save, the schema page and the search page use the new schema
    without a page reload. A search URL that still names a deleted field keeps
    working.

## Non-Goals

*   Creating or deleting collections. The schema page only edits the selected
    collection.
*   Checking ahead which changes the server will accept, for example requiring
    `optional: true` on new fields. The server decides and its message is
    shown. Planned for the next iteration.
*   Filling a new non-optional field with default values and re-indexing, with
    a warning that this blocks the server. Planned for the next iteration.
*   Editing settings beyond type and the six flags in the table (`locale`,
    `reference`, `embed`, `num_dim` and others). They can only be changed in
    the JSON editor, or not at all for `embed` and `reference` fields (see Open
    Questions).
*   Editing keys that Typesense fixes at creation (`name`,
    `default_sorting_field`, `token_separators`, `symbols_to_index`,
    `enable_nested_fields`). They stay in the read-only facts row.
*   Detecting renames. A field cannot be renamed. The table locks the name of
    an existing field. In JSON, a changed name is a deleted field plus a new
    field, and the preview says so.
*   Following a long schema change in the background through
    `/operations/schema_changes`.

## Open Questions

*   **Write blocking on large collections**: How long does a field re-index
    block writes on about one million documents? This decides how strong the
    warning in the preview must be.
*   **`embed` and `reference` fields**: Read-only in the table for v1. Should
    the JSON editor also refuse changes to them, or pass them to the server?

## Critical User Journeys (CUJs)

### CUJ 1: Make a stored key searchable

*   **Given**: `demo_books` has documents with a key `publisher` that is not in
    the schema. The admin is on the schema page.
*   **When**: The admin starts edit mode, adds the field `publisher` as
    `string`, `optional`, `facet`, opens the preview, and saves.
*   **Then**: The preview shows one added field. The request body is
    `{"fields": [{"name": "publisher", "type": "string", "optional": true, "facet": true}]}`.
    The table shows `publisher` as a normal field. On the search page,
    `publisher` appears under "Search in" and as a filter, without a reload,
    and a search for a publisher name returns highlighted hits.

### CUJ 2: Turn on a flag for an existing field

*   **Given**: `demo_books` has a field `title` with `locale` set to `de` (set
    up for the test).
*   **When**: The admin turns on `sort` for `title` in the table and saves.
*   **Then**: The preview says `title` will be indexed again and writes are
    blocked meanwhile. The request drops `title` and adds it back with all its
    previous settings, `locale: "de"` included, plus `sort: true`. After the
    save, `title` is offered as a sort option on the search page.

### CUJ 3: Delete a field while a search URL still uses it

*   **Given**: The search page is open with `?sort=rating:desc` and a filter on
    `rating`.
*   **When**: The admin deletes `rating` on the schema page, saves, and goes
    back to the search page.
*   **Then**: The request body is `{"fields": [{"name": "rating", "drop": true}]}`.
    The preview says the values stay in the documents and still show on result
    cards. The search page ignores the old sort and filter and shows results
    instead of an error.

### CUJ 4: Edit in JSON, switch views, save nothing

*   **Given**: The admin is in edit mode.
*   **When**: The admin reformats the JSON (indentation, key order) without
    changing any value, switches to the table and back, and opens the preview.
*   **Then**: The preview reports no changes and Save is disabled. No request
    is sent.

### CUJ 5: The server rejects a change

*   **Given**: The admin adds a field `isbn` as `string` without `optional`,
    and existing documents do not have that key.
*   **When**: The admin saves.
*   **Then**: The server's 400 message is shown as returned (it suggests
    `optional: true`). The draft is unchanged, so the admin can tick
    `optional` and save again.

### CUJ 6: Someone else changes the schema during editing

*   **Given**: The admin is in edit mode with unsaved changes. Meanwhile an
    import or another admin adds a field `price_v2`.
*   **When**: The admin opens the preview.
*   **Then**: The dashboard notices that the server schema no longer matches
    the one editing started from. Save is blocked, and the admin can discard
    the draft and start again from the new schema. `price_v2` is never dropped
    by this save.

## Technical Plan (Architecture)

### Verified server behavior

Checked against the local Typesense 30 (`docker-compose.yml`) on throwaway
collections, 2026-10-30. The plan depends on each point.

| Request | Result |
| --- | --- |
| A field exactly as GET returns it (all keys, `hnsw_params`, `embed: null` …) after `{name, drop: true}` | Accepted. Settings such as `locale: "de"` are kept. |
| `int32` → `string` on a field with values | Accepted, values are indexed as strings. |
| `string` → `int32` with a value `"abc"` | 400: "Existing data for field `code` cannot be coerced into an int32." Schema unchanged. |
| One valid and one invalid field in the same request | 400 for the invalid one. The valid one is **not** applied: a PATCH is all or nothing. |
| Drop a field that does not exist | 400: "Field `nope` is not part of collection schema." |
| Any key besides `fields`, `metadata`, `synonym_sets` | 400: "Only `fields`, `metadata` and `synonym_sets` can be updated at the moment." |
| `GET /operations/schema_changes` | Exists, returns `[]` when idle. |
| A dropped and re-added field | Moves to the end of the `fields` list. |
| Drop or change the field named in `default_sorting_field` | Accepted, and `default_sorting_field` is cleared. It cannot be set again without creating the collection anew. The preview warns about this. |

The proxy (`apps/server/src/app.ts`) forwards every HTTP method, so PATCH works
in proxy mode without changes. The API client has no request timeout of its
own; a timeout can only come from the browser, the proxy or a network break.

### Data flow

```text
  GET /collections/:name ──► schema (TanStack Query cache)
                                   │  "Edit" pressed
                                   ▼
                     base = copy of schema (never refetched while editing)
                     draft = { fields, metadata, synonym_sets } from base
                                   │
           ┌───────────────────────┴───────────────────────┐
           ▼                                               ▼
   Fields table (edits draft directly)        JSON editor (own text buffer)
                                               text ──parse on tab leave──► draft
                                               draft ──format on tab open──► text
           └───────────────────────┬───────────────────────┘
                                   │  "Review changes"
                                   ▼
             refetch schema ──► differs from base? ──yes──► block, offer restart
                                   │ no
                                   ▼
             diffSchema(base, draft) ──► { body, changes[] }
                                   │  empty? ─► "No changes", Save disabled
                                   ▼
             Preview dialog: one line per change + exact JSON body
                                   │  "Save"
                                   ▼
             PATCH /collections/:name (body)
               ├─ 2xx ──► invalidate [connectionId, 'collections'] ─► leave edit mode
               ├─ 4xx ──► show server message, keep draft and edit mode
               └─ no answer ──► "result unknown" ─► refetch schema, new base check
```

### The diff (`lib/typesense/schema-diff.ts`)

A module with pure functions and no React, so it can be tested on its own.

*   **Draft shape**: `SchemaDraft = { fields: CollectionField[]; metadata?;
    synonym_sets? }`. A table edit changes one field object in place
    (immutably), starting from the full server field. So the field keeps
    every key the table does not show.
*   **Normalizing**: Before two fields are compared, both are filled with
    Typesense's defaults for missing keys (`facet: false`, `index: true`,
    `infix: false`, `locale: ""`, `optional: false`, `stem: false`,
    `store: true` and so on, `sort` by type: `true` for numbers and `bool`,
    `false` otherwise). Key order does not matter. This keeps a reformatted
    JSON or a flag turned on and off again from counting as a change.
*   **Fields by name**:
    *   in the draft, not in the base: **add**, send the draft field as is.
    *   in the base, not in the draft: **drop**, send `{name, drop: true}`.
    *   in both and different after normalizing: **change**, send
        `{name, drop: true}` and then the draft field as is.
    *   Field order is ignored; the server reorders fields on change anyway.
*   **`metadata` and `synonym_sets`**: included in the body only when they
    differ from the base (deep compare).
*   **Result**: `{ body, changes }`. `changes` has one entry per field with
    its kind (`add`, `drop`, `change`) and, for `change`, the keys that
    differ. The preview builds its lines from this. An empty `changes` list
    and no other differences means "nothing to save".
*   **Duplicate names in the draft**: reported as an error by the diff, Save is
    disabled. The server would otherwise get two definitions for one name.

### Edit mode on the schema page

*   **Start**: An "Edit schema" button next to the tabs. It copies the current
    query data into `base` and builds the draft. While editing, the page shows
    the draft, not the live query, so a background refetch cannot change what
    the user sees.
*   **Fields table**: The existing table gets editable cells: type as a select
    over the known types, one checkbox per flag, a delete button per row, and a
    row at the bottom to add a field (name, type). Names of existing fields are
    plain text with a hint on hover: "To rename, delete the field and add a new
    one. Values do not move to the new name." Rows show their state: new,
    changed, or deleted (struck through, with undo). Rows the table cannot
    edit safely are read-only with a reason: wildcard fields (`.*`),
    fields with `embed` or `reference`, and types the select does not know.
*   **JSON editor**: The lazily loaded CodeMirror editor with its textarea
    fallback, moved out of the search page into a shared component. It shows
    `{ fields, metadata, synonym_sets }` of the draft. Its text is parsed into
    the draft when the user leaves the tab or opens the preview. Invalid JSON,
    a non-object, or a `fields` value that is not an array blocks that step
    and shows the parse error under the editor.
*   **Preview dialog**: Opens on "Review changes". It first refetches the
    schema and compares it with `base`; any difference blocks Save with
    "The schema was changed on the server since you started editing" and a
    button to discard the draft and start again. Otherwise it lists one line
    per change in plain words and shows the exact body:
    *   add: "`publisher` is added. Existing values of this key are indexed."
    *   change: "`title` is indexed again (sort). Writes to this collection are
        blocked until it finishes." For collections with many documents, the
        dialog shows the document count next to this line.
    *   drop: "`rating` is removed from the index. The values stay in the
        documents and still show on result cards."
    *   a name in the draft that is not in the base while a base name is
        missing gets the drop and add lines; there is no rename wording.
*   **Save**: A mutation sends the body. The Save button is disabled while it
    runs and the request is never retried automatically.
    *   Success: invalidate the query key prefix `[connectionId, 'collections']`
        (the collections list, this schema, and so the search page), close the
        dialog, leave edit mode, show a toast.
    *   Server error (`TypesenseError`): show the message as returned in the
        dialog. Draft and edit mode stay.
    *   No answer (network error, aborted): show "No answer from the server.
        The change may still be running." Refetch the schema. The user can
        close the dialog and check the result in the table.
*   **Leaving with unsaved changes**: Navigating away, switching the collection
    in the sidebar, or reloading asks first (TanStack Router's blocker plus
    `beforeunload`). "Cancel" in edit mode asks first if the draft differs
    from `base`.

### Search page after a schema change

`SearchView` already ignores "search in" fields that are not in the schema.
The same is done for:

*   `filters`: entries whose field is not in `facetFields(schema)` are left
    out of `filter_by` and of the facet bar.
*   `sort`: ignored when its field is not in `sortFields(schema)`; the page
    sorts by relevance.

JSON mode on the search page is not filtered: what the user wrote is sent
as is, and the server's message is shown.

### Tests

`apps/server` already runs unit tests with Node's own test runner
(`node --test`, TypeScript run directly by Node). The web app gets the same
setup for `schema-diff.ts`, with no new dependency. `pnpm check` already runs
`pnpm -r test`, so the tests run in CI.

## Alternatives Considered

### Alternative A: Drop and re-add every field on each save

This is what bfritscher/typesense-dashboard does: the body drops all fields of
the original schema and then adds all fields of the edited schema.

*   **Pros**: No diff logic. The body is always valid in form, whatever the
    user changed.
*   **Cons**: Every save re-indexes every field of the collection and blocks
    writes for that whole time, even when one flag changed. On a collection
    with millions of documents this turns a small edit into a long outage for
    writers. Any key the edit form does not know is lost when its field is
    re-added from the form.
*   **Reason for Rejection**: The cost grows with collection size for every
    change, including changes to a single field. The diff is a small pure
    function that can be tested on its own.

### Alternative B: JSON editor holds the full schema, the server rejects the rest

The JSON view shows everything GET returns (`name`, `num_documents`,
`default_sorting_field`, `token_separators` …), and changed keys besides
`fields` are sent as they are, so the server answers with its own message.

*   **Pros**: The JSON matches the schema JSON users know. No decision on our
    side about which keys are editable.
*   **Cons**: A PATCH is all or nothing, so one changed fixed key makes the
    whole save fail, valid field changes included. `num_documents` changes on
    its own whenever documents are imported, which can make a save fail with
    no visible edit. The server message names the allowed keys, not the key
    that caused the rejection.
*   **Reason for Rejection**: Users would hit failures they did not cause.
    Fixed keys stay readable in the facts row above the editor.

### Alternative C: Replace the table with a new layout or expandable rows

Each field becomes a card or an expandable row with all its settings.

*   **Pros**: Room for every setting a field has (`locale`, `reference`,
    `num_dim` …), also on narrow screens.
*   **Cons**: Name, type and six flags fit as table columns. The settings that
    need more room are out of scope for v1. Expanding rows hides the overview
    of which fields have which flags.
*   **Reason for Rejection**: Not needed for the v1 scope. Expandable rows stay
    the way to add the other settings later. Open risk: with many columns the
    table gets tight on small screens; it scrolls horizontally inside its
    border.

### Alternative D: Detect renames in the JSON editor

When one field disappears and another appears, treat it as a rename and block
it or explain it.

*   **Pros**: Catches users who expect that renaming moves the data.
*   **Cons**: No rule tells a rename apart from "delete one field, add another",
    which is exactly what users are told to do. Matching by position or type
    blocks real changes (for example replacing `color` with `colour` of a
    different type) or lets real renames through.
*   **Reason for Rejection**: Any rule is wrong in common cases. The table
    locks names, and the preview says for every drop that the values stay
    under the old key.

### Alternative E: Table only, with a read-only preview of the body

No JSON editing; the existing read-only JSON view stays, and the preview shows
the body that will be sent.

*   **Pros**: About a third less work: no shared draft between two views, no
    parse step, no moving of the JSON editor.
*   **Cons**: Power users cannot paste field definitions from the Typesense
    docs or edit settings the table does not show, such as `locale`.
*   **Reason for Rejection**: JSON editing for power users is a stated
    requirement of the owner, the same as on the search page.

### Alternative F: Vitest for the unit tests

*   **Pros**: Watch mode, better output, resolves the `@/` path alias the web
    app uses.
*   **Cons**: A new dev dependency and config for one pure module. `apps/server`
    already runs `node --test`.
*   **Reason for Rejection**: The diff module only imports types, so Node's own
    runner can run it without alias resolution. One test setup across the
    repo. Revisit when web tests need React or the alias.

--------------------------------------------------------------------------------

## Non-Functional Requirements

*   **Security**: Only admin keys can log in (enforced since the API keys
    feature), so every user of this page may change schemas. No new secret
    handling. Server messages are rendered as text, never as HTML.
*   **Performance**: A change re-indexes the changed fields and blocks writes
    to the collection meanwhile. The diff keeps that to the fields the user
    changed. The preview states it per field.
*   **Rollout & Rollback**: A web-only change, no stored data format changes.
    A dropped field can be restored by adding it again; its values are still in
    the documents. A changed field can be changed back the same way.

--------------------------------------------------------------------------------

### Future Improvements

*   **Check before sending**: Warn ahead about changes the server will reject,
    for example a new field without `optional`.
*   **Defaults for new required fields**: Fill a new non-optional field with a
    default value in every document and re-index, with a warning that this
    blocks writes for a while.
*   **Follow long changes**: Poll `/operations/schema_changes` after a
    timeout and show progress.
*   **More field settings**: Expandable rows for `locale`, `reference`,
    `num_dim` and the other settings.

--------------------------------------------------------------------------------

## Detailed Implementation Plan

Build order: steps 1 to 3 are the core and land in one PR. Step 4 (search
page) can be its own PR before or after.

### Target Files to Create/Modify

#### 1. `apps/web/src/lib/typesense/types.ts` (Modify)

*   **Type / Scope**: TypeScript types.
*   **Proposed Changes**: Add `stem?: boolean` to `CollectionField`. Add
    `SchemaUpdate = { fields?: (CollectionField | { name: string; drop: true })[];
    metadata?: Record<string, unknown>; synonym_sets?: string[] }` for the
    PATCH body.

#### 2. `apps/web/src/lib/typesense/api.ts` (Modify)

*   **Type / Scope**: API client.
*   **Proposed Changes**: Add `updateCollection(client, name, body:
    SchemaUpdate): Promise<SchemaUpdate>`, a `PATCH /collections/{name}` with
    the name URL-encoded like the other collection calls. Errors surface as
    `TypesenseError` through the existing client.

#### 3. `apps/web/src/lib/typesense/schema-diff.ts` (Create)

*   **Type / Scope**: Pure TypeScript module, type-only imports (so Node can run
    its tests without the `@/` alias).
*   **Proposed Changes**:
    *   `FIELD_TYPES`: the types the table offers (`string`, `string[]`,
        `int32`, `int32[]`, `int64`, `int64[]`, `float`, `float[]`, `bool`,
        `bool[]`, `geopoint`, `geopoint[]`, `object`, `object[]`, `auto`,
        `string*`).
    *   `EDITABLE_FLAGS = ['optional', 'facet', 'index', 'sort', 'infix',
        'stem']`.
    *   `SchemaDraft = { fields: CollectionField[]; metadata?; synonym_sets? }`
        and `toDraft(schema): SchemaDraft`.
    *   `normalizeField(field)`: fills missing keys with Typesense defaults
        and returns a value with sorted keys. The defaults table is taken from
        a real GET response of the local Typesense 30 and written down in the
        module with that source noted. `sort` default depends on the type.
    *   `isTableEditable(field)`: false for wildcard names, `embed`,
        `reference`, and types not in `FIELD_TYPES`, with the reason.
    *   `diffSchema(base: SchemaDraft, draft: SchemaDraft): { body:
        SchemaUpdate; changes: SchemaChange[]; errors: string[] }` with
        `SchemaChange = { kind: 'add' | 'drop' | 'change'; name: string;
        keys?: string[] }`. Rules as in the Technical Plan. `errors` reports
        duplicate and empty names.
    *   `parseDraftJson(text): SchemaDraft | { error: string }`: checks
        object, `fields` array of objects with a string `name`; extra
        top-level keys are an error naming the key ("`token_separators`
        cannot be changed after creation").

#### 4. `apps/web/src/lib/typesense/schema-diff.test.ts` (Create)

*   **Type / Scope**: Unit tests (`node:test`, `node:assert/strict`).
*   **Proposed Changes**: One test per rule:
    *   identical schema → empty body, no changes.
    *   reordered keys and fields, explicit defaults written out → no changes.
    *   new field → one `add`, body holds the field as written.
    *   missing field → one `drop` with `{name, drop: true}`.
    *   flag change on a field with `locale: "de"` → `drop` then the full
        field with `locale: "de"` and the new flag; `keys` names the flag.
    *   type change → `change` with `keys: ['type']`.
    *   `metadata` changed → body has `metadata`, no field entries.
    *   duplicate name → `errors` not empty.
    *   `parseDraftJson`: invalid JSON, array, `fields` missing, extra key
        `name` → each an error.
    *   one fixture is a real GET response from Typesense 30 (saved as JSON in
        the test), compared against itself after `toDraft` → no changes. This
        catches a wrong defaults table.

#### 5. `apps/web/package.json` (Modify)

*   **Type / Scope**: Build configuration.
*   **Proposed Changes**: Add `"test": "node --test 'src/**/*.test.ts'"`, the
    same form as `apps/server`. The root `pnpm check` picks it up through
    `pnpm -r --if-present test`.

#### 6. `apps/web/tsconfig.app.json` and `apps/web/tsconfig.node.json` (Modify)

*   **Type / Scope**: TypeScript configuration.
*   **Proposed Changes**: Exclude `src/**/*.test.ts` from the app config (it
    has no Node types) and include it in the node config, which has
    `types: ["node"]`. The test imports `./schema-diff.ts` with the extension,
    which both configs already allow.

#### 7. `apps/web/src/components/lazy-json-editor.tsx` (Create)

*   **Type / Scope**: React component.
*   **Proposed Changes**: Moves the `lazy()` import of `json-editor.tsx`, its
    textarea fallback (`JsonTextarea`) and the `Suspense` skeleton out of
    `search-page.tsx`. Exports `LazyJsonEditor` with the props of
    `JsonEditor`.

#### 8. `apps/web/src/pages/search-page.tsx` (Modify)

*   **Type / Scope**: React page.
*   **Proposed Changes**:
    *   Use `LazyJsonEditor`; remove the local `lazy`, `JsonTextarea` and the
        `Textarea` import.
    *   In `SearchView`, build `filters` from `search.filters` keeping only
        fields in `facetFields(schema)`, and use `search.sort` only when its
        field is in `sortFields(schema)`. These cleaned values feed
        `filter_by`, `sort_by` and the facet bar. The URL is left as it is.

#### 9. `apps/web/src/components/schema/schema-editor.tsx` (Create)

*   **Type / Scope**: React component, owns edit mode.
*   **Proposed Changes**: Props: `schema` (the query data), `onDone()`. State:
    `base` (copied once on mount), `draft`, `view` (`'table' | 'json'`),
    `jsonText`, `jsonError`, `previewOpen`.
    *   Tabs "Fields" and "JSON". Leaving the JSON tab runs `parseDraftJson`;
        on error the tab does not change and `jsonError` shows under the
        editor. Opening the JSON tab sets `jsonText` from the draft
        (formatted with two spaces).
    *   Buttons: "Review changes" (parses JSON first if that tab is open) and
        "Cancel" (asks when the draft differs from `base`).
    *   `useBlocker` from TanStack Router with `enableBeforeUnload` while the
        draft differs from `base`, using a confirm dialog with "Leave" and
        "Stay".

#### 10. `apps/web/src/components/schema/schema-fields-editor.tsx` (Create)

*   **Type / Scope**: React component.
*   **Proposed Changes**: Props: `base`, `draft`, `onChange(draft)`. Renders
    the table with columns name, type, the six flags, and actions.
    *   Type: `Select` over `FIELD_TYPES`.
    *   Flags: `Checkbox` per flag; changing one replaces the field object with
        `{...field, [flag]: value}`.
    *   Delete: removes the field from the draft; deleted base fields stay
        visible struck through with an undo button that puts the base field
        back.
    *   Add row: name `Input` and type `Select`, adds `{name, type, optional:
        true}` (optional on by default since most adds target existing
        documents; the user can untick it).
    *   Row badges: new, changed, deleted, computed with `diffSchema` per
        field. Rows where `isTableEditable` is false are read-only with the
        reason in a tooltip.
    *   Existing field names are text with the rename hint in a tooltip.
    *   The table scrolls horizontally inside its border on narrow screens.

#### 11. `apps/web/src/components/schema/schema-changes-dialog.tsx` (Create)

*   **Type / Scope**: React component.
*   **Proposed Changes**: Props: `connection`, `client`, `name`, `base`,
    `draft`, `numDocuments`, `open`, `onOpenChange`, `onSaved()`.
    *   On open, refetch the schema with `queryClient.fetchQuery` and
        `staleTime: 0` on `[connectionId, 'collections', name]`. Compare with
        `base` using `diffSchema(toDraft(fresh), base)`; any change shows the
        conflict message and a "Start over" button, and no Save.
    *   Otherwise list `changes` with the wording from the Technical Plan, the
        document count next to `change` lines, and the body in a read-only
        `pre`.
    *   Save: `useMutation` calling `api.updateCollection`. Disabled while
        pending. Success: `invalidateQueries({ queryKey: [connectionId,
        'collections'] })`, toast, `onSaved()`. `TypesenseError`: message in an
        alert inside the dialog. Other errors: the "No answer from the server"
        text, then a refetch of the schema.

#### 12. `apps/web/src/pages/collection-page.tsx` (Modify)

*   **Type / Scope**: React page.
*   **Proposed Changes**: Add an `editing` state and an "Edit schema" button.
    When `editing`, render `SchemaEditor` in place of the read-only tabs; the
    facts row stays. Add `stem` to `FLAGS`.

#### 13. `apps/web/src/i18n/locales/en.ts` and `apps/web/src/i18n/locales/de.ts` (Modify)

*   **Type / Scope**: Translations.
*   **Proposed Changes**: New `schema.*` keys: edit, cancel, review, save,
    addField, fieldName, renameHint, readOnlyReason (wildcard, embed,
    reference, unknownType), state labels (new, changed, deleted), undo, the
    three change lines, writeBlocked, noChanges, conflict, startOver,
    noAnswer, saved, unsavedLeave, jsonTopLevelKey, and the parse errors.

#### 14. `scripts/seed-demo.ts` (Modify)

*   **Type / Scope**: Dev script.
*   **Proposed Changes**: Every document gets a `publisher` value from a small
    fixed list. The key is not in the collection schema, so CUJ 1 can add it
    and see existing values become searchable.

#### 15. `README.md` (Modify)

*   **Type / Scope**: Documentation.
*   **Proposed Changes**: Note at `pnpm seed` that `publisher` is stored but
    not indexed, for trying schema editing. Add `pnpm test` to the
    development commands if not listed.

### Verification Plan

*   **Compilation/Build**: `pnpm check` (typecheck, lint, test, build) green.
    Lint stays at the 10 existing warnings.
*   **Unit Tests**: `pnpm --filter web test` runs `schema-diff.test.ts`; every
    case in step 4 passes.
*   **Static Analysis & Linting**: part of `pnpm check`.
*   **Test Coverage Requirement**: Every rule of `diffSchema` and
    `parseDraftJson` has at least one test. No coverage tool.
*   **E2E/Integration**: Manual, in the browser against the compose Typesense
    after `pnpm seed`, both direct and proxy mode:
    *   CUJ 1 to CUJ 6 as written. For CUJ 2, set `locale: "de"` on `title`
        in the JSON view and save first, then toggle `sort` in the table.
    *   For each save, the request body in the network panel equals the body
        in the preview.
    *   Narrow window (375 px): the table scrolls inside its border, the page
        does not scroll sideways.
    *   No errors in the browser console.

--------------------------------------------------------------------------------

*Drafted with EGM*
