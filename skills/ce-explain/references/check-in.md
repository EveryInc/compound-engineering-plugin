# Check-in

The check-in is the active-recall section of the explainer: a `Check yourself` section at the end of the artifact where the reader answers first and reads the answers after. It is static text in the document. The run asks the reader nothing about it — no offer, no prediction turn, no exercise posed in chat — so a user who switches away never comes back to a waiting question.

## Include or omit

The request wins in both directions: an explicit ask for a check-in, quiz, or exercises includes the section whatever the material; an explicit "no quiz" or equivalent omits it. When the request is silent, include the section when retention is the point — a hard or unfamiliar concept, a gnarly or consequential diff, a dense recap window with decisions worth recalling later — and omit it when comprehension is the point and retention is incidental: a routine recap before a meeting, a small mechanical diff, a topic the user signals they only need to skim. When the material and the request disagree, the request wins. Do not announce a justification either way.

The reader does not change the decision. An artifact rendered for another reader gets the same test, because the section exercises whoever reads the document.

## Shape

- One section headed `Check yourself`, placed last: after the explanation and before the HTML footer.
- Questions first, then their answers under an `Answers` label, so a reader can attempt every question before any answer is in view. Choose the number according to what is worth practicing.
- Each answer states what a correct response contains and names the gap a plausible wrong answer exposes. One correction per question — do not lecture past the gap.
- Static only: no forms, scripts, click handlers, or collapsing widgets. The label and spacing set the answers apart; nothing hides them.

Questions should test applying the mechanism or recognizing its limits rather than recalling the explanation's wording.
