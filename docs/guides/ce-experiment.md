# `ce-experiment`

> Turn an idea into a numbered experiment: a brief in the layout's `projects` role, a measurable loop through `ce-optimize`, dated run notes, and a drafted end-of-cycle learning.

`ce-experiment` is thin on purpose. The layout says where an experiment lives and how it is numbered (`id_scheme`), `ce-optimize` owns the measurement spec and its commands, a writing-review capability (when the harness has one) reviews the prose, and `ce-compound` records the transferable finding. This skill supplies the brief, the log, and the draft, and never claims a result the notes do not show.

```text
idea note / brainstorm plan
        |
        v
/ce-experiment start  --> <projects path>/README.md  (+ ce-optimize spec)
/ce-experiment log    --> <notes path>/<date>-<slug>.md   (dead ends included)
/ce-experiment write-up --> <writing path>/learning.md    (cites brief, notes, dream report)
```

---

## TL;DR

| Question | Answer |
|----------|--------|
| What does it do? | Creates the experiment's home from the layout, sets up its measurement loop, logs runs, drafts the write-up |
| When to use it | Starting an experiment from an idea, logging a run, or writing the cycle up |
| What it produces | Brief + spec; one note per run; a draft learning at the `writing` role |
| Safe failure | The brief alone; nothing is created under a guessed path |

---

## Example invocations

```text
# From an idea note; id follows the layout's id_scheme (sequential never renumbers)
/ce-experiment start ideas/2026-09-15-injection-canary.md

# Log a run into the experiment's notes role
/ce-experiment log 003 tried threshold 0.7; detection 81% -> 84%, false positives up

# Draft the write-up from brief, notes, and the latest dream report
/ce-experiment write-up 003
```

---

## Novel mechanics

- **Identity from `id_scheme`.** `sequential` takes the next integer after the highest existing experiment and never reuses or renumbers; `date`, `johnny-decimal`, and `none` follow their own rules. An experiment the request names is reused.
- **Templates from the folder first.** A `templates` role holding an experiment or weekly-learning template wins over the bundled brief.
- **Measurement is delegated.** The skill hands `ce-optimize` the target, the metric (a rubric on a fixed case set, or a `ce-pov` panel verdict), and the folder; it does not restate `ce-optimize`'s spec or commands. Without `ce-optimize`, the brief records the intended metric and the run stops there.
- **Evidence discipline.** Every claim in the write-up points at the brief, a note, or a dream report; a result not shown in the notes is stated as not reached. Publishing happens only when asked.

## Chain position

`ce-experiment` sits between the planning skills and the closers: an idea from [`ce-ideate`](./ce-ideate.md) or a plan from [`ce-brainstorm`](./ce-brainstorm.md) becomes a brief; [`ce-optimize`](./ce-optimize.md) runs the loop; [`ce-dream`](./ce-dream.md)'s report and [`ce-doc-review`](./ce-doc-review.md) feed the write-up; [`ce-compound`](./ce-compound.md) records the finding. Configuration: [`ce-setup`](./ce-setup.md) (`knowledge` argument), [configuration](./configuration.md#knowledge-layout).

## See also

- [`ce-capture`](./ce-capture.md) -- source notes the brief cites
- [`ce-optimize`](./ce-optimize.md) -- the measurement loop
- [`ce-compound`](./ce-compound.md) -- the `learning` artifact
