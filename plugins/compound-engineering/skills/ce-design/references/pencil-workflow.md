# Pencil MCP Design Workflow

Pencil is a professional vector design tool. Its `.pen` files are encrypted and accessible only through Pencil MCP tools -- never use file-read or content-search tools on `.pen` files directly.

## Setup

1. Call `get_editor_state` to determine the currently active `.pen` file and user selection
2. If no file is open, call `open_document` with `"new"` to create an empty `.pen` file, or pass a specific file path
3. Call `get_guidelines` with the relevant topic (`web-app`, `mobile-app`, `landing-page`, `design-system`, `table`, `slides`) for design rules
4. Call `get_style_guide_tags` then `get_style_guide` to get design inspiration and a style system to follow

## Creating Designs

### Find Placement

Call `find_empty_space_on_canvas` to determine where to place new designs without overlapping existing work.

### Build with batch_design

Use `batch_design` to execute insert, copy, update, replace, move, delete, and image operations. Each call supports up to 25 operations -- enough for meaningful progress without overwhelming the system.

Operation syntax (each line is a single operation):
- `foo=I("parent", { ... })` -- Insert
- `baz=C("nodeid", "parent", { ... })` -- Copy
- `foo2=R("nodeid1/nodeid2", { ... })` -- Replace
- `U(foo+"/nodeid", { ... })` -- Update
- `D("dfFAeg2")` -- Delete
- `M("nodeid3", "parent", 2)` -- Move
- `G("baz", "ai", "...")` -- Generate image

### Self-Review Checkpoints

After every 2-3 batches of modifications, call `get_screenshot` to visually validate the design.

Use `snapshot_layout` to examine computed layout rectangles and verify element positioning.

### Variables and Themes

Use `get_variables` to read current design tokens and themes. Use `set_variables` to add or update variables for consistent theming.

## Editing Existing Designs

1. Use `batch_get` with patterns or node IDs to discover and understand existing content
2. Use `search_all_unique_properties` to find all property values within a subtree
3. Use `replace_all_matching_properties` for bulk property updates (e.g., retheming)
4. Modify with `batch_design` operations (update, replace, delete, move)

## Exporting

Use `export_nodes` to export designs as PNG, JPEG, WEBP, or PDF for handoff artifacts and reference screenshots.

## Key Advantages

- **Professional vector design** -- Full-featured design tool with variables, themes, and components
- **Batch operations** -- Efficient multi-operation calls for fast design creation
- **Design tokens** -- Built-in variable and theme system for consistent design systems
- **Multiple export formats** -- PNG, JPEG, WEBP, PDF for various handoff needs
