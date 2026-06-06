<overview>
How to inject dynamic runtime context into agent system prompts. Static prompts tell the agent what it CAN do. Dynamic context tells it what it can do RIGHT NOW with the user's actual data.

**Core principle:** The user's context IS the agent's context.
</overview>

<why_context_matters>
## Why Dynamic Context Injection?

The failure case:
```text
User: "Write a little thing about Catherine the Great in my reading feed"
Agent: "What system are you referring to? I'm not sure what reading feed means."
```

The agent failed because it didn't know what books exist, what the "reading feed" is, or what tools it has to publish there. Fix: inject runtime context about app state into the system prompt.
</why_context_matters>

<pattern name="context-injection">
## The Context Injection Pattern

Build your system prompt dynamically, including current app state:

```swift
func buildSystemPrompt() -> String {
    let availableBooks = libraryService.books
    let recentActivity = analysisService.recentRecords(limit: 10)
    let userProfile = profileService.currentProfile

    return """
    # Your Identity
    You are a reading assistant for \(userProfile.name)'s library.

    ## Available Books in User's Library
    \(availableBooks.map { "- \"\($0.title)\" by \($0.author) (id: \($0.id))" }.joined(separator: "\n"))

    ## Recent Reading Activity
    \(recentActivity.map { "- Analyzed \"\($0.bookTitle)\": \($0.excerptPreview)" }.joined(separator: "\n"))

    ## Your Capabilities
    - **publish_to_feed**: Create insights that appear in the Feed tab
    - **read_library**: View books, highlights, and analyses
    - **web_search**: Search the internet for research
    - **write_file**: Save research to Documents/Research/{bookId}/

    When the user mentions "the feed" or "reading feed", they mean the Feed tab.
    Use `publish_to_feed` to create content there.
    """
}
```
</pattern>

<what_to_inject>
## What Context to Inject

**1. Available Resources** — what data/files exist that the agent can access:
```text
Books: "Moby Dick" (id: book_123), "1984" (id: book_456)
Research folders: Documents/Research/book_123/ (3 files)
```

**2. Current State** — what the user has done recently:
```text
- 2 hours ago: Highlighted passage in "1984" about surveillance
- Yesterday: Completed research on "Moby Dick" whale symbolism
```

**3. Capabilities Mapping** — what tool maps to what UI feature, in user language:
```text
| User Says | You Should Use | Result |
|-----------|----------------|--------|
| "my feed" | `publish_to_feed` | Creates insight in Feed tab |
| "my library" | `read_library` | Shows their book collection |
| "research this" | `web_search` + `write_file` | Saves to Research folder |
```

**4. Domain Vocabulary** — app-specific terms:
```text
- **Feed**: The Feed tab showing reading insights
- **Research folder**: Documents/Research/{bookId}/
- **Highlight**: A passage the user marked in a book
```
</what_to_inject>

<implementation_patterns>
## Implementation Patterns

**Service-Based (Swift/iOS):**
```swift
class AgentContextBuilder {
    func buildContext() -> String {
        let books = libraryService.books
        let profile = profileService.currentProfile
        let activity = activityService.recent(limit: 10)
        return """
        ## Library (\(books.count) books)
        \(books.map { "- \"\($0.title)\" (id: \($0.id))" }.joined(separator: "\n"))
        ## Recent Activity
        \(activity.map { "- \($0.description)" }.joined(separator: "\n"))
        """
    }
}
let systemPrompt = basePrompt + "\n\n" + AgentContextBuilder(...).buildContext()
```

**Hook-Based (TypeScript):**
```typescript
async function buildSystemPrompt(providers: ContextProvider[]): Promise<string> {
  const contexts = await Promise.all(providers.map(p => p.getContext()));
  return [BASE_PROMPT, ...contexts].join('\n\n');
}
```
</implementation_patterns>

<context_freshness>
## Context Freshness

Always inject fresh context at agent initialization — not cached context from app launch:

```swift
func startChatAgent() async -> AgentSession {
    let context = await buildCurrentContext()  // Fresh context
    return await AgentOrchestrator.shared.startAgent(
        config: ChatAgent.config,
        systemPrompt: basePrompt + context
    )
}
```

For long-running agents, provide a refresh tool:
```swift
tool("refresh_context", "Get current app state") { _ in
    let books = libraryService.books
    let recent = activityService.recent(10)
    return "Current library: \(books.count) books. Recent: \(recent.map { $0.summary }.joined(separator: ", "))"
}
```
</context_freshness>

<examples>
## Real-World Example: Every Reader

```swift
func getChatAgentSystemPrompt() -> String {
    let books = BookLibraryService.shared.books
    let analyses = BookLibraryService.shared.analysisRecords.prefix(10)

    let bookList = books.map { "- \"\($0.title)\" by \($0.author) (id: \($0.id))" }.joined(separator: "\n")
    let recentList = analyses.map { record in
        let title = books.first { $0.id == record.bookId }?.title ?? "Unknown"
        return "- From \"\(title)\": \"\(record.excerptPreview)\""
    }.joined(separator: "\n")

    return """
    # Reading Assistant

    ## Available Books
    \(bookList.isEmpty ? "No books yet." : bookList)

    ## Recent Reading Journal
    \(recentList.isEmpty ? "No analyses yet." : recentList)

    ## Your Capabilities
    - **Publish to Feed**: Use `publish_to_feed` → appears in Feed tab
    - **Library Access**: Use `read_library`
    - **Research**: web_search + write_file → saves to Documents/Research/{bookId}/

    When asked to "write something for their feed", use `publish_to_feed` with the relevant book_id.
    """
}
```

Result: "write a little thing about Catherine the Great in my reading feed" → agent sees "reading feed" → uses `publish_to_feed` → finds relevant book ID → success.
</examples>

<checklist>
## Context Injection Checklist

Before launching an agent:
- [ ] System prompt includes current resources (books, files, data)
- [ ] Recent activity is visible to the agent
- [ ] Capabilities are mapped to user vocabulary
- [ ] Domain-specific terms are explained
- [ ] Context is fresh (gathered at agent start, not cached)

When adding new features:
- [ ] New resources included in context injection
- [ ] New capabilities documented in system prompt
- [ ] User vocabulary for the feature mapped
</checklist>
