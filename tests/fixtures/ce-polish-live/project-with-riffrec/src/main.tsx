import { createRoot } from "react-dom/client"
import { RiffrecProvider } from "riffrec"
import { App } from "./App"

createRoot(document.getElementById("root")!).render(
  <RiffrecProvider forceEnable live={{}}>
    <App />
  </RiffrecProvider>,
)
