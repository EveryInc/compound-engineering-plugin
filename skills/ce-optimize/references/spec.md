# Phase 0: input type and the optimization spec

Read this at the start of Phase 0. It carries how to tell a spec path from a goal description, and how to load, build, or validate the spec before CP-0. The schemas it validates against are `references/optimize-spec-schema.yaml` and `references/experiment-log-schema.yaml`.

### 0.1 Determine Input Type

Check whether the input is:
- **A spec file path** (ends in `.yaml` or `.yml`): read and validate it
- **A description of the optimization goal**: help the user create a spec interactively

### 0.2 Load or Create Spec

**If spec file provided:**
1. Read the YAML spec file. The orchestrating agent parses YAML natively -- no shell script parsing.
2. Validate the spec against **every** rule in the `validation_rules` section of `references/optimize-spec-schema.yaml` (that section is the single source of truth for what a valid spec requires — do not rely on a remembered subset; conditional rules such as the singleton-rubric and exclusive-resources requirements live only there).
3. If any rule fails, report the specific failures and ask the user to fix them before proceeding

**If description provided:**
1. Analyze the project to understand what can be measured
2. **Detect whether the optimization target is qualitative or quantitative** — this determines `type: hard` vs `type: judge` and is the single most important spec decision:

   **Use `type: hard`** when:
   - The metric is a scalar number with a clear "better" direction
   - The metric is objectively measurable (build time, test pass rate, latency, memory usage)
   - No human judgment is needed to evaluate "is this result actually good?"
   - Examples: reduce build time, increase test coverage, reduce API latency, decrease bundle size

   If the user names more than one hard success condition that must all hold (local wall time and CI critical path and runner-minutes, for example), put them in `metric.objectives` as `role: required` and keep `metric.primary` as the ranking key. A spec without `metric.objectives` keeps single-primary acceptance. If each evaluation costs minutes, set `measurement.stability.mode: ladder` with a relative or paired comparison and a futility bound; do not spend the full confirmation protocol on every exploratory experiment. Start from `references/example-expensive-benchmark-spec.yaml` for that shape.

   **Use `type: judge`** when:
   - The quality of the output requires semantic understanding to evaluate
   - A human reviewer would need to look at the results to say "this is better"
   - Proxy metrics exist but can mislead (e.g., "more clusters" does not mean "better clusters")
   - The optimization could produce degenerate solutions that look good on paper
   - Examples: clustering quality, search relevance, summarization quality, code readability, UX copy, recommendation relevance

   **IMPORTANT**: If the target is qualitative, **strongly recommend `type: judge`**. Explain that hard metrics alone will optimize proxy numbers without checking actual quality. Show the user the three-tier approach:
   - **Degenerate gates** (hard, cheap, fast): catch obviously broken solutions — e.g., "all items in 1 cluster" or "0% coverage". Run first. If gates fail, skip the expensive judge step.
   - **LLM-as-judge** (the actual optimization target): sample outputs, score them against a rubric, aggregate. This is what the loop optimizes.
   - **Diagnostics** (logged, not gated): distribution stats, counts, timing — useful for understanding WHY a judge score changed.

   If the user insists on `type: hard` for a qualitative target, proceed but warn that the results may optimize a misleading proxy.

3. **Design the sampling strategy** (for `type: judge`):

   Guide the user through defining stratified sampling. The key question is: "What parts of the output space do you need to check quality on?"

   Walk through these questions:
   - **What does one "item" look like?** (a cluster, a search result page, a summary, etc.)
   - **What are the natural size/quality strata?** (e.g., large clusters vs small clusters vs singletons)
   - **Where are quality failures most likely?** (e.g., very large clusters may be degenerate merges; singletons may be missed groupings)
   - **What total sample size balances cost vs signal?** (default: 30 items, adjust based on output volume)

   Example stratified sampling for clustering:
   ```yaml
   stratification:
     - bucket: "top_by_size"     # largest clusters — check for degenerate mega-clusters
       count: 10
     - bucket: "mid_range"       # middle of non-solo cluster size range — representative quality
       count: 10
     - bucket: "small_clusters"  # clusters with 2-3 items — check if connections are real
       count: 10
   singleton_sample: 15          # singletons — check for false negatives (items that should cluster)
   ```

   The sampling strategy is domain-specific. For search relevance, strata might be "top-3 results", "results 4-10", "tail results". For summarization, strata might be "short documents", "long documents", "multi-topic documents".

   **Singleton evaluation is critical when the goal involves coverage** — sampling singletons with the singleton rubric checks whether the system is missing obvious groupings.

4. **Design the rubric** (for `type: judge`):

   Help the user define the scoring rubric. A good rubric:
   - Has a 1-5 scale (or similar) with concrete descriptions for each level
   - Includes supplementary fields that help diagnose issues (e.g., `distinct_topics`, `outlier_count`)
   - Is specific enough that two judges would give similar scores
   - Does NOT assume bigger/more is better — "3 items per cluster average" is not inherently good or bad

   Example for clustering:
   ```yaml
   rubric: |
     Rate this cluster 1-5:
     - 5: All items clearly about the same issue/feature
     - 4: Strong theme, minor outliers
     - 3: Related but covers 2-3 sub-topics that could reasonably be split
     - 2: Weak connection — items share superficial similarity only
     - 1: Unrelated items grouped together
     Also report: distinct_topics (integer), outlier_count (integer)
   ```

5. Guide the user through the remaining spec fields:
   - What degenerate cases should be rejected? (gates — e.g., "solo_pct <= 0.95" catches all-singletons, "max_cluster_size <= 500" catches mega-clusters)
   - What command runs the measurement?
   - What files can be modified? What is immutable?
   - Any constraints or dependencies?
   - If this is the first run: recommend `execution.mode: serial`, `execution.max_concurrent: 1`, `stopping.max_iterations: 4`, and `stopping.max_hours: 1`
   - If the user named multiple required hard targets or an expensive harness: recommend `metric.objectives` plus `stability.mode: ladder` as above, and show `references/example-expensive-benchmark-spec.yaml`
   - If `type: judge`: recommend `sample_size: 10`, `batch_size: 5`, and `max_total_cost_usd: 5` until the rubric and harness are trusted
6. Write the spec to `.context/compound-engineering/ce-optimize/<spec-name>/spec.yaml`
7. Present the spec to the user for approval before proceeding
