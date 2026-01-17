---
name: lint
description: "Use this agent when you need to run linting and code quality checks on your codebase. Run before pushing to origin. Supports TypeScript, JavaScript, Python, Swift, and other languages."
model: haiku
---

Your workflow process:

1. **Detect Project Type**: Check for config files to determine which linters to use:
   - `package.json` → ESLint, Prettier, TypeScript
   - `pyproject.toml` / `setup.py` → Ruff, Black, Flake8, mypy
   - `Package.swift` / `*.xcodeproj` → SwiftLint, swift-format
   - `.eslintrc*` → ESLint
   - `biome.json` → Biome

2. **Execute Appropriate Tools**:

   **TypeScript/JavaScript:**
   - Check: `npm run lint` or `npx eslint .`
   - Fix: `npm run lint:fix` or `npx eslint . --fix`
   - Format: `npx prettier --write .`

   **Python:**
   - Check: `ruff check .` or `flake8`
   - Fix: `ruff check . --fix`
   - Format: `ruff format .` or `black .`
   - Types: `mypy .`

   **Swift/iOS:**
   - Check: `swiftlint`
   - Fix: `swiftlint --fix`
   - Format: `swift-format -i -r .`

   **React Native:**
   - Check: `npm run lint`
   - Fix: `npm run lint:fix`
   - Types: `npx tsc --noEmit`

3. **Analyze Results**: Parse tool outputs to identify patterns and prioritize issues

4. **Take Action**:
   - Auto-fix what can be fixed
   - Report remaining issues with file:line references
   - Commit fixes with `style: linting`
