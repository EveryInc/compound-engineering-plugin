---
name: rclone
description: This skill should be used when uploading, syncing, or managing files across cloud storage providers using rclone. Triggers on "upload to S3", "sync to cloud", "rclone", "backup files", "upload video/image to bucket", "Cloudflare R2", "Backblaze B2", "Google Drive sync", "Dropbox upload", or requests to transfer files to S3-compatible storage.
license: MIT
allowed-tools:
  - Bash
  - Read
  - Write
metadata:
  version: "1.1.0"
  category: file-transfer
  tags: [cloud-storage, s3, r2, b2, rclone, backup]
---

# rclone File Transfer Skill

Transfer files to cloud storage using rclone.

## Contents

- [Workflow](#workflow)
- [Quick Commands](#quick-commands)
- [Transfer Checklist](#transfer-checklist)
- [References](#references)

## Workflow

### Phase 1: Setup Verification

1. Check rclone installation
2. List configured remotes
3. Configure new remote if needed

```bash
# Check installation and remotes
command -v rclone >/dev/null 2>&1 && echo "rclone: $(rclone version | head -1)" || echo "NOT INSTALLED"
rclone listremotes 2>/dev/null || echo "NO REMOTES CONFIGURED"
```

### Phase 2: Transfer

1. Choose operation (copy, sync)
2. Add appropriate flags
3. Execute transfer

```bash
# Upload file
rclone copy /path/to/file remote:bucket/path/ --progress

# Upload directory
rclone copy /path/to/folder remote:bucket/folder/ --progress

# Sync (mirror with deletes)
rclone sync /local/path remote:bucket/path/ --progress
```

### Phase 3: Verification

1. Check file exists on remote
2. Verify file integrity
3. Troubleshoot if needed

```bash
# Verify upload
rclone check /local/file remote:bucket/file
rclone lsl remote:bucket/path/to/file
```

## Quick Commands

| Operation | Command |
|-----------|---------|
| Upload file | `rclone copy file.mp4 remote:bucket/ --progress` |
| Upload folder | `rclone copy ./folder remote:bucket/folder/ --progress` |
| Sync folder | `rclone sync ./local remote:bucket/ --progress` |
| List contents | `rclone ls remote:bucket/` |
| Dry run | `rclone copy ./path remote:bucket/ --dry-run` |
| Large file | `rclone copy big.mp4 remote:bucket/ --s3-chunk-size=64M --progress` |

## Transfer Checklist

- [ ] rclone installed (`command -v rclone`)
- [ ] Remote configured (`rclone listremotes`)
- [ ] Remote accessible (`rclone lsd remote:`)
- [ ] Transfer completed without errors
- [ ] File verified on remote (`rclone check`)

## References

- [Provider Configuration](./references/providers.md) - Setup for S3, R2, B2, Google Drive, Dropbox
- [Operations Reference](./references/operations.md) - All commands and flags
- [Troubleshooting](./references/troubleshooting.md) - Debug and fix common issues

## Installation

If rclone is not installed:

```bash
# macOS
brew install rclone

# Linux
curl https://rclone.org/install.sh | sudo bash
```

Configure a new remote: `rclone config`
