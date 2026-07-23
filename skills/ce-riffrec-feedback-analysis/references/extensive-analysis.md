# Extensive analysis path

Goal: a full Compound Engineering-compatible artifact set that feeds `ce-brainstorm`.

## Workflow

1. Run the analyzer on the input using the `SKILL_DIR`-anchored command in SKILL.md.

2. Read the generated `analysis.md`, `problem-analysis.md`, and `requirements-kickoff.md`. Skip `review-prompt.md` — it re-embeds the same transcript for a separate model.

3. Read `source-materials.md` before brainstorm — the manifest linking the original raw feedback, transcript, frames, chunks, and analysis artifacts, so brainstorm and planning stay traceable to the original evidence.

4. Inspect the extracted screenshots for high-signal moments using the platform's image-view tool. Prioritize screenshots selected because of click events near verbal complaints, failed network requests, console errors, or repeated interaction. The script's candidate findings are deliberately conservative — confirm one against screenshot plus transcript before promoting it to a requirement.

5. Fill or refine `problem-analysis.md` in place, under the category headings it ships with. Focus on WHAT is wrong, not HOW to fix it.

6. Convert evidence into requirements. Keep these categories distinct:

   - **Observed facts:** transcript quotes, click targets, request statuses, screenshot contents.
   - **Inferences:** likely user intent, likely broken control, suspected missing state.
   - **Requirements:** product behavior needed to resolve the problem.

7. When the current workspace contains the product source code, run a source-mapping pass before or during brainstorm. Use the transcript language, visible UI labels, screenshot paths, route names, and generated requirements to search the codebase for likely components, controllers, services, models, tests, and state stores.

8. Add source mapping to the brainstorm material as suspected implementation surfaces, not as proven root cause unless the code clearly proves it. Include confidence levels and short evidence notes explaining why each file or component is relevant.

9. Continue into brainstorm: load the `ce-brainstorm` skill with the generated `requirements-kickoff.md` so it can confirm and regroup the captured requirements before planning. Stop here only when the user explicitly asked only to extract or analyze artifacts.

## Capture scale

- Capture every distinct problem, bug, request, expectation, confusion point, and "note to self" in the transcript or frames, including low-priority ones — mark priority, do not drop.
- Attach a concrete anchor to each: timestamp, transcript phrase, screenshot path, clicked UI element, thread ID, or observed state.
- Prioritization is brainstorm's job, not extraction's — it may regroup, split, defer, or reject items later, so the first pass preserves the full signal.
- Source mapping is supporting material, not a filter. If a problem cannot yet be mapped to code, keep the problem and mark the mapping unknown.

## Source mapping grounding

When mapping feedback to source code, classify each mapping as one of:

- **Likely buggy surface:** the code path exists and directly handles the observed behavior.
- **Missing or incomplete surface:** the feedback names a behavior, but the repo has no clear UI, route, controller action, or component implementing it yet.
- **Indirect surface:** the code is adjacent to the behavior, but the exact interaction may happen through rendered email content, third-party UI, generated HTML, or another layer.
- **Unknown:** no grounded source mapping found yet.

Tag each mapping with the requirement/example id it serves (`R14`, `AE4`, `EX17`), a `path:line`, and a one-line code quote as evidence.

Prefer saying "I did not find a current inbox implementation for this surface" over forcing a speculative mapping. Missing surfaces are useful product findings and should stay in the brainstorm.

## Output

The analyzer prints the artifacts it wrote. The ones that matter downstream are `analysis.md`, `problem-analysis.md`, `source-materials.md`, and `requirements-kickoff.md`; `frames/` and `raw/` are local-only.

For audio-only or notes-only sources there are no frames — extract functional problems, requirements, and UX friction from transcript or notes only.
