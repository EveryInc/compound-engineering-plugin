# Workflow: Generate Artifacts

<required_reading>
Read these references before generating:
1. `../references/progressive-disclosure.md`
2. `../references/mechanical-enforcement.md`
</required_reading>

<process>
## Step 1: Identify Missing Artifacts

Input is a list of missing artifacts from the audit workflow.
Supported outputs:

- `docs/CONVENTIONS.md`
- `docs/TECH_DEBT.md`
- `docs/QUALITY_SCORE.md`
- `docs/ARCHITECTURE.md`
- `CLAUDE.md`
- `docs/SECURITY.md`
- `docs/FRONTEND.md`
- `docs/DESIGN.md`

## Step 2: Map Artifacts to Templates

Map each target to `../assets/*` template.
If target file exists, do not overwrite without explicit confirmation.

## Step 3: Read Project Context

Use repo context to fill placeholders:

- Language and framework
- Key directories
- Naming conventions already in use
- Existing tooling commands

## Step 4: Generate Populated Content

Write starter docs with:

- Generic sections preserved
- Project-specific placeholders filled where clear
- Remaining placeholders explicit as `[PLACEHOLDER]`

## Step 5: Confirm Outputs

List created files and any remaining placeholders to fill manually.
</process>

<success_criteria>
- [ ] Only requested artifacts are generated
- [ ] Templates are populated with project context
- [ ] Existing files are not clobbered silently
- [ ] Output paths follow docs convention
- [ ] Generated files are readable and actionable
</success_criteria>
