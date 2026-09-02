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

  let commentToolOn = false
  let sessionEnded = false
  let inFlight = false
  let draft = null
  const pins = []

  function prototypeRoot() {
    return document.getElementById("ce-prototype-root") || document.body
  }

  function isOverlayAsset(node) {
    if (!(node instanceof Element)) return false
    const href = node.getAttribute("href")
    const src = node.getAttribute("src")
    return href === "/annotate.css" || src === "/annotate.js" || node.id === "ce-annotate-host"
  }

  function activateScripts(container) {
    for (const old of container.querySelectorAll("script")) {
      if (isOverlayAsset(old)) continue
      const script = document.createElement("script")
      for (const attr of old.attributes) script.setAttribute(attr.name, attr.value)
      if (!script.src) script.textContent = `{\n${old.textContent || ""}\n}`
      old.replaceWith(script)
    }
  }

  function applyHead(headHtml) {
    if (typeof headHtml !== "string") return
    for (const node of [...document.head.children]) {
      if (isOverlayAsset(node)) continue
      if (node.hasAttribute("data-ce-morph-head") || ["STYLE", "LINK", "SCRIPT"].includes(node.tagName)) {
        node.remove()
      }
    }
    if (!headHtml) return
    const tmp = document.createElement("div")
    tmp.innerHTML = headHtml
    for (const node of [...tmp.children]) {
      if (node.tagName === "TITLE") {
        document.title = node.textContent || document.title
        continue
      }
      if (!["STYLE", "LINK", "SCRIPT"].includes(node.tagName)) continue
      node.setAttribute("data-ce-morph-head", "")
      document.head.appendChild(node)
    }
    activateScripts(document.head)
  }

  function applyScreenHtml(html) {
    const root = document.getElementById("ce-prototype-root")
    if (root) {
      root.innerHTML = html
      activateScripts(root)
      return
    }
    const tmp = document.createElement("div")
    tmp.innerHTML = html
    const incoming = [...tmp.childNodes]
    for (const child of [...document.body.childNodes]) {
      if (isOverlayAsset(child)) continue
      child.remove()
    }
    const host = document.getElementById("ce-annotate-host")
    for (const node of incoming) {
      document.body.insertBefore(node, host)
    }
    activateScripts(document.body)
  }

  function advancePinsAfterMorph() {
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
      if (node) {
        if (pin.status !== "pending") pin.status = "attached"
        Object.assign(pin, positionFromNode(node))
      } else if (pin.status !== "pending") {
        pin.status = "target-gone"
      }
    }
    renderPins()
  }

  function openComposer(target, event) {
    const selector = cssPath(target)
    if (!selector) return
    draft = {
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

  toggle.addEventListener("click", () => {
    if (sessionEnded) return
    commentToolOn = !commentToolOn
    toggle.setAttribute("aria-pressed", String(commentToolOn))
    toggle.classList.toggle("is-on", commentToolOn)
    toggle.textContent = commentToolOn ? "Commenting" : "Comment"
    if (!commentToolOn) closeComposer()
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
        x: draft.rect.x,
        y: draft.rect.y,
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
    sessionEnded = true
    commentToolOn = false
    toggle.disabled = true
    setStatus("Session ended")
    closeComposer()
  })

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

  if (token && "EventSource" in window) {
    const source = new EventSource(tokenUrl("/events"))
    source.addEventListener("morph", (event) => {
      let data
      try {
        data = JSON.parse(event.data)
      } catch {
        return
      }
      if (typeof data.html === "string") applyScreenHtml(data.html)
      applyHead(data.head)
      advancePinsAfterMorph()
      reattachPins()
    })
    source.addEventListener("session-ended", () => {
      sessionEnded = true
      commentToolOn = false
      toggle.disabled = true
      stop.disabled = true
      setStatus("Session ended")
      closeComposer()
    })
  }
})()
