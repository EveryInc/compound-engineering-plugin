# frozen_string_literal: true

# DSPy.rb Configuration Examples
# This file demonstrates various configuration patterns for different use cases

require 'dspy'

# ============================================================================
# Basic Configuration
# ============================================================================

# Simple OpenAI configuration
DSPy.configure do |c|
  c.lm = DSPy::LM.new('openai/gpt-4o-mini',
    api_key: ENV['OPENAI_API_KEY'])
end

# ============================================================================
# Multi-Provider Configuration
# ============================================================================

# Anthropic Claude
DSPy.configure do |c|
  c.lm = DSPy::LM.new('anthropic/claude-3-5-sonnet-20241022',
    api_key: ENV['ANTHROPIC_API_KEY'])
end

# Google Gemini
DSPy.configure do |c|
  c.lm = DSPy::LM.new('gemini/gemini-1.5-pro',
    api_key: ENV['GOOGLE_API_KEY'])
end

# Local Ollama
DSPy.configure do |c|
  c.lm = DSPy::LM.new('ollama/llama3.1',
    base_url: 'http://localhost:11434')
end

# OpenRouter (access to 200+ models)
DSPy.configure do |c|
  c.lm = DSPy::LM.new('openrouter/anthropic/claude-3.5-sonnet',
    api_key: ENV['OPENROUTER_API_KEY'],
    base_url: 'https://openrouter.ai/api/v1')
end

# ============================================================================
# Environment-Based Configuration
# ============================================================================

# Different models for different environments
if Rails.env.development?
  # Use local Ollama for development (free, private)
  DSPy.configure do |c|
    c.lm = DSPy::LM.new('ollama/llama3.1')
  end
elsif Rails.env.test?
  # Use cheap model for testing
  DSPy.configure do |c|
    c.lm = DSPy::LM.new('openai/gpt-4o-mini',
      api_key: ENV['OPENAI_API_KEY'])
  end
else
  # Use powerful model for production
  DSPy.configure do |c|
    c.lm = DSPy::LM.new('anthropic/claude-3-5-sonnet-20241022',
      api_key: ENV['ANTHROPIC_API_KEY'])
  end
end

# ============================================================================
# Configuration with Custom Parameters
# ============================================================================

DSPy.configure do |c|
  c.lm = DSPy::LM.new('openai/gpt-4o',
    api_key: ENV['OPENAI_API_KEY'],
    temperature: 0.7,        # Creativity (0.0-2.0, default: 1.0)
    max_tokens: 2000,        # Maximum response length
    top_p: 0.9,              # Nucleus sampling
    frequency_penalty: 0.0,  # Reduce repetition (-2.0 to 2.0)
    presence_penalty: 0.0    # Encourage new topics (-2.0 to 2.0)
  )
end

# ============================================================================
# Multiple Model Configuration (Task-Specific)
# ============================================================================

# Create different language models for different tasks
module MyApp
  # Fast model for simple tasks
  FAST_LM = DSPy::LM.new('openai/gpt-4o-mini',
    api_key: ENV['OPENAI_API_KEY'],
    temperature: 0.3  # More deterministic
  )

  # Powerful model for complex tasks
  POWERFUL_LM = DSPy::LM.new('anthropic/claude-3-5-sonnet-20241022',
    api_key: ENV['ANTHROPIC_API_KEY'],
    temperature: 0.7
  )

  # Creative model for content generation
  CREATIVE_LM = DSPy::LM.new('openai/gpt-4o',
    api_key: ENV['OPENAI_API_KEY'],
    temperature: 1.2,  # More creative
    top_p: 0.95
  )

  # Vision-capable model
  VISION_LM = DSPy::LM.new('openai/gpt-4o',
    api_key: ENV['OPENAI_API_KEY'])
end

# Use in modules
class SimpleClassifier < DSPy::Module
  def initialize
    super
    DSPy.configure { |c| c.lm = MyApp::FAST_LM }
    @predictor = DSPy::Predict.new(SimpleSignature)
  end
end

class ComplexAnalyzer < DSPy::Module
  def initialize
    super
    DSPy.configure { |c| c.lm = MyApp::POWERFUL_LM }
    @predictor = DSPy::ChainOfThought.new(ComplexSignature)
  end
end

# ============================================================================
# Configuration with Observability (OpenTelemetry)
# ============================================================================

require 'opentelemetry/sdk'

# Configure OpenTelemetry
OpenTelemetry::SDK.configure do |c|
  c.service_name = 'my-dspy-app'
  c.use_all
end

# Configure DSPy (automatically integrates with OpenTelemetry)
DSPy.configure do |c|
  c.lm = DSPy::LM.new('openai/gpt-4o-mini',
    api_key: ENV['OPENAI_API_KEY'])
end

# ============================================================================
# Configuration with Langfuse Tracing
# ============================================================================

require 'dspy/langfuse'

DSPy.configure do |c|
  c.lm = DSPy::LM.new('openai/gpt-4o-mini',
    api_key: ENV['OPENAI_API_KEY'])

  # Enable Langfuse tracing
  c.langfuse = {
    public_key: ENV['LANGFUSE_PUBLIC_KEY'],
    secret_key: ENV['LANGFUSE_SECRET_KEY'],
    host: ENV['LANGFUSE_HOST'] || 'https://cloud.langfuse.com'
  }
end

# ============================================================================
# Configuration with Retry Logic
# ============================================================================

class RetryableConfig
  MAX_RETRIES = 3

  def self.configure
    DSPy.configure do |c|
      c.lm = create_lm_with_retry
    end
  end

  def self.create_lm_with_retry
    lm = DSPy::LM.new('openai/gpt-4o-mini',
      api_key: ENV['OPENAI_API_KEY'])

    # Wrap with retry logic
    lm.extend(RetryBehavior)
    lm
  end

  module RetryBehavior
    def forward(input, retry_count: 0)
      super(input)
    rescue RateLimitError, TimeoutError => e
      if retry_count < MAX_RETRIES
        sleep(2 ** retry_count)  # Exponential backoff
        forward(input, retry_count: retry_count + 1)
      else
        raise
      end
    end
  end
end

RetryableConfig.configure

# ============================================================================
# Configuration with Fallback Models
# ============================================================================

class FallbackConfig
  def self.configure
    DSPy.configure do |c|
      c.lm = create_lm_with_fallback
    end
  end

  def self.create_lm_with_fallback
    primary = DSPy::LM.new('anthropic/claude-3-5-sonnet-20241022',
      api_key: ENV['ANTHROPIC_API_KEY'])

    fallback = DSPy::LM.new('openai/gpt-4o',
      api_key: ENV['OPENAI_API_KEY'])

    FallbackLM.new(primary, fallback)
  end

  class FallbackLM
    def initialize(primary, fallback)
      @primary = primary
      @fallback = fallback
    end

    def forward(input)
      @primary.forward(input)
    rescue => e
      puts "Primary model failed: #{e.message}. Falling back..."
      @fallback.forward(input)
    end
  end
end

FallbackConfig.configure

# ============================================================================
# Configuration with Budget Tracking
# ============================================================================

class BudgetTrackedConfig
  def self.configure(monthly_budget_usd:)
    DSPy.configure do |c|
      c.lm = BudgetTracker.new(
        DSPy::LM.new('openai/gpt-4o',
          api_key: ENV['OPENAI_API_KEY']),
        monthly_budget_usd: monthly_budget_usd
      )
    end
  end

  class BudgetTracker
    def initialize(lm, monthly_budget_usd:)
      @lm = lm
      @monthly_budget_usd = monthly_budget_usd
      @monthly_cost = 0.0
    end

    def forward(input)
      result = @lm.forward(input)

      # Track cost (simplified - actual costs vary by model)
      tokens = result.metadata[:usage][:total_tokens]
      cost = estimate_cost(tokens)
      @monthly_cost += cost

      if @monthly_cost > @monthly_budget_usd
        raise "Monthly budget of $#{@monthly_budget_usd} exceeded!"
      end

      result
    end

    private

    def estimate_cost(tokens)
      # Simplified cost estimation (check provider pricing)
      (tokens / 1_000_000.0) * 5.0  # $5 per 1M tokens
    end
  end
end

BudgetTrackedConfig.configure(monthly_budget_usd: 100)

# ============================================================================
# Configuration Initializer for Rails
# ============================================================================

# Save this as config/initializers/dspy.rb
#
# require 'dspy'
#
# DSPy.configure do |c|
#   # Environment-specific configuration
#   model_config = case Rails.env.to_sym
#   when :development
#     { provider: 'ollama', model: 'llama3.1' }
#   when :test
#     { provider: 'openai', model: 'gpt-4o-mini', temperature: 0.0 }
#   when :production
#     { provider: 'anthropic', model: 'claude-3-5-sonnet-20241022' }
#   end
#
#   # Configure language model
#   c.lm = DSPy::LM.new(
#     "#{model_config[:provider]}/#{model_config[:model]}",
#     api_key: ENV["#{model_config[:provider].upcase}_API_KEY"],
#     **model_config.except(:provider, :model)
#   )
#
#   # Optional: Add observability
#   if Rails.env.production?
#     c.langfuse = {
#       public_key: ENV['LANGFUSE_PUBLIC_KEY'],
#       secret_key: ENV['LANGFUSE_SECRET_KEY']
#     }
#   end
# end

# ============================================================================
# Testing Configuration
# ============================================================================

# In spec/spec_helper.rb or test/test_helper.rb
#
# RSpec.configure do |config|
#   config.before(:suite) do
#     DSPy.configure do |c|
#       c.lm = DSPy::LM.new('openai/gpt-4o-mini',
#         api_key: ENV['OPENAI_API_KEY'],
#         temperature: 0.0  # Deterministic for testing
#       )
#     end
#   end
# end

# ============================================================================
# Configuration Best Practices
# ============================================================================

# 1. Use environment variables for API keys (never hardcode)
# 2. Use different models for different environments
# 3. Use cheaper/faster models for development and testing
# 4. Configure temperature based on use case:
#    - 0.0-0.3: Deterministic, factual tasks
#    - 0.7-1.0: Balanced creativity
#    - 1.0-2.0: High creativity, content generation
# 5. Add observability in production (OpenTelemetry, Langfuse)
# 6. Implement retry logic and fallbacks for reliability
# 7. Track costs and set budgets for production
# 8. Use max_tokens to control response length and costs
