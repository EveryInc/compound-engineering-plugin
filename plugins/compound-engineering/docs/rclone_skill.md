# rclone File Transfer Skill

Transfer files to cloud storage using rclone with support for S3, Cloudflare R2, Backblaze B2, Google Drive, Dropbox, and 40+ cloud providers.

## What This Skill Does

This skill provides a streamlined workflow for transferring files to cloud storage:

- **Provider configuration** - Set up remotes for any cloud storage
- **File uploads** - Single files or entire directories
- **Sync operations** - Mirror local folders to cloud with deletes
- **Transfer verification** - Confirm uploads with integrity checks
- **Troubleshooting** - Debug and fix common issues

## Common Workflows

### 1. Upload Files to S3/R2/B2
Transfer files to S3-compatible storage with progress tracking.

```bash
rclone copy video.mp4 r2:my-bucket/videos/ --progress
```

### 2. Sync a Directory to Cloud
Mirror a local folder to cloud storage (includes deletions).

```bash
rclone sync ./local-folder remote:bucket/folder/ --progress
```

### 3. Verify Transfer Integrity
Confirm files were uploaded correctly.

```bash
rclone check /local/file remote:bucket/file
```

### 4. Configure New Cloud Provider
Set up a new remote for any supported provider.

```bash
rclone config
```

### 5. Backup with Large Files
Handle large file uploads with appropriate chunk sizes.

```bash
rclone copy big-video.mp4 remote:bucket/ --s3-chunk-size=64M --progress
```

## Agent Skill Standard

This skill follows the [Agent Skill Standard](https://agentskills.io/), an open standard for portable AI coding agent skills. This means it works across 14+ AI coding agents including:

- Claude Code
- OpenAI Codex
- OpenCode
- Cursor
- Gemini CLI
- GitHub Copilot CLI
- Windsurf
- And more...

## Installing with Skilz (Universal Installer)

The recommended way to install this skill across different AI coding agents is using the **skilz** universal installer.

### Install Skilz

```bash
pip install skilz
```

### Installation Options

#### Option 1: Install for Claude Code

```bash
skilz install rclone --agent claude-code
```

#### Option 2: Install for OpenCode

```bash
skilz install rclone --agent opencode
```

#### Option 3: Install for Gemini CLI

```bash
skilz install rclone --agent gemini
```

#### Option 4: Install for OpenAI Codex

```bash
skilz install rclone --agent codex
```

### Install from SkillzWave Marketplace

Visit [SkillzWave.ai](https://skillzwave.ai) to browse and install skills with one click.

## Requirements

- rclone installed (`brew install rclone` or `curl https://rclone.org/install.sh | sudo bash`)
- Configured remote (`rclone config`)

## License

MIT
