(() => {
  const token = new URLSearchParams(window.location.search).get("token")
  // The helper stamps the path it served on this script. History API rewrites
  // change location.pathname without changing which screen file this is.
  const servedPage = document.currentScript?.getAttribute("data-ce-page") || "/"
  const servedDocument = document.currentScript?.getAttribute("data-ce-document") || ""
  // Overlay host hangs off <html>, not <body>, so it stays out of body layout
  // and document.body.children. A manual popover puts it on the top layer so
  // Comment/Stop stay usable over dialog.showModal().
  const host = document.createElement("ce-annotate-host")
  host.style.cssText =
    "display: block; position: fixed; inset: 0; pointer-events: none; z-index: 2147483645; margin: 0; padding: 0; border: 0;"
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
    <button type="button" class="ce-annotate-toggle" aria-pressed="false">Comment</button>
    <button type="button" class="ce-annotate-stop">Stop</button>
    <span class="ce-annotate-status" hidden></span>
  `
  shadow.appendChild(chrome)

  const layer = document.createElement("div")
  layer.className = "ce-annotate-layer"
  shadow.appendChild(layer)

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
  const stop = chrome.querySelector(".ce-annotate-stop")
  const status = chrome.querySelector(".ce-annotate-status")
  const commentField = composer.querySelector(".ce-annotate-comment")
  const submit = composer.querySelector(".ce-annotate-submit")
  const cancel = composer.querySelector(".ce-annotate-cancel")
  const error = composer.querySelector(".ce-annotate-error")

  const STATE_KEY = "ce-annotate-state"
  const PIN_STATUS = { queued: "pending", working: "working", done: "attached" }
  let commentToolOn = false
  let sessionEnded = false
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
  // History API rewrite is not what the helper looks up. The browser owns
  // every reconciliation; pins, tool state, and open draft are carried across.
  function persistAndReload() {
    const state = {
      commentToolOn,
      pins,
      draft: draft ? { ...draft, text: commentField.value, left: composer.style.left, top: composer.style.top } : null,
    }
    try {
      sessionStorage.setItem(STATE_KEY, JSON.stringify(state))
    } catch {
      // Without storage the reload still shows the revised screen; only the pins are lost.
    }
    window.location.replace(servedPage)
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
      sessionStorage.removeItem(STATE_KEY)
    } catch {
      return false
    }
    if (!saved || !Array.isArray(saved.pins)) return false
    for (const pin of saved.pins) {
      if (pin && typeof pin.selector === "string" && typeof pin.comment === "string") pins.push(pin)
    }
    if (saved.commentToolOn) setCommentTool(true)
    if (saved.draft && typeof saved.draft.selector === "string") restoreDraft(saved.draft)
    return true
  }

  function restoreDraft(saved) {
    let node = null
    try {
      node = document.querySelector(saved.selector)
    } catch {
      node = null
    }
    draft = { selector: saved.selector, textSnippet: saved.textSnippet, rect: saved.rect, x: saved.x, y: saved.y }
    composer.hidden = false
    if (node) {
      const rect = node.getBoundingClientRect()
      Object.assign(draft, positionFromNode(node))
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
    for (const pin of pins) {
      const status = PIN_STATUS[states[pin.id]]
      if (status) pin.status = status
    }
    reattachPins()
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

  function renderPins() {
    layer.replaceChildren()
    for (const pin of pins) {
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

  function positionFromNode(node) {
    const rect = node.getBoundingClientRect()
    return { x: rect.left + Math.min(12, rect.width / 2), y: rect.top + 4 }
  }

  function reattachPins() {
    const root = prototypeRoot()
    for (const pin of pins) {
      let node = null
      try {
        node = root.querySelector(pin.selector) || document.querySelector(pin.selector)
      } catch {
        node = null
      }
      const queued = pin.status === "pending" || pin.status === "working"
      if (node) {
        if (!queued) pin.status = "attached"
        Object.assign(pin, positionFromNode(node))
      } else if (!queued) {
        pin.status = "target-gone"
      }
    }
    renderPins()
  }

  function markEnded() {
    sessionEnded = true
    commentToolOn = false
    toggle.disabled = true
    stop.disabled = true
    setStatus("Session ended")
    closeComposer()
  }

  function openComposer(target, event) {
    const selector = cssPath(target)
    if (!selector) return
    draft = {
      ...positionFromNode(target),
      selector,
      textSnippet: (target.textContent || "").trim().slice(0, 240),
      rect: {
        x: event.clientX,
        y: event.clientY,
        width: target.getBoundingClientRect().width,
        height: target.getBoundingClientRect().height,
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
    toggle.textContent = on ? "Commenting" : "Comment"
    if (!on) closeComposer(inFlight)
  }

  toggle.addEventListener("click", () => {
    if (sessionEnded) return
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
    try {
      const response = await fetch(tokenUrl("/session/end"), { method: "POST" })
      if (!response.ok) throw new Error("retry")
    } catch {
      stop.disabled = false
      setStatus("Stop failed — retry")
      return
    }
    markEnded()
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

  document.addEventListener("click", (event) => {
    if (!commentToolOn || sessionEnded) return
    if (event.composedPath().includes(host)) return
    const target = event.target
    if (!(target instanceof Element)) return
    if (host.contains(target)) return
    event.preventDefault()
    event.stopPropagation()
    openComposer(target, event)
  }, true)

  if (restorePersistedState()) reattachPins()

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
