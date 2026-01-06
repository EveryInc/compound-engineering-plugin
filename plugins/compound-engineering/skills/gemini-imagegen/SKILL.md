---
name: gemini-imagegen
description: This skill should be used when generating or editing images with the Gemini API. Triggers on "generate image", "create image with Gemini", "edit image", "image generation", "text-to-image", "style transfer", "multi-turn image refinement", or requests to use Google's Gemini for visual content creation.
license: MIT
allowed-tools:
  - Bash
  - Read
  - Write
---

# Gemini Image Generation

Generate and edit images using Google's Gemini API.

## Contents

- [Environment Setup](#environment-setup)
- [Ready-to-Use Scripts](#ready-to-use-scripts)
- [Models](#models)
- [Quick Reference](#quick-reference)
- [Core API Pattern](#core-api-pattern)
- [Prompting Best Practices](#prompting-best-practices)
- [File Format Warning](#file-format-warning)

## Environment Setup

**Required:** Set `GEMINI_API_KEY` environment variable.

**Dependencies:** Install from [requirements.txt](./requirements.txt):
```bash
pip install -r requirements.txt
```

## Ready-to-Use Scripts

The following CLI scripts are available in [scripts/](./scripts/):

| Script | Purpose | Usage |
|--------|---------|-------|
| [generate_image.py](./scripts/generate_image.py) | Text-to-image generation | `python scripts/generate_image.py "prompt" output.jpg` |
| [edit_image.py](./scripts/edit_image.py) | Edit existing images | `python scripts/edit_image.py input.jpg "edit instruction" output.jpg` |
| [compose_images.py](./scripts/compose_images.py) | Combine multiple images | `python scripts/compose_images.py "instruction" out.jpg img1.jpg img2.jpg` |
| [multi_turn_chat.py](./scripts/multi_turn_chat.py) | Interactive refinement | `python scripts/multi_turn_chat.py` |
| [gemini_images.py](./scripts/gemini_images.py) | Python library | `from gemini_images import GeminiImageGenerator` |

## Models

| Model | Speed | Quality | Best For |
|-------|-------|---------|----------|
| `gemini-2.5-flash-image` | Fast | Good | Previews, iteration |
| `gemini-3-pro-image-preview` | Slower | Best | Final outputs, 4K |

**Default:** Scripts use flash for speed. Use `--model gemini-3-pro-image-preview` for production quality.

## Quick Reference

### Default Settings
- **Model:** `gemini-2.5-flash-image` (scripts) / `gemini-3-pro-image-preview` (pro)
- **Resolution:** 1K (options: 1K, 2K, 4K)
- **Aspect Ratio:** 1:1

### Available Aspect Ratios
`1:1`, `2:3`, `3:2`, `3:4`, `4:3`, `4:5`, `5:4`, `9:16`, `16:9`, `21:9`

### Available Resolutions
`1K` (default), `2K`, `4K`

## Core API Pattern

For complete implementations, see [generate_image.py](./scripts/generate_image.py).

Quick inline example:

```python
from gemini_images import GeminiImageGenerator

gen = GeminiImageGenerator()
gen.generate("A sunset over mountains", "sunset.jpg")
```

### Custom Resolution & Aspect Ratio

```python
from google.genai import types

response = client.models.generate_content(
    model="gemini-3-pro-image-preview",
    contents=[prompt],
    config=types.GenerateContentConfig(
        response_modalities=['TEXT', 'IMAGE'],
        image_config=types.ImageConfig(
            aspect_ratio="16:9",
            image_size="2K"
        ),
    )
)
```

### Editing Images

Use [edit_image.py](./scripts/edit_image.py) or:

```python
from PIL import Image

img = Image.open("input.png")
response = client.models.generate_content(
    model="gemini-3-pro-image-preview",
    contents=["Add a sunset to this scene", img],
    config=types.GenerateContentConfig(response_modalities=['TEXT', 'IMAGE']),
)
```

### Multi-Turn Refinement

Use [multi_turn_chat.py](./scripts/multi_turn_chat.py) for interactive sessions or:

```python
chat = client.chats.create(
    model="gemini-3-pro-image-preview",
    config=types.GenerateContentConfig(response_modalities=['TEXT', 'IMAGE'])
)
response = chat.send_message("Create a logo for 'Acme Corp'")
response = chat.send_message("Make the text bolder and add a blue gradient")
```

## Prompting Best Practices

### Photorealistic Scenes
Include camera details: lens type, lighting, angle, mood.
> "A photorealistic close-up portrait, 85mm lens, soft golden hour light, shallow depth of field"

### Stylized Art
Specify style explicitly:
> "A kawaii-style sticker of a happy red panda, bold outlines, cel-shading, white background"

### Text in Images
Be explicit about font style and placement:
> "Create a logo with text 'Daily Grind' in clean sans-serif, black and white, coffee bean motif"

### Product Mockups
Describe lighting setup and surface:
> "Studio-lit product photo on polished concrete, three-point softbox setup, 45-degree angle"

## Advanced Features

### Google Search Grounding

Generate images based on real-time data:

```python
response = client.models.generate_content(
    model="gemini-3-pro-image-preview",
    contents=["Visualize today's weather in Tokyo as an infographic"],
    config=types.GenerateContentConfig(
        response_modalities=['TEXT', 'IMAGE'],
        tools=[{"google_search": {}}]
    )
)
```

### Multiple Reference Images

Use [compose_images.py](./scripts/compose_images.py) to combine up to 14 reference images.

## File Format Warning

**CRITICAL:** Gemini returns JPEG format by default. Always use `.jpg` extension:

```python
# CORRECT
image.save("output.jpg")

# WRONG - Creates JPEG with PNG extension!
image.save("output.png")
```

### Converting to PNG

```python
img.save("output.png", format="PNG")
```

### Verify Format

```bash
file image.png  # If shows "JPEG image data" - rename to .jpg
```

## Quality Checklist

Before delivering generated images:

- [ ] GEMINI_API_KEY environment variable set
- [ ] Correct model selected (flash for speed, pro for quality)
- [ ] Prompt includes specific details (camera, lighting, style)
- [ ] Output uses `.jpg` extension (Gemini returns JPEG)
- [ ] Image verified with `file` command if format matters

## Notes

- All generated images include SynthID watermarks
- Image-only mode won't work with Google Search grounding
- For editing, describe changes conversationally
- Default to 1K resolution for speed; use 2K/4K when quality is critical
