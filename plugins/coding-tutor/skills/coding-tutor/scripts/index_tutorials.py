#!/usr/bin/env python3
"""
Index all tutorials by extracting their YAML frontmatter.

Usage:
    python index_tutorials.py
    python index_tutorials.py --tutorials-dir /path/to/tutorials
    python index_tutorials.py --format json
    python index_tutorials.py --format human
"""

import argparse
import json
import re
import subprocess
import sys
from pathlib import Path


def get_tutorials_directory():
    """Get the tutorials directory (~/coding-tutor-tutorials/)."""
    return Path.home() / "coding-tutor-tutorials"


def extract_frontmatter(filepath):
    """
    Extract YAML frontmatter from a markdown file.

    Args:
        filepath: Path to markdown file

    Returns:
        dict with frontmatter fields or None if no frontmatter found
    """
    content = filepath.read_text()

    # Match YAML frontmatter between --- delimiters
    match = re.match(r'^---\s*\n(.*?)\n---\s*\n', content, re.DOTALL)
    if not match:
        return None

    frontmatter_text = match.group(1)
    frontmatter = {}

    # Parse simple YAML key: value pairs
    for line in frontmatter_text.split('\n'):
        line = line.strip()
        if ':' in line:
            key, value = line.split(':', 1)
            key = key.strip()
            value = value.strip()

            # Convert understanding_score to int, or None if "null"
            if key == 'understanding_score':
                if value == 'null' or not value:
                    value = None
                else:
                    try:
                        value = int(value)
                    except ValueError:
                        pass

            # Handle null values for last_quizzed
            if key == 'last_quizzed' and value == 'null':
                value = None

            # Handle list/array values for prerequisites
            if key == 'prerequisites' and value.startswith('['):
                # Simple list parsing - extract items between brackets
                value = value.strip('[]').strip()
                if value:
                    frontmatter[key] = [item.strip() for item in value.split(',')]
                else:
                    frontmatter[key] = []
            else:
                frontmatter[key] = value

    return frontmatter


def index_tutorials(tutorials_dir=None):
    """
    Index all tutorials from the tutorials directory.

    Args:
        tutorials_dir: Path to tutorials directory (defaults to ~/coding-tutor-tutorials/)

    Returns:
        list of dicts with tutorial metadata
    """
    tutorials = []

    if tutorials_dir is not None:
        tutorials_path = Path(tutorials_dir)
    else:
        tutorials_path = get_tutorials_directory()

    if not tutorials_path.exists():
        return tutorials

    # Find all .md files in tutorials directory
    for filepath in sorted(tutorials_path.glob("*.md")):
        frontmatter = extract_frontmatter(filepath)

        if frontmatter:
            tutorials.append({
                "filename": filepath.name,
                "filepath": str(filepath),
                "concepts": frontmatter.get("concepts", ""),
                "source_repo": frontmatter.get("source_repo", ""),
                "description": frontmatter.get("description", ""),
                "understanding_score": frontmatter.get("understanding_score"),
                "last_quizzed": frontmatter.get("last_quizzed"),
                "prerequisites": frontmatter.get("prerequisites", []),
                "created": frontmatter.get("created", ""),
                "last_updated": frontmatter.get("last_updated", "")
            })

    return tutorials


def format_human_readable(tutorials):
    """Format tutorials as human-readable text."""
    if not tutorials:
        return "No tutorials found. Check if ~/coding-tutor-tutorials/learner_profile.md exists - if not, onboard the learner first. If it exists, create their first tutorial using their profile context."

    output = []
    output.append(f"Found {len(tutorials)} tutorial(s):\n")

    for tutorial in tutorials:
        output.append(f"  {tutorial['filename']}")
        output.append(f"   Concepts: {tutorial['concepts']}")
        if tutorial.get('source_repo'):
            output.append(f"   Source repo: {tutorial['source_repo']}")
        if tutorial['description']:
            output.append(f"   Description: {tutorial['description']}")
        score = tutorial['understanding_score']
        if score is None:
            output.append(f"   Understanding: not quizzed yet")
        else:
            output.append(f"   Understanding: {score}/10")
        if tutorial.get('last_quizzed'):
            output.append(f"   Last quizzed: {tutorial['last_quizzed']}")
        if tutorial.get('created'):
            output.append(f"   Created: {tutorial['created']}")
        if tutorial.get('prerequisites') and tutorial['prerequisites']:
            prereqs = ', '.join(tutorial['prerequisites']) if isinstance(tutorial['prerequisites'], list) else tutorial['prerequisites']
            output.append(f"   Prerequisites: {prereqs}")
        output.append("")

    return "\n".join(output)


def main():
    parser = argparse.ArgumentParser(
        description="Index all tutorials by extracting frontmatter"
    )
    parser.add_argument(
        "--tutorials-dir",
        help="Path to tutorials directory (defaults to ~/coding-tutor-tutorials/)",
        default=None
    )
    parser.add_argument(
        "--format",
        choices=["json", "human"],
        default="json",
        help="Output format (default: json)"
    )

    args = parser.parse_args()

    try:
        tutorials = index_tutorials(args.tutorials_dir)

        if args.format == "json":
            if not tutorials:
                print(json.dumps({
                    "tutorials": [],
                    "message": "No tutorials found. Check if ~/coding-tutor-tutorials/learner_profile.md exists - if not, onboard the learner first. If it exists, create their first tutorial using their profile context."
                }, indent=2))
            else:
                print(json.dumps({"tutorials": tutorials}, indent=2))
        else:
            print(format_human_readable(tutorials))

        return 0
    except Exception as e:
        print(f"Error indexing tutorials: {e}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
