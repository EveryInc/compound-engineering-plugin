# HTML Plan Template

This template extends `plugins/compound-engineering/skills/_shared/html-output.md` for ce-plan. Use it only when the user passed `--html` or the bare `html` fallback keyword in `$ARGUMENTS`.

The generated file must be a complete, self-contained HTML5 document at:

```text
docs/plans/YYYY-MM-DD-NNN-<type>-<descriptive-name>-plan.html
```

Emit this Implementation Note near the top of every HTML plan:

> This is the HTML view of a ce-plan. Run ce-plan without --html to produce the markdown plan that ce-work consumes.

## Plan HTML Template

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>[Plan Title]</title>
  <style>
    /* Use the embedded CSS theme from ../_shared/html-output.md. */
  </style>
</head>
<body>
  <header class="doc-header">
    <p class="eyebrow">ce-plan HTML view</p>
    <h1>[Plan Title]</h1>
    <p class="summary">[1-3 line prose summary]</p>
    <div class="pill-row" aria-label="Plan frontmatter">
      <span class="pill pill-status-active">status: active</span>
      <span class="pill pill-type-feat">type: feat</span>
      <span class="pill pill-date">date: YYYY-MM-DD</span>
      <span class="pill pill-origin">origin: [origin path when present]</span>
    </div>
    <script type="application/json" id="plan-frontmatter">
      {
        "title": "[Plan Title]",
        "type": "[feat|fix|refactor]",
        "status": "active",
        "date": "YYYY-MM-DD",
        "origin": "[optional origin path]"
      }
    </script>
  </header>

  <div class="layout">
    <nav class="toc" aria-label="Plan sections">
      <a href="#summary">Summary</a>
      <a href="#problem-frame">Problem Frame</a>
      <a href="#requirements">Requirements</a>
      <a href="#scope-boundaries">Scope Boundaries</a>
      <a href="#context-research">Context &amp; Research</a>
      <a href="#key-technical-decisions">Key Technical Decisions</a>
      <a href="#implementation-units">Implementation Units</a>
      <a href="#u1">U1. [Name]</a>
      <a href="#u2">U2. [Name]</a>
      <a href="#test-scenarios">Test Scenarios</a>
      <a href="#risks-open-questions">Risks &amp; Open Questions</a>
      <a href="#sources">Sources &amp; References</a>
    </nav>

    <main>
      <aside class="notice" aria-label="Implementation note">
        <strong>Implementation Note:</strong> This is the HTML view of a ce-plan. Run ce-plan without --html to produce the markdown plan that ce-work consumes.
      </aside>

      <section id="summary">
        <h2>Summary</h2>
        <p>[Forward-looking summary of the planned work.]</p>
      </section>

      <section id="problem-frame">
        <h2>Problem Frame</h2>
        <p>[Situational context and pain that motivate the plan.]</p>
      </section>

      <section id="requirements">
        <h2>Requirements</h2>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th scope="col">R-ID</th>
                <th scope="col">Requirement</th>
                <th scope="col">Origin trace</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row" data-label="R-ID">R1</th>
                <td data-label="Requirement">[Requirement or success criterion]</td>
                <td data-label="Origin trace">[Prompt, origin doc, issue, or assumption]</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section id="scope-boundaries">
        <h2>Scope Boundaries</h2>
        <ul>
          <li>[Explicit non-goal or exclusion]</li>
        </ul>
      </section>

      <section id="context-research">
        <h2>Context &amp; Research</h2>
        <h3>Relevant Code and Patterns</h3>
        <ul>
          <li>[Existing file, class, component, or pattern to follow]</li>
        </ul>
        <h3>Institutional Learnings</h3>
        <ul>
          <li>[Relevant docs/solutions insight]</li>
        </ul>
        <h3>External References</h3>
        <ul>
          <li>[External docs or best-practice source, if used]</li>
        </ul>
      </section>

      <section id="key-technical-decisions">
        <h2>Key Technical Decisions</h2>
        <ul>
          <li><strong>[Decision]:</strong> [Rationale]</li>
        </ul>
      </section>

      <section id="implementation-units">
        <h2>Implementation Units</h2>

        <article id="u1">
          <h3>U1. [Name]</h3>
          <p><strong>Goal:</strong> [What this unit accomplishes]</p>
          <p><strong>Requirements:</strong> [R1, R2]</p>
          <p><strong>Dependencies:</strong> [None / U1 / external prerequisite]</p>

          <h4>Files</h4>
          <ul>
            <li>Create: <code>path/to/new_file</code></li>
            <li>Modify: <code>path/to/existing_file</code></li>
            <li>Test: <code>path/to/test_file</code></li>
          </ul>

          <h4>Approach</h4>
          <ul>
            <li>[Key design or sequencing decision]</li>
          </ul>

          <h4>Test Scenarios</h4>
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th scope="col">Category</th>
                  <th scope="col">Scenario</th>
                  <th scope="col">Expected</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th scope="row" data-label="Category">Happy path</th>
                  <td data-label="Scenario">[Specific input/action]</td>
                  <td data-label="Expected">[Expected outcome]</td>
                </tr>
              </tbody>
            </table>
          </div>

          <h4>Acceptance</h4>
          <ul>
            <li>[Outcome that should hold when this unit is complete]</li>
          </ul>
        </article>
      </section>

      <section id="system-wide-impact">
        <h2>System-Wide Impact</h2>
        <ul>
          <li><strong>Interaction graph:</strong> [Callbacks, middleware, observers, or entry points]</li>
          <li><strong>Error propagation:</strong> [How failures should travel across layers]</li>
          <li><strong>State lifecycle risks:</strong> [Partial-write, cache, duplicate, or cleanup concerns]</li>
          <li><strong>API surface parity:</strong> [Other interfaces that may require the same change]</li>
        </ul>
      </section>

      <section id="test-scenarios">
        <h2>Test Scenarios</h2>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th scope="col">Unit</th>
                <th scope="col">Category</th>
                <th scope="col">Scenario</th>
                <th scope="col">Expected</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row" data-label="Unit"><a href="#u1">U1</a></th>
                <td data-label="Category">Happy path</td>
                <td data-label="Scenario">[Specific input/action]</td>
                <td data-label="Expected">[Expected outcome]</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section id="risks-open-questions">
        <h2>Risks &amp; Open Questions</h2>
        <aside class="risk risk-high">
          <strong>[Risk]:</strong> [Mitigation or accepted tradeoff]
        </aside>
        <h3>Deferred to Implementation</h3>
        <ul>
          <li>[Question or unknown]: [Why it is intentionally deferred]</li>
        </ul>
      </section>

      <section id="sources">
        <h2>Sources &amp; References</h2>
        <ul>
          <li><strong>Origin document:</strong> <a href="[path]">[docs/brainstorms/YYYY-MM-DD-topic-requirements.md]</a></li>
          <li>Related code: <code>[path or symbol]</code></li>
          <li>External docs: <a href="[url]">[url]</a></li>
        </ul>
      </section>
    </main>
  </div>

  <footer class="doc-footer">
    <p>Generated by ce-plan. Markdown remains the workflow source until downstream skills support HTML inputs.</p>
  </footer>
</body>
</html>
```

## Rendering Rules

- Preserve every applicable section from `references/plan-template.md`; omit only sections that the markdown template marks optional and inapplicable.
- Render Implementation Units as `<article id="uN">`, where `N` matches the stable U-ID.
- Render Requirements traceability and Test Scenarios as real tables with `<thead>`, `<tbody>`, and scoped header cells.
- Use `<aside class="risk risk-high">` or `<aside class="risk risk-medium">` for meaningful risk callouts.
- Use inline SVG for diagrams in HTML mode. See `_shared/html-output.md` for data-flow, sequence, and dependency patterns.
- Keep source links in Sources & References as normal `<a href="https://...">` links. The no-external-resource rule only forbids externally loaded CSS, JS, fonts, and images.
