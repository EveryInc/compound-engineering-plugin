# Figma MCP Design Workflow

Figma integration works through two possible MCP connections, each with different capabilities. The workflow adapts based on which is available.

## Tool Detection

**Official Figma MCP** -- Provides design reading, component extraction, and Code-to-Canvas capabilities. Detected by presence of Figma MCP tools like `get_figma_data`.

**Framelink (figma-context-mcp)** -- Provides simplified design extraction for implementation. Detected by presence of `get_file` tool. Read-only.

Both can be available simultaneously. Official Figma MCP takes priority for creation workflows.

## Official Figma MCP Workflow

### Reading Designs

1. Extract design data from Figma files -- components, styles, layout, spacing
2. Use extracted data to inform the design brief and implementation
3. Read specific frames or components for reference

### Code-to-Canvas (When Available)

If Code-to-Canvas is supported:
1. Build the design as HTML/CSS locally or in another tool
2. Capture screenshots of the implementation
3. Push the captured design back to Figma for review and collaboration

This enables a round-trip: Figma design context informs code, and code results can be pushed back for team review.

### Design Tokens

Extract design tokens (colors, typography, spacing) from Figma files to maintain consistency between design and implementation.

## Framelink Workflow

### Extracting Design Context

1. Call `get_file` with the Figma file URL to get a simplified design representation
2. Call `get_images` to extract specific frame or component images
3. Use the extracted data as reference for the design brief

### Working with Figma Links

When the user provides a Figma URL:
1. Parse the file key and node IDs from the URL
2. Extract relevant frames and components
3. Use as visual reference for new designs or implementation

## Integration with Existing Agents

After designs are created (in Figma or any other tool):

- `compound-engineering:design:figma-design-sync` can sync Figma designs to implementation code during `/ce:work`
- `compound-engineering:design:design-implementation-reviewer` can compare live implementation against Figma designs

## Key Advantages

- **Team collaboration** -- Figma's native sharing and commenting for design review
- **Design system access** -- Read existing components, tokens, and styles
- **Round-trip capability** -- Code-to-Canvas bridges the design-code gap
- **Wide adoption** -- Most design teams already use Figma
