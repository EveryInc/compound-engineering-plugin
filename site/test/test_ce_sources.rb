# frozen_string_literal: true

require "minitest/autorun"
require "digest"
require "fileutils"
require "json"
require "open3"
require "tmpdir"
require "time"
require "jekyll"

require_relative "../_plugins/ce_sources"

# Shared helpers for building a throwaway repo + site pair from the fixture tree.
module CeSourcesFixtures
  FIXTURE_REPO = File.expand_path("fixtures/repo", __dir__)
  REAL_SITE = File.expand_path("..", __dir__)

  SITE_CONFIG = <<~YAML
    title: Fixture Site
    description: Fixture description.
    url: https://example.test
    theme: jekyll-vitepress-theme
    plugins:
      - jekyll-vitepress-theme
    markdown: kramdown
    kramdown:
      input: GFM
      parse_block_html: false
    collections:
      guides:
        output: true
        permalink: "/guides/:name/"
    defaults:
      - scope:
          path: ""
        values:
          layout: default
    exclude:
      - vendor
    jekyll_vitepress:
      edit_link:
        enabled: false
      last_updated:
        enabled: true
      copy_page:
        enabled: false
      github_star:
        enabled: false
      llms:
        enabled: true
      seo:
        enabled: true
  YAML

  SIDEBAR_DATA = <<~YAML
    - title: Skills
      collection: guides
  YAML

  INDEX_PAGE = <<~MD
    ---
    layout: home
    title: Fixture Site
    permalink: /
    ---

    Fixture home.
  MD

  # Copies the fixture repo into a tmpdir and scaffolds a site/ dir beside it,
  # mirroring the real layout (symlinks into the repo, no site-local _plugins).
  def scaffold(&block)
    Dir.mktmpdir("ce-sources-") do |tmp|
      repo = File.join(tmp, "repo")
      FileUtils.cp_r(FIXTURE_REPO, repo)
      # The manifest lives outside the fixture repo so the bun suite's
      # "only one .claude-plugin/plugin.json in the tree" pin stays true.
      FileUtils.mkdir_p(File.join(repo, ".claude-plugin"))
      FileUtils.cp(File.join(File.dirname(FIXTURE_REPO), "plugin.json"), File.join(repo, ".claude-plugin", "plugin.json"))
      site_dir = File.join(repo, "site")
      FileUtils.mkdir_p(File.join(site_dir, "_data"))
      FileUtils.mkdir_p(File.join(site_dir, "_includes", "jekyll_vitepress"))
      File.write(File.join(site_dir, "_config.yml"), SITE_CONFIG)
      File.write(File.join(site_dir, "_data", "sidebar.yml"), SIDEBAR_DATA)
      File.write(File.join(site_dir, "index.md"), INDEX_PAGE)
      FileUtils.cp(
        File.join(REAL_SITE, "_includes", "jekyll_vitepress", "doc_footer_end.html"),
        File.join(site_dir, "_includes", "jekyll_vitepress", "doc_footer_end.html")
      )
      File.symlink("../docs/guides", File.join(site_dir, "_guides"))
      File.symlink("../README.md", File.join(site_dir, "install.md"))
      File.symlink("../docs/install/upgrading.md", File.join(site_dir, "upgrading.md"))
      block.call(repo, site_dir)
    end
  end

  def new_site(site_dir)
    config = Jekyll.configuration(
      "source" => site_dir,
      "destination" => File.join(site_dir, "_site"),
      "quiet" => true
    )
    Jekyll::Site.new(config)
  end

  # Reads the site (which fires :post_read hooks, ours before the theme's).
  def read_site(site_dir)
    site = new_site(site_dir)
    site.reset
    site.read
    site
  end

  def guides(site)
    site.collections["guides"].docs
  end

  def guide(site, title)
    guides(site).find { |doc| doc.data["title"] == title } ||
      flunk("no guide titled #{title.inspect}; have #{guides(site).map { |d| d.data["title"] }.inspect}")
  end

  def page(site, url)
    site.pages.find { |p| p.url == url } || flunk("no page at #{url}; have #{site.pages.map(&:url).inspect}")
  end

  def tree_digest(root)
    files = Dir.glob("**/*", File::FNM_DOTMATCH, base: root).reject { |f| f.start_with?("site") }
    files.sort.map do |rel|
      path = File.join(root, rel)
      File.file?(path) ? [rel, Digest::SHA256.file(path).hexdigest] : [rel, "dir"]
    end
  end

  def git(repo, *args, env: {})
    out, status = Open3.capture2(env, "git", *args, chdir: repo)
    flunk("git #{args.join(' ')} failed: #{out}") unless status.success?
    out
  end

  def commit_all(repo, date)
    env = {
      "GIT_AUTHOR_DATE" => date, "GIT_COMMITTER_DATE" => date,
      "GIT_AUTHOR_NAME" => "Fixture", "GIT_AUTHOR_EMAIL" => "fixture@example.test",
      "GIT_COMMITTER_NAME" => "Fixture", "GIT_COMMITTER_EMAIL" => "fixture@example.test"
    }
    git(repo, "init", "-q")
    git(repo, "add", "-A")
    git(repo, "-c", "commit.gpgsign=false", "commit", "-q", "-m", "fixture", env: env)
  end
end

class TestCatalogParser < Minitest::Test
  CATALOG = File.read(File.join(CeSourcesFixtures::FIXTURE_REPO, "docs/guides/README.md"))

  def setup
    @groups = CeSources::Catalog.parse(CATALOG)
  end

  def test_only_h2_sections_with_guide_rows_become_groups
    assert_equal ["Group One", "Group Two"], @groups.map { |g| g[:title] }
    assert_equal ["group-one", "group-two"], @groups.map { |g| g[:slug] }
  end

  def test_rows_yield_guide_names_in_order
    assert_equal %w[ce-alpha ce-beta], @groups[0][:guides].map { |g| g[:name] }
    assert_equal %w[ce-gamma], @groups[1][:guides].map { |g| g[:name] }
  end

  def test_descriptions_are_kept_as_markdown_and_flattened_to_plain_text
    beta = @groups[0][:guides][1]
    assert_equal "Second step with `code` and *emphasis*", beta[:description_md]
    assert_equal "Second step with code and emphasis", beta[:description]

    gamma = @groups[1][:guides][0]
    assert_equal "Turn a Riffrec recording into feedback", gamma[:description]
  end

  def test_group_content_is_the_section_body_without_its_heading_or_rule
    content = @groups[0][:content]
    assert_includes content, "Two skills that run in order."
    assert_includes content, "| [`/ce-alpha`](./ce-alpha.md) |"
    refute_includes content, "## Group One"
    refute_includes content, "Group Two"
    refute_match(/^---\s*\z/, content)
  end
end

class TestReadmeParser < Minitest::Test
  README = File.read(File.join(CeSourcesFixtures::FIXTURE_REPO, "README.md"))

  def test_hosts_are_install_h3s_in_order_deduplicated_with_parentheticals_stripped
    assert_equal ["Claude Code", "Cursor", "Grok Build CLI", "oh-my-pi"], CeSources::Readme.hosts(README)
  end

  def test_title_from_first_h1_strips_backticks
    assert_equal "ce-alpha", CeSources::Titles.from_markdown("# `ce-alpha`\n\nbody", "fallback")
  end

  def test_title_falls_back_when_first_heading_is_not_an_h1
    assert_equal "ce-orphan", CeSources::Titles.from_markdown("## Not an H1\n\nbody", "ce-orphan")
  end

  def test_first_paragraph_skips_headings_html_blockquotes_fences_and_tables
    text = "<div>\n# Title\n</div>\n\n> [!NOTE]\n> quoted\n\n```sh\nls\n```\n\n| a | b |\n|---|---|\n\nThe *real* first paragraph\nspans two lines.\n\nSecond.\n"
    assert_equal "The real first paragraph spans two lines.", CeSources::Markdown.first_paragraph(text)
    assert_nil CeSources::Markdown.first_paragraph("# Only a heading\n")
  end
end

class TestGitTimes < Minitest::Test
  include CeSourcesFixtures

  def test_commit_time_of_the_last_commit_touching_the_path
    scaffold do |repo, _site|
      commit_all(repo, "2024-03-04T05:06:07+00:00")
      at = CeSources::Git.last_updated_at(repo, "docs/guides/ce-alpha.md")
      assert_equal Time.iso8601("2024-03-04T05:06:07+00:00"), at
    end
  end

  def test_falls_back_to_mtime_outside_a_git_repo
    scaffold do |repo, _site|
      path = File.join(repo, "docs/guides/ce-alpha.md")
      assert_equal File.mtime(path), CeSources::Git.last_updated_at(repo, "docs/guides/ce-alpha.md")
    end
  end

  def test_falls_back_to_mtime_when_git_binary_is_missing
    scaffold do |repo, _site|
      path = File.join(repo, "docs/guides/ce-alpha.md")
      at = CeSources::Git.last_updated_at(repo, "docs/guides/ce-alpha.md", git: "ce-sources-no-such-git")
      assert_equal File.mtime(path), at
    end
  end
end

class TestAdoption < Minitest::Test
  include CeSourcesFixtures

  def test_frontmatter_less_guides_become_documents_titled_from_their_h1
    scaffold do |_repo, site_dir|
      site = read_site(site_dir)
      titles = guides(site).map { |d| d.data["title"] }
      %w[ce-alpha ce-beta ce-gamma].each { |t| assert_includes titles, t }
      assert_equal "default", guide(site, "ce-alpha").data["layout"]
      assert_equal "/guides/ce-alpha/", guide(site, "ce-alpha").url
      refute site.collections["guides"].files.any? { |f| f.extname == ".md" }, "raw .md left in collection.files"
      refute site.static_files.any? { |f| f.relative_path.end_with?(".md") }, "raw .md left in site.static_files"
    end
  end

  def test_catalog_doc_and_root_pages_get_fixed_titles_and_permalinks
    scaffold do |_repo, site_dir|
      site = read_site(site_dir)
      catalog = guide(site, "Skill catalog")
      assert_equal "/guides/", catalog.url
      assert_equal "Install", page(site, "/install/").data["title"]
      assert_equal "Upgrading", page(site, "/upgrading/").data["title"]
      assert_equal "default", page(site, "/install/").data["layout"]
    end
  end

  def test_catalog_groups_become_synthetic_documents_and_order_the_collection
    scaffold do |_repo, site_dir|
      site = read_site(site_dir)
      one = guide(site, "Group One")
      two = guide(site, "Group Two")
      assert_equal true, one.data["ce_group"]
      assert_equal "/guides/group-one/", one.url
      assert_includes one.content, "| [`/ce-alpha`](/guides/ce-alpha/) |"

      assert_equal 1, guide(site, "Skill catalog").data["nav_order"]
      assert_equal 2, one.data["nav_order"]
      assert_equal 3, guide(site, "ce-alpha").data["nav_order"]
      assert_equal 4, guide(site, "ce-beta").data["nav_order"]
      assert_equal 5, two.data["nav_order"]
      assert_equal 6, guide(site, "ce-gamma").data["nav_order"]

      assert_equal "Group One", guide(site, "ce-alpha").data["parent"]
      assert_equal "Group Two", guide(site, "ce-gamma").data["parent"]
      assert_equal "First step: define what to build", guide(site, "ce-alpha").data["description"]
    end
  end

  def test_items_without_a_catalog_description_get_their_first_paragraph
    scaffold do |_repo, site_dir|
      site = read_site(site_dir)
      assert_equal "Two skills that run in order.", guide(site, "Group One").data["description"]
      assert_equal "Compound Engineering skills in the Group Two group, with the guide for each.", guide(site, "Group Two").data["description"]
      assert_equal "End-user-facing documentation for fixture skills. Defaults are documented in configuration.", guide(site, "Skill catalog").data["description"]
      assert_equal "For a first-time install, see the README.", page(site, "/upgrading/").data["description"]
      assert_equal "This guide is not in the catalog and has no H1, so its title falls back to the file name.", guide(site, "ce-orphan").data["description"]
    end
  end

  def test_uncatalogued_guide_sorts_after_catalogued_ones_with_no_parent_and_filename_title
    scaffold do |_repo, site_dir|
      site = read_site(site_dir)
      orphan = guide(site, "ce-orphan")
      assert_nil orphan.data["parent"]
      assert_operator orphan.data["nav_order"], :>, guide(site, "ce-gamma").data["nav_order"]
    end
  end

  def test_guide_with_front_matter_keeps_its_own_data_and_is_not_double_adopted
    scaffold do |_repo, site_dir|
      site = read_site(site_dir)
      native = guide(site, "Front Matter Guide")
      assert_equal 42, native.data["nav_order"]
      assert_equal 1, guides(site).count { |d| d.path.end_with?("configuration.md") }
      assert_equal "docs/guides/configuration.md", native.data["ce_source_path"]
    end
  end

  def test_source_paths_resolve_through_symlinks_to_repo_relative_paths
    scaffold do |_repo, site_dir|
      site = read_site(site_dir)
      assert_equal "docs/guides/ce-alpha.md", guide(site, "ce-alpha").data["ce_source_path"]
      assert_equal "docs/guides/README.md", guide(site, "Skill catalog").data["ce_source_path"]
      assert_equal "README.md", page(site, "/install/").data["ce_source_path"]
      assert_equal "docs/install/upgrading.md", page(site, "/upgrading/").data["ce_source_path"]
      assert_equal "docs/guides/README.md", guide(site, "Group One").data["ce_source_path"]
    end
  end

  def test_last_updated_comes_from_git_when_the_repo_has_history
    scaffold do |repo, site_dir|
      commit_all(repo, "2024-03-04T05:06:07+00:00")
      site = read_site(site_dir)
      expected = Time.iso8601("2024-03-04T05:06:07+00:00")
      assert_equal expected, guide(site, "ce-alpha").data["last_updated_at"]
      assert_equal expected, page(site, "/install/").data["last_updated_at"]
    end
  end

  def test_last_updated_falls_back_to_mtime_without_git
    scaffold do |repo, site_dir|
      site = read_site(site_dir)
      assert_equal File.mtime(File.join(repo, "docs/guides/ce-alpha.md")), guide(site, "ce-alpha").data["last_updated_at"]
    end
  end

  def test_site_data_ce_and_versions
    scaffold do |_repo, site_dir|
      site = read_site(site_dir)
      ce = site.data["ce"]
      assert_equal "9.8.7", ce["version"]
      assert_equal ["Claude Code", "Cursor", "Grok Build CLI", "oh-my-pi"], ce["hosts"]
      assert_equal ["Group One", "Group Two"], ce["groups"].map { |g| g["title"] }
      assert_equal "/guides/group-one/", ce["groups"][0]["url"]
      alpha = ce["groups"][0]["guides"][0]
      assert_equal({ "name" => "ce-alpha", "title" => "ce-alpha", "description" => "First step: define what to build", "url" => "/guides/ce-alpha/" }, alpha)

      assert_equal "v9.8.7", site.data["versions"]["current"]
      items = site.data["versions"]["items"]
      assert_equal 1, items.length
      assert_equal "Releases", items[0]["title"]
      assert_equal true, items[0]["external"]
      assert_match %r{github\.com/EveryInc/compound-engineering-plugin/releases}, items[0]["url"]
    end
  end

  def test_applying_the_hook_twice_does_not_double_adopt
    scaffold do |_repo, site_dir|
      site = read_site(site_dir)
      before = guides(site).map(&:path).sort
      pages_before = site.pages.map(&:url).sort
      CeSources.apply(site)
      assert_equal before, guides(site).map(&:path).sort
      assert_equal pages_before, site.pages.map(&:url).sort
    end
  end

  def test_adding_a_guide_and_a_catalog_row_needs_no_site_change
    scaffold do |repo, site_dir|
      File.write(File.join(repo, "docs/guides/ce-delta.md"), "# `ce-delta`\n\nDelta.\n")
      catalog = File.join(repo, "docs/guides/README.md")
      File.write(catalog, File.read(catalog).sub("| [`/ce-gamma`](./ce-gamma.md) | Turn", "| [`/ce-delta`](./ce-delta.md) | Fourth |\n| [`/ce-gamma`](./ce-gamma.md) | Turn"))
      site = read_site(site_dir)
      names = site.data["ce"]["groups"][1]["guides"].map { |g| g["name"] }
      assert_equal %w[ce-delta ce-gamma], names
      assert_equal "Group Two", guide(site, "ce-delta").data["parent"]
      assert_operator guide(site, "ce-delta").data["nav_order"], :<, guide(site, "ce-gamma").data["nav_order"]
    end
  end
end

class TestSiteBuild < Minitest::Test
  include CeSourcesFixtures

  GUIDE_TITLES = ["Skill catalog", "Group One", "ce-alpha", "ce-beta", "Group Two", "ce-gamma", "ce-orphan", "Front Matter Guide"].freeze

  def test_full_build_feeds_every_guide_through_the_theme_exactly_once
    scaffold do |repo, site_dir|
      before = tree_digest(repo)
      site = new_site(site_dir)
      site.process
      assert_equal before, tree_digest(repo), "build mutated a source file"

      sidebar = site.data["jekyll_vitepress_sidebar"]
      docs = sidebar["groups"][0]["docs"].map { |d| d.data["title"] }
      assert_equal GUIDE_TITLES, docs
      roots = sidebar["groups"][0]["items"]
      assert_equal ["Skill catalog", "Group One", "Group Two", "ce-orphan", "Front Matter Guide"], roots.map { |n| n["title"] }
      assert_equal %w[ce-alpha ce-beta], roots[1]["children"].map { |n| n["title"] }

      out = File.join(site_dir, "_site")
      search = JSON.parse(File.read(File.join(out, "search.json")))
      search_titles = search.map { |e| e["title"] }
      GUIDE_TITLES.each { |t| assert_equal 1, search_titles.count(t), "search.json lists #{t} #{search_titles.count(t)} times" }

      llms = File.read(File.join(out, "llms.txt"))
      GUIDE_TITLES.each { |t| assert_equal 1, llms.scan("[#{t}](").length, "llms.txt lists #{t}" }
      llms_full = File.read(File.join(out, "llms-full.txt"))
      refute_includes llms_full, "[!IMPORTANT]", "llms-full.txt keeps a raw GitHub alert marker"
      refute_includes llms_full, "](./", "llms-full.txt keeps a sibling-relative guide link"
      refute_includes llms_full, 'src="assets/', "llms-full.txt keeps a repo-relative asset path"
      assert_includes llms_full, "/guides/ce-beta/", "llms-full.txt carries the rewritten guide link"
      assert_includes llms_full, "{: .important }", "llms-full.txt carries the theme callout syntax"
      sitemap = File.read(File.join(out, "sitemap.xml"))
      assert_includes sitemap, "https://example.test/guides/ce-alpha/"

      assert_empty Dir.glob("**/*.md", base: File.join(out, "guides")), "raw markdown copied into _site/guides"
      refute File.exist?(File.join(out, "install.md"))

      assert File.exist?(File.join(out, "guides", "ce-alpha", "index.html"))
      home = File.read(File.join(out, "index.html"), encoding: "UTF-8")
      assert_includes home, 'href="./assets/css/vitepress-core.css"', "homepage stylesheet is not page-relative"
      alpha = File.read(File.join(out, "guides", "ce-alpha", "index.html"), encoding: "UTF-8")
      assert_includes alpha, 'href="../../assets/css/vitepress-core.css"', "guide stylesheet is not page-relative"
      assert_includes alpha, 'data-search-index-url="../../search.json"'
      refute_match(/\b(href|src)="\/(?!\/)/, alpha, "guide page still carries a root-absolute URL")
      assert File.exist?(File.join(out, "guides", "group-one", "index.html"))
      install = File.read(File.join(out, "install", "index.html"))
      assert_includes install, 'href="https://github.com/EveryInc/compound-engineering-plugin/edit/main/README.md"'
      assert_includes install, "Edit this page on GitHub"
      alpha = File.read(File.join(out, "guides", "ce-alpha", "index.html"), encoding: "UTF-8")
      assert_includes alpha, "edit/main/docs/guides/ce-alpha.md"
      home = File.read(File.join(out, "index.html"), encoding: "UTF-8")
      refute_includes home, "Edit this page on GitHub"
    end
  end
end
