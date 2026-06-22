<!-- ce-decompose task-graph · schema_version: 1 -->

| id | title | stage | model | status | manual_status | depends_on | node_file | branch_ref | pr_refs | base_commit | no_pr | source |
|----|-------|-------|-------|--------|---------------|------------|-----------|------------|---------|-------------|-------|--------|
| n1 | Schema + loader | work | generation | done |  |  | n1.md | n1/schema | #375,#386,#390 | aaa111 |  | EX-1 |
| n2 | Lookup columns | work | generation | done |  | n1 | n2.md | n2/cols | #392 | bbb222 |  | EX-2 |
| n3 | Render bundle | work | ceiling | not-started |  | n2 | n3.md |  |  |  |  | EX-3 |
| n6 | Solar v2 model | brainstorm | ceiling | not-started |  | n3 | n6.md |  |  |  |  | EX-6 |
| n7 | IAM fix | work | generation | done |  |  | n7.md | n7/iam | #400 | ccc333 |  | EX-7 |
| n10 | Data load | work | generation | not-started | done | n2,n7 | n10.md |  |  |  | true | EX-10 |
