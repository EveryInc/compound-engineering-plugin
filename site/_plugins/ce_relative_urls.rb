# frozen_string_literal: true

# Makes the built HTML work at any base path. Jekyll emits every in-site URL
# as root-absolute, prefixed with `baseurl` (`/compound-engineering/assets/...`),
# which is right at every.to and wrong at the GitHub Pages origin
# (`everyinc.github.io/compound-engineering-plugin/`) and at a local server
# with a different base. Rewriting those to page-relative paths
# (`../../assets/...`) after render lets one build serve every host.
#
# Full URLs (canonical, Open Graph, sitemap, llms.txt) keep `site.url` and
# stay absolute, so the every.to address remains the canonical one. Only HTML
# output is touched; the 404 page stays absolute because a host serves it at
# arbitrary paths, where a relative link has no fixed anchor.
module CeRelativeUrls
  ATTRS = %w[href src srcset poster action data-search-index-url data-url].freeze
  ATTR = /\b(#{ATTRS.join("|")})=(["'])([^"']*)\2/

  module_function

  # +page_url+ is the page's site-relative URL ("/", "/guides/ce-plan/",
  # "/guides.md" is not HTML and never reaches here).
  def rewrite(html, page_url:, baseurl:)
    prefix = relative_prefix(page_url)
    html.gsub(ATTR) do
      attr, quote, value = Regexp.last_match(1), Regexp.last_match(2), Regexp.last_match(3)
      "#{attr}=#{quote}#{relativize(value, baseurl, prefix)}#{quote}"
    end
  end

  # "./" for a page at the root, "../" per directory below it.
  def relative_prefix(page_url)
    dir = page_url.end_with?("/") ? page_url : File.dirname(page_url) + "/"
    depth = dir.split("/").reject(&:empty?).length
    depth.zero? ? "./" : "../" * depth
  end

  def relativize(value, baseurl, prefix)
    return value unless value == baseurl || value.start_with?("#{baseurl}/")
    return value if value.start_with?("//")

    rest = value.delete_prefix(baseurl).delete_prefix("/")
    "#{prefix}#{rest}"
  end

  def apply(item)
    return unless item.output_ext == ".html" && item.output
    return if item.url == "/404.html"

    item.output = rewrite(item.output, page_url: item.url, baseurl: item.site.baseurl.to_s)
  end
end

Jekyll::Hooks.register [:documents, :pages], :post_render do |item|
  CeRelativeUrls.apply(item)
end
