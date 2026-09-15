import { createRoot } from "react-dom/client"
import { App } from "./App"

// A comment that names RiffrecProvider without mounting it must not count as a mount.
createRoot(document.getElementById("root")!).render(<App />)
