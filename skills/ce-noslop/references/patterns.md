# Pattern catalog

Rule numbers are stable ids. A removed rule leaves a gap; never renumber. Each rule names the pattern and the fix. The tests in `SKILL.md` decide whether a passage is a finding; this catalog names what to look for and what to write instead.

**False-positive floor.** A single device is a choice, not a tell. Flag a passage when patterns accumulate (SKILL.md test 5), and never flag: text inside quotation marks, titles, or code; a term the domain uses for one exact meaning; deliberate repetition for emphasis; a scope statement, safety notice, or real correction; one short sentence for emphasis; a heading or sign-off in a letter.

## Content

1. **Puffery.** A claim of importance stapled to an ordinary fact: "marks a turning point", "plays a vital role", "a testament to", "in today's landscape". Delete the claim and keep the fact.
2. **Trailing -ing analysis.** A clause bolted on the end that explains significance: "highlighting", "ensuring", "reflecting", "showcasing", "underscoring". Delete the clause; the sentence survives.
3. **Promotional adjectives.** "Vibrant", "seamless", "robust", "groundbreaking", "stunning", "thoughtfully designed", "powerful yet simple". State the property or delete the claim.
4. **Vague attribution.** "Experts believe", "industry reports suggest", "widely regarded", "studies show". Name the source or cut the claim. Never invent a source.
5. **Formulaic outlook.** "Despite challenges, continues to thrive"; a closing paragraph about the bright future. Keep one real limitation or plan, stated plainly, and end on the last concrete fact.
6. **Setup-reversal copy.** "Ten features. Zero headaches." "Everything changed. Your invoice didn't." State what the thing does; if the reversal was carrying the sentence, the sentence had no content.
7. **Faux insight.** "The part everyone misses", "what nobody tells you", "the real question is", "at its core". Cut the setup and let the claim stand.
8. **Metadiscourse.** "This matters more than it sounds", "the key point is", "as you can see", "in other words" when nothing was unclear. Delete the aside; if the point is unclear, add support instead.
9. **Rejecting an alternative no one raised.** "A tempting approach would be", "some might say", "this isn't about X". Remove the fake option and state the real constraint.

## Language

10. **Model vocabulary.** Delve, tapestry, testament, underscore, showcase, garner, interplay, intricate, enduring, foster, crucial, pivotal, additionally, moreover, enhance, leverage, utilize, facilitate, landscape and realm and journey as abstractions. Use the plain word for the actual claim.
11. **Dressed-up copulas.** "Acts as", "functions as", "serves as", "offers", "boasts", "represents" where the sentence means "is" or "has". Use the short verb.
12. **Not X but Y.** "It's not just a linter, it's a system." "The question isn't A, it's B." Nobody claimed X; state Y.
13. **Forced triads.** Three adjectives, three examples, three beats when the natural number is one or two. Keep the items that are true and specific.
14. **Synonym cycling.** The same thing called three names in one passage. Pick one term and repeat it; in technical writing, repetition is precision.
15. **A span that is really a list.** "From onboarding to billing" when onboarding and billing are two items, not the ends of anything. Name the items.
16. **Filler.** "In order to" is "to". "Due to the fact that" is "because". "It is important to note that" is nothing. "At this point in time" is "now".
17. **Stacked hedges.** "Could potentially possibly" is "may". One hedge, and only when the uncertainty is real.
18. **Adverbs doing a verb's work.** "Runs quickly" becomes "finishes in 40 ms"; "significantly improves" becomes the measured change. When the adverb carries the meaning, replace the verb or supply the number.
19. **Nominalizations.** "The demotion of the grid is the change" is "demote the grid". Prefer the verb.
20. **Borrowed metaphors for ordinary operations.** Words from physics, strategy, or machinery standing in for a plain code action: a "vector" that is a method, a "surface" that is an API, a "primitive" that is a function, a "lever" or "wedge" that is a change, a "north star" that is a goal, a "flywheel" that is a feedback loop, "evacuating" code that is being moved. Name the operation or the thing.
21. **Feeling instead of mechanism.** "Deploys feel effortless", "errors are handled gracefully", "the API gets out of your way". Name what the reader can do or check: "a failed deploy rolls back within one minute", "a malformed row is skipped and logged with its line number".

## Structure

22. **Dense sentences.** A sentence the reader parses twice. One idea per sentence; a chain of semicolons becomes a list.
23. **Passive hiding the actor.** "Queries are validated" leaves the reader guessing who validates; "the compiler validates queries" does not. Keep the passive only when naming the actor adds nothing.
24. **Buried decision.** The conclusion arrives after its rationale. Conclusion, then reason, then background.
25. **Heading restated in the first sentence.** Delete the restatement; start with the content.
26. **Summary-recap ending.** "In conclusion", "overall", a paragraph that repeats the piece. End on the last concrete point or the next action.
27. **Dramatic fragments.** "No priors. No nostalgia. The old rules were gone." One short sentence can land a point; a row of them is a pose. Rewrite as sentences.
28. **Colon reveal.** "The detail that makes it work: a separate grader." A colon belongs before a list or a quote, not as drama or a mid-sentence connector.

## Formatting

29. **Em dash as a rhythm crutch.** Several per paragraph, or a formulaic "this isn't X — it's Y". Use a period or a comma, or split the sentence. A semicolon is not a substitute. Leave dashes alone in code, ranges, and tables.
30. **Bold label that restates its line.** "**Performance:** performance improved." Convert to prose. Keep a bold lead-in only when the sentence after it says something the label did not.
31. **Bold sprinkled for emphasis**, every proper noun or acronym bolded. Bold only what the reader must find.
32. **Title Case headings.** Sentence case.
33. **Decorative emoji** in headings and bullets. Remove, unless the caller's contract fixes them.
34. **Bullets where two sentences of prose read better**; headers over two-sentence sections; horizontal rules between every section of a short document. Format follows content.
35. **Curly quotes** mixed with straight ones. Straight quotes in technical text.

## Chat artifacts

36. **Chatbot openers and closers.** "Certainly", "Great question", "Happy to help", "Let me know if you need anything else", "Want me to". Remove; state the content.
37. **Sycophancy.** "You're absolutely right" before the answer. Answer.
38. **Announcing the next point.** "Let's dive in", "here's what you need to know", "without further ado". State the point.
39. **Process narration in a report.** Steps the agent took that do not change what the reader does next. A cause that was ruled out or a fix that failed stays, stated as a finding; the account of how the agent spent its time goes.
40. **Knowledge-limit disclaimers and gap-filling.** "While details are limited, it likely..." State what the source does not show, or cut the sentence. Never present a guess as a fact.
41. **Manufactured thoroughness.** Bare counts ("resolved 11 threads"), scorecards, and lists of everything checked. Say what was decided and why; if nothing non-routine was decided, say nothing.
