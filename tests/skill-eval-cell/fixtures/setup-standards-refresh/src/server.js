import express from "express"
import { ledgerRoutes } from "./routes/ledger.js"
import { webhookRoutes } from "./routes/webhooks.js"
import { errorMiddleware } from "./errors.js"

const app = express()
app.use(express.json())
app.use("/ledger", ledgerRoutes)
app.use("/webhooks", webhookRoutes)
app.use(errorMiddleware)

export default app
