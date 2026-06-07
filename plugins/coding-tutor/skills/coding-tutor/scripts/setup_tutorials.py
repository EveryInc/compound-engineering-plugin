#!/usr/bin/env python3
"""
Set up the central tutorials repository for coding-tutor.

Usage:
    python setup_tutorials.py
    python setup_tutorials.py --create-github-repo

Creates ~/coding-tutor-tutorials/ if it doesn't exist, initializes git,
and optionally creates a private GitHub repository.
"""

import argparse
import subprocess
import sys
from pathlib import Path


def get_tutorials_repo_path():
    """Get the path for the tutorials repo (~/coding-tutor-tutorials/)."""
    return Path.home() / "coding-tutor-tutorials"


README_CONTENT = """# Coding Tutor - My Learning Journey

This repository contains my personalized coding tutorials created with the [coding-tutor](https://github.com/nityeshaga/claude-code-essentials) Claude Code plugin.

## What's Here

- **Tutorials**: Markdown files with concepts learned from various codebases
- **Learner Profile**: My background, goals, and learning preferences
- **Quiz History**: Spaced repetition quiz results tracking my progress

## How It Works

Each tutorial includes:
- `source_repo`: Which codebase the examples come from
- `concepts`: What concepts are covered
- `understanding_score`: How well I've retained this (1-10, updated via quizzes)
- Real code examples from actual projects I'm learning from

This is my personal learning trail - tutorials are written specifically for me, using my vocabulary and building on my existing knowledge.
"""


def setup_tutorials_repo(create_github=False):
    """
    Set up the central tutorials repository.

    Returns:
        tuple: (success: bool, message: str)
    """
    repo_path = get_tutorials_repo_path()

    if repo_path.exists():
        return True, f"Tutorials repo already exists at {repo_path.resolve()}"

    try:
        # Create directory
        repo_path.mkdir(parents=True)

        # Initialize git
        subprocess.run(['git', 'init'], cwd=repo_path, check=True, capture_output=True)

        # Create README
        readme_path = repo_path / "README.md"
        readme_path.write_text(README_CONTENT)

        # Create .gitignore
        gitignore_path = repo_path / ".gitignore"
        gitignore_path.write_text(".DS_Store\n*.swp\n*.swo\n")

        # Initial commit
        subprocess.run(['git', 'add', '-A'], cwd=repo_path, check=True, capture_output=True)
        subprocess.run(
            ['git', 'commit', '-m', 'Initial commit: coding learning journey'],
            cwd=repo_path, check=True, capture_output=True
        )

        message = f"Created tutorials repo at {repo_path.resolve()}"

        # Optionally create GitHub repo
        if create_github:
            result = subprocess.run(
                ['gh', 'repo', 'create', 'coding-tutor-tutorials', '--private', '--source=.', '--push'],
                cwd=repo_path, capture_output=True, text=True
            )
            if result.returncode == 0:
                message += "\nCreated private GitHub repo and pushed"
            else:
                message += f"\nNote: Could not create GitHub repo: {result.stderr}"

        return True, message

    except Exception as e:
        return False, f"Error setting up tutorials repo: {e}"


def main():
    parser = argparse.ArgumentParser(
        description="Set up the central tutorials repository for coding-tutor"
    )
    parser.add_argument(
        "--create-github-repo",
        action="store_true",
        help="Also create a private GitHub repository"
    )

    args = parser.parse_args()

    success, message = setup_tutorials_repo(create_github=args.create_github_repo)
    print(message)

    return 0 if success else 1


if __name__ == "__main__":
    sys.exit(main())
