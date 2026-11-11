# Placement and routing

**Result:** for each proven candidate, the cheapest fix, where it lives, who owns it, and the signal a later run will use to tell whether it worked. The approval account shows these next.

## Cheapest fix

Prefer the fix that removes the most cost while adding the least to what every future agent must read. Try these in order and take the first that holds:

1. **Remove something.** Delete an instruction that did nothing or caused the friction, a stale doc passage, or a rule a check now covers. Removal is a fix, not a side effect.
2. **A check.** A lint rule, test, hook, or CI step that catches the mistake mechanically. Use one when the mistake has a fixed shape a tool can detect.
3. **A pointer or a doc fix.** Correct the stale path or command, or add a short pointer where the agent looked first. Use one when the agent lost time finding something that exists.
4. **A standard.** A condition for reviewers in the nearest `CODING_STANDARDS.md` or equivalent. Use one for a judgment call a reviewer can see in a diff and no tool can check.
5. **A new instruction.** Use one only when nothing above holds. It costs every future session.

A missing tool, script, or access path (tee a dev-server log, a read-only service credential, a script for a repeated sequence) is its own fix. Treat it as a small script when it lives in the repo, and as a routed item when it needs product code or a credential only the user has.

## Where it lives

Name the place the right agent will actually read:

- **Always-loaded** (the root instruction file): only pointers and rules every session needs. Text here is paid for on every turn.
- **Review time** (coding standards, review docs): rules a reviewer applies to a diff. The implementing agent has the most to hold in context, so judgment rules belong with the reviewer.
- **On demand** (docs, references, skills): detail an agent loads when the task calls for it, reached by a pointer.
- **Personal or project scope:** a preference only this user holds goes in their personal or local instruction file, not the committed one. A fact about the repo goes in the committed file.

## Owner

| The fix | Owner |
|---|---|
| An edit to an instruction file, doc, small script, or the repo's harness settings | `ce-retro` applies it after approval. |
| A lesson about how the product code behaves, or a check that guards product behavior | `ce-compound`, which still applies its own bar and may decline. |
| A rewrite of the coding standards or review docs as a whole | `ce-setup` with `standards`. |
| A change to product code, such as merging two ways of doing one thing or making a hidden dependency explicit | `ce-plan`, with the item as its input. |
| Friction caused by a skill or plugin | An issue drafted for the user to post upstream. Never post it yourself. |
| A file outside the repo, such as the user's global instruction file | `ce-retro` applies it, but only after that item's own diff approval and a backup. |

## Success signal

For every candidate, state what a later run would see if the fix worked, in terms a session transcript or the tree can show: the agent reaches the file without searching, the command no longer fails, the correction stops appearing, the check catches the mistake. A fix with no observable signal cannot be graded later, so prefer one that has one.
