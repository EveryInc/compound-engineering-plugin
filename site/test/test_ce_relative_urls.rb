# frozen_string_literal: true

require "minitest/autorun"
require "jekyll"
require_relative "../_plugins/ce_relative_urls"

class TestCeRelativeUrls < Minitest::Test
  BASE = "/compound-engineering"

  def rewrite(html, url, baseurl = BASE)
    CeRelativeUrls.rewrite(html, page_url: url, baseurl: baseurl)
  end

  def test_root_page_links_become_dot_relative
    html = '<link href="/compound-engineering/assets/css/core.css"><a href="/compound-engineering/">Home</a>'
    assert_equal '<link href="./assets/css/core.css"><a href="./">Home</a>', rewrite(html, "/")
  end

  def test_nested_page_climbs_one_level_per_directory
    html = '<img src="/compound-engineering/assets/demo/loop.gif"><a href="/compound-engineering/guides/ce-plan/">'
    assert_equal '<img src="../../assets/demo/loop.gif"><a href="../../guides/ce-plan/">', rewrite(html, "/guides/ce-work/")
    assert_equal '<img src="../assets/demo/loop.gif"><a href="../guides/ce-plan/">', rewrite(html, "/guides/")
  end

  def test_data_attributes_the_theme_reads_are_rewritten
    html = '<div data-search-index-url="/compound-engineering/search.json" data-url="/compound-engineering/guides/ce-plan.md">'
    assert_equal '<div data-search-index-url="../../search.json" data-url="../../guides/ce-plan.md">', rewrite(html, "/guides/ce-plan/")
  end

  def test_absolute_external_and_fragment_urls_are_untouched
    html = '<meta content="https://every.to/compound-engineering/x/"><a href="https://github.com/x">' \
           '<a href="#install"><script src="//cdn.example/x.js"><a href="/compound-engineering-plugin/">'
    assert_equal html, rewrite(html, "/guides/ce-plan/")
  end

  def test_bare_baseurl_home_link_maps_to_the_root
    assert_equal '<a href="../../">', rewrite('<a href="/compound-engineering">', "/guides/ce-plan/")
  end

  def test_empty_baseurl_relativizes_root_absolute_paths
    assert_equal '<a href="../guides/ce-beta/">', rewrite('<a href="/guides/ce-beta/">', "/install/", "")
    assert_equal '<script src="//cdn.example/x.js">', rewrite('<script src="//cdn.example/x.js">', "/install/", "")
  end

  def test_html_file_urls_resolve_from_their_directory
    assert_equal '<a href="./guides/">', rewrite('<a href="/compound-engineering/guides/">', "/404.html")
    assert_equal '<a href="../">', rewrite('<a href="/compound-engineering/">', "/guides/index.html")
  end
end
