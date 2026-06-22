#!/usr/bin/env bash

# Maps a PR review comment node ID to its parent thread.
# Fetches all review threads (paginated) and their comments, then returns the
# thread whose comments contain the target ID.

set -e

if [ $# -lt 2 ]; then
    echo "Usage: get-thread-for-comment PR_NUMBER COMMENT_NODE_ID [OWNER/REPO]"
    echo "Example: get-thread-for-comment 378 PRRC_kwDOP_gZVc6ySv89"
    exit 1
fi

PR_NUMBER=$1
COMMENT_NODE_ID=$2

if [ -n "$3" ]; then
    OWNER=$(echo "$3" | cut -d/ -f1)
    REPO=$(echo "$3" | cut -d/ -f2)
else
    # `|| true` is load-bearing: under `set -e`, a failed command substitution
    # in an assignment aborts the script immediately. Run outside a git repo,
    # `gh repo view` exits 1, its stderr is swallowed by `2>/dev/null`, and the
    # script would die here with rc=1 and no output -- making the friendly error
    # below unreachable. Keep `|| true` so detection failure falls through to it.
    OWNER=$(gh repo view --json owner -q .owner.login 2>/dev/null || true)
    REPO=$(gh repo view --json name -q .name 2>/dev/null || true)
fi

if [ -z "$OWNER" ] || [ -z "$REPO" ]; then
    echo "Error: could not resolve owner/repo. Run get-thread-for-comment from inside the target git repository, or pass OWNER/REPO as the third argument (e.g., get-thread-for-comment $PR_NUMBER $COMMENT_NODE_ID EveryInc/cora)." >&2
    exit 1
fi

# Pagination (issue #798): paginate the reviewThreads connection so PRs with
# more than one page of threads can still resolve a comment to its parent
# thread. Per-thread comments are still capped at 100 -- threads exceeding
# that depth are not paginated here.
threads_pages=$(gh api graphql --paginate --slurp \
  -f owner="$OWNER" -f repo="$REPO" -F pr="$PR_NUMBER" \
  -f query='
query Threads($owner: String!, $repo: String!, $pr: Int!, $endCursor: String) {
  repository(owner: $owner, name: $repo) {
    pullRequest(number: $pr) {
      reviewThreads(first: 100, after: $endCursor) {
        nodes {
          id
          isResolved
          isOutdated
          path
          line
          originalLine
          startLine
          originalStartLine
          comments(first: 100) {
            nodes {
              id
              author { login }
              body
              createdAt
              url
            }
          }
        }
        pageInfo { hasNextPage endCursor }
      }
    }
  }
}')

echo "$threads_pages" | jq -e --arg cid "$COMMENT_NODE_ID" '
  [.[].data.repository.pullRequest.reviewThreads.nodes[]
   | select(.comments.nodes | map(.id) | index($cid))]
  | if length == 0 then error("No thread found for comment \($cid)") else .[0] end
'
