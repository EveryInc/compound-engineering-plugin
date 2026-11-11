# Warm the npm cache for cross-model peers

Cross-model peers resolve acpx within tested version bounds, preserving npm's release-age and date-cutoff policies. Warming downloads an eligible transport and the adapters associated with the newest validated release. An older policy-selected transport may fetch different adapter packages on its first run.

Ask once. Say first what it gets the user: skills that consult another model, such as Codex or Claude, usually start without a download on first use. Then say in plain words what it does: it downloads now, into the user's npm cache, the npm packages those skills use to reach the other model, instead of on first use. Say too that npm runs any install scripts those packages declare, as it would on that first use. Name a package such as acpx only alongside that description. Run it only after the user approves; if they decline, fetch nothing.

On approval, run the health script with `--warm-acpx` in place of `--version VERSION`, using the same `SKILL_DIR` as Step 2:

```bash
SKILL_DIR="<absolute path of the directory containing the ce-setup SKILL.md>";
bash "$SKILL_DIR/scripts/check-health" --warm-acpx
```

It installs each package into npx's cache, without starting the package itself, and prints one line per package. Show those lines. A failed warm does not disable peers; their normal launch still attempts resolution under the same npm policy. In the summary, say whether every package was cached, or that the user declined, or which package failed to fetch.
