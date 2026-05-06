# Excalidraw JSON Format Reference

This reference defines the exact schema for valid `.excalidraw` files. Use it whenever reading or writing Excalidraw JSON to avoid hallucinating field names or invalid structures.

---

## Top-Level Structure

```json
{
  "type": "excalidraw",
  "version": 2,
  "source": "https://excalidraw.com",
  "elements": [...],
  "appState": {
    "gridSize": null,
    "viewBackgroundColor": "#ffffff"
  },
  "files": {}
}
```

| Field | Type | Notes |
|-------|------|-------|
| `type` | string | Always `"excalidraw"` |
| `version` | number | Always `2` |
| `source` | string | Always `"https://excalidraw.com"` |
| `elements` | array | All drawable elements |
| `appState` | object | Canvas settings — keep minimal |
| `files` | object | Embedded image data — usually `{}` |

---

## Common Fields (All Element Types)

Every element must include these fields:

```json
{
  "id": "abc123XYZ",
  "type": "rectangle",
  "x": 100,
  "y": 200,
  "width": 160,
  "height": 60,
  "angle": 0,
  "strokeColor": "#1e1e1e",
  "backgroundColor": "#dbeafe",
  "fillStyle": "solid",
  "strokeWidth": 2,
  "strokeStyle": "solid",
  "roughness": 0,
  "opacity": 100,
  "groupIds": [],
  "frameId": null,
  "roundness": { "type": 3 },
  "seed": 1234567890,
  "version": 1,
  "versionNonce": 987654321,
  "isDeleted": false,
  "boundElements": [],
  "updated": 1700000000000,
  "link": null,
  "locked": false
}
```

| Field | Type | Notes |
|-------|------|-------|
| `id` | string | Random alphanumeric, unique across all elements (e.g., `"aBcD1234"`) |
| `type` | string | One of: `rectangle`, `ellipse`, `arrow`, `text`, `frame`, `line` |
| `x`, `y` | number | Top-left corner position. Origin is top-left of canvas. x increases rightward, y increases downward. |
| `width`, `height` | number | Pixel dimensions |
| `angle` | number | Rotation in radians. Use `0` for no rotation. |
| `strokeColor` | string | Hex color for border/stroke |
| `backgroundColor` | string | Hex fill color, or `"transparent"` |
| `fillStyle` | string | `"solid"`, `"hachure"`, `"cross-hatch"`, `"dots"` |
| `strokeWidth` | number | `1`, `2`, or `4` |
| `strokeStyle` | string | `"solid"`, `"dashed"`, `"dotted"` |
| `roughness` | number | `0` (smooth), `1` (normal), `2` (rough) |
| `opacity` | number | `0`–`100` |
| `groupIds` | array | IDs of groups this element belongs to (usually `[]`) |
| `frameId` | string \| null | ID of the parent frame element, or `null` if not in a frame |
| `roundness` | object \| null | `{ "type": 3 }` for rounded corners, `null` for sharp |
| `seed` | number | Random integer for reproducible rendering |
| `version` | number | Element version counter, start at `1` |
| `versionNonce` | number | Random integer |
| `isDeleted` | boolean | Always `false` for active elements |
| `boundElements` | array | Arrows bound to this shape. Each entry: `{ "id": "<arrow-id>", "type": "arrow" }` |
| `updated` | number | Unix timestamp in milliseconds |
| `link` | string \| null | Optional URL link |
| `locked` | boolean | `false` unless intentionally locked |

---

## Element Types

### rectangle / ellipse

No extra fields beyond the common set. Use `rectangle` for boxes, `ellipse` for circles/ovals.

**Example — architecture component box:**
```json
{
  "id": "homeBloc01",
  "type": "rectangle",
  "x": 120,
  "y": 200,
  "width": 160,
  "height": 60,
  "angle": 0,
  "strokeColor": "#1e1e1e",
  "backgroundColor": "#ede9fe",
  "fillStyle": "solid",
  "strokeWidth": 2,
  "strokeStyle": "solid",
  "roughness": 0,
  "opacity": 100,
  "groupIds": [],
  "frameId": "homeFrame01",
  "roundness": { "type": 3 },
  "seed": 111111111,
  "version": 1,
  "versionNonce": 222222222,
  "isDeleted": false,
  "boundElements": [
    { "id": "arrow01", "type": "arrow" }
  ],
  "updated": 1700000000000,
  "link": null,
  "locked": false
}
```

---

### text

Text elements may be standalone labels or labels contained inside a shape.

**Extra fields:**

| Field | Type | Notes |
|-------|------|-------|
| `text` | string | The display text |
| `fontSize` | number | Font size in pixels (e.g., `16`) |
| `fontFamily` | number | `1` = Virgil (handwritten), `2` = Helvetica, `3` = Cascadia |
| `textAlign` | string | `"left"`, `"center"`, `"right"` |
| `verticalAlign` | string | `"top"`, `"middle"` |
| `baseline` | number | Baseline offset in pixels (typically `fontSize * 0.8`) |
| `containerId` | string \| null | ID of the shape this text is a label for. Set `null` for standalone text. |
| `originalText` | string | Same as `text` (used by Excalidraw internally) |
| `lineHeight` | number | Line height multiplier, typically `1.25` |

**Example — label inside a rectangle:**
```json
{
  "id": "homeBloc01Label",
  "type": "text",
  "x": 128,
  "y": 218,
  "width": 144,
  "height": 25,
  "angle": 0,
  "strokeColor": "#1e1e1e",
  "backgroundColor": "transparent",
  "fillStyle": "solid",
  "strokeWidth": 1,
  "strokeStyle": "solid",
  "roughness": 0,
  "opacity": 100,
  "groupIds": [],
  "frameId": "homeFrame01",
  "roundness": null,
  "seed": 333333333,
  "version": 1,
  "versionNonce": 444444444,
  "isDeleted": false,
  "boundElements": [],
  "updated": 1700000000000,
  "link": null,
  "locked": false,
  "text": "HomeBloc",
  "fontSize": 16,
  "fontFamily": 1,
  "textAlign": "center",
  "verticalAlign": "middle",
  "baseline": 14,
  "containerId": "homeBloc01",
  "originalText": "HomeBloc",
  "lineHeight": 1.25
}
```

When a text is a label inside a shape:
- Set `containerId` to the shape's `id`
- Add `{ "id": "<text-id>", "type": "text" }` to the shape's `boundElements`
- Position text at `shape.x + 8, shape.y + 8` with `width = shape.width - 16, height = shape.height - 16`

---

### arrow

**Extra fields:**

| Field | Type | Notes |
|-------|------|-------|
| `points` | array | Array of `[x, y]` relative to arrow origin. Min 2 points: `[[0,0],[dx,dy]]` |
| `startBinding` | object \| null | Binding to the source shape (see Binding Format below) |
| `endBinding` | object \| null | Binding to the target shape |
| `startArrowhead` | string \| null | `null`, `"arrow"`, `"bar"`, `"dot"`, `"triangle"` |
| `endArrowhead` | string \| null | Same options as startArrowhead |
| `elbowed` | boolean | `false` for straight/curved arrows |

**Binding Format:**
```json
{
  "elementId": "homeBloc01",
  "focus": 0,
  "gap": 8
}
```

| Field | Type | Notes |
|-------|------|-------|
| `elementId` | string | ID of the shape this arrow endpoint is bound to — **MUST exist in elements array** |
| `focus` | number | `-1.0` to `1.0`. `0` = center, `1` = right edge, `-1` = left edge |
| `gap` | number | Pixel gap between arrow tip and shape boundary. Use `8` |

**Example — arrow from HomeScreen to HomeBloc:**
```json
{
  "id": "arrow01",
  "type": "arrow",
  "x": 200,
  "y": 110,
  "width": 0,
  "height": 90,
  "angle": 0,
  "strokeColor": "#1e1e1e",
  "backgroundColor": "transparent",
  "fillStyle": "solid",
  "strokeWidth": 2,
  "strokeStyle": "solid",
  "roughness": 0,
  "opacity": 100,
  "groupIds": [],
  "frameId": "homeFrame01",
  "roundness": { "type": 2 },
  "seed": 555555555,
  "version": 1,
  "versionNonce": 666666666,
  "isDeleted": false,
  "boundElements": [],
  "updated": 1700000000000,
  "link": null,
  "locked": false,
  "points": [[0, 0], [0, 90]],
  "startBinding": {
    "elementId": "homeScreen01",
    "focus": 0,
    "gap": 8
  },
  "endBinding": {
    "elementId": "homeBloc01",
    "focus": 0,
    "gap": 8
  },
  "startArrowhead": null,
  "endArrowhead": "arrow",
  "elbowed": false
}
```

---

### frame

Frames group related elements visually. Elements inside a frame set their `frameId` to the frame's `id`.

**No extra required fields** beyond the common set, but `name` is conventionally set:

```json
{
  "id": "homeFrame01",
  "type": "frame",
  "x": 60,
  "y": 20,
  "width": 400,
  "height": 560,
  "angle": 0,
  "strokeColor": "#bbb",
  "backgroundColor": "transparent",
  "fillStyle": "solid",
  "strokeWidth": 1,
  "strokeStyle": "solid",
  "roughness": 0,
  "opacity": 100,
  "groupIds": [],
  "frameId": null,
  "roundness": null,
  "seed": 777777777,
  "version": 1,
  "versionNonce": 888888888,
  "isDeleted": false,
  "boundElements": [],
  "updated": 1700000000000,
  "link": null,
  "locked": false,
  "name": "Home Feature"
}
```

Frames never have `frameId` set (frames are not nested inside other frames).

---

## Binding Consistency Rules (Critical)

Excalidraw will silently render broken diagrams if bindings are inconsistent. Always validate:

1. **Arrow → Shape:** `arrow.startBinding.elementId` and `arrow.endBinding.elementId` must each reference an element that exists in the `elements` array.

2. **Shape → Arrow backlink:** Every shape that an arrow binds to must include a `boundElements` entry pointing back to that arrow:
   ```json
   { "id": "<arrow-id>", "type": "arrow" }
   ```

3. **Text → Shape backlink:** When a text element has a `containerId`, the referenced shape must have a `boundElements` entry:
   ```json
   { "id": "<text-id>", "type": "text" }
   ```

4. **Frame membership:** Elements inside a frame set `frameId` to the frame's `id`. The frame itself has `frameId: null`.

---

## ID Generation

IDs are random alphanumeric strings (8–12 characters). Use a deterministic naming scheme when generating programmatically to make debugging easier:

- Frames: `f_<featureName>` (e.g., `f_home`)
- Components: `c_<featureName>_<componentName>` (e.g., `c_home_bloc`)
- Arrows: `a_<from>_<to>` (e.g., `a_homeScreen_homeBloc`)
- Labels: `l_<componentId>` (e.g., `l_c_home_bloc`)

IDs must be unique across the entire `elements` array.

---

## Architecture Layer Colors

Use these colors consistently for Flutter/BLoC architecture diagrams:

| Layer | backgroundColor | Description |
|-------|----------------|-------------|
| Screen | `#dbeafe` | Blue-50 — UI/presentation layer |
| Bloc | `#ede9fe` | Purple-50 — state management layer |
| Repository | `#dcfce7` | Green-50 — data access layer |
| Service | `#fef9c3` | Yellow-50 — external services/APIs |
| Model | `#fce7f3` | Pink-50 — data models |

All elements use `strokeColor: "#1e1e1e"`.

---

## Layout Conventions

For architecture diagrams:

- **Frame size:** 400px wide, 560px tall per feature area
- **Gap between frames:** 60px horizontal gap
- **Component box size:** 160px wide × 60px tall
- **Component horizontal center:** frame.x + 120 (centered in 400px frame)
- **Layer Y positions (relative to frame.y):**
  - Screen: +50px
  - Bloc: +200px
  - Repository: +350px
  - Service: +500px

---

## Common Mistakes to Avoid

1. **Mismatched bindings:** Arrow says it binds to shape X, but shape X has no entry in `boundElements` pointing back. Always set both sides.

2. **Missing `boundElements` entry for contained text:** If a text has `containerId`, the shape must list it in `boundElements`.

3. **Invalid `points` on arrows:** Points must be `[[x1, y1], [x2, y2], ...]` — array of two-element arrays, minimum 2 points. Not `[{x, y}]` objects.

4. **Frame elements without `frameId`:** Elements visually inside a frame but with `frameId: null` will not be clipped by the frame in Excalidraw.

5. **Duplicate IDs:** Each element must have a globally unique `id` within the file.

6. **Missing `versionNonce`:** Every element needs a `versionNonce` (any random integer). Omitting it causes Excalidraw to fail silently.

7. **Wrong `roundness` for arrows:** Arrows use `{ "type": 2 }` (not `{ "type": 3 }` which is for shapes).
