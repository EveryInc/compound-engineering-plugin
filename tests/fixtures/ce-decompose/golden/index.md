<!-- ce-decompose task-graph · schema_version: 1 -->

| id | title | stage | model | status | manual_status | depends_on | node_file | branch_ref | pr_refs | base_commit | no_pr | source |
|----|-------|-------|-------|--------|---------------|------------|-----------|------------|---------|-------------|-------|--------|
| n1 | OSM road attributes on ReferenceTrail | work | generation | done |  |  | n1-osm-road-attributes.md | claude/running-route-shade | #375,#386,#390 |  |  | LAB-867 |
| n2 | Street-crossing detection + busyness weighting | work | generation | done |  | n1 | n2-crossing-detection.md | pj/lab-868 | #396 |  |  | LAB-868 |
| n3 | RouteFeatures sidecar + promotion + backfill | work | ceiling | done |  | n2 | n3-routefeatures-sidecar.md | pj/lab-869 | #398,#408,#416 |  |  | LAB-869 |
| n4 | Search API filter for crossing burden | work | generation | done |  | n3 | n4-search-filter-crossings.md | pj/lab-870 | #411 |  |  | LAB-870 |
| n5 | Canopy shade v1: canopy_fraction + min_shade | work | generation | done |  | n3 | n5-canopy-v1.md | pj/lab-871 | #414 |  |  | LAB-871 |
| n6 | Solar shade v2: time-of-day shade | brainstorm | ceiling | not-started |  | n3 | n6-solar-v2.md |  |  |  |  | LAB-872 |
| n7 | Loader IAM auth for ogr2ogr subprocess | work | generation | done |  |  | n7-loader-iam-auth.md | pj/lab-873 |  |  |  | LAB-873 |
| n8 | Crossings calibration from Denver spot-check | plan | ceiling | not-started |  | n2,n3 | n8-crossings-calibration.md |  |  |  |  | LAB-877 |
| n9 | Canopy follow-ups: NULL-vs-0.0 + sort index | plan | generation | not-started |  | n5 | n9-canopy-followups.md |  |  |  |  | LAB-878 |
| n10 | Ops: vectorize + load CO NLCD canopy into prod | work | generation | not-started | done | n5,n7 | n10-canopy-data-load.md |  |  |  | true | LAB-879 |
