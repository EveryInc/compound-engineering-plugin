#!/usr/bin/env python3
"""
Prioritize tutorials for quizzing based on spaced repetition.

Usage: python3 quiz_priority.py
       python3 quiz_priority.py --tutorials-dir /path/to/tutorials

Returns tutorials ordered by quiz urgency (most urgent first).
"""

import argparse
import re
import subprocess
from datetime import datetime
from pathlib import Path


def get_tutorials_directory():
    """Get the tutorials directory (~/coding-tutor-tutorials/)."""
    return Path.home() / "coding-tutor-tutorials"

# Ideal days between quizzes based on understanding score
# Lower scores = more frequent review needed
INTERVALS = {
    0: 1,    # Never assessed - urgent
    1: 2,
    2: 3,
    3: 5,
    4: 8,
    5: 13,
    6: 21,
    7: 34,
    8: 55,
    9: 89,
    10: 144  # Fibonacci-ish progression
}


def parse_frontmatter(filepath):
    """Extract YAML frontmatter from tutorial."""
    content = filepath.read_text()

    # Match YAML frontmatter between --- delimiters
    match = re.match(r'^---\s*\n(.*?)\n---\s*\n', content, re.DOTALL)
    if not match:
        return None

    frontmatter_text = match.group(1)
    metadata = {'filepath': str(filepath)}

    # Parse simple YAML key: value pairs
    for line in frontmatter_text.split('\n'):
        line = line.strip()
        if ':' in line:
            key, value = line.split(':', 1)
            key = key.strip()
            value = value.strip()

            # Handle null values
            if value == 'null':
                value = None
            # Convert understanding_score to int
            elif key == 'understanding_score' and value:
                try:
                    value = int(value)
                except ValueError:
                    pass
            # Handle list values for concepts
            elif key == 'concepts' and value.startswith('['):
                value = value.strip('[]').strip()
                if value:
                    value = [item.strip() for item in value.split(',')]
                else:
                    value = []

            metadata[key] = value

    return metadata


def parse_date(date_value):
    """Parse date from string DD-MM-YYYY format."""
    if isinstance(date_value, str):
        return datetime.strptime(date_value, '%d-%m-%Y').date()
    return date_value


def calculate_priority(tutorial, today):
    """
    Calculate quiz priority score. Higher = more urgent.

    Priority logic:
    1. No last_quizzed = never assessed, use created date + urgency bonus
    2. Has last_quizzed = calculate days overdue based on score interval
    3. Missing created date = assume max urgency (100)
    """
    score = tutorial.get('understanding_score') or 0  # Default to 0 if null
    ideal_interval = INTERVALS.get(score, INTERVALS[5])

    last_quizzed = tutorial.get('last_quizzed')

    if not last_quizzed:
        # Never quizzed - need baseline assessment
        created = tutorial.get('created')
        if created:
            created = parse_date(created)
            days_since_created = (today - created).days
            # Bonus ensures never-quizzed items surface early
            return days_since_created / ideal_interval + 10
        # No date info at all - max urgency
        return 100

    # Normal case: has been quizzed before
    last_quizzed = parse_date(last_quizzed)
    days_since_quiz = (today - last_quizzed).days
    days_overdue = days_since_quiz - ideal_interval

    return days_overdue / ideal_interval


def main():
    parser = argparse.ArgumentParser(
        description="Prioritize tutorials for quizzing based on spaced repetition"
    )
    parser.add_argument(
        "--tutorials-dir",
        help="Path to tutorials directory (defaults to ~/coding-tutor-tutorials/)",
        default=None
    )

    args = parser.parse_args()

    today = datetime.now().date()
    tutorials = []

    if args.tutorials_dir:
        tutorials_path = Path(args.tutorials_dir)
    else:
        tutorials_path = get_tutorials_directory()

    if not tutorials_path.exists():
        print("No tutorials found in ~/coding-tutor-tutorials/")
        return

    for filepath in tutorials_path.glob("*.md"):
        if filepath.name == "learner_profile.md":
            continue
        metadata = parse_frontmatter(filepath)
        if metadata:
            metadata['priority'] = calculate_priority(metadata, today)
            tutorials.append(metadata)

    if not tutorials:
        print("No tutorials found")
        return

    # Sort by priority (highest first = most urgent)
    tutorials.sort(key=lambda t: t['priority'], reverse=True)

    print("=" * 60)
    print("QUIZ PRIORITY (most urgent first)")
    print("=" * 60)
    print()

    for i, t in enumerate(tutorials, 1):
        score = t.get('understanding_score') or 0
        last_q = t.get('last_quizzed')
        concepts = t.get('concepts', [])
        if isinstance(concepts, list):
            concepts_str = ', '.join(concepts[:2])  # First 2 concepts
        else:
            concepts_str = str(concepts)

        # Calculate days ago
        if last_q:
            last_q = parse_date(last_q)
            days_ago = (today - last_q).days
            last_quizzed_str = f"{days_ago} days ago"
        else:
            last_quizzed_str = "never"

        print(f"{i}. {concepts_str}")
        print(f"   understanding_score: {score}/10")
        print(f"   last_quizzed: {last_quizzed_str}")
        print(f"   file: {t['filepath']}")
        print()


if __name__ == "__main__":
    main()
