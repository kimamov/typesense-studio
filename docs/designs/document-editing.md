# Document Editing

*   **Author:** kantemir
*   **Status:** Implemented
*   **Date:** 2026-11-02

--------------------------------------------------------------------------------

## Overview

The document page of the selected collection
(`/c/$connectionId/collections/$name/document`) is a placeholder today. The
Edit button on a search hit already links to it with `?id=<id>`. This feature
turns it into an editor for documents, reachable from the sidebar below
"Schema".

The page has two views of one draft. The **form** is for everyday edits: one
input per schema field, limited to the safe actions (create or upsert a new
document, save changes to an existing one). The **JSON** view is for power
users: it takes one document or an array of documents and runs any of
`create`, `upsert` and `update` on them, with a result per document.

## The Problem

To add or change a document today, an admin leaves the dashboard and writes a
request by hand. The search page can delete a document but not change it.

The dashboard most similar to ours (bfritscher/typesense-dashboard) has a
JSON-only page: an array of documents in an editor, an "Action mode" select
(`create`, `upsert`, `update`) and an import button. Its Edit button copies
the hit from the search result into that editor and preselects `upsert`. Three
things follow from that:

*   The edited document is the copy from the search result, not the current
    one on the server.
*   Saving replaces the whole document, so a field someone else changed in the
    meantime is overwritten.
*   There is no form: every edit means writing JSON by hand, typed correctly
    for the schema.

## Goals

*   A sidebar entry "Document" below "Schema" opens the page for a new
    document.
*   The Edit button on a search hit opens the page with that document loaded
    from the server.
*   The form shows one input per schema field. Fields the form cannot edit are
    shown read-only.
*   Switching from the form to JSON shows the form's current state. Switching
    back reads the JSON into the form.
*   Form actions: **Create** and **Upsert** for a new document, **Save** for an
    existing one. Save sends only the changed fields.
*   JSON actions: `create`, `upsert` and `update` on one document or an array.
*   Server errors are shown as the server words them, per document. After an
    error the draft stays as it was.
*   After a change, the search page and the document count show it without a
    reload.

## Non-Goals

*   Deleting on this page. Delete stays on the search hits.
*   `emplace`, `dirty_values`, import from a file and export. The Typesense
    defaults apply (`dirty_values`: `coerce_or_reject` with a wildcard field,
    otherwise `reject`).
*   Searching for a document by anything but its id on this page.
*   Form inputs for nested objects, geopoints, `auto` and wildcard fields.
    They are read-only in the form and editable in JSON.
*   Checking documents against the schema before sending. The server checks,
    and its messages name the field and the expected type.

## Open Questions

*   None. Decided: an `int64` field is read-only in the form when the loaded
    value is not a safe integer (JavaScript numbers lose precision above
    2^53). JSON has the same limit, since `JSON.parse` rounds as well.

## Critical User Journeys (CUJs)

### CUJ 1: Fix a typo in a hit

*   **Given**: The admin searches `demo_books` and sees a typo in a title.
*   **When**: The admin presses Edit on the hit, corrects `title` in the form
    and presses Save.
*   **Then**: The page loaded the document with `GET`. The request is an
    `update` with `{"id": "…", "title": "…"}` only. A toast confirms it, the
    form shows the saved document, and the search page shows the new title
    without a reload.

### CUJ 2: Create a document in the form

*   **Given**: The admin opens "Document" in the sidebar.
*   **When**: The admin fills the required fields, leaves `id` empty and
    presses Create.
*   **Then**: Typesense assigns an id. The URL changes to `?id=<new id>` and
    the page is in edit mode for the new document. The document count on the
    schema page is one higher.

### CUJ 3: The server rejects a value

*   **Given**: The admin creates a document whose `id` already exists.
*   **When**: The admin presses Create.
*   **Then**: An alert shows "A document with id 1 already exists." The form
    keeps every value.

### CUJ 4: Power user updates several documents

*   **Given**: The admin is on the page, in the JSON view.
*   **When**: The admin pastes
    `[{"id": "1", "in_stock": false}, {"id": "nope", "in_stock": false}]`,
    selects `update` and runs it.
*   **Then**: The result list shows document `1` as updated (with a link to
    open it) and `nope` as failed with "Could not find a document with id:
    nope". Document `1` keeps all its other fields.

### CUJ 5: Switch views with a change

*   **Given**: A loaded document in the form, `pages` changed from 325 to 300.
*   **When**: The admin switches to JSON.
*   **Then**: The JSON shows `"pages": 300`. After changing `"rating"` in JSON
    and switching back, the form shows both changes.

### CUJ 6: Leave with unsaved changes

*   **Given**: A changed draft.
*   **When**: The admin clicks another sidebar entry.
*   **Then**: The browser asks for confirmation, as on the schema page.

## Technical Plan (Architecture)

### Verified server behavior

Checked against the local Typesense 30 (`docker-compose.yml`) on throwaway
collections, 2026-11-02.

| Request | Result |
| --- | --- |
| `GET /documents/:id` for a missing id | 404 "Could not find a document with id: …" |
| `POST /documents/import?action=…` | Always HTTP 200, body is JSONL with one result per input line: `{"success": true}` or `{"success": false, "code": 409, "error": "…"}`. With `return_id=true`, every result carries `id`. |
| import `create` with an existing id | Line result 409 "A document with id 1 already exists." |
| import `update` with a missing id | Line result 404 "Could not find a document with id: …" |
| import `update` with `{"id": …, "o": null}` | `o` is removed from the document (optional fields and fields outside the schema). `null` on a required field: 400 "Field `a` must be a string." |
| import `upsert` with a partial document | Line result 400 for the first missing required field. Fields not in the body are gone after a successful upsert. |
| A wrong type (`"pages": "abc"`) | Line result 400 "Field `pages` must be an int32." |
| `"id": 5` (a number) | 400 "Document's `id` field should be a string." |
| Fields not in the schema | Stored and returned, not indexed (`publisher` in `demo_books`). |
| Create without `id` | Typesense uses its internal sequence number as the id. **It does not check for an existing document with that id**: in a collection with a document `"1"`, a document without id also got `"1"`, and the export listed both. |
| Unknown collection | HTTP 404 for the whole request. |

### One endpoint for every write

Every write, from the form and from JSON, goes through
`POST /collections/:name/documents/import?action=<action>&return_id=true` with a
JSONL body. One function, one result format, one way to show errors:

*   The form sends one line. Its result is shown as an alert under the
    buttons.
*   JSON sends one line per document. Results are shown as a list.
*   A request that fails as a whole (network, 404 collection) is a
    `TypesenseError` and shown with `useErrorMessage`, as everywhere else.

The client already sends string bodies as `text/plain` and can return the raw
response text (`raw: true`), so the API call is a few lines.

### Data flow

```text
  ?id=<id> ──► GET /documents/:id ──► loaded (TanStack Query, [conn, 'collections', name, 'document', id])
                     │  editor mounts (keyed by id)
                     ▼
        base = copy of loaded (or {} for a new document), never refetched while editing
        draft = copy of base
                     │
       ┌─────────────┴──────────────┐
       ▼                            ▼
   Form (edits draft)          JSON text (own buffer)
                                text ──parse on tab leave──► draft  (one object only)
                                draft ──format on tab open──► text
       │                            │
       ▼                            ▼
   new:  create / upsert [draft]   create / upsert / update  [parsed object or array]
   edit: update [diff(base, draft)]
       └─────────────┬──────────────┘
                     ▼
         POST /documents/import?action=…&return_id=true
           ├─ results ──► all ok + one document ──► toast, invalidate, ?id=<id>, editor restarts
           │          └─► list per document (JSON) / alert (form)
           └─ request error ──► alert, draft unchanged
```

After any successful write, `[conn, 'collections', name]` is invalidated. That
refreshes the search, the document count and the loaded document. The editor
is keyed by id and a save counter, so it starts again from the reloaded
document after a save.

### The form model (`lib/typesense/document-form.ts`)

Pure functions with tests, like `schema-diff.ts`.

*   **`formFields(schema, document, mode)`**: the rows of the form. One row per
    schema field in schema order, then the document's keys that are not in the
    schema. `id` comes first. Each row has `name`, `type`, `required`, and
    `input`, which is one of `text`, `number`, `bool`, `list` (string and
    numeric arrays), or `readonly` with a reason:
    *   `id` when editing an existing document (Typesense rejects a changed
        id).
    *   Fields with `embed` (generated by Typesense).
    *   `object`, `object[]`, `geopoint`, `geopoint[]`, `auto`, `image`,
        `bool[]`, wildcard names (`.*`, `title_.*`), and names with a dot
        (nested fields of an object).
    *   Keys not in the schema.
    Read-only rows show the value as compact JSON.
*   **Input values**: number fields are `<input type="number">`, so the
    browser only lets numbers through and no parse step is needed. Empty input
    on an optional field means "not set"; on a required field it is an empty
    string, and the server names what is wrong.
*   **`emptyDocument(schema)`**: a new document starts with required `bool`
    fields set to `false`, because a switch cannot show "not set".
*   **`documentChanges(base, draft)`**: the `update` body. Keys whose value
    differs (deep compare), plus `null` for keys in `base` that are missing in
    the draft, plus `id`. Empty when nothing changed (Save disabled).
*   **`parseDocumentsJson(text)`**: an object or an array of objects, each
    with a string `id` or none. Other shapes are an error with a message.

### The page

*   **Header**: collection name, title ("New document" or "Edit document
    <id>"), and an "Open document" id input with a button that sets `?id`. A
    "New document" button clears `?id`.
*   **Tabs** "Form" and "JSON", as in `SchemaEditor`. The JSON tab holds the
    action select with one sentence per action under it (create: "Creates new
    documents, fails for an existing id"; upsert: "Creates or replaces whole
    documents"; update: "Changes the given fields of existing documents").
    It defaults to `update` when a document is loaded, otherwise `create`.
*   **Back to the form with an array** in JSON: the switch is refused with
    "The form shows one document. Arrays can only be run in JSON."
*   **Create without id**: the `id` input has the hint "Empty: Typesense
    assigns an id. It may equal an id you assigned yourself."
*   **404 on load**: the alert says the document was not found and offers
    "Create a document with this id", which opens the new-document form with
    that id filled in.
*   **Unsaved changes**: `useBlocker` with the same rule as the schema editor.

## Alternatives Considered

### Alternative A: Single-document endpoints for the form

`POST /documents`, `POST /documents?action=upsert` and `PATCH /documents/:id`
answer with HTTP status codes instead of a result line. The JSON view needs
import anyway for arrays, so this would be a second write path with a second
error format for the same result.

### Alternative B: Edit means upsert, as in bfritscher/typesense-dashboard

Simple, but overwrites fields changed by someone else, and removes stored
fields the form did not show. Sending only the changes avoids both.

### Alternative C: All actions in the form as well

A select next to the form's submit button. Upsert on a loaded document would
remove fields not in the draft, and `update` on a new document always fails.
The form offers only the actions that make sense in its state; everything
else is one tab away in JSON.

### Alternative D: JSON takes one document only

Keeps the result display to one alert. Rejected: power users paste several
documents, and with import as the only write path the result list is the only
extra piece.

## Non-Functional Requirements

*   **Security**: Only admin keys can log in. Server messages and document
    values are rendered as text, never as HTML.
*   **Performance**: Very large arrays are sent in one request. Typesense
    batches them on the server (`batch_size` 40). No client-side limit in v1.
*   **Rollout & Rollback**: Web-only change, no stored data format changes.

--------------------------------------------------------------------------------

### Future Improvements

*   Import from a file and export to JSONL.
*   `emplace` and a `dirty_values` select in the JSON view.
*   A document search inside the "Open document" input.
*   Form inputs for nested objects and geopoints.

--------------------------------------------------------------------------------

## Detailed Implementation Plan

One PR.

### Target Files to Create/Modify

#### 1. `apps/web/src/lib/typesense/api.ts` (Modify)

*   Add `document(client, collection, id, signal)` (`GET`) and
    `importDocuments(client, collection, documents, action)`: JSONL body,
    `raw: true`, returns the parsed result lines.

#### 2. `apps/web/src/lib/typesense/document-form.ts` (Create)

*   `formFields`, `emptyDocument`, `documentChanges`, `parseDocumentsJson` as
    described above. Types imported with `.ts` extensions.

#### 3. `apps/web/src/lib/typesense/document-form.test.ts` (Create)

*   Read-only rules per type, required and optional, keys outside the
    schema, `emptyDocument`, the diff (changed, removed as `null`, unchanged
    gives empty), JSON shapes (object, array, invalid, numeric id).

#### 4. `apps/web/src/pages/document-page.tsx` (Modify)

*   Header, loading by id, the editor with both tabs, actions, results.

#### 5. `apps/web/src/components/collection-nav.tsx` (Modify)

*   Add the entry to `COLLECTION_PAGES` below Schema.

#### 6. `apps/web/src/i18n/locales/en.ts` and `de.ts` (Modify)

*   Texts for the page, actions, hints and results.

### Verification Plan

*   **Build**: `pnpm check` green, lint stays at 10 warnings.
*   **Unit tests**: `document-form.test.ts`.
*   **Manual**: in the in-app browser against the compose Typesense after
    `pnpm seed`: CUJ 1 to 6, and for each write the request in the network
    panel matches the expected action and body. Narrow window (375 px)
    without sideways scrolling. No console errors. `pnpm seed` afterwards.
