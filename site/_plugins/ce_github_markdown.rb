# frozen_string_literal: true

require "pathname"

# Translates GitHub-flavoured markdown written for the repo into the site's terms
# when the sources are adopted, so README.md, docs/install/upgrading.md, and the
# guides render without being edited:
#
# - `> [!NOTE]`-style alerts become kramdown callouts the theme styles
#   (marker line dropped, `{: .note }` appended after the blockquote).
# - Block-level `<div ...>` / `<p align=...>` / `<details>` wrappers gain `markdown="1"` so the
#   markdown inside them renders with `parse_block_html` left off site-wide.
# - Repo-relative links and asset paths resolve to site pages, site assets, or
#   the file on GitHub; a target that does not exist in the repo is left alone so
#   the link checker fails the build.
#
# `CeGithubMarkdown.rewrite` is a pure function over strings so it can be unit
# tested without a Jekyll site; the hook at the bottom wires it to adopted sources.
module CeGithubMarkdown
  GITHUB_REPO = "https://github.com/EveryInc/compound-engineering-plugin"
  GUIDES_DIRS = ["skills/guides", "docs/guides"].freeze
  ALERT_TYPES = %w[note tip important warning caution].freeze

  ALERT_MARKER = /\A>\s*\[!(#{ALERT_TYPES.join("|")})\]\s*\z/i
  FENCE = /\A\s{0,3}(`{3,}|~{3,})/
  WRAPPER_TAG = /\A<(div|p|details)(\s[^>]*)?>\s*\z/i
  MD_LINK = /(!?\[(?:[^\[\]]|\[[^\[\]]*\])*\])\(([^()\s<>]+)\)/
  HTML_ATTR = /\b(href|src)=(["'])([^"']*)\2/
  SKIP_TARGET = %r{\A(?:[a-z][a-z0-9+.-]*:|//|#|/)}i

  module_function

  # +base_url+ is the site's baseurl ("" at a domain root, "/compound-engineering"
  # under every.to); it prefixes every in-site path the rewrite produces.
  def rewrite(content, source_path:, repo_root:, base_url: "")
    content = content.dup.force_encoding(Encoding::UTF_8) unless content.encoding == Encoding::UTF_8
    lines = content.split(/(?<=\n)/)
    out = []
    fence = nil
    i = 0
    while i < lines.size
      line = lines[i]
      if fence
        fence = nil if line =~ FENCE && Regexp.last_match(1).start_with?(fence[0]) && Regexp.last_match(1).length >= fence.length
        out << line
      elsif line =~ FENCE
        fence = Regexp.last_match(1)
        out << line
      elsif line.chomp =~ ALERT_MARKER
        type = Regexp.last_match(1).downcase
        start = i + 1
        i = start
        i += 1 while i < lines.size && lines[i].start_with?(">")
        quote = lines[start...i].map { |l| rewrite_links(l, source_path, repo_root, base_url) }
        out.concat(quote)
        last = quote.last || line
        out << "{: .#{type} }#{last.end_with?("\n") ? "\n" : ""}"
        next
      else
        out << rewrite_line(line, source_path, repo_root, base_url)
      end
      i += 1
    end
    out.join
  end

  def rewrite_line(line, source_path, repo_root, base_url = "")
    if (m = line.match(WRAPPER_TAG)) && m[2].to_s !~ /\bmarkdown=/i
      return line.sub(/>(\s*)\z/) { " markdown=\"1\">#{Regexp.last_match(1)}" }
    end
    rewrite_links(line, source_path, repo_root, base_url)
  end

  # Rewrites link targets whose position falls outside inline code spans. Link
  # text may itself contain code (`` [`ce-plan`](./ce-plan.md) ``), so the check is
  # on the target's offset, not on the whole match.
  def rewrite_links(line, source_path, repo_root, base_url = "")
    spans = code_spans(line)
    line = line.gsub(MD_LINK) do
      m = Regexp.last_match
      next m[0] if spans.any? { |r| r.cover?(m.begin(2)) }

      "#{m[1]}(#{map_target(m[2], source_path, repo_root, base_url)})"
    end
    spans = code_spans(line)
    line.gsub(HTML_ATTR) do
      m = Regexp.last_match
      next m[0] if spans.any? { |r| r.cover?(m.begin(3)) }

      "#{m[1]}=#{m[2]}#{map_target(m[3], source_path, repo_root, base_url)}#{m[2]}"
    end
  end

  # Offsets covered by CommonMark code spans: a run of N backticks closes only
  # at the next run of exactly N backticks; an unmatched opener is literal.
  def code_spans(line)
    ranges = []
    pos = 0
    while (open = line.index(/`+/, pos))
      run = line[open..][/\A`+/]
      close = open + run.length
      close = line.index(/(?<!`)#{Regexp.escape(run)}(?!`)/, close)
      if close
        ranges << (open...(close + run.length))
        pos = close + run.length
      else
        pos = open + run.length
      end
    end
    ranges
  end

  def map_target(target, source_path, repo_root, base_url = "")
    return target if target.empty? || target =~ SKIP_TARGET

    path, fragment = target.split("#", 2)
    path, query = path.split("?", 2)
    resolved = resolve(path, source_path)
    return target if resolved.nil?

    mapped = map_path(resolved, repo_root, base_url)
    return target if mapped.nil?

    mapped += "?#{query}" if query
    mapped += "##{fragment}" if fragment
    mapped
  end

  # Resolves +path+ against the directory of +source_path+ to a normalized
  # repo-relative path; nil when it escapes the repo root.
  def resolve(path, source_path)
    base = File.dirname(source_path)
    cleaned = Pathname.new(base == "." ? path : File.join(base, path)).cleanpath.to_s
    return nil if cleaned == ".." || cleaned.start_with?("../")

    cleaned
  end

  def map_path(path, repo_root, base_url = "")
    site = site_path(path)
    return "#{base_url}#{site}" if site

    full = File.join(repo_root, path)
    return "#{base_url}/#{path}" if path.start_with?("assets/") && File.file?(full) && !path.end_with?(".md")
    return "#{GITHUB_REPO}/tree/main/#{path}" if File.directory?(full)
    return "#{GITHUB_REPO}/blob/main/#{path}" if File.file?(full)

    nil
  end

  # The site path a published source renders at, without the baseurl; nil for
  # anything that is not a published page.
  def site_path(path)
    return "/install/" if path == "README.md"
    return "/upgrading/" if path == "docs/install/upgrading.md"

    GUIDES_DIRS.each do |dir|
      next unless path.start_with?("#{dir}/")

      rest = path.delete_prefix("#{dir}/")
      return "/guides/" if rest == "README.md"
      return "/guides/#{rest.delete_suffix(".md")}/" if rest.end_with?(".md") && !rest.include?("/")
    end

    nil
  end
end

# No Jekyll hook here: ce_sources.rb calls CeGithubMarkdown.rewrite on every
# adopted document and page inside its high-priority :site, :post_read pass,
# before the theme snapshots content for llms-full.txt, search.json, and the
# copy-page exports. A :pre_render hook would run after those snapshots and
# leave them carrying raw GitHub markers and repo-relative links.
