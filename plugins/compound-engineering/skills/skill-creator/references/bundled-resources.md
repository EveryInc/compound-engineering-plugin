# Bundled Resources Guide

## Overview

Skills can include three types of bundled resources:

| Type | Purpose | Location |
|------|---------|----------|
| Scripts | Executable code for deterministic tasks | `scripts/` |
| References | Documentation loaded as needed | `references/` |
| Assets | Files used in output (templates, images) | `assets/` |

## Scripts (`scripts/`)

Executable code (Python/Bash/etc.) for tasks requiring deterministic reliability or repeatedly rewritten.

**When to include:**
- Same code is being rewritten repeatedly
- Deterministic reliability is needed

**Examples:**
- `scripts/rotate_pdf.py` for PDF rotation
- `scripts/validate_schema.py` for data validation
- `scripts/generate_report.py` for templated reports

**Benefits:**
- Token efficient
- Deterministic execution
- May be executed without loading into context

**Note:** Scripts may still need to be read for patching or environment-specific adjustments.

## References (`references/`)

Documentation intended to be loaded as needed into context.

**When to include:**
- Documentation Claude should reference while working
- Detailed information not needed for every invocation

**Examples:**
- `references/finance.md` for financial schemas
- `references/api_docs.md` for API specifications
- `references/policies.md` for company policies

**Best practices:**
- Keep SKILL.md lean, references loaded only when needed
- For large files (>10k words), include grep search patterns in SKILL.md
- Avoid duplication between SKILL.md and references

**Information placement:**
- SKILL.md: Essential procedural instructions, workflow guidance
- References: Detailed reference material, schemas, examples

## Assets (`assets/`)

Files not loaded into context, but used within output Claude produces.

**When to include:**
- Files needed in final output
- Templates to copy or modify
- Binary files (images, fonts, documents)

**Examples:**
- `assets/logo.png` for brand assets
- `assets/slides.pptx` for PowerPoint templates
- `assets/frontend-template/` for HTML/React boilerplate
- `assets/font.ttf` for typography

**Benefits:**
- Separates output resources from documentation
- Enables file use without loading into context

## Progressive Disclosure Design

Skills use a three-level loading system:

| Level | Content | When Loaded | Size |
|-------|---------|-------------|------|
| 1 | Metadata (name + description) | Always | ~100 words |
| 2 | SKILL.md body | When skill triggers | <5k words |
| 3 | Bundled resources | As needed | Unlimited* |

*Scripts can be executed without reading into context window.
