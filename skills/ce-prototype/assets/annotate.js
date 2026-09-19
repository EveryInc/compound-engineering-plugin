(() => {
  const token = new URLSearchParams(window.location.search).get("token")
  // The helper stamps the path it served on this script. History API rewrites
  // change location.pathname without changing which screen file this is.
  const servedPage = document.currentScript?.getAttribute("data-ce-page") || "/"
  const servedDocument = document.currentScript?.getAttribute("data-ce-document") || ""
  // Overlay host hangs off <html>, not <body>, so it stays out of body layout
  // and document.body.children. A manual popover puts it on the top layer so
  // Annotate and the end control stay usable over dialog.showModal().
  const host = document.createElement("ce-annotate-host")
  host.style.cssText =
    "display: block; position: fixed; inset: 0; width: auto; height: auto; overflow: visible; color: inherit; background: transparent; pointer-events: none; z-index: 2147483645; margin: 0; padding: 0; border: 0;"
  document.documentElement.appendChild(host)
  host.setAttribute("popover", "manual")
  const raiseOverlay = () => {
    if (typeof host.showPopover !== "function") return
    try { host.hidePopover() } catch {}
    try { host.showPopover() } catch {}
  }
  raiseOverlay()
  if (typeof MutationObserver === "function") {
    new MutationObserver((records) => {
      for (const record of records) {
        const nodes = record.type === "attributes" ? [record.target] : record.addedNodes
        for (const node of nodes) {
          if (node !== host && node.nodeName === "DIALOG" && node.hasAttribute?.("open")) {
            raiseOverlay()
            return
          }
        }
      }
    }).observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ["open"] })
  }
  const shadow = host.attachShadow({ mode: "open" })
  const css = document.createElement("link")
  css.rel = "stylesheet"
  // Resolved against this script's own URL, not the document base a screen may set.
  css.href = new URL("/__ce-annotate/annotate.css", document.currentScript?.src || window.location.origin).href
  shadow.appendChild(css)

  const chrome = document.createElement("div")
  chrome.className = "ce-annotate-chrome"
  chrome.innerHTML = `
    <button type="button" class="ce-annotate-toggle" aria-pressed="false" aria-keyshortcuts="Control+A Escape" title="Click pins the rest state. Ctrl+A while hovering freezes hover, then click to pin. Esc or Ctrl+A again turns it off."><span class="ce-annotate-toggle-label">Annotate</span><kbd class="ce-annotate-hotkey">Ctrl+A</kbd></button>
    <button type="button" class="ce-annotate-stop" title="Close the preview and return to chat">End session</button>
    <span class="ce-annotate-status" hidden></span>
  `
  shadow.appendChild(chrome)

  const catcher = document.createElement("div")
  catcher.className = "ce-annotate-catcher"
  catcher.hidden = true
  shadow.appendChild(catcher)

  const layer = document.createElement("div")
  layer.className = "ce-annotate-layer"
  shadow.appendChild(layer)

  const pinTip = document.createElement("div")
  pinTip.className = "ce-annotate-pin-tip"
  pinTip.hidden = true
  shadow.appendChild(pinTip)

  const composer = document.createElement("form")
  composer.className = "ce-annotate-composer"
  composer.hidden = true
  composer.innerHTML = `
    <textarea class="ce-annotate-comment" rows="3" placeholder="What should change here?"></textarea>
    <div class="ce-annotate-actions">
      <button type="submit" class="ce-annotate-submit" disabled>Submit</button>
      <button type="button" class="ce-annotate-cancel">Cancel</button>
    </div>
    <p class="ce-annotate-error" hidden></p>
  `
  shadow.appendChild(composer)

  const toggle = chrome.querySelector(".ce-annotate-toggle")
  const toggleLabel = chrome.querySelector(".ce-annotate-toggle-label")
  const stop = chrome.querySelector(".ce-annotate-stop")
  const status = chrome.querySelector(".ce-annotate-status")
  const commentField = composer.querySelector(".ce-annotate-comment")
  const submit = composer.querySelector(".ce-annotate-submit")
  const cancel = composer.querySelector(".ce-annotate-cancel")
  const error = composer.querySelector(".ce-annotate-error")

  const overlaySession = document.currentScript?.getAttribute("data-ce-session") || ""
  const STATE_KEY = overlaySession ? `ce-annotate-state:${overlaySession}` : "ce-annotate-state"
  const PIN_STATUS = { held: "pending", queued: "pending", working: "working" }
  let commentToolOn = false
  let sessionEnded = false
  let lastPointer = { x: 0, y: 0 }
  let sawPointer = false
  const frozenStyles = []
  let inFlight = false
  let reloadPending = false
  let draft = null
  let source = null
  // The helper's view of each annotation's lifecycle, keyed by id. Pin status
  // follows it; a reload or a screen change never changes a pin on its own.
  let annotationStates = {}
  const pins = []

  function prototypeRoot() {
    return document.getElementById("ce-prototype-root") || document.body
  }

  // A revised screen is shown by navigating to the stamped served path, so a
  // History API rewrite is not what the helper looks up. Query and fragment
  // on that path stay. The browser owns every reconciliation; pins, tool
  // state, and open draft are carried across explorer navigation as well as
  // helper-driven reloads.
  function persistState() {
    const state = {
      commentToolOn,
      sessionEnded,
      pins,
      annotationStates,
      draft: draft
        ? { ...draft, page: servedPage, text: commentField.value, left: composer.style.left, top: composer.style.top }
        : null,
    }
    try {
      sessionStorage.setItem(STATE_KEY, JSON.stringify(state))
    } catch {
      // Without storage a navigation still shows the next screen; only the pins are lost.
    }
  }

  function persistAndReload() {
    persistState()
    window.location.replace(`${servedPage}${window.location.search}${window.location.hash}`)
  }

  // A screen change arriving while a comment is being sent waits for that
  // request to settle, so the pin gets its id (or its retry) before the reload.
  function requestReload() {
    if (inFlight) {
      reloadPending = true
      return
    }
    if (source) source.close()
    persistAndReload()
  }

  function restorePersistedState() {
    let saved = null
    try {
      saved = JSON.parse(sessionStorage.getItem(STATE_KEY) || "null")
    } catch {
      return false
    }
    if (!saved || typeof saved !== "object") return false
    if (saved.annotationStates && typeof saved.annotationStates === "object" && !Array.isArray(saved.annotationStates)) {
      annotationStates = { ...saved.annotationStates, ...annotationStates }
    }
    if (Array.isArray(saved.pins)) {
      for (const pin of saved.pins) {
        if (!pin || typeof pin.selector !== "string" || typeof pin.comment !== "string") continue
        if (pin.id && pins.some((existing) => existing.id === pin.id)) continue
        pins.push(pin)
      }
    }
    dropAppliedPins()
    if (saved.sessionEnded) {
      markEnded()
      return true
    }
    if (saved.commentToolOn && !agentHasBatch()) setCommentTool(true)
    if (
      saved.draft &&
      typeof saved.draft.selector === "string" &&
      (!saved.draft.page || saved.draft.page === servedPage) &&
      !agentHasBatch()
    ) {
      restoreDraft(saved.draft)
    }
    syncStopButton()
    return true
  }

  function restoreDraft(saved) {
    let node = null
    try {
      node = document.querySelector(saved.selector)
    } catch {
      node = null
    }
    draft = { selector: saved.selector, textSnippet: saved.textSnippet, rect: saved.rect, point: saved.point, x: saved.x, y: saved.y }
    composer.hidden = false
    if (node) {
      const rect = node.getBoundingClientRect()
      Object.assign(draft, positionFromNode(node, draft))
      placeComposer(rect.left, rect.top + rect.height)
    } else {
      composer.style.left = saved.left || ""
      composer.style.top = saved.top || ""
    }
    commentField.value = typeof saved.text === "string" ? saved.text : ""
    error.hidden = true
    commentField.focus()
    syncSubmit()
  }

  function applyAnnotationStates(states) {
    if (!states || typeof states !== "object") return
    annotationStates = states
    dropAppliedPins()
    for (const pin of pins) {
      const status = PIN_STATUS[states[pin.id]]
      if (status) pin.status = status
    }
    reattachPins()
    syncStopButton()
  }

  // An applied note is answered by the revised screen. Its pin would only
  // point at whatever the old selector matches now.
  function dropAppliedPins() {
    for (let i = pins.length - 1; i >= 0; i--) {
      if (annotationStates[pins[i].id] === "done") pins.splice(i, 1)
    }
  }

  function unflushedCount() {
    const ids = new Set()
    for (const [id, state] of Object.entries(annotationStates)) {
      if (state === "held") ids.add(id)
    }
    for (const pin of pins) {
      const state = pin.id ? annotationStates[pin.id] : "held"
      if (!state || state === "held") ids.add(pin.id || `local:${pins.indexOf(pin)}`)
    }
    return ids.size
  }

  function pinOnThisPage(pin) {
    return !pin.page || pin.page === servedPage
  }

  function agentHasBatch() {
    return Object.values(annotationStates).some((state) => state === "queued" || state === "working")
  }

  function syncStopButton() {
    if (sessionEnded) return
    if (agentHasBatch()) {
      if (commentToolOn) setCommentTool(false)
      toggle.hidden = true
      stop.hidden = true
      setStatus("Sent to agent")
      status.title = "Return to chat. You can annotate again after this batch is applied."
      return
    }
    toggle.hidden = false
    stop.hidden = false
    status.removeAttribute("title")
    if (status.textContent === "Sent to agent") setStatus("")
    const n = unflushedCount()
    if (n === 0) {
      stop.textContent = "End session"
      stop.removeAttribute("aria-label")
      stop.title = "Close the preview and return to chat"
      return
    }
    const badge = document.createElement("span")
    badge.className = "ce-annotate-count"
    badge.textContent = String(n)
    stop.replaceChildren(badge, document.createTextNode("Send to agent"))
    const notes = n === 1 ? "1 note" : `${n} notes`
    stop.setAttribute("aria-label", `Send ${notes} to the agent`)
    stop.title = `Send ${notes} to the agent. The session stays open for another batch.`
  }

  function cssPath(el) {
    if (!(el instanceof Element)) return ""
    if (el.id) return `#${CSS.escape(el.id)}`
    if (el === document.body) return "body"
    const parts = []
    let node = el
    while (node && node.nodeType === 1 && node !== document.documentElement) {
      if (node.id === "ce-prototype-root" || node === document.body) break
      if (node.id) {
        parts.unshift(`#${CSS.escape(node.id)}`)
        break
      }
      const parent = node.parentElement
      if (!parent) break
      const tag = node.tagName.toLowerCase()
      const same = [...parent.children].filter((child) => child.tagName === node.tagName)
      const index = same.indexOf(node) + 1
      parts.unshift(same.length > 1 ? `${tag}:nth-of-type(${index})` : tag)
      node = parent
    }
    return parts.join(" > ")
  }

  function tokenUrl(path, extra) {
    const url = new URL(path, window.location.origin)
    if (token) url.searchParams.set("token", token)
    if (extra) {
      for (const [key, value] of Object.entries(extra)) {
        if (value) url.searchParams.set(key, value)
      }
    }
    return url.toString()
  }

  function setStatus(text) {
    status.hidden = !text
    status.textContent = text || ""
  }

  function syncSubmit() {
    submit.disabled = sessionEnded || inFlight || commentField.value.trim() === ""
    cancel.disabled = inFlight
  }

  function closeComposer(keep) {
    composer.hidden = true
    if (keep) return
    draft = null
    error.hidden = true
    error.textContent = ""
    commentField.value = ""
    syncSubmit()
  }

  // Pins stay click-through so a note on a control never blocks that control;
  // the comment shows by pointer position instead of a hover target.
  const PIN_SIZE = 22
  function showPinTipAt(x, y) {
    const pin = pins.findLast(
      (p) => pinOnThisPage(p) && x >= p.x && x <= p.x + PIN_SIZE && y >= p.y && y <= p.y + PIN_SIZE,
    )
    pinTip.hidden = !pin
    if (!pin) return
    pinTip.textContent = pin.comment
    pinTip.style.left = `${Math.max(0, Math.min(pin.x + PIN_SIZE + 4, window.innerWidth - 260))}px`
    pinTip.style.top = `${pin.y}px`
  }

  function renderPins() {
    pinTip.hidden = true
    layer.replaceChildren()
    for (const pin of pins) {
      if (!pinOnThisPage(pin)) continue
      const marker = document.createElement("button")
      marker.type = "button"
      marker.className = `ce-annotate-pin is-${pin.status}`
      marker.textContent = pin.status === "target-gone" ? "!" : pins.indexOf(pin) + 1
      marker.title = pin.comment
      marker.style.left = `${pin.x}px`
      marker.style.top = `${pin.y}px`
      layer.appendChild(marker)
    }
  }

  // A pin stays where it was dropped inside its target, so a note on a large
  // element does not jump to that element's corner.
  function positionFromNode(node, pin) {
    const rect = node.getBoundingClientRect()
    const was = pin && pin.rect
    if (was && pin.point && was.width > 0 && was.height > 0) {
      const fx = Math.max(0, Math.min(1, (pin.point.x - was.x) / was.width))
      const fy = Math.max(0, Math.min(1, (pin.point.y - was.y) / was.height))
      return { x: rect.left + fx * rect.width, y: rect.top + fy * rect.height }
    }
    return { x: rect.left + Math.min(12, rect.width / 2), y: rect.top + 4 }
  }

  function reattachPins() {
    const root = prototypeRoot()
    for (const pin of pins) {
      if (!pinOnThisPage(pin)) continue
      let node = null
      try {
        node = root.querySelector(pin.selector) || document.querySelector(pin.selector)
      } catch {
        node = null
      }
      const queued = pin.status === "pending" || pin.status === "working"
      if (node) {
        if (!queued) pin.status = "attached"
        Object.assign(pin, positionFromNode(node, pin))
      } else if (!queued) {
        pin.status = "target-gone"
      }
    }
    renderPins()
  }

  function markEnded() {
    sessionEnded = true
    setCommentTool(false)
    toggle.hidden = true
    stop.hidden = true
    setStatus("Session ended")
    closeComposer()
    pins.length = 0
    renderPins()
  }

  function openComposer(target, event) {
    const selector = cssPath(target)
    if (!selector) return
    const box = target.getBoundingClientRect()
    draft = {
      x: event.clientX,
      y: event.clientY,
      selector,
      textSnippet: (target.textContent || "").trim().slice(0, 240),
      rect: { x: box.left, y: box.top, width: box.width, height: box.height },
      // On a canvas or empty space the target says little; the point is what
      // the explorer indicated.
      point: {
        x: event.clientX,
        y: event.clientY,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
      },
    }
    composer.hidden = false
    placeComposer(event.clientX, event.clientY)
    error.hidden = true
    commentField.focus()
    syncSubmit()
  }

  function placeComposer(x, y) {
    const width = composer.offsetWidth || Math.min(260, window.innerWidth)
    const height = composer.offsetHeight || Math.min(160, window.innerHeight)
    composer.style.left = `${Math.max(0, Math.min(x + 12, window.innerWidth - width))}px`
    composer.style.top = `${Math.max(0, Math.min(y + 12, window.innerHeight - height))}px`
  }

  function setCommentTool(on) {
    commentToolOn = on
    toggle.setAttribute("aria-pressed", String(on))
    toggle.classList.toggle("is-on", on)
    toggleLabel.textContent = on ? "Annotating" : "Annotate"
    catcher.hidden = !on
    if (!on) {
      unfreezeHover()
      closeComposer(inFlight)
    }
  }

  function pageElementFromPoint(x, y) {
    let node = null
    for (const el of document.elementsFromPoint(x, y)) {
      if (!(el instanceof Element)) continue
      if (el === host || host.contains(el)) continue
      if (el === document.documentElement) continue
      node = el
      break
    }
    return node || prototypeRoot()
  }

  // Hit testing skips pointer-events:none, which is how labels and headlines
  // laid over a canvas are usually styled. What was indicated is the topmost
  // painted element at the point with those counted, so every visible one
  // smaller than the hit element joins a single hit test. One at a time would
  // let a label win while another unhittable layer is painted over it.
  function unhittableElementAt(x, y, hit) {
    const hitBox = hit.getBoundingClientRect()
    const hitArea = hitBox.width * hitBox.height
    const candidates = []
    for (const el of document.body.querySelectorAll("*")) {
      if (el === host || host.contains(el)) continue
      const box = el.getBoundingClientRect()
      const area = box.width * box.height
      if (!area || area >= hitArea) continue
      if (x < box.left || x > box.right || y < box.top || y > box.bottom) continue
      if (getComputedStyle(el).pointerEvents !== "none") continue
      const visible = el.checkVisibility
        ? el.checkVisibility({ opacityProperty: true, visibilityProperty: true })
        : getComputedStyle(el).visibility === "visible"
      if (visible && paintsAt(el, x, y)) candidates.push(el)
    }
    if (candidates.length === 0) return null
    const saved = candidates.map((el) => [
      el,
      el.style.getPropertyValue("pointer-events"),
      el.style.getPropertyPriority("pointer-events"),
    ])
    for (const el of candidates) el.style.setProperty("pointer-events", "auto", "important")
    try {
      // The top element can be a part of a candidate, such as a shape inside
      // an svg, which became hittable by inheritance.
      let top = pageElementFromPoint(x, y)
      while (top && !candidates.includes(top)) top = top.parentElement
      return top || null
    } finally {
      for (const [el, value, priority] of saved) {
        if (value) el.style.setProperty("pointer-events", value, priority)
        else el.style.removeProperty("pointer-events")
      }
    }
  }

  // A box that contains the point can paint nothing there: a positioned
  // wrapper around labels has a box and no pixels of its own. Only what the
  // element itself draws counts, so a wrapper's children are judged as themselves.
  const REPLACED = new Set(["IMG", "SVG", "VIDEO", "CANVAS", "PICTURE", "IFRAME", "OBJECT", "EMBED", "INPUT", "SELECT", "TEXTAREA", "BUTTON"])
  function paintsAt(el, x, y) {
    if (REPLACED.has(el.tagName.toUpperCase())) return true
    const style = getComputedStyle(el)
    // Alpha is the fourth component; `rgb(255, 204, 0)` also ends in ", 0)".
    const transparent = (color) => color === "transparent" || /^rgba\((?:[^,]+,){3}\s*0(?:\.0+)?\)$/.test(color)
    if (!transparent(style.backgroundColor) || style.backgroundImage !== "none") return true
    // A border paints only its own band, not the interior it surrounds.
    const box = el.getBoundingClientRect()
    const depth = { Top: y - box.top, Right: box.right - x, Bottom: box.bottom - y, Left: x - box.left }
    for (const side of ["Top", "Right", "Bottom", "Left"]) {
      const width = parseFloat(style[`border${side}Width`])
      if (!(width > 0) || style[`border${side}Style`] === "none" || transparent(style[`border${side}Color`])) continue
      if (depth[side] >= 0 && depth[side] <= width) return true
    }
    const range = document.createRange()
    for (const node of el.childNodes) {
      if (node.nodeType !== 3 || !node.nodeValue.trim()) continue
      range.selectNodeContents(node)
      for (const box of range.getClientRects()) {
        if (x >= box.left && x <= box.right && y >= box.top && y <= box.bottom) return true
      }
    }
    return false
  }

  function targetFromCatcher(event) {
    catcher.style.pointerEvents = "none"
    try {
      const hit = pageElementFromPoint(event.clientX, event.clientY)
      return unhittableElementAt(event.clientX, event.clientY, hit) || hit
    } finally {
      catcher.style.pointerEvents = ""
    }
  }

  function unfreezeHover() {
    for (const item of frozenStyles) {
      for (const [prop, value, priority] of item.overrides) {
        if (value) item.el.style.setProperty(prop, value, priority)
        else item.el.style.removeProperty(prop)
      }
    }
    frozenStyles.length = 0
  }

  const freezeExact = new Set([
    "display", "visibility", "opacity", "overflow", "overflow-x", "overflow-y",
    "color", "cursor", "z-index", "font-weight", "font-style",
    "box-shadow", "text-shadow", "filter", "backdrop-filter", "mix-blend-mode",
    "translate", "rotate", "scale", "clip-path",
  ])
  const freezePrefix = ["background-", "border-", "outline-", "text-decoration", "transform", "mask-", "fill", "stroke"]

  function shouldFreezeProp(prop) {
    if (prop.includes("webkit-text-fill") || prop.includes("webkit-text-stroke")) return false
    if (prop === "border-block-size" || prop === "border-inline-size") return false
    if (freezeExact.has(prop)) return true
    return freezePrefix.some((prefix) => prop === prefix || prop.startsWith(prefix))
  }

  function freezeSubtree(root) {
    const nodes = [root, ...root.querySelectorAll("*")]
    for (const el of nodes) {
      const overrides = []
      const cs = getComputedStyle(el)
      for (let i = 0; i < cs.length; i++) {
        const prop = cs[i]
        if (!shouldFreezeProp(prop)) continue
        overrides.push([prop, el.style.getPropertyValue(prop), el.style.getPropertyPriority(prop)])
        el.style.setProperty(prop, cs.getPropertyValue(prop))
      }
      frozenStyles.push({ el, overrides })
    }
  }

  function freezeRootFrom(hit) {
    const limit = prototypeRoot()
    const areaCap = window.innerWidth * window.innerHeight * 0.5
    let root = hit
    while (root.parentElement) {
      const parent = root.parentElement
      if (parent === limit || parent === document.body || parent === document.documentElement) break
      const box = parent.getBoundingClientRect()
      if (box.width * box.height > areaCap) break
      root = parent
    }
    freezeSubtree(root)
  }

  function freezeHoverThenAnnotate() {
    catcher.style.pointerEvents = "none"
    try {
      if (sawPointer) {
        unfreezeHover()
        freezeRootFrom(pageElementFromPoint(lastPointer.x, lastPointer.y))
      }
    } finally {
      catcher.style.pointerEvents = ""
    }
    setCommentTool(true)
  }

  function isTypingTarget(el) {
    if (!(el instanceof Element)) return false
    const tag = el.tagName
    if (tag === "TEXTAREA" || tag === "SELECT") return true
    if (tag === "INPUT") {
      const type = (el.getAttribute("type") || "text").toLowerCase()
      return !["button", "submit", "reset", "checkbox", "radio", "file", "color", "range", "hidden"].includes(type)
    }
    return el.isContentEditable
  }

  toggle.addEventListener("click", () => {
    if (sessionEnded || agentHasBatch()) return
    setCommentTool(!commentToolOn)
  })

  commentField.addEventListener("input", syncSubmit)
  cancel.addEventListener("click", () => closeComposer())

  composer.addEventListener("submit", async (event) => {
    event.preventDefault()
    if (!draft || inFlight || sessionEnded) return
    const comment = commentField.value.trim()
    if (!comment) return
    // The composer can be closed (tool toggled off) while the request is in
    // flight; the submission is complete in itself from here on.
    // The path names the screen this pin is on; the helper resolves it to the
    // file the agent edits. Path only: no query, so no token.
    const payload = {
      page: servedPage,
      comment,
      selector: draft.selector,
      textSnippet: draft.textSnippet,
      rect: draft.rect,
      point: draft.point,
    }
    const submission = { ...payload, x: draft.x, y: draft.y }
    inFlight = true
    syncSubmit()
    error.hidden = true
    try {
      const response = await fetch(tokenUrl("/annotation"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      if (!response.ok) throw new Error("retry")
      const { id } = await response.json()
      pins.push({ ...submission, id, status: PIN_STATUS[annotationStates[id]] || "pending" })
      renderPins()
      syncStopButton()
      persistState()
      closeComposer()
    } catch {
      if (!sessionEnded) {
        composer.hidden = false
        error.hidden = false
        error.textContent = "Could not send — retry"
      }
    } finally {
      inFlight = false
      syncSubmit()
    }
    if (reloadPending && !sessionEnded) requestReload()
  })

  stop.addEventListener("click", async () => {
    if (sessionEnded) return
    stop.disabled = true
    while (inFlight && !sessionEnded) {
      await new Promise((resolve) => setTimeout(resolve, 20))
    }
    if (sessionEnded) return
    const sending = unflushedCount() > 0
    try {
      const response = await fetch(tokenUrl(sending ? "/session/flush" : "/session/end"), { method: "POST" })
      if (!response.ok) throw new Error("retry")
    } catch {
      stop.disabled = false
      setStatus(sending ? "Could not send to agent — retry" : "Could not end session — retry")
      return
    }
    if (sending) {
      for (const id of Object.keys(annotationStates)) {
        if (annotationStates[id] === "held") annotationStates[id] = "queued"
      }
      for (const pin of pins) {
        if (pin.id && (!annotationStates[pin.id] || annotationStates[pin.id] === "held")) {
          annotationStates[pin.id] = "queued"
        }
      }
      persistState()
      stop.disabled = false
      syncStopButton()
      return
    }
    markEnded()
  })

  window.addEventListener("pagehide", persistState)
  window.addEventListener("pageshow", (event) => {
    if (event.persisted) restorePersistedState()
  })
  window.addEventListener("scroll", reattachPins, { capture: true, passive: true })
  window.addEventListener("resize", reattachPins)
  const layoutRoot = prototypeRoot()
  if (typeof ResizeObserver === "function") {
    new ResizeObserver(reattachPins).observe(layoutRoot)
  }
  if (typeof MutationObserver === "function") {
    new MutationObserver(reattachPins).observe(layoutRoot, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["style", "class", "hidden"],
    })
  }

  catcher.addEventListener("click", (event) => {
    if (!commentToolOn || sessionEnded || agentHasBatch()) return
    event.preventDefault()
    event.stopPropagation()
    const target = targetFromCatcher(event)
    if (!(target instanceof Element)) return
    openComposer(target, event)
  })

  document.addEventListener("pointermove", (event) => {
    sawPointer = true
    lastPointer.x = event.clientX
    lastPointer.y = event.clientY
    showPinTipAt(event.clientX, event.clientY)
  }, { capture: true, passive: true })

  document.addEventListener("keydown", (event) => {
    if (sessionEnded || agentHasBatch()) return
    if (event.key === "Escape") {
      if (!commentToolOn && composer.hidden) return
      event.preventDefault()
      event.stopPropagation()
      setCommentTool(false)
      return
    }
    if (!event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return
    if (event.key.toLowerCase() !== "a") return
    const path = event.composedPath()
    if (path.some((node) => isTypingTarget(node))) return
    if (isTypingTarget(shadow.activeElement) || isTypingTarget(document.activeElement)) return
    event.preventDefault()
    event.stopPropagation()
    if (commentToolOn) {
      setCommentTool(false)
      return
    }
    freezeHoverThenAnnotate()
  }, true)

  if (restorePersistedState()) reattachPins()
  syncStopButton()

  if ("EventSource" in window) {
    source = new EventSource(tokenUrl("/events", { document: servedDocument }))
    source.addEventListener("screen-changed", requestReload)
    source.addEventListener("annotations", (event) => {
      let states
      try {
        states = JSON.parse(event.data)
      } catch {
        return
      }
      applyAnnotationStates(states)
    })
    source.addEventListener("session-ended", markEnded)
    source.addEventListener("error", () => {
      if (source.readyState === EventSource.CLOSED) markEnded()
    })
  }
})()
