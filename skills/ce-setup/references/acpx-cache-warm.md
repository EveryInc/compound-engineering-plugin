# Warm the npm cache for cross-model peers

Cross-model peers run the pinned acpx through `npx`, and acpx launches its codex and claude adapters the same way. Each peer run asks npm to prefer cached copies, so a package already in the npm cache starts in about a second, while a missing one has to be downloaded first. Warming fetches the pinned acpx and those adapters into the cache now, over the network, so the first peer run does not pay for the download.

Offer it when the health report's `node` row is available. Ask once, saying it downloads the pinned acpx and its adapters from the npm registry into the user's npm cache. Run it only after the user approves; if they decline, fetch nothing.

On approval, run the health script with `--warm-acpx` in place of `--version VERSION`, using the same `SKILL_DIR` as Step 2:

```bash
SKILL_DIR="<absolute path of the directory containing the ce-setup SKILL.md>";
bash "$SKILL_DIR/scripts/check-health" --warm-acpx
```

It installs each package into npx's cache without starting it and prints one line per package. Show those lines. A package that could not be fetched leaves peers working; that peer run downloads it instead. Report the warm under Fixed when every package was cached, and under Skipped when the user declined or a fetch failed, naming the package.
