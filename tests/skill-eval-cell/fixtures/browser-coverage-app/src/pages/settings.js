const form = (error = "") => `<h1>Settings</h1>
<form method="post" action="/settings">
  <label>Email <input name="email" type="email"></label>
  ${error ? `<p class="error">${error}</p>` : ""}
  <button>Save</button>
</form>`

export function settingsPage(_req, res) {
  res.send(form())
}

export function saveSettings(req, res) {
  if (!/^[^@\s]+@[^@\s]+$/.test(req.body.email ?? "")) {
    return res.status(422).send(form("Email is invalid"))
  }
  res.send("<h1>Settings</h1><p>Saved</p>")
}
