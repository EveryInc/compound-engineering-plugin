---
layout: home
title: Compound Engineering
permalink: /
description: Skills for your coding agent that make each unit of engineering work easier than the last.
hero:
  text: Each unit of work should make the next one easier.
  tagline: Compound Engineering is a set of skills for the coding agent you already use. Plan, work, review, then compound. What you learn gets written down where the next run will read it.
  actions:
    - theme: brand
      text: Install
      link: /install/
    - theme: alt
      text: See the skills
      link: /guides/
---

{%- assign ce_skill_count = 0 -%}
{%- for group in site.data.ce.groups -%}{%- assign ce_skill_count = ce_skill_count | plus: group.guides.size -%}{%- endfor %}
<section class="ce-section ce-explainer-section">
  <div class="ce-explainer" data-skills="{{ ce_skill_count }}" data-hosts="{{ site.data.ce.hosts.size }}"></div>
  <p class="ce-visually-hidden">Animated explainer. In traditional development, effort per change climbs with every feature. Compound engineering inverts the curve through a six-step loop: brainstorm, plan, work, simplify, review, and compound. The compound step writes a learning to docs/solutions/, and a later, unrelated plan finds and uses it. Most of the effort goes to planning and review, not execution.</p>
  <script defer src="{{ '/assets/explainer/ce-explainer.js' | relative_url }}"></script>
</section>

<section class="ce-section ce-install">
  <h2 id="install">Install</h2>
  <p>In Claude Code, two commands. Other hosts are on the <a href="{{ '/install/' | relative_url }}">install page</a>.</p>
  <div class="language-text highlighter-rouge"><div class="highlight"><pre class="highlight"><code>/plugin marketplace add EveryInc/compound-engineering-plugin
/plugin install compound-engineering</code></pre></div></div>
  {% include ce/hosts.html %}
  <p class="ce-muted">Current release v{{ site.data.ce.version }}</p>
</section>

<section class="ce-section ce-loop">
  <h2 id="the-loop">The loop</h2>
  <p>Most of the thinking happens before and after the code is written. The last step is the one that pays off next time.</p>
  <ol class="ce-steps">
    <li><strong>Plan</strong><span>Decide what to build and why before any code exists.</span></li>
    <li><strong>Work</strong><span>Build it from the plan, with tests and review gates along the way.</span></li>
    <li><strong>Review</strong><span>Check the change against the plan and the repo's standards.</span></li>
    <li><strong>Compound</strong><span>Write down what was learned so the next run starts further ahead.</span></li>
  </ol>
</section>

{% include ce/skill_grid.html %}

<section class="ce-section ce-more">
  <h2 id="read-more">Read more</h2>
  <ul class="ce-links">
    <li><a href="https://every.to/guides/compound-engineering">The compound engineering guide</a></li>
    <li><a href="https://every.to/chain-of-thought/compound-engineering-how-every-codes-with-agents">How Every codes with agents</a></li>
    <li><a href="https://github.com/EveryInc/compound-engineering-plugin">Source on GitHub</a></li>
  </ul>
</section>
