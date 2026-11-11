import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const extensionDir = dirname(fileURLToPath(import.meta.url))
const packageRoot = resolve(extensionDir, "../..")
const skillsDir = resolve(packageRoot, "skills")

export default function compoundEngineeringPiExtension(pi: any) {
  // The cross-model host attestation snippet keys on this marker to recognize a Pi host.
  process.env.CROSS_MODEL_HOST_HARNESS ??= "pi"
  pi.on("resources_discover", async () => ({ skillPaths: [skillsDir] }))
}
