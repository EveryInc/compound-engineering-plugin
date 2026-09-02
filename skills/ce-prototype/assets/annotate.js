(() => {
  const token = new URLSearchParams(window.location.search).get("token")
  const host = document.getElementById("ce-annotate-host") || document.body.appendChild(Object.assign(document.createElement("div"), { id: "ce-annotate-host" }))
  const shadow = host.attachShadow({ mode: "open" })
  const css = document.createElement("link")
  css.rel = "stylesheet"
  css.href = "/annotate.css"
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
  let commentToolOn = false
  let sessionEnded = false
  let inFlight = false
  let draft = null
  const pins = []

  function prototypeRoot() {
    return document.getElementById("ce-prototype-root") || document.body
  }

  // A revised screen is shown by reloading the document, so the browser owns
  // every reconciliation (head, html/body attributes, linked assets, scripts);
  // only the explorer's pins and tool state are carried across.
  function persistAndReload() {
    try {
      sessionStorage.setItem(STATE_KEY, JSON.stringify({ commentToolOn, pins }))
    } catch {
      // Without storage the reload still shows the revised screen; only the pins are lost.
    }
    window.location.reload()
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
    return true
  }

  function advancePinsAfterRevision() {
    for (const pin of pins) {
      if (pin.status === "working") pin.status = "attached"
    }
    const next = pins.find((pin) => pin.status === "pending")
    if (next) next.status = "working"
  }

  function cssPath(el) {
    if (!(el instanceof Element)) return ""
    if (el.id) return `#${CSS.escape(el.id)}`
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

  function tokenUrl(path) {
    const url = new URL(path, window.location.origin)
    if (token) url.searchParams.set("token", token)
    return url.toString()
  }

  function setStatus(text) {
    status.hidden = !text
    status.textContent = text || ""
  }

  function syncSubmit() {
    submit.disabled = sessionEnded || inFlight || commentField.value.trim() === ""
  }

  function closeComposer() {
    composer.hidden = true
    draft = null
    error.hidden = true
    error.textContent = ""
    commentField.value = ""
    inFlight = false
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
    composer.style.left = `${Math.min(event.clientX + 12, window.innerWidth - 280)}px`
    composer.style.top = `${Math.min(event.clientY + 12, window.innerHeight - 160)}px`
    error.hidden = true
    commentField.focus()
    syncSubmit()
  }

  function setCommentTool(on) {
    commentToolOn = on
    toggle.setAttribute("aria-pressed", String(on))
    toggle.classList.toggle("is-on", on)
    toggle.textContent = on ? "Commenting" : "Comment"
    if (!on) closeComposer()
  }

  toggle.addEventListener("click", () => {
    if (sessionEnded) return
    setCommentTool(!commentToolOn)
  })

  commentField.addEventListener("input", syncSubmit)
  cancel.addEventListener("click", closeComposer)

  composer.addEventListener("submit", async (event) => {
    event.preventDefault()
    if (!draft || inFlight || sessionEnded) return
    const comment = commentField.value.trim()
    if (!comment) return
    inFlight = true
    syncSubmit()
    error.hidden = true
    const payload = {
      comment,
      selector: draft.selector,
      textSnippet: draft.textSnippet,
      rect: draft.rect,
    }
    try {
      const response = await fetch(tokenUrl("/annotation"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      if (!response.ok) throw new Error("retry")
      const hasWorking = pins.some((pin) => pin.status === "working")
      pins.push({
        ...payload,
        status: hasWorking ? "pending" : "working",
        x: draft.x,
        y: draft.y,
      })
      renderPins()
      closeComposer()
    } catch {
      inFlight = false
      error.hidden = false
      error.textContent = "Could not send — retry"
      syncSubmit()
    }
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

  document.addEventListener("click", (event) => {
    if (!commentToolOn || sessionEnded) return
    if (event.composedPath().includes(host)) return
    const target = event.target
    if (!(target instanceof Element)) return
    if (target.id === "ce-annotate-host" || target.closest("#ce-annotate-host")) return
    event.preventDefault()
    event.stopPropagation()
    openComposer(target, event)
  }, true)

  if (restorePersistedState()) {
    advancePinsAfterRevision()
    reattachPins()
  }

  if ("EventSource" in window) {
    const source = new EventSource(tokenUrl("/events"))
    source.addEventListener("screen-changed", () => {
      source.close()
      persistAndReload()
    })
    source.addEventListener("session-ended", markEnded)
    source.addEventListener("error", () => {
      if (source.readyState === EventSource.CLOSED) markEnded()
    })
  }
})()
