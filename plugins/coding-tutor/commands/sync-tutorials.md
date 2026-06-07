# Sync Coding Tutor Tutorials

Commit and push your tutorials to the GitHub repository for backup and mobile reading.

## Instructions

1. **Go to the tutorials repo**: `cd ~/coding-tutor-tutorials`

2. **Check for changes**: Run `git status` to see what's new or modified

3. **If there are changes**:
   - Stage all changes: `git add -A`
   - Create a commit with a message summarizing what was added/updated (e.g., "Add tutorial on React hooks" or "Update quiz scores")
   - Push to origin: `git push`

4. **If no GitHub remote exists**:
   - Create the repo: `gh repo create coding-tutor-tutorials --private --source=. --push`

5. **Report results**: Tell the user what was synced or that everything is already up to date

## Notes

- The tutorials repo is at: `~/coding-tutor-tutorials/`
- Always use `--private` when creating the GitHub repo
- This is your personal learning journey - keep it backed up!
