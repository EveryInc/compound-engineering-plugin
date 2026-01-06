# Gemini Image Generation Skill

Generate and edit images using Google's Gemini API with ready-to-use CLI scripts.

## What This Skill Does

This skill provides a complete toolkit for AI image generation including:

- **Text-to-image generation** - Create images from prompts
- **Image editing** - Modify existing images with instructions
- **Multi-image composition** - Combine up to 14 reference images
- **Multi-turn refinement** - Interactive chat-based image iteration
- **Style transfer** - Apply artistic styles to images

## Common Workflows

### 1. Generate Product Images
Create studio-quality product photos with specific lighting and composition.

```bash
python scripts/generate_image.py "Studio-lit product photo on polished concrete" product.jpg
```

### 2. Edit Existing Images
Add elements, change backgrounds, or modify existing images.

```bash
python scripts/edit_image.py input.jpg "Add a sunset background" output.jpg
```

### 3. Create Marketing Assets
Generate logos, social media graphics, and brand imagery.

```bash
python scripts/generate_image.py "Logo with text 'Daily Grind' in clean sans-serif" logo.jpg
```

### 4. Combine Reference Images
Merge multiple images into a cohesive composition.

```bash
python scripts/compose_images.py "Combine these into a collage" out.jpg img1.jpg img2.jpg
```

### 5. Interactive Refinement Session
Iteratively refine an image through conversation.

```bash
python scripts/multi_turn_chat.py
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
skilz install gemini-imagegen --agent claude-code
```

#### Option 2: Install for OpenCode

```bash
skilz install gemini-imagegen --agent opencode
```

#### Option 3: Install for Gemini CLI

```bash
skilz install gemini-imagegen --agent gemini
```

#### Option 4: Install for OpenAI Codex

```bash
skilz install gemini-imagegen --agent codex
```

### Install from SkillzWave Marketplace

Visit [SkillzWave.ai](https://skillzwave.ai) to browse and install skills with one click.

## Requirements

- Python 3.8+
- `GEMINI_API_KEY` environment variable
- Dependencies from `requirements.txt`

## License

MIT
