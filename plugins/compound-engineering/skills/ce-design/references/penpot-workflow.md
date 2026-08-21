# Penpot MCP Design Workflow

Penpot is an open-source design platform with a design-as-code philosophy. It supports multi-directional workflows: design informs code, and code informs design. Self-hostable with no paywalls.

## Setup

1. Verify Penpot MCP tools are available
2. Connect to the Penpot instance (cloud or self-hosted)
3. Open or create the target project and file

## Creating Designs

### Design-as-Code Approach

Penpot's unique differentiator is treating designs as code artifacts:
- Design tokens map directly to CSS custom properties
- Components maintain semantic relationships
- Layout properties use standard CSS concepts (flex, grid)

### Building Screens

1. Create frames at the target viewport dimensions
2. Build incrementally -- add one visual group at a time
3. Use components and design tokens for consistency
4. Verify with screenshots between groups of modifications

### Working with Components

- Create reusable components for repeated UI patterns
- Use design tokens for colors, typography, and spacing
- Maintain a consistent component hierarchy

## Reading Designs

Extract design data through the Penpot API:
- File structure and page hierarchy
- Component definitions and instances
- Design tokens and style definitions
- Layout properties and constraints

## Collaboration

Penpot supports team collaboration:
- Share files for review and feedback
- Comment on specific design elements
- Version history for tracking changes

## Exporting

Export designs in multiple formats:
- SVG for vector assets
- PNG/JPEG for raster screenshots
- CSS for design token extraction
- Component specs for developer handoff

## Key Advantages

- **Open source** -- Self-hostable, no vendor lock-in, no paywalls
- **Design-as-code** -- Designs map directly to CSS and code concepts
- **Multi-directional** -- Both design-to-code and code-to-design workflows
- **Standards-based** -- Uses SVG natively, CSS layout concepts, web standards
- **Full API access** -- Complete file manipulation through open API
