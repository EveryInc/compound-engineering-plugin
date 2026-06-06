<overview>
Mobile is a first-class platform for agent-native apps. It has unique constraints and opportunities. This guide covers why mobile matters, iOS storage architecture, checkpoint/resume patterns, and cost-aware design.
</overview>

<why_mobile>
## Why Mobile Matters

Mobile devices offer unique advantages for agent-native apps:

- **File system** — Agents work with files naturally using the same primitives that work everywhere else.
- **Rich context** — Health data, location, photos, calendars — deeply personalized agent experiences.
- **Local apps** — Everyone has their own copy. Foundation for apps that modify themselves, fork, evolve per-user.
- **Cross-device sync** — iCloud shares the same file system across devices without a sync layer.

**The challenge:** Agents are long-running. Mobile apps are not.

iOS will background your app after seconds of inactivity and may kill it to reclaim memory. Mobile agent apps need:
- **Checkpointing** — Saving state so work isn't lost
- **Resuming** — Picking up where you left off after interruption
- **Background execution** — Using the limited time iOS gives you wisely
</why_mobile>

<ios_storage>
## iOS Storage Architecture

For agent-native iOS apps, use iCloud Drive's Documents folder for your shared workspace. This gives you free, automatic multi-device sync without building a sync layer or running a server.

### Why iCloud Documents?

| Approach | Cost | Complexity | Offline | Multi-Device |
|----------|------|------------|---------|--------------|
| Custom backend + sync | $$$ | High | Manual | Yes |
| CloudKit database | Free tier limits | Medium | Manual | Yes |
| **iCloud Documents** | Free (user's storage) | Low | Automatic | Automatic |

iCloud Documents: uses user's existing iCloud storage, automatic sync, works offline, visible in Files.app, no server costs.

### Implementation: iCloud-First with Local Fallback

```swift
func iCloudDocumentsURL() -> URL? {
    FileManager.default.url(forUbiquityContainerIdentifier: nil)?
        .appendingPathComponent("Documents")
}

class SharedWorkspace {
    let rootURL: URL
    init() {
        if let iCloudURL = iCloudDocumentsURL() {
            self.rootURL = iCloudURL
        } else {
            self.rootURL = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first!
        }
    }
}
```

### Directory Structure

```text
iCloud Drive/YourApp/Documents/
├── Journal/
│   ├── user/2025-01-15.md
│   └── agent/2025-01-15.md
├── Research/{bookId}/
│   ├── full_text.txt
│   └── sources/
├── Chats/{conversationId}.json
└── context.md
```

### Handling iCloud File States

iCloud files may not be downloaded locally. Handle `.icloud` placeholder files:

```swift
func readFile(at url: URL) throws -> String {
    if url.pathExtension == "icloud" {
        try FileManager.default.startDownloadingUbiquitousItem(at: url)
        throw FileNotYetAvailableError()
    }
    return try String(contentsOf: url, encoding: .utf8)
}

func writeFile(_ content: String, to url: URL) throws {
    let coordinator = NSFileCoordinator()
    var error: NSError?
    coordinator.coordinate(writingItemAt: url, options: .forReplacing, error: &error) { newURL in
        try? content.write(to: newURL, atomically: true, encoding: .utf8)
    }
    if let error = error { throw error }
}
```

### Entitlements Required

```xml
<key>com.apple.developer.icloud-container-identifiers</key>
<array><string>iCloud.com.yourcompany.yourapp</string></array>
<key>com.apple.developer.icloud-services</key>
<array><string>CloudDocuments</string></array>
<key>com.apple.developer.ubiquity-container-identifiers</key>
<array><string>iCloud.com.yourcompany.yourapp</string></array>
```

### When NOT to Use iCloud Documents

- **Sensitive data** — Use Keychain or encrypted local storage instead
- **High-frequency writes** — iCloud sync has latency; use local + periodic sync
- **Large media files** — Consider CloudKit Assets or on-demand resources
- **Shared between users** — iCloud Documents is single-user; use CloudKit for sharing
</ios_storage>

<background_execution>
## Background Execution & Resumption

Mobile apps can be suspended or terminated at any time. Agents must handle this gracefully.

### Checkpoint/Resume Pattern

Save agent state before backgrounding, restore on foreground:

```swift
class AgentOrchestrator: ObservableObject {
    func handleAppWillBackground() {
        for session in activeSessions {
            saveCheckpoint(session)
            session.transition(to: .backgrounded)
        }
    }

    func handleAppDidForeground() {
        for session in activeSessions where session.state == .backgrounded {
            if let checkpoint = loadCheckpoint(session.id) {
                resumeFromCheckpoint(session, checkpoint)
            }
        }
    }
}
```

### Agent State Machine

```swift
enum AgentState {
    case idle           // Not running
    case running        // Actively executing
    case waitingForUser // Paused, waiting for input
    case backgrounded   // App backgrounded, state saved
    case completed      // Finished successfully
    case failed(Error)  // Finished with error
}
```

Valid transitions: idle→running, running→{waitingForUser, backgrounded, completed, failed}, waitingForUser→{running, backgrounded}, backgrounded→{running, completed}.

### Background Task Extension

Request extra time when backgrounded during critical operations:

```swift
func handleAppWillBackground() {
    backgroundTask = UIApplication.shared.beginBackgroundTask { [weak self] in
        self?.endBackgroundTask()
    }
    Task {
        for session in activeSessions { await saveCheckpoint(session) }
        endBackgroundTask()
    }
}
```
</background_execution>

<permissions>
## Permission Handling

| Resource | iOS Permission | Use Case |
|----------|---------------|----------|
| Photo Library | PHPhotoLibrary | Profile generation from photos |
| Files | Document picker | Reading user documents |
| Camera | AVCaptureDevice | Scanning book covers |
| Location | CLLocationManager | Location-aware recommendations |

**Request permissions only when needed, not at launch.** When denied, offer alternatives ("grant access in Settings → Privacy, or share photos directly in chat").
</permissions>

<cost_awareness>
## Cost-Aware Design

### Model Tier Selection

Use the cheapest model that achieves the outcome:

| Agent Type | Tier | Reasoning |
|-----------|------|-----------|
| Quick lookup | Fast (Haiku) | Simple lookups |
| Chat, research, content | Balanced (Sonnet) | Good balance |
| Complex analysis, profile gen | Powerful (Opus) | Multi-source synthesis |

### Token Budgets

Set `maxInputTokens`, `maxOutputTokens`, and `maxTurns` per agent config. Abort with `AgentError.budgetExceeded` when limits are hit.

### Network-Aware Execution

Check `NWPathMonitor` path. When on cellular (`path.isExpensive`), warn the user before heavy operations. Defer research to WiFi.

### Caching

Cache expensive operations with TTL (e.g., 24-hour research cache keyed by bookId). Check cache before calling the API.

### Cost Visibility

Show users session stats: turn count, tokens used, estimated cost.
</cost_awareness>

<offline_handling>
## Offline Graceful Degradation

Categorize tools by connectivity requirement:

```swift
let offlineTools: Set<String> = ["read_file", "write_file", "list_files", "read_library", "search_local"]
let onlineTools: Set<String> = ["web_search", "web_fetch", "publish_to_cloud"]
let hybridTools: Set<String> = ["publish_to_feed"]  // Works offline, syncs later
```

When an online tool is called without connectivity, communicate what's still possible offline. Queue deferred actions and process when network returns.
</offline_handling>

<battery_awareness>
## Battery-Aware Execution

Monitor `UIDevice.batteryLevel`, `UIDevice.batteryState`, and `ProcessInfo.isLowPowerModeEnabled`. When battery is low and not charging, defer or prompt before heavy tasks. In Low Power Mode, downgrade to the fast model tier.
</battery_awareness>

<on_device_vs_cloud>
## On-Device vs. Cloud

| Component | Location |
|-----------|----------|
| Orchestration | On-device |
| Tool execution (file ops, HealthKit) | On-device |
| LLM calls | Cloud (Anthropic API) |
| Checkpoints | On-device (local files, optionally iCloud) |

**Implication:** Network is required for reasoning. Design tools to degrade gracefully offline. For truly long-running agents (hours), consider a server-side orchestrator with the mobile app as a viewer.
</on_device_vs_cloud>

<checklist>
## Mobile Agent-Native Checklist

**iOS Storage:**
- [ ] iCloud Documents as primary storage (or conscious alternative)
- [ ] Local Documents fallback when iCloud unavailable
- [ ] Handle `.icloud` placeholder files (trigger download)
- [ ] Use NSFileCoordinator for conflict-safe writes

**Background Execution:**
- [ ] Checkpoint/resume implemented for all agent sessions
- [ ] State machine for agent lifecycle (idle, running, backgrounded, etc.)
- [ ] Background task extension for critical saves (30 second window)
- [ ] User-visible status for backgrounded agents

**Permissions:**
- [ ] Permissions requested only when needed, not at launch
- [ ] Graceful degradation when permissions denied
- [ ] Clear error messages with Settings deep links

**Cost Awareness:**
- [ ] Model tier matched to task complexity
- [ ] Token budgets per session
- [ ] Network-aware (defer heavy work to WiFi)
- [ ] Caching for expensive operations
- [ ] Cost visibility to users

**Offline Handling:**
- [ ] Offline-capable tools identified
- [ ] Graceful degradation for online-only features
- [ ] Action queue for sync when online

**Battery Awareness:**
- [ ] Battery monitoring for heavy operations
- [ ] Low power mode detection
- [ ] Defer or downgrade based on battery state
</checklist>
