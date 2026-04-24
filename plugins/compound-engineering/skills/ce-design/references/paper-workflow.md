# Paper MCP Design Workflow

Paper is a professional design tool with a live HTML canvas. Designs render in real-time as HTML/CSS, making them directly translatable to implementation code. The user watches designs appear element by element.

## Setup

1. Call `get_basic_info` to understand file structure, loaded fonts, and existing artboards
2. Note artboard dimensions to determine if designs are for mobile (375px), tablet, or desktop (1440px)
3. Call `get_selection` to see what the user is focused on (if anything)
4. Call `get_font_family_info` to confirm available fonts before writing styles -- this is mandatory before first use of typographic styles

## Creating Designs

### Create Artboard

Use `create_artboard` with appropriate dimensions for the target viewport.

### Write HTML Incrementally

Each `write_html` call adds roughly ONE visual group:
- A header section
- A single list or table row
- A card shell
- A button group
- A footer

Never batch an entire component or screen into one call. A card with a header, 4 rows, and a footer is 6+ separate `write_html` calls.

### Self-Review Checkpoints

After every 2-3 `write_html` calls, take a screenshot with `get_screenshot` (default 1x scale is sufficient for layout verification; use scale=2 only for reading small text).

Evaluate against the review checklist:
- **Spacing** -- Uneven gaps, cramped groups, or areas that feel unintentionally empty?
- **Typography** -- Text too small to read, poor line-height, weak hierarchy?
- **Contrast** -- Low contrast text, elements blending into backgrounds?
- **Alignment** -- Elements that should share a vertical or horizontal lane but do not?
- **Clipping** -- Content cut off at edges? If content overflows, use `update_styles` to set the overflowing dimension to "fit-content"

Summarize each checkpoint into a one-line verdict. Fix found issues before moving on.

### Typographic Units

- Use "px" for font sizes
- Use "em" for letter spacing
- Use "px" for line height (relative units acceptable if they do not produce subpixel sizes)

### Finishing

Call `finish_working_on_nodes` when done with each screen. This is mandatory.

## Editing Existing Designs

Use `get_tree_summary` to understand artboard structure, `get_node_info` to inspect specific nodes, and `get_children` to list direct children.

Modify with:
- `write_html` -- Add new elements
- `update_styles` -- Change CSS properties
- `set_text_content` -- Update text
- `delete_nodes` -- Remove elements
- `duplicate_nodes` -- Clone and modify (efficient for repeated elements)

Always call `finish_working_on_nodes` when done editing.

## Extracting Code

Use `get_jsx` to extract component structure. Each element has an `id` attribute for targeting specific nodes.

Use `get_computed_styles` for precise CSS values (supports batching multiple nodeIds).

## Key Advantages

- **Live canvas** -- User watches designs appear in real-time
- **HTML/CSS native** -- Designs translate directly to implementation code
- **No export cycle** -- Designs are immediately visible on canvas, no screenshot/upload needed
- **Realistic rendering** -- Real browser rendering engine, not simulated
