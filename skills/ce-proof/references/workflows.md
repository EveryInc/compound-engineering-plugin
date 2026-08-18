# Proof workflows

Required read before running one of these end to end: reviewing a shared doc, creating and sharing a new one, or pulling a doc down to a local file. Endpoint and operation detail lives in `api.md`.

## Workflow: Review a Shared Document

When given a Proof URL like `https://www.proofeditor.ai/d/abc123?token=xxx`:

1. Extract the slug and token
2. Bind presence with the CE identity defaults
3. Read via `v3/document`
4. Edit with `v3/edit` (narrow content ops; review ops for comments/suggestions)

```bash
TOKEN="xxx"
SLUG="abc123"
AGENT="ai:compound-engineering"

curl -sS -X POST "https://www.proofeditor.ai/api/agent/$SLUG/presence" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Agent-Id: $AGENT" \
  -d '{"name":"Compound Engineering","status":"reading","summary":"Reviewing doc"}'

DOC=$(curl -sS "https://www.proofeditor.ai/api/agent/$SLUG/v3/document" \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Agent-Id: $AGENT")
REVISION=$(printf '%s' "$DOC" | jq -r '.revision // empty')

# Comment on visible text
curl -sS -X POST "https://www.proofeditor.ai/api/agent/$SLUG/v3/edit" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Agent-Id: $AGENT" \
  -H "Idempotency-Key: $(uuidgen)" \
  -d "$(jq -n --argjson rev "${REVISION:-null}" '{
    by:"ai:compound-engineering",
    baseRevision: (if $rev == null then null else $rev end),
    operations:[{op:"comment",on:"text to comment on",body:"Your comment here"}]
  } | if .baseRevision == null then del(.baseRevision) else . end')"

# Narrow content edit
curl -sS -X POST "https://www.proofeditor.ai/api/agent/$SLUG/v3/edit" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Agent-Id: $AGENT" \
  -H "Idempotency-Key: $(uuidgen)" \
  -d '{"by":"ai:compound-engineering","operations":[{"op":"replace","find":"old","with":"new"}]}'

# Tracked suggestion
curl -sS -X POST "https://www.proofeditor.ai/api/agent/$SLUG/v3/edit" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Agent-Id: $AGENT" \
  -H "Idempotency-Key: $(uuidgen)" \
  -d '{"by":"ai:compound-engineering","operations":[{"op":"suggest","kind":"replace","find":"old","with":"new"}]}'
```

## Workflow: Create and Share a New Document

**Publishing a local file (the primary case):** read the file and JSON-encode its full contents into the `markdown` field with `jq --rawfile` so newlines, quotes, and backticks are escaped correctly. Never hand-write the body or leave an inline placeholder — that publishes a placeholder doc instead of the source artifact.

```bash
SRC="path/to/plan.md"
TITLE="Plan: Foo"

RESPONSE=$(jq -n --arg title "$TITLE" --rawfile md "$SRC" '{title:$title, markdown:$md}' \
  | curl -sS -X POST https://www.proofeditor.ai/share/markdown \
    -H "Content-Type: application/json" -d @-)

URL=$(echo "$RESPONSE" | jq -r '.tokenUrl')
SLUG=$(echo "$RESPONSE" | jq -r '.slug')
TOKEN=$(echo "$RESPONSE" | jq -r '.accessToken')
OWNER_SECRET=$(echo "$RESPONSE" | jq -r '.ownerSecret')   # required for owner delete while unclaimed

# Keep OWNER_SECRET in session memory only — never write it into the repo tree.

curl -sS -X POST "https://www.proofeditor.ai/api/agent/$SLUG/presence" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Agent-Id: ai:compound-engineering" \
  -d '{"name":"Compound Engineering","status":"reading","summary":"Uploaded doc"}'

echo "$URL"
```

After publish handoffs from planning workflows, surface the URL and return control — do not delete the doc automatically.

When the user later asks to clean up an unclaimed doc you created:

```bash
curl -sS -X DELETE "https://www.proofeditor.ai/api/documents/$SLUG" \
  -H "Authorization: Bearer $OWNER_SECRET"
```

## Workflow: Pull a Proof Doc to Local

Sync the current Proof doc state to a local markdown file. Used for:

- Ad-hoc snapshots of a Proof doc to disk
- Pulling a shared Proof doc that the user (or others) edited back down to a local working copy
- Refreshing a local working copy against the live Proof version

Canonical read for this workflow: `GET /api/agent/$SLUG/v3/document`.

```bash
SLUG=<slug>
TOKEN=<accessToken>
LOCAL=<absolute-path>

STATE_TMP=$(mktemp "${TMPDIR:-/tmp}/ce-proof-state.XXXXXX")
curl -sS "https://www.proofeditor.ai/api/agent/$SLUG/v3/document" \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Agent-Id: ai:compound-engineering" > "$STATE_TMP"
REVISION=$(jq -r '.revision // empty' "$STATE_TMP")

TMP="${LOCAL}.proof-sync.$$"
jq -jr '.markdown' "$STATE_TMP" > "$TMP" && mv "$TMP" "$LOCAL"
rm "$STATE_TMP"
```

`jq -jr` streams markdown bytes without going through a shell variable, so trailing newlines survive. `mv` within the same filesystem is atomic.

**Confirm before writing when the pull isn't directly asked for.** If a workflow ends up pulling as a side-effect of a different action, surface the impending write with a short confirm like "Sync Proof doc to `<localPath>`?" A silent overwrite is surprising.
