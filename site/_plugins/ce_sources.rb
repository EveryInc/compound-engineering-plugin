# frozen_string_literal: true

# Adopts the repo's frontmatter-less markdown (the guides collection, README.md
# as /install/, docs/install/upgrading.md as /upgrading/) as first-class Jekyll
# documents and pages, then derives title, order, grouping, source path, and
# last-updated date from the guides catalog, the real file path, and git.
#
# Runs as a :site, :post_read hook at :high priority so it precedes the theme's
# own post-read builders (sidebar, search index, SEO, llms.txt), which read the
# collection once and cannot be re-run.

require "json"
require_relative "ce_github_markdown"
require "open3"
require "time"

module CeSources
  REPO_URL = "https://github.com/EveryInc/compound-engineering-plugin"
  GUIDES_COLLECTION = "guides"
  ROOT_PAGES = {
    "install.md" => {
      "title" => "Install",
      "permalink" => "/install/",
      "ce_fallback_description" => "Install Compound Engineering in Claude Code, Cursor, Codex, and every other supported agent host."
    },
    "upgrading.md" => {
      "title" => "Upgrading",
      "permalink" => "/upgrading/",
      "ce_fallback_description" => "Refresh an existing Compound Engineering install on each agent host."
    }
  }.freeze
  CATALOG_BASENAME = "README.md"
  CATALOG_TITLE = "Skill catalog"
  CATALOG_PERMALINK = "/guides/"

  module Titles
    module_function

    # First ATX H1 with surrounding backticks stripped, else the fallback.
    def from_markdown(text, fallback)
      match = text.to_s.match(/^#[ \t]+(.+?)[ \t]*#*[ \t]*$/)
      return fallback unless match

      title = match[1].strip.gsub(/\A`+|`+\z/, "").strip
      title.empty? ? fallback : title
    end
  end

  module Markdown
    module_function

    # Splits markdown into [preamble, [[heading, body], ...]] on H2 headings,
    # ignoring headings inside fenced code blocks.
    def h2_sections(text)
      sections = []
      current = nil
      in_fence = false
      text.to_s.each_line do |line|
        in_fence = !in_fence if line.match?(/\A\s*(```|~~~)/)
        if !in_fence && (match = line.chomp.match(/\A##[ \t]+(.+?)[ \t]*#*[ \t]*\z/))
          current = [match[1].strip, +""]
          sections << current
        elsif current
          current[1] << line
        end
      end
      sections
    end

    def plain_text(markdown)
      markdown.to_s
              .gsub(/!?\[([^\]]*)\]\([^)]*\)/, '\1')
              .gsub(/`([^`]*)`/, '\1')
              .gsub(/(\*\*|__)(.+?)\1/, '\2')
              .gsub(/(?<![\w*])[*_](.+?)[*_](?![\w*])/, '\1')
              .gsub(/\s+/, " ")
              .strip
    end

    # First paragraph of running prose, flattened to plain text; nil when the
    # text holds no paragraph outside headings, HTML, quotes, fences, tables,
    # rules, lists, and badge or image lines.
    def first_paragraph(text)
      in_fence = false
      block = []
      text.to_s.each_line do |raw|
        line = raw.chomp
        in_fence = !in_fence if line.match?(/\A\s*(```|~~~)/)
        next if in_fence || line.match?(/\A\s*(```|~~~)/)

        if line.strip.empty?
          break unless block.empty?
        elsif block.empty? && line.match?(/\A\s*(#|>|\||<|!\[|\[!\[|[-*_]{3,}\s*\z|[-*+]\s|\d+\.\s)/)
          next
        else
          block << line
        end
      end
      block.empty? ? nil : plain_text(block.join(" "))
    end

    def strip_trailing_rule(body)
      body.sub(/\n+[ \t]*(-{3,}|\*{3,}|_{3,})[ \t]*\n*\z/, "\n").strip + "\n"
    end
  end

  module Catalog
    module_function

    ROW = /\A\|\s*\[`?\/?([^`\]]+?)`?\]\(\.\/([^)]+?)\.md\)\s*\|\s*(.*?)\s*\|\s*\z/

    # => [{ title:, slug:, content:, guides: [{ name:, description_md:, description: }] }]
    # An H2 section is a group only when it holds at least one guide table row.
    def parse(text)
      Markdown.h2_sections(text).filter_map do |heading, body|
        guides = body.each_line.filter_map { |line| row(line) }
        next if guides.empty?

        {
          title: heading,
          slug: Jekyll::Utils.slugify(heading),
          content: Markdown.strip_trailing_rule(body),
          guides: guides
        }
      end
    end

    def row(line)
      match = line.strip.match(ROW)
      return unless match

      {
        name: match[2],
        description_md: match[3],
        description: Markdown.plain_text(match[3])
      }
    end
  end

  module Readme
    module_function

    INSTALL_SECTIONS = ["Install", "More Install Options"].freeze

    # H3 headings under the install sections, in order, de-duplicated, with a
    # trailing parenthetical such as "(`grok`)" removed.
    def hosts(text)
      Markdown.h2_sections(text)
              .select { |heading, _| INSTALL_SECTIONS.include?(heading) }
              .flat_map { |_, body| body.scan(/^###[ \t]+(.+?)[ \t]*$/).flatten }
              .map { |name| name.sub(/\s*\([^)]*\)\s*\z/, "").strip }
              .uniq
    end
  end

  module Git
    module_function

    def last_updated_at(repo_root, relative_path, git: "git", dates: nil)
      time = dates ? dates[relative_path] : commit_time(repo_root, relative_path, git: git)
      time || File.mtime(File.join(repo_root, relative_path))
    end

    # One history walk for every path under +pathspecs+, newest commit first, so
    # a build spawns one git process instead of one per adopted source.
    def commit_times(repo_root, pathspecs, git: "git")
      out, status = Open3.capture2(git, "log", "--format=%x00%cI", "--name-only", "--", *pathspecs, chdir: repo_root, err: File::NULL)
      return {} unless status.success?

      dates = {}
      current = nil
      out.each_line(chomp: true) do |line|
        if line.start_with?("\0")
          current = Time.iso8601(line.delete_prefix("\0"))
        elsif !line.empty? && current
          dates[line] ||= current
        end
      end
      dates
    rescue SystemCallError, ArgumentError
      {}
    end

    def commit_time(repo_root, relative_path, git: "git")
      out, status = Open3.capture2(git, "log", "-1", "--format=%cI", "--", relative_path, chdir: repo_root, err: File::NULL)
      return unless status.success?

      value = out.strip
      value.empty? ? nil : Time.iso8601(value)
    rescue SystemCallError, ArgumentError
      nil
    end
  end

  module Manifest
    module_function

    def version(repo_root)
      path = File.join(repo_root, ".claude-plugin", "plugin.json")
      JSON.parse(File.read(path, encoding: "UTF-8")).fetch("version").to_s
    rescue SystemCallError, JSON::ParserError, KeyError
      Jekyll.logger.warn("ce-sources", "could not read version from #{path}")
      nil
    end
  end

  # One adoption pass over a read site. Safe to call more than once: each step
  # skips sources that are already adopted.
  class Adopter
    attr_reader :site, :repo_root

    def initialize(site)
      @site = site
      @repo_root = File.realpath(File.expand_path(site.config["ce_repo_root"] || "..", site.source))
    end

    def apply
      collection = site.collections[GUIDES_COLLECTION]
      return unless collection

      adopt_guides(collection)
      adopt_root_pages
      groups = Catalog.parse(catalog_text(collection))
      synthesize_groups(collection, groups)
      rewrite_sources(collection)
      by_name = collection.docs.to_h { |doc| [doc.basename_without_ext, doc] }
      arrange(collection, groups, by_name)
      collection.docs.sort_by! { |doc| [doc.data["nav_order"].to_f, doc.path] }
      describe(collection)
      publish_data(collection, groups, by_name)
    end

    private

    # --- adoption ---------------------------------------------------------

    def commit_dates
      @commit_dates ||= Git.commit_times(repo_root, [source_path(File.join(site.source, "_#{GUIDES_COLLECTION}")), *ROOT_PAGES.keys.map { |name| source_path(File.join(site.source, name)) }])
    end

    def adopt_guides(collection)
      collection.files.select { |file| file.extname == ".md" }.each do |file|
        doc = Jekyll::Document.new(file.path, site: site, collection: collection)
        doc.read
        collection.docs << doc
        collection.files.delete(file)
        site.static_files.delete(file)
      end
      collection.docs.each { |doc| decorate_guide(doc) }
    end

    def decorate_guide(doc)
      return if doc.data["ce_group"]

      source = source_path(doc.path)
      doc.data["ce_source_path"] ||= source
      doc.data["last_updated_at"] ||= Git.last_updated_at(repo_root, source, dates: commit_dates)
      doc.data["layout"] ||= "default"

      if doc.basename == CATALOG_BASENAME
        doc.data["title"] = CATALOG_TITLE
        doc.data["permalink"] = CATALOG_PERMALINK
      elsif !front_matter?(doc)
        doc.data["title"] = Titles.from_markdown(doc.content, doc.basename_without_ext)
      end
    end

    def adopt_root_pages
      site.static_files.dup.each do |file|
        name = file.relative_path.delete_prefix("/")
        data = ROOT_PAGES[name]
        next unless data
        next if site.pages.any? { |page| page.url == data["permalink"] }

        page = Jekyll::Page.new(site, site.source, "", name)
        page.data.merge!(data)
        page.data["layout"] = "default"
        source = source_path(File.join(site.source, name))
        page.data["ce_source_path"] = source
        page.data["last_updated_at"] = Git.last_updated_at(repo_root, source, dates: commit_dates)
        site.pages << page
        site.static_files.delete(file)
      end
    end

    # Rewrites GitHub-flavoured markdown in every adopted item now, in post_read,
    # so the theme's builders (llms-full.txt, search.json, copy-page exports)
    # snapshot the rewritten content rather than the raw repo text.
    def rewrite_sources(collection)
      items = collection.docs + site.pages.select { |page| page.data["ce_source_path"] }
      items.each do |item|
        source = item.data["ce_source_path"]
        next unless source

        item.content = CeGithubMarkdown.rewrite(item.content, source_path: source, repo_root: repo_root, base_url: site.baseurl.to_s)
      end
    end

    # --- catalog ----------------------------------------------------------

    def catalog_doc(collection)
      collection.docs.find { |doc| doc.basename == CATALOG_BASENAME }
    end

    def catalog_text(collection)
      catalog_doc(collection)&.content.to_s
    end

    def synthesize_groups(collection, groups)
      catalog = catalog_doc(collection)
      groups.each do |group|
        next if collection.docs.any? { |doc| doc.data["ce_group"] && doc.data["title"] == group[:title] }

        doc = Jekyll::Document.new(File.join(collection.directory, "#{group[:slug]}.md"), site: site, collection: collection)
        doc.content = group[:content]
        doc.data.merge!(
          "title" => group[:title],
          "permalink" => "/guides/#{group[:slug]}/",
          "layout" => "default",
          "ce_group" => true,
          "ce_fallback_description" => "Compound Engineering skills in the #{group[:title]} group, with the guide for each.",
          "ce_source_path" => catalog&.data&.dig("ce_source_path"),
          "last_updated_at" => catalog&.data&.dig("last_updated_at")
        )
        collection.docs << doc
      end
    end

    # nav_order runs 1-based across the collection: catalog, then each group
    # followed by its guides in row order, then uncatalogued guides by name.
    def arrange(collection, groups, by_name)
      order = 0
      assign = ->(doc, data) { doc.data.merge!("nav_order" => (order += 1), **data) unless doc.data.key?("nav_order") }

      catalog = catalog_doc(collection)
      assign.call(catalog, {}) if catalog

      placed = [catalog].compact
      groups.each do |group|
        group_doc = collection.docs.find { |doc| doc.data["ce_group"] && doc.data["title"] == group[:title] }
        assign.call(group_doc, {})
        placed << group_doc
        group[:guides].each do |entry|
          doc = by_name[entry[:name]]
          next unless doc

          assign.call(doc, "parent" => group[:title], "description" => entry[:description], "description_md" => entry[:description_md])
          placed << doc
        end
      end

      (collection.docs - placed).sort_by(&:basename).each { |doc| assign.call(doc, {}) }
    end

    # Anything still lacking a description (uncatalogued guides, group pages,
    # the catalog, install, upgrading) describes itself by its first paragraph,
    # then by a fallback line, so no page repeats the site description.
    def describe(collection)
      items = collection.docs + site.pages.select { |page| page.data["ce_source_path"] }
      items.each do |item|
        item.data["description"] ||= Markdown.first_paragraph(item.content) || item.data.delete("ce_fallback_description")
        item.data.delete("ce_fallback_description")
      end
    end

    # --- site data --------------------------------------------------------

    def publish_data(collection, groups, by_name)
      version = Manifest.version(repo_root)

      site.data["ce"] = {
        "groups" => groups.map { |group| group_data(group, by_name) },
        "hosts" => Readme.hosts(readme_text),
        "version" => version
      }
      site.data["versions"] = {
        "current" => version ? "v#{version}" : nil,
        "items" => [{ "title" => "Releases", "url" => "#{REPO_URL}/releases", "external" => true }]
      }
    end

    def group_data(group, by_name)
      {
        "title" => group[:title],
        "url" => "/guides/#{group[:slug]}/",
        "guides" => group[:guides].filter_map do |entry|
          doc = by_name[entry[:name]]
          next unless doc

          { "name" => entry[:name], "title" => doc.data["title"], "description" => entry[:description], "url" => doc.url }
        end
      }
    end

    def readme_text
      File.read(File.join(repo_root, "README.md"), encoding: "UTF-8")
    rescue SystemCallError
      ""
    end

    # --- helpers ----------------------------------------------------------

    def source_path(path)
      real = File.realpath(path)
      real.start_with?("#{repo_root}/") ? real.delete_prefix("#{repo_root}/") : real
    end

    def front_matter?(doc)
      Jekyll::Utils.has_yaml_header?(doc.path)
    end
  end

  def self.apply(site)
    Adopter.new(site).apply
  end
end

Jekyll::Hooks.register :site, :post_read, priority: :high do |site|
  CeSources.apply(site)
end
