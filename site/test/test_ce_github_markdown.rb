# frozen_string_literal: true

require "minitest/autorun"
require "tmpdir"
require "fileutils"
require_relative "../_plugins/ce_github_markdown"

class TestCeGithubMarkdown < Minitest::Test
  BLOB = "https://github.com/EveryInc/compound-engineering-plugin/blob/main"

  def setup
    @repo_root = Dir.mktmpdir("ce-gfm-")
    %w[
      README.md
      docs/install/upgrading.md
      docs/specs/omp.md
      docs/guides/README.md
      docs/guides/ce-plan.md
      docs/guides/ce-work.md
      skills/guides/README.md
      skills/guides/ce-plan.md
      skills/guides/ce-work.md
      assets/logo.png
      assets/demo/compound-loop.gif
      assets/demo/README.md
      CONTRIBUTING.md
      LICENSE
    ].each do |path|
      full = File.join(@repo_root, path)
      FileUtils.mkdir_p(File.dirname(full))
      File.write(full, "x")
    end
  end

  def teardown
    FileUtils.remove_entry(@repo_root)
  end

  def rewrite(content, source_path: "README.md")
    CeGithubMarkdown.rewrite(content, source_path: source_path, repo_root: @repo_root)
  end

  # --- alerts -------------------------------------------------------------

  def test_base_url_prefixes_every_in_site_path_but_not_external_ones
    out = CeGithubMarkdown.rewrite(
      "[a](docs/guides/ce-plan.md) [b](README.md#install) <img src=\"assets/logo.png\"> [c](docs/specs/omp.md) [d](https://x.test/)",
      source_path: "README.md", repo_root: @repo_root, base_url: "/compound-engineering"
    )
    assert_includes out, "[a](/compound-engineering/guides/ce-plan/)"
    assert_includes out, "[b](/compound-engineering/install/#install)"
    assert_includes out, 'src="/compound-engineering/assets/logo.png"'
    assert_includes out, "[c](https://github.com/EveryInc/compound-engineering-plugin/blob/main/docs/specs/omp.md)"
    assert_includes out, "[d](https://x.test/)"
  end

  def test_important_alert_becomes_kramdown_callout
    input = <<~MD
      intro

      > [!IMPORTANT]
      > **Already installed?** Refresh first.
      > Running update alone keeps you old.

      after
    MD
    expected = <<~MD
      intro

      > **Already installed?** Refresh first.
      > Running update alone keeps you old.
      {: .important }

      after
    MD
    assert_equal expected, rewrite(input)
  end

  def test_alert_types_are_lowercased_and_case_insensitive
    %w[NOTE Tip important WARNING caution].each do |type|
      out = rewrite("> [!#{type}]\n> body\n")
      assert_equal "> body\n{: .#{type.downcase} }\n", out
    end
  end

  def test_plain_blockquote_is_untouched
    input = "> just a quote\n> two lines\n"
    assert_equal input, rewrite(input)
  end

  def test_alert_marker_inside_fenced_block_is_untouched
    input = "```md\n> [!NOTE]\n> body\n```\n"
    assert_equal input, rewrite(input)
  end

  # --- html wrappers --------------------------------------------------------

  def test_div_align_center_gains_markdown_attribute
    input = "<div align=\"center\">\n\n# Title\n\n</div>\n"
    expected = "<div align=\"center\" markdown=\"1\">\n\n# Title\n\n</div>\n"
    assert_equal expected, rewrite(input)
  end

  def test_p_align_gains_markdown_attribute
    assert_equal "<p align=\"center\" markdown=\"1\">\n", rewrite("<p align=\"center\">\n")
  end

  def test_details_block_gains_markdown_attribute
    input = "<details>\n<summary>Other install paths</summary>\n\n`omp install` pins a snapshot.\n\n</details>\n"
    expected = "<details markdown=\"1\">\n<summary>Other install paths</summary>\n\n`omp install` pins a snapshot.\n\n</details>\n"
    assert_equal expected, rewrite(input)
  end

  def test_div_already_carrying_markdown_is_unchanged
    input = "<div align=\"center\" markdown=\"1\">\n"
    assert_equal input, rewrite(input)
  end

  def test_div_inside_fenced_block_is_unchanged
    input = "```html\n<div align=\"center\">\n</div>\n```\n"
    assert_equal input, rewrite(input)
  end

  def test_img_and_closing_tags_are_not_given_markdown_attribute
    input = "<img src=\"https://x/y.png\">\n</div>\n<br>\n<a href=\"https://x\">y</a>\n"
    assert_equal input, rewrite(input)
  end

  # --- links: published pages ----------------------------------------------

  def test_guide_link_from_readme_maps_to_site_guide
    assert_equal "[x](/guides/ce-plan/)", rewrite("[x](docs/guides/ce-plan.md)")
    assert_equal "[x](/guides/ce-plan/)", rewrite("[x](skills/guides/ce-plan.md)")
  end

  def test_guides_catalog_link_keeps_fragment
    assert_equal "[x](/guides/#the-core-loop)", rewrite("[x](docs/guides/README.md#the-core-loop)")
    assert_equal "[x](/guides/#the-core-loop)", rewrite("[x](skills/guides/README.md#the-core-loop)")
  end

  def test_upgrading_link_maps_to_upgrading_page
    assert_equal "[x](/upgrading/)", rewrite("[x](docs/install/upgrading.md)")
  end

  def test_readme_link_from_upgrading_page_resolves_parent_dirs
    out = rewrite("[x](../../README.md#install)", source_path: "docs/install/upgrading.md")
    assert_equal "[x](/install/#install)", out
  end

  def test_sibling_guide_link_from_a_guide
    assert_equal "[x](/guides/ce-work/)", rewrite("[x](./ce-work.md)", source_path: "docs/guides/ce-plan.md")
    assert_equal "[x](/guides/ce-work/)", rewrite("[x](./ce-work.md)", source_path: "skills/guides/ce-plan.md")
    assert_equal "[x](/guides/)", rewrite("[x](README.md)", source_path: "docs/guides/ce-plan.md")
  end

  def test_query_string_is_preserved
    assert_equal "[x](/guides/ce-plan/?v=1#top)", rewrite("[x](docs/guides/ce-plan.md?v=1#top)")
  end

  # --- links: assets -------------------------------------------------------

  def test_html_img_src_maps_to_site_asset
    input = "<img src=\"assets/logo.png\" alt=\"Logo\" width=\"120\">"
    assert_equal "<img src=\"/assets/logo.png\" alt=\"Logo\" width=\"120\">", rewrite(input)
  end

  def test_markdown_image_maps_to_site_asset
    assert_equal "![](/assets/demo/compound-loop.gif)", rewrite("![](assets/demo/compound-loop.gif)")
  end

  def test_markdown_file_under_assets_goes_to_github
    assert_equal "<a href=\"#{BLOB}/assets/demo/README.md\">d</a>", rewrite("<a href=\"assets/demo/README.md\">d</a>")
  end

  # --- links: unpublished and unchanged ------------------------------------

  def test_unpublished_existing_file_maps_to_github_blob
    assert_equal "[x](#{BLOB}/docs/specs/omp.md)", rewrite("[x](docs/specs/omp.md)")
    assert_equal "[x](#{BLOB}/LICENSE)", rewrite("[x](LICENSE)")
    assert_equal "[x](#{BLOB}/CONTRIBUTING.md#setup)", rewrite("[x](CONTRIBUTING.md#setup)")
  end

  def test_existing_directory_maps_to_github_tree
    assert_equal "[x](https://github.com/EveryInc/compound-engineering-plugin/tree/main/docs/specs)",
                 rewrite("[x](docs/specs)")
  end

  def test_nonexistent_relative_path_is_left_unchanged
    assert_equal "[x](docs/nope.md)", rewrite("[x](docs/nope.md)")
  end

  def test_absolute_and_anchor_links_are_unchanged
    input = "[a](https://example.com/x.md) [b](http://x) [c](mailto:me@x.io) [d](#install) [e](//cdn/x) [f](/already/)"
    assert_equal input, rewrite(input)
  end

  def test_badge_image_link_pair_rewrites_only_relative_target
    input = "[![Skills](https://img.shields.io/badge/skills-35-black.svg)](docs/guides/README.md)"
    assert_equal "[![Skills](https://img.shields.io/badge/skills-35-black.svg)](/guides/)", rewrite(input)
  end

  def test_link_inside_fenced_block_is_unchanged
    input = "```text\n[x](docs/guides/ce-plan.md)\n<img src=\"assets/logo.png\">\n```\n~~~\n[y](README.md)\n~~~\n"
    assert_equal input, rewrite(input)
  end

  def test_link_inside_inline_code_is_unchanged
    input = "see `[x](docs/guides/ce-plan.md)` and [y](docs/guides/ce-plan.md)"
    assert_equal "see `[x](docs/guides/ce-plan.md)` and [y](/guides/ce-plan/)", rewrite(input)
  end

  def test_link_whose_text_is_inline_code_is_rewritten
    input = "| [`/ce-plan`](docs/guides/ce-plan.md) | Enrich |"
    assert_equal "| [`/ce-plan`](/guides/ce-plan/) | Enrich |", rewrite(input)
    input = "- [`ce-work`](./ce-work.md): execute the plan"
    assert_equal "- [`ce-work`](/guides/ce-work/): execute the plan", rewrite(input, source_path: "docs/guides/ce-plan.md")
  end

  def test_double_backtick_code_span_containing_backtick_shields_link
    input = "`` `[x](docs/guides/ce-plan.md)` `` then [y](docs/guides/ce-plan.md)"
    assert_equal "`` `[x](docs/guides/ce-plan.md)` `` then [y](/guides/ce-plan/)", rewrite(input)
  end

  def test_non_utf8_tagged_input_with_multibyte_bytes_is_handled
    input = "see \xE2\x80\x94 [x](docs/guides/ce-plan.md)".b
    assert_equal "see — [x](/guides/ce-plan/)", rewrite(input)
  end

  def test_reference_paths_with_spaces_in_angle_brackets_are_left_alone
    input = "[x](<docs/guides/ce plan.md>)"
    assert_equal input, rewrite(input)
  end
end
