# deploy-landing

Helper the release agent calls to decide whether a routine upstream update lands by a direct push to `main` or by opening a pull request. `inspectBranchPolicy` reads the branch-protection JSON that `gh api` returned; `decideLandingPath` combines that with the repository's written instructions.
