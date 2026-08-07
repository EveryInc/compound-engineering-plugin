# Sketch MCP Design Workflow

Sketch MCP connects to the Sketch desktop app on macOS via a local HTTP server (localhost:31126). It provides both reading and scripted creation capabilities through the SketchAPI.

## Requirements

- macOS only
- Sketch desktop app running
- Sketch MCP server connected (local HTTP on port 31126)

## Setup

1. Call `get_selection_as_image` to verify the connection and see the current selection
2. Identify the current document and page context

## Reading Designs

Use `get_selection_as_image` to capture the current selection as an image for reference.

Read existing designs to extract:
- Layout structure and spacing
- Color palette and typography
- Component patterns and visual language

## Creating and Modifying Designs

Use `run_code` with SketchAPI JavaScript to create or modify designs programmatically.

SketchAPI enables:
- Creating new artboards, layers, and shapes
- Setting styles (fills, borders, shadows, text styles)
- Organizing layers and groups
- Duplicating and transforming elements
- Exporting slices and artboards

### Scripted Creation Pattern

```javascript
// Example: SketchAPI scripts run inside run_code
const sketch = require('sketch');
const document = sketch.getSelectedDocument();
const page = document.selectedPage;
// ... create and style elements
```

Build designs incrementally with multiple `run_code` calls, verifying with `get_selection_as_image` between modifications.

## Exporting

Use SketchAPI export functions within `run_code` to generate PNG, SVG, or PDF exports for handoff.

## Key Advantages

- **Full plugin API** -- Complete SketchAPI access enables complex automations
- **Native macOS design** -- Professional vector design with native performance
- **Scripted creation** -- Programmatic design creation and modification
- **Existing ecosystem** -- Access to Sketch's component libraries and plugins
