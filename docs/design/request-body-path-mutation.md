# Request-body path mutation (JSON-Path / XPath) — design note

**Status:** agreed direction. The underlying mutation/query primitives
(`JsonUtils.updateJSONObject` in `@controlium/utils`, bug-fixed; `XmlUtils` in
`@controlium/utils`, newly built) are done. `request.steps.ts`/`validation.steps.ts`
themselves are **not** wired to any of this yet — this note covers the rules those step
definitions must follow once they are.

## The real fork: "data" vs "json data" vs "xml data"

A request body declared in a step is one of three kinds, and the wording is
load-bearing, not cosmetic — it's a capturing group in the regex specifically so the
handler can tell which one a test author wrote:

- `data '...'` — opaque text. Never mutable by a DataTable, regardless of what the text
  looks like. `data '{"a":1}'` is still just text, even though it happens to parse as
  JSON.
- `json data '...'` — declared JSON. A DataTable override uses `JSON-Path | Value`
  columns.
- `xml data '...'` — declared XML. A DataTable override uses `XPath | Value` columns.

Attaching a `JSON-Path`/`XPath` DataTable to a `data '...'` step is a hard error. The
step's own wording is the *only* source of truth for what the body is — this never
second-guesses it by sniffing the text, and it's independent of what
`API_AUTWrapper.request()` sends as the `Content-Type` header (that's a separate, unrelated
decision — see `request.steps.ts`'s own class doc once written).

This same fork applies to both the literal-body and test-data-file-body step shapes.

## JSON side — `JsonUtils.updateJSONObject` (already exists, two bugs fixed)

No new primitive needed — `@controlium/utils` already has
`JsonUtils.updateJSONObject(currentObject, pathString, value)`, built on `jsonpath-plus`.
Two real bugs were found and fixed while adding proper test coverage (there was
previously exactly one test for the entire method):

1. Deleting a zero-match path crashed with a raw `TypeError` instead of any deliberate
   check. Fixed: it's now an idempotent no-op — "ensure it is not there."
2. Adding a new property via a `$.`-rooted path (e.g. `$.b`) produced a bogus wrapper
   object (`{"$": {"b": ...}}`) instead of setting the top-level key directly — caused by
   unconditionally prepending a `.` to paths that were already rooted. Fixed: only prepend
   when the path isn't already `$`- or `[`-rooted.

## XML side — `XmlUtils` (new)

No XML support existed anywhere in `@controlium/utils` before this. Built to mirror
`JsonUtils`'s shape as closely as the domain allows.

### Library

`slimdom` (a spec-compliant, pure-JS DOM4 implementation) + `fontoxpath` (a
spec-compliant, pure-JS XPath 3.1 engine — a superset of XPath 1.0). Both zero native
deps, both ship their own bundled `.d.ts`. Superseded `xpath` + `@xmldom/xmldom` (the
original choice) after `@xmldom/xmldom` turned out to write parse-failure diagnostics
straight to `console.error` with no way to fully disable it — unacceptable once "the
framework must be in full control of everything written to stdout/stderr" became an
explicit requirement. `slimdom` has zero console calls anywhere in its source;
`fontoxpath`'s only `console.log` lives in its own unused `trace()` debugging helper.
See `XmlUtils`'s own class doc for the fuller rationale, including why validation
(`isXml`) and pretty-printing (`serialize`'s `{ pretty: true }`) are delegated to two
further purpose-built, zero-console tools (`fast-xml-parser`, `xml-formatter`) rather
than asked of this pairing at all — only the query/mutate job genuinely needs a document
model.

### Paths are always absolute, rooted at the document element

Every XPath — for every operation, not just create — is evaluated directly against the
parsed `Document`, not against its root element. A **bare/relative** path only ever sees
the document's own root element itself via the default `child::` axis; it does not reach
that root element's *children*. So given `<user><name>Bob</name><role>admin</role></user>`,
the path `role` matches **zero** nodes — not `<role>`, as it might look at a glance — and
`/user/role` matches exactly one (verified live: `getMatchingXMLNodeCount` returns `0` for
`"role"` and `1` for `"/user/role"` against that same document). A DataTable's `XPath`
column must always be a full, absolute path starting from the actual root element's own
tag name — `/user/role`, not `role` — even though that root tag name is already visible
right there in the same step's own XML literal. This is just standard XPath root
semantics, not a quirk of this implementation; it only needs stating here because it's an
easy mistake to make when the obvious-looking shorthand silently matches nothing instead
of failing loudly.

### Universal rule — no ambiguity, ever

An XPath expression matching more than one node always throws, for every operation
(read, update, create, delete). No exceptions.

### Update (exactly one match)

Sets the element's text content, or the attribute's value, directly.

### Create (zero matches)

The key problem: an XPath predicate (`[1]`, `[self::X]`, ...) is a *test* against
existing nodes, not a construction recipe — "zero matches" doesn't say *why*, and
different reasons imply different, incompatible fixes (see worked example below). A
plain name step never has that problem: zero matches only ever means one thing, "doesn't
exist yet," with one unambiguous fix.

So the path is walked step by step, left to right, starting from the document's root
element (which must already exist and match the path's first step — auto-creation never
fabricates a document's root):

- Any step — **predicate-bearing or not** — that resolves to exactly one *existing* node:
  descend into it, no restriction. A predicate evaluated against real, current data is
  just an ordinary query, same as any read.
- The first step that comes back **zero-match** must be one of:
  - a plain element-name step (`child::` axis, the default) — creates a new child
    element, appended as the parent's last child;
  - `@attr` — creates a new attribute, but only directly onto an element that *itself*
    already resolved to exactly one existing node (never triggers element-creation to
    build a missing ancestor just to hang an attribute off it);
  - a plain name step on the `preceding-sibling::`/`following-sibling::` axis, relative
    to an anchor that already resolved to exactly one existing node — creates the new
    element immediately before/after that anchor (`insertBefore`). This is what lets a
    test author control sibling ordering without any extra DataTable column — e.g.
    `/root/role/preceding-sibling::dept` with zero matches inserts `<dept>` immediately
    before `<role>`, wherever `<role>` currently sits.
  - Anything else (any other predicate or axis) at the zero-match step → throw. Can't
    invert a predicate into "what to build."
- Every step below the first created one cascades the same way — plain steps only, each
  appended as the new child of the one just created. Every intermediate created element
  is empty/structural; only the final leaf gets the row's `Value` as text content.

**Worked example of why predicates can't drive creation themselves:**
`/A/*[1][self::X]` (zero matches) could mean "`A` has no children at all" (fix: add X as
the only child), or "`A`'s first child exists but is called `Y`, not `X`" (fix: insert X
*before* Y) — two completely different edits, indistinguishable from "it didn't match."
Compare to `/root/X[last()]/Y`: if `X[last()]` resolves to one *existing* `<X>` (there's
already at least one), that's just an ordinary query pick — `/Y` underneath it, zero
matches, is then a perfectly ordinary plain-step create relative to a real, already-known
anchor. No ambiguity, because the predicate's job was done against real data before
creation ever entered the picture.

### Delete (`value` is `JsonUtils.SENTINEL_UNDEFINED`, i.e. `"_undefined"`)

Simpler than create — there's no synthesis step, so there's nothing for a predicate to
be ambiguous *about*:

- Multiple matches → throw (same universal rule, no exception).
- One match → delete it — remove the element (and its subtree) from its parent, or
  remove the attribute from its owning element.
- Zero matches → no-op, **any path shape**, predicates included. Already true ("ensure
  it is not there"), nothing to do. No restriction needed here, unlike create.

### Namespace prefixes ARE resolved — real XPath semantics, not literal-string matching

Superseded by the `slimdom`/`fontoxpath` migration: `fontoxpath` is a genuinely
namespace-aware XPath engine, so a prefix used in a path (`pfx:foo`, `@pfx:attr`) is
resolved against whatever `xmlns:pfx="..."` declaration exists anywhere in the document
being queried (first one found, depth-first) — a real, spec-standard resolution, not a
literal-string match. An undeclared prefix throws clearly. One consequence: two
*different* prefixes bound to the *same* namespace URI are, correctly, treated as the
same element/attribute name — namespace equivalence is defined by URI, not by which
prefix string spells it. See `XmlUtils`'s own class doc for the full detail and the
deliberate scoping simplification (whole-document scan, not strict lexical ancestor
scoping).

### Explicitly out of scope

- **Multi-colon element names** (e.g. `<x:y:zzy>`) — a non-issue, not just an edge case
  being ignored: neither `slimdom` nor its predecessor will even *parse* a document
  containing one (fatal error at parse time). Nothing to design around.
- **Positional control beyond sibling-relative** (first/last child of a parent, nth
  position) — the `preceding-sibling::`/`following-sibling::` trick covers "relative to a
  specific existing sibling," which is as far as this goes. No DataTable column for an
  explicit position was added, and none is needed for that trick to work.

### Verification is a separate, simpler concern

Everything above is about *mutation* (the request-body override). Reading/asserting
structure — e.g. a future `validation.steps.ts` XPath-based response check — needs none
of the create/delete machinery, just plain XPath queries, which already express things
like "X is the first element under A" (`/A/*[1][self::X]`) or "X's immediate preceding
sibling is Y" (`/A/X[preceding-sibling::*[1][self::Y]]`) with no new primitive required.
