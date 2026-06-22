<!-- ce-decompose task-graph · schema_version: 1 -->

| id | title | stage | model | status | manual_status | depends_on | node_file | branch_ref | pr_refs | base_commit | no_pr | source |
|----|-------|-------|-------|--------|---------------|------------|-----------|------------|---------|-------------|-------|--------|
| n1 | A | work | generation | not-started |  | n2 | n1.md |  |  |  |  |  |
| n2 | B | work | generation | not-started |  | n1 | n2.md |  |  |  |  |  |
