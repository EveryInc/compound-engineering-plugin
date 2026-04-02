import { promises as fs } from "fs"
import path from "path"
import {
  assertPathWithinRoot,
  backupFile,
  captureManagedPathSnapshot,
  captureTextFileSnapshot,
  ensureDir,
  ensureManagedDir,
  ManagedPathSnapshot,
  removeFileIfExists,
  removeManagedPathIfExists,
  pathExists,
  readText,
  restoreManagedPathSnapshot,
  restoreTextFileSnapshot,
  assertSafePathComponent,
  sanitizeSafePathName,
  writeTextIfChanged,
} from "../utils/files"
import { mergeJsonConfigAtKey } from "../sync/json-config"
import { getPiPolicyFingerprint } from "../utils/pi-policy"
import { copySkillDirForPi } from "../utils/pi-skills"
import type { PiBundle } from "../types/pi"
import { resolvePiLayout, samePiPath } from "../utils/pi-layout"
import { derivePiSharedResourceContract } from "../utils/pi-trust-contract"
import {
  canUseVerifiedCleanup,
  collectLegacyArtifactCandidates,
  createManagedArtifact,
  createPiManagedSection,
  filterPiManagedStateForVerifiedSections,
  getPiManagedTrustInfo,
  planLegacyCustomRootInstallCleanup,
  removeLegacyArtifactCandidates,
  removeStaleManagedArtifacts,
  replacePiManagedSection,
  shouldWritePiManagedState,
  writePiManagedState,
} from "../utils/pi-managed"

export const PI_AGENTS_BLOCK_START = "<!-- BEGIN COMPOUND PI TOOL MAP -->"
export const PI_AGENTS_BLOCK_END = "<!-- END COMPOUND PI TOOL MAP -->"
export const PI_AGENTS_BLOCK_BODY = `## Compound Engineering (Pi compatibility)

This block is managed by compound-plugin.

Compatibility notes:
- Claude Task(agent, args) maps to the ce_subagent extension tool
- Use ce_subagent for Compound Engineering workflows even when another extension also provides a generic subagent tool
 - ce_subagent cwd must stay within the active workspace root; external cwd overrides are rejected
- Use ce_run_prompt to execute verified Pi prompts by alias
- Only compound-engineering:* and claude-home:* qualified Task refs are executable in Pi by default; foreign qualified Task refs remain rejected unless the compat runtime explicitly verifies a dispatchable namespace
- Use ce_list_capabilities to inspect the current verified Pi skills, prompts, and aliases available in this workspace
- AskUserQuestion maps to the ask_user_question extension tool
- MCP access uses MCPorter via mcporter_list and mcporter_call extension tools
- MCPorter config path: compound-engineering/mcporter.json (project sync), .pi/compound-engineering/mcporter.json (project install), ~/.pi/agent/compound-engineering/mcporter.json (global), or the bundled packaged fallback when that layer is the verified authority
- MCPorter configPath overrides are ignored; Compound Engineering resolves the verified config automatically
`

const PI_AGENTS_BLOCK_DISABLED_BODY = `## Compound Engineering (Pi compatibility)

This block is managed by compound-plugin.

Compatibility notes:
- Compound Engineering compat tools are not currently installed at this root.
- Local compat tools should not be advertised from this root until the compat extension is present again.
- Verified global or bundled Compound Engineering fallbacks may still exist; use ce_list_capabilities to inspect the actual callable runtime surface.
`

type PiManagedPublicationSnapshots = {
  snapshotRoot: string | null
  snapshots: Map<string, ManagedPathSnapshot>
}

export async function writePiBundle(outputRoot: string, bundle: PiBundle): Promise<void> {
  const policyFingerprint = getPiPolicyFingerprint()
  const paths = resolvePiLayout(outputRoot, "install")
  const prompts = bundle.prompts.map((prompt) => ({
    ...prompt,
    emittedName: sanitizeSafePathName(prompt.name, "prompt name"),
  }))
  const generatedSkills = bundle.generatedSkills.map((skill) => ({
    ...skill,
    emittedName: sanitizeSafePathName(skill.name, "generated skill name"),
  }))
  const skillDirs = bundle.skillDirs.map((skill) => ({
    ...skill,
    emittedName: sanitizeSafePathName(skill.name, "skill name"),
  }))
  const extensions = bundle.extensions.map((extension) => ({
    ...extension,
    emittedName: assertSafePathComponent(extension.name, "extension name"),
  }))

  for (const prompt of prompts) {
    assertPathWithinRoot(path.join(paths.promptsDir, `${prompt.emittedName}.md`), paths.root, "Pi prompt path")
  }
  for (const skill of [...generatedSkills, ...skillDirs]) {
    assertPathWithinRoot(path.join(paths.skillsDir, skill.emittedName), paths.root, "Pi skill path")
  }
  for (const extension of extensions) {
    assertPathWithinRoot(path.join(paths.extensionsDir, extension.emittedName), paths.root, "Pi extension path")
  }

  const legacyLayout = !samePiPath(paths.root, outputRoot)
    ? resolvePiLayout(outputRoot, "sync")
    : null
  const trustInfo = await getPiManagedTrustInfo(paths)
  const legacyTrustInfo = legacyLayout ? await getPiManagedTrustInfo(legacyLayout) : null
  const previousState = trustInfo.state
  const publicationSnapshots = await capturePiManagedPublicationSnapshots(paths)

  const installArtifacts = [
    ...prompts.map((prompt) =>
      createManagedArtifact(paths, "prompt", prompt.sourceName ?? prompt.name, prompt.emittedName)),
    ...generatedSkills.map((skill) =>
      createManagedArtifact(paths, "generated-skill", skill.sourceName ?? skill.name, skill.emittedName)),
    ...skillDirs.map((skill) =>
      createManagedArtifact(paths, "copied-skill", skill.sourceName ?? skill.name, skill.emittedName)),
  ]
  const legacyCustomRootCandidates = legacyLayout
    ? collectLegacyArtifactCandidates(paths, installArtifacts, { legacyRoot: outputRoot })
    : []
  const preserveUnverifiedMalformedInstallMcporter = Boolean(bundle.mcporterConfig)
    && !canUseVerifiedCleanup(trustInfo, "install")
    && await inspectJsonObjectState(paths.mcporterConfigPath) === "invalid"

  const nextState = replacePiManagedSection(previousState, "install", createPiManagedSection({
    nameMaps: bundle.nameMaps,
    artifacts: installArtifacts,
    mcpServers: preserveUnverifiedMalformedInstallMcporter ? [] : Object.keys(bundle.mcporterConfig?.mcpServers ?? {}),
    sharedResources: {
      compatExtension: bundle.extensions.length > 0,
      mcporterConfig: preserveUnverifiedMalformedInstallMcporter ? false : Boolean(bundle.mcporterConfig),
    },
  }), bundle.pluginName)
  nextState.policyFingerprint = policyFingerprint
  const syncCleanupVerified = canUseVerifiedCleanup(trustInfo, "sync")
  const sharedSyncCompat = syncCleanupVerified && previousState?.sync.sharedResources.compatExtension === true
  const sharedSyncMcporterConfig = syncCleanupVerified && previousState?.sync.sharedResources.mcporterConfig === true
  const sharedSyncMcpServers = syncCleanupVerified ? new Set(previousState?.sync.mcpServers ?? []) : new Set<string>()
  const verifiedPreviousState = filterPiManagedStateForVerifiedSections(previousState, {
    install: canUseVerifiedCleanup(trustInfo, "install"),
    sync: syncCleanupVerified,
  })
  const previousSkillArtifacts = verifiedPreviousState
    ? [...verifiedPreviousState.install.artifacts, ...verifiedPreviousState.sync.artifacts]
    : []
  const previousSkillArtifactsByName = new Map<string, typeof previousSkillArtifacts>()
  for (const artifact of previousSkillArtifacts) {
    const key = `${artifact.kind}:${artifact.emittedName}`
    const bucket = previousSkillArtifactsByName.get(key) ?? []
    bucket.push(artifact)
    previousSkillArtifactsByName.set(key, bucket)
  }
  const legacyCleanupPlan = legacyLayout && legacyTrustInfo
    ? await planLegacyCustomRootInstallCleanup({ legacyLayout, legacyTrustInfo, artifactCandidates: legacyCustomRootCandidates })
    : null
  const removeTrackedFileIfExists = async (filePath: string): Promise<void> => {
    await rememberPiManagedPublicationSnapshot(publicationSnapshots, filePath)
    await removeFileIfExists(filePath)
  }
  const removeTrackedSkillDirectoryIfExists = async (dirPath: string): Promise<void> => {
    await rememberPiManagedPublicationSnapshot(publicationSnapshots, dirPath)
    await removeSkillDirectoryIfExists(dirPath)
  }
  try {
    await ensureManagedDir(paths.skillsDir)
    await ensureManagedDir(paths.promptsDir)
    await ensureManagedDir(paths.extensionsDir)

    const compatPath = path.join(paths.extensionsDir, "compound-engineering-compat.ts")
    const preserveUntrustedCompat = !nextState.install.sharedResources.compatExtension
      && !sharedSyncCompat
      && !syncCleanupVerified
      && await pathExists(compatPath)
    const shouldPreserveAmbiguousMcporter = !syncCleanupVerified
      && await pathExists(paths.mcporterConfigPath)
    const installMcporterReplaceKeys = canUseVerifiedCleanup(trustInfo, "install") && !shouldPreserveAmbiguousMcporter
      ? (previousState?.install.mcpServers ?? []).filter((serverName) => !sharedSyncMcpServers.has(serverName))
      : []

    if (preserveUntrustedCompat) {
      console.warn(`Warning: found ambiguous Pi shared resource at ${compatPath}; removing the live compat extension because sync ownership cannot be proven.`)
    }
    if (shouldPreserveAmbiguousMcporter && (previousState?.install.mcpServers.length ?? 0) > 0) {
      console.warn(`Warning: found ambiguous mcporter.json at ${paths.mcporterConfigPath}; leaving it untouched because sync ownership cannot be proven.`)
    }

    for (const prompt of prompts) {
      const targetPath = path.join(paths.promptsDir, `${prompt.emittedName}.md`)
      const nextContent = prompt.content + "\n"
      const existing = await readText(targetPath).catch(() => null)
      if (existing !== nextContent) {
        await rememberPiManagedPublicationSnapshot(publicationSnapshots, targetPath)
      }
      await writeTextIfChanged(targetPath, nextContent, { existingContent: existing })
    }

    for (const skill of skillDirs) {
      const targetDir = path.join(paths.skillsDir, skill.emittedName)
      const previousArtifact = [
        ...(previousSkillArtifactsByName.get(`generated-skill:${skill.emittedName}`) ?? []),
        ...(previousSkillArtifactsByName.get(`synced-skill:${skill.emittedName}`) ?? []),
      ][0]
      await copySkillDirForPi(
        skill.sourceDir,
        targetDir,
        skill.name,
        bundle.nameMaps,
        { trustedRoot: skill.sourceDir },
        undefined,
        {
          onBeforeMutate: async (mode) => {
            if (mode === "replace" || previousArtifact) {
              await rememberPiManagedPublicationSnapshot(publicationSnapshots, targetDir)
            }
            if (previousArtifact) {
              await removeSkillDirectoryIfExists(targetDir)
            }
          },
        },
      )
    }

    for (const skill of generatedSkills) {
      const targetDir = path.join(paths.skillsDir, skill.emittedName)
      const previousArtifact = [
        ...(previousSkillArtifactsByName.get(`copied-skill:${skill.emittedName}`) ?? []),
        ...(previousSkillArtifactsByName.get(`synced-skill:${skill.emittedName}`) ?? []),
      ][0]
      if (previousArtifact) {
        await rememberPiManagedPublicationSnapshot(publicationSnapshots, targetDir)
        await removeSkillDirectoryIfExists(targetDir)
      }
      const targetPath = path.join(targetDir, "SKILL.md")
      const nextContent = skill.content + "\n"
      const existing = await readText(targetPath).catch(() => null)
      if (existing !== nextContent) {
        await rememberPiManagedPublicationSnapshot(publicationSnapshots, targetDir)
      }
      await writeTextIfChanged(targetPath, nextContent, { existingContent: existing })
    }

    for (const extension of extensions) {
      const targetPath = path.join(paths.extensionsDir, extension.emittedName)
      const nextContent = extension.content + "\n"
      const existing = await readText(targetPath).catch(() => null)
      if (existing !== nextContent) {
        await rememberPiManagedPublicationSnapshot(publicationSnapshots, targetPath)
      }
      await writeTextIfChanged(targetPath, nextContent, { existingContent: existing })
    }

    if (bundle.mcporterConfig) {
        await ensureManagedDir(path.dirname(paths.mcporterConfigPath))
      if (preserveUnverifiedMalformedInstallMcporter) {
        console.warn(`Warning: found malformed legacy mcporter.json at ${paths.mcporterConfigPath}; leaving it untouched because install ownership cannot be proven.`)
      } else {
        const nextContent = JSON.stringify(bundle.mcporterConfig, null, 2) + "\n"
        const existing = await readText(paths.mcporterConfigPath).catch(() => null)
        if (existing !== nextContent) {
          const backupPath = await backupFile(paths.mcporterConfigPath)
          if (backupPath) {
            console.log(`Backed up existing MCPorter config to ${backupPath}`)
          }
        }
        await rememberPiManagedPublicationSnapshot(publicationSnapshots, paths.mcporterConfigPath)
        await mergeJsonConfigAtKey({
          configPath: paths.mcporterConfigPath,
          key: "mcpServers",
          incoming: bundle.mcporterConfig.mcpServers,
          replaceKeys: installMcporterReplaceKeys,
          snapshotOnWrite: false,
        })
      }
    } else if (canUseVerifiedCleanup(trustInfo, "install") && (previousState?.install.mcpServers.length ?? 0) > 0) {
      await rememberPiManagedPublicationSnapshot(publicationSnapshots, paths.mcporterConfigPath)
      const result = await mergeJsonConfigAtKey({
        configPath: paths.mcporterConfigPath,
        key: "mcpServers",
        incoming: {},
        replaceKeys: installMcporterReplaceKeys,
        snapshotOnWrite: false,
      })

      if (result.didWrite && result.isEmpty) {
        await removeFileIfExists(paths.mcporterConfigPath)
      }
    }

    const compatContract = derivePiSharedResourceContract({
      nextOwns: nextState.install.sharedResources.compatExtension,
      otherVerifiedOwner: sharedSyncCompat,
      preserveUntrusted: preserveUntrustedCompat,
    })
    const keepCompatExtension = compatContract.retain
    if (!keepCompatExtension) {
      await rememberPiManagedPublicationSnapshot(publicationSnapshots, compatPath)
      await removeFileIfExists(compatPath)
    }

    const agentsBefore = await readText(paths.agentsPath).catch(() => null)
    const shouldAdvertiseCompatTools = compatContract.advertise
    const agentsBlock = buildPiAgentsBlock(shouldAdvertiseCompatTools)
    const nextAgents = agentsBefore === null ? agentsBlock + "\n" : upsertBlock(agentsBefore, agentsBlock)
    if (nextAgents !== agentsBefore) {
      await rememberPiManagedPublicationSnapshot(publicationSnapshots, paths.agentsPath)
    }
    await ensurePiAgentsBlock(paths.agentsPath, shouldAdvertiseCompatTools)

    await removeStaleManagedArtifacts(
      paths,
      filterPiManagedStateForVerifiedSections(previousState, { install: canUseVerifiedCleanup(trustInfo, "install") }),
      nextState,
      removeTrackedFileIfExists,
      removeTrackedSkillDirectoryIfExists,
    )

    for (const warning of legacyCleanupPlan?.warnings ?? []) {
      console.warn(warning)
    }
    await removeLegacyArtifactCandidates(
      legacyCleanupPlan?.artifactCandidates ?? [],
      removeTrackedFileIfExists,
      removeTrackedSkillDirectoryIfExists,
    )

    if (legacyLayout && legacyCleanupPlan?.removeCompatExtension) {
      await removeTrackedFileIfExists(path.join(legacyLayout.extensionsDir, "compound-engineering-compat.ts"))
    }

    if (legacyLayout && legacyCleanupPlan && legacyCleanupPlan.pruneMcporterKeys.length > 0) {
      await rememberPiManagedPublicationSnapshot(publicationSnapshots, legacyLayout.mcporterConfigPath)
      const result = await mergeJsonConfigAtKey({
        configPath: legacyLayout.mcporterConfigPath,
        key: "mcpServers",
        incoming: {},
        replaceKeys: legacyCleanupPlan.pruneMcporterKeys,
        snapshotOnWrite: false,
      })

      if (result.didWrite && result.isEmpty) {
        await removeTrackedFileIfExists(legacyLayout.mcporterConfigPath)
      }
    }

    if (shouldWritePiManagedState(nextState)) {
      const didWriteManagedState = await writePiManagedState(paths, nextState, {
        install: true,
        sync: canUseVerifiedCleanup(trustInfo, "sync"),
      })
      if (didWriteManagedState) {
        await rememberPiManagedPublicationSnapshot(publicationSnapshots, paths.managedManifestPath)
        await rememberPiManagedPublicationSnapshot(publicationSnapshots, paths.verificationPath)
      }
    } else {
      if (await pathExists(paths.managedManifestPath)) {
        await rememberPiManagedPublicationSnapshot(publicationSnapshots, paths.managedManifestPath)
      }
      if (await pathExists(paths.verificationPath)) {
        await rememberPiManagedPublicationSnapshot(publicationSnapshots, paths.verificationPath)
      }
      await removeFileIfExists(paths.managedManifestPath)
      await removeFileIfExists(paths.verificationPath)
    }
  } catch (error) {
    await restorePiManagedPublicationSnapshots(publicationSnapshots)
    throw error
  }
  if (publicationSnapshots.snapshotRoot) {
    await fs.rm(publicationSnapshots.snapshotRoot, { recursive: true, force: true }).catch(() => undefined)
  }
}

async function capturePiManagedPublicationSnapshots(
  paths: ReturnType<typeof resolvePiLayout>,
): Promise<PiManagedPublicationSnapshots> {
  await ensureManagedDir(paths.root)
  return { snapshotRoot: null, snapshots: new Map<string, ManagedPathSnapshot>() }
}

async function rememberPiManagedPublicationSnapshot(
  rollback: PiManagedPublicationSnapshots,
  targetPath: string,
): Promise<void> {
  if (rollback.snapshots.has(targetPath)) return
  if (!rollback.snapshotRoot) {
    await ensureManagedDir(path.dirname(targetPath))
    rollback.snapshotRoot = await fs.mkdtemp(path.join(path.dirname(targetPath), ".pi-publish-rollback-"))
  }
  rollback.snapshots.set(targetPath, await captureManagedPathSnapshot(targetPath, rollback.snapshotRoot))
}

async function restorePiManagedPublicationSnapshots(rollback: PiManagedPublicationSnapshots): Promise<void> {
  for (const snapshot of [...rollback.snapshots.values()].reverse()) {
    await restoreManagedPathSnapshot(snapshot)
  }
  if (rollback.snapshotRoot) {
    await fs.rm(rollback.snapshotRoot, { recursive: true, force: true }).catch(() => undefined)
  }
}

async function removeSkillDirectoryIfExists(dirPath: string): Promise<void> {
  await removeManagedPathIfExists(dirPath)
}

async function inspectJsonObjectState(configPath: string): Promise<"missing" | "valid" | "invalid"> {
  if (!(await pathExists(configPath))) {
    return "missing"
  }

  try {
    const parsed = JSON.parse(await readText(configPath)) as unknown
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return "valid"
    }
  } catch {
    return "invalid"
  }

  return "invalid"
}

export async function ensurePiAgentsBlock(filePath: string, enabled = true): Promise<void> {
  const block = buildPiAgentsBlock(enabled)

  if (!(await pathExists(filePath))) {
    await writeTextIfChanged(filePath, block + "\n")
    return
  }

  let snapshot: Awaited<ReturnType<typeof captureTextFileSnapshot>> | null = null
  try {
    const existing = await readText(filePath)
    const updated = upsertBlock(existing, block)
    if (updated !== existing) {
      snapshot = await captureTextFileSnapshot(filePath)
      await writeTextIfChanged(filePath, updated)
    }
  } catch (error) {
    if (snapshot) {
      await restoreTextFileSnapshot(snapshot)
    }
    throw error
  }
}

export function buildPiAgentsBlock(enabled = true): string {
  return [PI_AGENTS_BLOCK_START, (enabled ? PI_AGENTS_BLOCK_BODY : PI_AGENTS_BLOCK_DISABLED_BODY).trim(), PI_AGENTS_BLOCK_END].join("\n")
}

export function upsertBlock(existing: string, block: string): string {
  const startIndex = existing.indexOf(PI_AGENTS_BLOCK_START)
  const endIndex = existing.indexOf(PI_AGENTS_BLOCK_END)

  if (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex) {
    const before = existing.slice(0, startIndex).trimEnd()
    const after = existing.slice(endIndex + PI_AGENTS_BLOCK_END.length).trimStart()
    return [before, block, after].filter(Boolean).join("\n\n") + "\n"
  }

  if (existing.trim().length === 0) {
    return block + "\n"
  }

  return existing.trimEnd() + "\n\n" + block + "\n"
}
