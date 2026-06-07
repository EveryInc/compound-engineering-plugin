#!/usr/bin/env python3
"""
Create a new coding tutorial template with proper frontmatter.

Usage:
    python create_tutorial.py "React Hooks"
    python create_tutorial.py "State Management" --concepts "Redux,Context,State"
"""

import argparse
import subprocess
import sys
from datetime import datetime
from pathlib import Path


def get_tutorials_repo_path():
    """Get the path for the tutorials repo (~/coding-tutor-tutorials/)."""
    return Path.home() / "coding-tutor-tutorials"


def get_repo_name():
    """Get the current git repository name."""
    try:
        result = subprocess.run(
            ['git', 'rev-parse', '--show-toplevel'],
            capture_output=True, text=True
        )
        if result.returncode == 0:
            return result.stdout.strip().split('/')[-1]
    except Exception:
        pass
    return "unknown"


def check_uncommitted_changes():
    """Check for uncommitted changes and print a warning if any exist."""
    try:
        result = subprocess.run(
            ['git', 'status', '--porcelain'],
            capture_output=True, text=True
        )
        if result.returncode == 0 and result.stdout.strip():
            lines = result.stdout.strip().split('\n')
            print(f"WARNING: You have {len(lines)} uncommitted change(s). Commit and push before proceeding.")
            print(result.stdout)
    except Exception:
        pass


def slugify(text):
    """Convert text to URL-friendly slug."""
    return text.lower().replace(" ", "-").replace("_", "-")


def create_tutorial(topic, concepts=None, output_dir=None):
    """
    Create a new tutorial template file.

    Args:
        topic: Main topic of the tutorial
        concepts: Comma-separated concepts (defaults to topic)
        output_dir: Directory to save tutorial (defaults to ~/coding-tutor-tutorials/)

    Returns:
        Path to created tutorial file
    """
    # Default output directory is the central tutorials repo (sibling to git root)
    if output_dir is None:
        output_dir = get_tutorials_repo_path()
    else:
        output_dir = Path(output_dir)

    # Create output directory if it doesn't exist
    output_dir.mkdir(parents=True, exist_ok=True)

    # Generate filename: YYYY-MM-DD-topic-slug.md
    date_str_filename = datetime.now().strftime("%Y-%m-%d")
    date_str_frontmatter = datetime.now().strftime("%d-%m-%Y")
    slug = slugify(topic)
    filename = f"{date_str_filename}-{slug}.md"
    filepath = output_dir / filename

    # Default concepts to topic if not provided
    if concepts is None:
        concepts = topic

    # Get current repo name
    repo_name = get_repo_name()

    # Create tutorial template with YAML frontmatter and embedded guidance
    template = f"""---
concepts: {concepts}
source_repo: {repo_name}
description: [TODO: Fill after completing tutorial - one paragraph summary]
understanding_score: null
last_quizzed: null
prerequisites: []
created: {date_str_frontmatter}
last_updated: {date_str_frontmatter}
---

# {topic}

[TODO: Opening paragraph - Start with the WHY. What problem does this concept solve? Why should the learner care about this? Connect it to their goal of becoming a senior engineer.

NOTE: Update the frontmatter 'prerequisites' field with up to 3 relevant past tutorials if this builds on previous concepts (e.g., [coding-tutor-tutorials/2025-11-20-basics.md]). Leave as empty array [] if this is foundational.]

## The Problem

[TODO: Describe a real scenario from this codebase where this concept matters. Make it concrete - not "X is useful for Y" but "look at this code in src/components/User.tsx where we need to do Y - that's the problem this concept solves"]

## Key Concepts

[TODO: Build mental models, not just definitions. Use:
- Analogies that connect to things they already understand
- ASCII diagrams if helpful for visualizing relationships
- ELI5 explanations that get to the essence
- Break complex concepts into digestible pieces
- Predict and address likely points of confusion

Remember: Teach the "shape" of the concept, not just the syntax.]

## Examples from Codebase

[TODO: Include 2-4 real examples from this repository. For each example:

### Example 1: [Brief description]
**Location:** src/components/User.tsx:25-30

```
# Paste the relevant code snippet here
```

**What this demonstrates:** [Explain what's happening and why this is a good example of the concept]

Repeat for each example. Use actual file paths and line numbers. The more specific, the stickier the learning.]

## Try It Yourself

[TODO: Suggest a small exercise the learner could try in this codebase to practice the concept. Make it:
- Achievable in 10-15 minutes
- Directly related to the codebase they're working in
- Something that would genuinely improve their understanding

Delete this section if no practical exercise makes sense for this concept.]

## Summary

[TODO: Key takeaways - what should stick in their mind after this tutorial? 3-5 bullet points capturing:
- The core concept in one sentence
- When to use it
- Common pitfalls to avoid
- How it connects to their broader learning journey]

---

## Q&A

[Questions and answers will be added here as the learner asks them during the tutorial]

## Quiz History

[Quiz sessions will be recorded here after the learner is quizzed on this topic]
"""

    # Write template to file
    filepath.write_text(template)

    return filepath


def main():
    parser = argparse.ArgumentParser(
        description="Create a new coding tutorial template"
    )
    parser.add_argument(
        "topic",
        help="Topic of the tutorial (e.g., 'React Hooks')"
    )
    parser.add_argument(
        "--concepts",
        help="Comma-separated concepts (defaults to topic)",
        default=None
    )
    parser.add_argument(
        "--output-dir",
        help="Output directory for tutorial (defaults to ~/coding-tutor-tutorials/)",
        default=None
    )

    args = parser.parse_args()

    check_uncommitted_changes()

    try:
        filepath = create_tutorial(args.topic, args.concepts, args.output_dir)
        print(f"Created tutorial template: {filepath}")
        print(f"Edit the file to add content and update the frontmatter")
        return 0
    except Exception as e:
        print(f"Error creating tutorial: {e}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
