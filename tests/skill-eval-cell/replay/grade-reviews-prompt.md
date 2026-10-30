You are grading code reviews blind. Each `<blind dir>/pr-<N>.json` (from `replay.ts blind`) holds:
- `ground_truth`: defects reviewers raised on that PR in real life. "fixed" means the author fixed it, so it was real. "declined" means the author showed it was wrong.
- `reviews`: independent automated reviews of the same diff, each identified only by an opaque `review_id`.

You do not know which configuration produced which review. Do not try to guess it.

For each PR:
1. For every ground-truth finding and every review, mark the review:
   - "hit": same defect and the same root cause, even if worded differently or at another line.
   - "partial": the right area and a related concern, but it misses the actual failure.
   - "miss".
   Judge by substance, not keyword overlap.
2. For every review finding that matches no ground truth, label it:
   - "credible": a specific, concrete failure whose evidence and reasoning hold together on their face.
   - "weak": speculative, taste or style, restating a non-issue, or reasoning that doesn't hold.
   Judge from the text alone. Do not open other files.

Write `{"<N>": {"gt": {"<gt id>": {"<review_id>": "hit|partial|miss"}}, "extra": {"<finding id>": "credible|weak"}}}` to `<out>/grades.json`. Include every ground-truth × review pair and every unmatched finding id. Then reply with hits per review per PR, and any call that could have gone either way. `replay.ts tally` unblinds the result.
