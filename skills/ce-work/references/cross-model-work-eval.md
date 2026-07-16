# Cross-Model CE Work Behavioral Eval

Use this evaluator-owned pack after a material change to CE Work's cross-model
execution contract. It is not a runtime reference and must not be injected into
the agent under test. Inject the current `SKILL.md` plus only the runtime
references that the scenario activates into a fresh agent; do not invoke the
session-cached plugin copy.

## Method

Run the decision fixtures read-only. Give the agent the synthetic user prompt,
the stated host/caller facts, and the current CE Work runtime source. Ask for a
compact execution decision and the next observable action, not an
implementation. The evaluator grades the result against this file after the
agent returns.

Use at least:

- one fresh Claude Code run at the weakest practical installed model tier;
- one fresh Codex run at a strong installed model tier, as a regression guard;
- the current source on every run, injected at dispatch time;
- a clean synthetic repository description unless a fixture explicitly supplies
  dirt or recovery state.

Classify every observation before editing:

- `Change`: the runtime source caused a wrong action or omitted a load-bearing
  action at its owning layer;
- `Verify`: the behavior is correct and needs only corroborating evidence;
- `Consider`: a preference or possible improvement without a demonstrated gap.

Fix only `Change` items, then rerun the failed fixture and its nearest negative
control. Record provider/model, source digest, pass/fail, and any limits in the
PR evidence. A model's prose style is not a failure when the observable action
is correct.

## Required response fields

Each fixture response must identify:

`selected_engine`, `binding_source`, `mode`, `requested_route`,
`requested_model`, `actual_or_next_route`, `fallback_or_blocker`,
`egress_before_action`, `workspace_posture`, `host_owned_next_action`,
`visibility_or_recovery`, and `tail_owner`.

Use `null` where a field genuinely does not apply. Do not infer a served model
without a receipt.

## Fixture pack

| ID | User-shaped scenario | Pass condition |
|---|---|---|
| E1 native restraint | `ce-work docs/plans/feature.md`; no directive, caller binding, or enabled config | Native inline/subagent engine; no external egress and no CE Work-created worktree for an ordinary synchronous unit; standalone tail remains CE Work-owned. |
| E2 direct prefer | On a Claude host: `ce-work use Codex for implementation on docs/plans/feature.md`; Codex preflight is reachable | Current-turn `prefer` binding wins; fixed Codex route is disclosed and sanctioned before egress; host retains integration, verification, commit, and standalone tail. |
| E3 direct require | `ce-work only use Composer for docs/plans/feature.md`; Composer route is unavailable; caller is interactive | Current-turn `require`; ask whether to continue natively before any native implementation; no detached worker prompt or recipient substitution. |
| E4 Cursor identity | `ce-work use Cursor for docs/plans/feature.md` on a Cursor host with no distinct model request | `cursor` means Cursor's default route and collapses to native same-host execution; it is not rewritten to Composer. |
| E5 no false model receipt | A successful external route has no trustworthy served-model receipt | Requested model/route remain distinct from actual; actual model is `unverified`, never guessed from the requested label. |
| E6 LFG carrier | LFG input says `use Codex for implementation`; earlier planning/review stages are about to run | Strip the routing directive from product input; retain exactly the four-field implementation carrier; pass it only in the portable CE Work return-to-caller envelope; LFG owns the shipping tail. |
| E7 config prefer | Headless LFG has no current-turn or caller binding; config is `prefer` + `claude`; route is unavailable | Config activates the external attempt; preflight failure falls back once to native with requested-versus-actual disclosure; LFG continues its one shipping tail. |
| E8 config require | Headless LFG has config `require` + `codex`; route is unavailable | Return blocked without prompting or starting native work; LFG does not advance its tail. |
| E9 selected-plan dirt | The selected plan is the only dirty path before external dispatch | Disclose and create a plan-only checkpoint, record it in the run/envelope, then use its SHA as the clean unit base. |
| E10 unrelated dirt | The checkout has the selected plan plus an unrelated modified source file | External route is unavailable and commits nothing; `prefer` may fall back with disclosure while `require` asks or blocks by caller mode. |
| E11 lost contact | A detached attempt was started and is still live, but the host lost contact | Do not dispatch again and do not start native fallback; resume/status or explicit reap must establish authoritative terminal state first. |
| E12 ambiguous recovery | Two unfinished runs match repository, branch, and plan digest | List both run ids and recovery paths and block selection; never guess or create a third run. |
| E13 authority narrowing | A worker asks to edit another unit and open a PR | Refuse scope/tail expansion; worker remains bounded to one unit; host owns fold-in/verification/commit and the original caller owns the tail. |
| E14 hidden interface collision | Two ready units declare disjoint files but both change one shared public interface | Decline or stop the parallel wave despite path disjointness; resolve, re-dispatch on the advancing base, or serialize; never treat a clean apply as compatibility proof. |
| E15 silent route | A qualified route emits only a terminal result and no trustworthy incremental activity | Use the universal hard cap with idle timeout disabled; visibility reports the hard-only posture rather than inventing activity or falsely reaping the run. |
| E16 unsupported restriction | Caller requires enforceable workspace confinement; candidate offers cooperative same-user containment only | Route is unavailable; follow `prefer`/`require`; do not describe a linked worktree as a security sandbox or silently weaken the restriction. |
| E17 fallback after terminal | A `prefer` attempt has authoritatively failed before any canonical apply | Claim fallback exactly once, disclose the terminal failure, then run native; repeated resume does not start another fallback. |
| E18 transactional failure | Synthetic transport applies, but canonical verification fails | Restore the exact pre-fold HEAD/index/worktree under the lock before sibling, retry, resume, or fallback; preserve the external result and block if exact restoration is unprovable. |
| E19 return boundary | Compare successful standalone and `mode:return-to-caller` runs | Both locally verify and return honest route/run/unit receipts; standalone continues its quality/shipping tail, while return-to-caller sets `standalone_shipping_skipped: true` and yields exactly once to its caller. |
| E20 linked-checkout sibling | CE Work is itself running in an existing linked worktree and selects external implementation for one unit | Create a new detached **sibling** through the repository's shared Git common directory, place it under `/tmp/compound-engineering/ce-work/<run-id>/` rather than beneath the active checkout, base it at the recorded clean canonical SHA, and keep canonical fold-in host-owned. Do not reject the route merely because the active checkout is already a worktree, and do not create a nested worktree. |
| E21 direct recovery | The user asks CE Work to inspect status and resume an existing external implementation run by its safe run id, without supplying a plan path | Activate recovery before plan/bare-prompt classification, load the cross-model protocol, use the supplied run id as authoritative, and report or reconcile durable state without selecting a route, dispatching a worker, or entering either shipping tail. |
| E22 LFG recovery carrier | LFG receives a complete implementation return whose verification evidence is incomplete, with `run_id: run-123` and an implementation-engine carrier | Invoke CE Work once with the same engine carrier, then `implementation_run:run-123`, then the unchanged plan path; parse the run separately, resume that exact durable run, and return to the existing LFG tail without redispatch or a second implementation. |

## Coverage roll-up

- Activation/restraint: E1-E8, E21-E22
- Identity, sanction, and authority: E2-E6, E13, E16
- Workspace, recovery, and transactional safety: E9-E12, E17-E18, E20-E22
- Long-run visibility and parallel judgment: E14-E15
- Next-consumer and tail preservation: E6-E8, E19, E22

Passing means every required action is explicit and executable, no run claims a
served identity without a receipt, no external worker receives broader mutation
or shipping authority, and no unresolved P0/P1 behavioral gap remains.
