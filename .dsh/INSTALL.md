# Installing Compound Engineering for DeepSeek Harness (DSH)

DSH loads CE through native **skills** discovery — the same `SKILL.md` directories shipped in this repository's `skills/` folder. No converter or generated copy step is required.

DSH is in developer preview, so the app's labels and discovery roots may change between releases. This guide was verified against DSH desktop (runtime 0.2.2-rc.3).

## Install skills

From a clone of this repository:

```bash
# Global (${DSH_HOME:-~/.dsh}/skills/) — available in every project
./compound-engineering-plugin/.dsh/scripts/install-skills.sh --global

# Project (<dir>/.dsh/skills/) — available in that project only
./compound-engineering-plugin/.dsh/scripts/install-skills.sh --project /path/to/project
```

The script creates symlinks so DSH reads the live skill directories from your checkout. Re-run it after `git pull` to refresh links when skill folder names change. It only ever creates or replaces CE-owned symlinks (links whose target resolves under this checkout's `skills/` tree); an existing entry pointing at your own skill, a fork, or another checkout is left untouched.

Check the current state without changing anything:

```bash
./compound-engineering-plugin/.dsh/scripts/install-skills.sh --check
```

Start a new DSH session after installing or updating so the skill catalog refreshes. Skills such as `ce-brainstorm` and `ce-plan` appear when their descriptions match your request.

## Manual-only skills

DSH honors `disable-model-invocation: true` natively: the model cannot call those skills, while you can still invoke them yourself. There is no `--include-manual` flag because no workaround is needed — manual-only skills are linked like every other skill. Examples in this repository include `ce-help`, `ce-polish`, `ce-test-xcode`, and `wtf`.

## Discovery and precedence

DSH scans several roots. Higher rank wins when the same skill name appears more than once:

| Rank | Scope | Path |
| --- | --- | --- |
| 100 | Project (recommended) | `<project>/.dsh/skills/<name>/` |
| 200 | Project, shared agent config | `<project>/.agents/skills/<name>/` |
| 400 | Global DSH root | `${DSH_HOME:-~/.dsh}/skills/<name>/` |
| 500 | Global shared agent root | `${AGENTS_HOME:-~/.agents}/skills/<name>/` |

The project root is the nearest ancestor directory containing `.git`, falling back to the current directory. `DSH_HOME` and `AGENTS_HOME` override the defaults.

## Pin a release

Clone the tag you want, then run the install script against that checkout:

```bash
git clone --branch compound-engineering-vX.Y.Z --depth 1 \
  https://github.com/EveryInc/compound-engineering-plugin.git
./compound-engineering-plugin/.dsh/scripts/install-skills.sh --global
```

Replace `X.Y.Z` with a tag from the [releases page](https://github.com/EveryInc/compound-engineering-plugin/releases).

## Local development

From your working copy:

```bash
/path/to/compound-engineering-plugin/.dsh/scripts/install-skills.sh --project /path/to/project
```

Edit skills under `skills/` and start a new DSH session to pick up prose changes. Because the install links the directory, edits are live; only new or renamed skill folders need a re-run.

## Uninstall

Remove only the links this checkout owns:

```bash
./compound-engineering-plugin/.dsh/scripts/install-skills.sh --uninstall
```

You can also delete the symlinks named after CE skill ids (for example `ce-brainstorm`, `ce-plan`) from `~/.dsh/skills/` or `<project>/.dsh/skills/` by hand.
