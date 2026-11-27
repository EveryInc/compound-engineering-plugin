import { app } from "./app.js"

const port = Number(process.argv[process.argv.indexOf("--port") + 1]) || 4310
app.listen(port, () => console.log(`shopfront on http://localhost:${port}`))
