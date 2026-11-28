import express from "express"
import { settingsPage, saveSettings } from "./pages/settings.js"
import { checkoutPage, submitCheckout } from "./pages/checkout.js"
import { profilePage } from "./pages/profile.js"

export const app = express()
app.use(express.urlencoded({ extended: false }))
app.get("/", (_req, res) => res.send("<h1>Shopfront</h1>"))
app.get("/settings", settingsPage)
app.post("/settings", saveSettings)
app.get("/checkout", checkoutPage)
app.post("/checkout", submitCheckout)
app.get("/profile", profilePage)
