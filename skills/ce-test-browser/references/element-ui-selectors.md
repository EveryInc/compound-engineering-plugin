# Element UI Component Selectors & Interaction Patterns

Load this reference when interacting with Element UI `~2.13.2` components via `agent-browser`. Element UI teleports many component overlays to `document.body`, outside the Vue app's mount container. This guide covers the selectors and multi-step interaction patterns needed.

**Version:** These patterns are tested against Element UI `~2.13.2`. Other versions may use different class names or DOM structures.

## Key Concept: Teleported Components

Element UI renders dropdown menus, dialogs, popovers, and date pickers as children of `document.body`, not inside the component that triggered them. This means:

- The trigger element (button, input) is inside your app's mount container (`#messaging`, `#multichannel-sender`)
- The overlay content (dropdown options, dialog body, picker panel) is a sibling of `<body>`, outside your app
- `agent-browser snapshot -i` will show both — look for elements near the bottom of the snapshot that aren't inside your app container

## el-select (Dropdown Select)

**DOM structure:**
- Trigger: `.el-select` container with `.el-input` inside
- Dropdown: `.el-select-dropdown` teleported to `body`, contains `.el-select-dropdown__item` elements

**Interaction pattern:**
```
1. agent-browser click @select-trigger       # Click the el-select input to open
2. agent-browser wait .el-select-dropdown     # Wait for dropdown to appear in body
3. agent-browser snapshot -i                  # Find the option refs
4. agent-browser click @target-option         # Click the desired option
5. agent-browser wait 500                     # Allow selection to register
```

**Finding options:** After step 2, use `agent-browser snapshot -i` to see the dropdown items with their `@eN` refs. Options are `.el-select-dropdown__item` elements. The selected option has class `selected`.

**Multi-select:** For `el-select` with `multiple` attribute, clicking an option toggles it without closing the dropdown. Click outside or press Escape to close.

## el-dialog (Modal Dialog)

**DOM structure:**
- Wrapper: `.el-dialog__wrapper` teleported to `body`
- Dialog: `.el-dialog` inside the wrapper
- Header: `.el-dialog__header` with `.el-dialog__title`
- Body: `.el-dialog__body`
- Footer: `.el-dialog__footer` with action buttons
- Overlay: `.v-modal` backdrop

**Interaction pattern:**
```
1. agent-browser click @trigger-button        # Click whatever opens the dialog
2. agent-browser wait .el-dialog__wrapper     # Wait for dialog wrapper
3. agent-browser snapshot -i                  # Find form fields and buttons
4. # Interact with dialog content (fill forms, click buttons)
5. agent-browser click @confirm-button        # Click confirm/submit in footer
6. agent-browser wait 500                     # Allow dialog to close
```

**Closing:** Click the X button (`.el-dialog__headerbtn`), click a footer button, or click the overlay (if `close-on-click-modal` is true, which is the default).

**Nested dialogs:** Element UI supports nested dialogs. Each gets its own `.el-dialog__wrapper` in body. Use `agent-browser snapshot -i` to distinguish between them.

## el-date-picker

**DOM structure:**
- Trigger: `.el-date-editor` input
- Panel: `.el-picker-panel` teleported to `body`
- Navigation: `.el-date-picker__header` with prev/next month buttons
- Date cells: `.el-date-table` with `td.available` cells
- Today: `td.today`
- Selected: `td.current`

**Interaction pattern (select a specific date):**
```
1. agent-browser click @date-input            # Click to open picker
2. agent-browser wait .el-picker-panel        # Wait for panel
3. agent-browser snapshot -i                  # See the calendar
4. # Navigate months if needed:
5. agent-browser click @next-month-button     # .el-icon-arrow-right in header
6. agent-browser wait 300                     # Allow month transition
7. agent-browser click @target-date-cell      # Click the date cell
8. agent-browser wait 500                     # Allow picker to close
```

**Date range:** For range pickers, the panel shows two months side by side. Click the start date, then the end date.

**Quick tip:** Use `agent-browser snapshot -i` after opening the picker to find the exact refs for date cells. Each `td` in the date table is interactive.

## el-popover

**DOM structure:**
- Trigger: the element with `v-popover` directive
- Content: `.el-popover` teleported to `body`
- Arrow: `.popper__arrow`

**Interaction pattern:**
```
1. agent-browser click @popover-trigger       # Click or hover to show
2. agent-browser wait .el-popover             # Wait for popover
3. agent-browser snapshot -i                  # Find content refs
4. # Interact with popover content
```

**Trigger mode:** Popovers can be triggered by `click`, `hover`, or `focus`. With `agent-browser`, always use click — hover events are unreliable.

## el-message-box (Confirm/Alert/Prompt)

**DOM structure:**
- Wrapper: `.el-message-box__wrapper` teleported to `body`
- Box: `.el-message-box`
- Title: `.el-message-box__title`
- Message: `.el-message-box__message`
- Input: `.el-message-box__input` (for prompt type)
- Buttons: `.el-message-box__btns` with cancel and confirm

**Interaction pattern:**
```
1. # Message box appears after an action
2. agent-browser wait .el-message-box__wrapper
3. agent-browser snapshot -i                  # See title, message, buttons
4. agent-browser click @confirm-button        # Or @cancel-button
```

## el-table

**DOM structure:**
- Container: `.el-table`
- Header: `.el-table__header-wrapper`
- Body: `.el-table__body-wrapper` with `tr` rows and `td` cells
- Fixed columns: `.el-table__fixed` (if present)

**Interaction pattern:**
```
1. agent-browser wait .el-table__body-wrapper  # Wait for table to render
2. agent-browser snapshot -i                   # Find row/cell refs
3. agent-browser click @target-row             # Click a row (if clickable)
```

**Pagination:** If the table has pagination (`.el-pagination`), use `agent-browser click` on page numbers or next/prev buttons.

## General Tips

### Discovering selectors
When you don't know the exact selector:
```
agent-browser snapshot -i    # Shows all interactive elements with @eN refs
```

### Waiting for animations
Element UI components have transition animations (default 300ms). After opening/closing overlays, wait at least 300-500ms before interacting with the next element.

### Z-index stacking
When multiple overlays are open (dialog + popover, or nested dialogs), the latest one has the highest z-index. `agent-browser snapshot -i` shows elements in DOM order, not z-index order — the last overlay in the list is typically the topmost.

### Hidden elements
If an element exists in the DOM but isn't visible (display: none, visibility: hidden), `agent-browser click` will fail. Use `agent-browser snapshot -i` to check visibility.

## Troubleshooting

| Symptom | Likely Cause | Fix |
|---------|-------------|-----|
| Dropdown doesn't appear after clicking select | Another overlay is blocking it | Close other overlays first |
| Can't find dropdown options | They're teleported to body, not inside the select | Use `snapshot -i` to find them at the bottom of the element list |
| Dialog close button doesn't work | Clicking the overlay instead of the X | Use specific `.el-dialog__headerbtn` selector |
| Date picker shows wrong month | Default is current month | Use nav buttons to reach target month before selecting |
| Table rows not clickable | Table doesn't have row-click handler | Check if the table has `@row-click` or specific cell buttons |
