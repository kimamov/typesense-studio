# Creating Collections

*   **Author:** kantemir
*   **Status:** Implemented
*   **Date:** 2026-11-06

--------------------------------------------------------------------------------

## Overview

The collections page (`/c/$connectionId/collections`) lists, searches, clones,
exports and deletes collections, but cannot create one. This feature adds a
"Create collection" button that opens a dialog with the collection's name, its
fields and its default sorting field, plus a JSON view for every other setting
`POST /collections` accepts.

## Goals

*   An admin can create a collection with a name, at least one field and an
    optional default sorting field, without writing JSON.
*   Every setting Typesense accepts at creation (`token_separators`,
    `symbols_to_index`, `metadata`, `embed`, `num_dim`, …) can be set in the
    JSON view, and survives switching between the views.
*   Mistakes the dashboard can see are shown before the request is sent: empty
    or duplicate names, a name that already exists, an invalid default sorting
    field. The server's message is shown for everything else.
*   After creation, the collection appears in the list, in the sidebar switcher
    and in the API key dialog's suggestions without a reload.

## Non-Goals

*   Pre-filling the dialog from another collection. "Clone schema" already
    copies a collection through the server (`POST /collections?src_name=`).
*   Form controls for `num_dim`, `stem_dictionary`, `reference` and `embed`.
    They are set in the JSON view.
*   Importing documents in the same step. The new collection's row links to the
    document page.

## Behavior Verified Against Typesense 30

Checked with `curl` against the compose Typesense:

| Request                                                    | Answer                                                                 |
|------------------------------------------------------------|------------------------------------------------------------------------|
| `fields: []` or no `fields`                                | 400, at least one field is required                                    |
| `default_sorting_field` on an optional field               | 400, "cannot be an optional field"                                     |
| `default_sorting_field` on a `string` without `sort: true` | 400, "not a sortable type"                                             |
| `default_sorting_field` on `int64`, `bool`, sortable `string` | 201                                                                 |
| an `object` field without `enable_nested_fields: true`     | 400, nested fields must be enabled                                     |
| a name that exists                                         | 409, "already exists"                                                  |
| a name with spaces or `/`                                  | 201; the name only has to be URL-encoded, which `api.ts` does already  |

## UI Decisions

### A dialog, not an expandable panel

The reference puts the form into an expansion panel above the table. We use a
dialog opened from a "Create collection" button in the page header, because:

*   **Consistency.** The API keys page creates keys the same way: a header
    button next to the table search opens a dialog with a Form and a JSON tab.
    Creating a collection should look and behave the same.
*   **Focus.** The form is a one-off task. A dialog keeps the list visible
    behind it, traps focus, and closes on success, so the list is the same as
    before plus the new row. An open panel would push the table down and stay
    open after the task is done.
*   **Length.** A schema can have many fields. The dialog is wider than the API
    key dialog (`sm:max-w-3xl`), and its body scrolls while the header and the
    buttons stay in place.

Closing the dialog with edits asks first, with the same question as leaving
the schema page with unsaved edits, so a click outside the dialog does not lose
a long schema.

The empty state ("This server has no collections yet") gets the same button,
since that is where a new server starts.

### Reusing the schema page's field editor

The field cards (`SchemaFieldsEditor`) are the ones on the schema page, so a
field looks the same when it is created and when it is edited later. A new
`create` mode turns off what only matters for an existing collection:

*   no "new" badge and green edge on every card, since every field is new;
*   new fields start as required (`optional: false`). On the schema page they
    start optional, because the server rejects a required field on a
    collection that has documents; a new collection has none.

Errors appear after the first click on "Create collection", not while the
dialog is still empty. The dialog opens with one unnamed field like the
reference, and "Every field needs a name" in red before anything was typed
would read as a mistake. A `showErrors` prop of the field editor holds the
field errors back until then; the schema page keeps showing them right away.

### Form and JSON share one draft

As on the schema page and in the API key dialog, the JSON tab shows the draft
the form edits, and the form takes the JSON over when the tab is left. Keys the
form does not show stay in the draft, so `token_separators` typed in JSON are
still sent after a detour through the form. Invalid JSON keeps the JSON tab
open and shows the parse error, with the same texts as the schema page.

### Default sorting field

A select lists only the fields Typesense accepts: named, not optional, not an
array, of type `int32`, `int64`, `float`, `bool`, or `string` with `sort`
turned on. If the chosen field is later removed, made optional or changed, an
error under the select says so instead of sending a request the server rejects.

## Differences From the Reference

| Reference (typesense-dashboard)                                       | Here                                                                     |
|-----------------------------------------------------------------------|--------------------------------------------------------------------------|
| Expansion panel above the table                                       | Dialog from a header button, like "Create key"                           |
| Own field form                                                        | The schema page's field cards, in `create` mode                          |
| Sorting field select offers `int32`, `int64`, `float` and sortable strings, optional ones included | Also `bool`; optional fields and arrays excluded, as the server requires |
| No checks before sending                                              | Empty, duplicate and existing names and an invalid sorting field are shown at the field |
| `enable_nested_fields` set silently for `object` fields               | Same, unless the JSON sets it explicitly; the form says so under the field list |
| Stemming dictionary select (loads `/stemming/dictionaries`)           | Left out; `stem_dictionary` can be set in JSON                           |
| `num_dim` input for `float[]`                                         | Left out; set in JSON                                                    |
| Form stays filled after creation                                      | Dialog closes, a toast names the collection, the list refreshes          |
| Monaco editor                                                         | The app's CodeMirror editor (`LazyJsonEditor`)                           |

## Code

*   `lib/typesense/collection-create.ts` (pure, tested): the draft type, the
    sorting field candidates, the checks, the request body and the JSON parser.
*   `components/create-collection-dialog.tsx`: the dialog.
*   `components/schema/schema-fields-editor.tsx`: the `create` mode.
*   `api.createCollection`: `POST /collections`.
