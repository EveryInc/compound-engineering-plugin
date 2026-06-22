<!-- ce-decompose task-graph · schema_version: 1 -->

| id | title | stage | model | status | manual_status | depends_on | node_file | branch_ref | pr_refs | base_commit | no_pr | source |
|----|-------|-------|-------|--------|---------------|------------|-----------|------------|---------|-------------|-------|--------|
| n1 | No branch | work | generation | x |  |  | n1.md |  |  |  |  |  |
| n2 | Branch commits | work | generation | x |  |  | n2.md |  |  |  |  |  |
| n3 | One open PR | work | generation | x |  |  | n3.md |  |  |  |  |  |
| n4 | One merged PR | work | generation | x |  |  | n4.md |  |  |  |  |  |
| n5 | Multi PR partial | work | generation | x |  |  | n5.md |  |  |  |  |  |
| n6 | Multi PR merged | work | generation | x |  |  | n6.md |  |  |  |  |  |
| n7 | Manual done pin | work | generation | x | done |  | n7.md |  |  |  |  |  |
| n8 | Manual blocked | work | generation | x | blocked |  | n8.md |  |  |  |  |  |
| n9 | No-PR ops | work | generation | x |  |  | n9.md |  |  |  | true |  |
| n10 | Ambiguous | work | generation | x |  |  | n10.md |  |  |  |  |  |
| n11 | Activator | work | generation | x |  | n4 | n11.md |  |  |  | true |  |
