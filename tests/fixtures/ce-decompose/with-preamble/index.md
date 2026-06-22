<!-- ce-decompose task-graph · schema_version: 1 -->

# Example project — task graph

Generate something useful from some inputs, then rank by a score.

Decisions locked at decompose time:
- Engine: custom approach over the off-the-shelf one.
- Serving: precompute then aggregate on demand.

| id | title | stage | model | status | manual_status | depends_on | node_file | branch_ref | pr_refs | base_commit | no_pr | source |
|----|-------|-------|-------|--------|---------------|------------|-----------|------------|---------|-------------|-------|--------|
| n1 | First | work | generation | not-started |  |  | n1.md |  |  |  |  |  |
| n2 | Second | work | generation | not-started |  | n1 | n2.md |  |  |  |  |  |
