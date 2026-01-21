# DSPy.rb LLM Providers

## Supported Providers

DSPy.rb provides unified support across multiple LLM providers through adapter gems that automatically load when installed.

### Provider Overview

- **OpenAI**: GPT-4, GPT-4o, GPT-4o-mini, GPT-3.5-turbo
- **Anthropic**: Claude 3 family (Sonnet, Opus, Haiku), Claude 3.5 Sonnet
- **Google Gemini**: Gemini 1.5 Pro, Gemini 1.5 Flash, other versions
- **Ollama**: Local model support via OpenAI compatibility layer
- **OpenRouter**: Unified multi-provider API for 200+ models

## Configuration

### Basic Setup

```ruby
require 'dspy'

DSPy.configure do |c|
  c.lm = DSPy::LM.new('provider/model-name', api_key: ENV['API_KEY'])
end
```

### OpenAI Configuration

**Required gem**: `dspy-openai`

```ruby
DSPy.configure do |c|
  # GPT-4o Mini (recommended for development)
  c.lm = DSPy::LM.new('openai/gpt-4o-mini', api_key: ENV['OPENAI_API_KEY'])

  # GPT-4o (more capable)
  c.lm = DSPy::LM.new('openai/gpt-4o', api_key: ENV['OPENAI_API_KEY'])

  # GPT-4 Turbo
  c.lm = DSPy::LM.new('openai/gpt-4-turbo', api_key: ENV['OPENAI_API_KEY'])
end
```

**Environment variable**: `OPENAI_API_KEY`

### Anthropic Configuration

**Required gem**: `dspy-anthropic`

```ruby
DSPy.configure do |c|
  # Claude 3.5 Sonnet (latest, most capable)
  c.lm = DSPy::LM.new('anthropic/claude-3-5-sonnet-20241022',
    api_key: ENV['ANTHROPIC_API_KEY'])

  # Claude 3 Opus (most capable in Claude 3 family)
  c.lm = DSPy::LM.new('anthropic/claude-3-opus-20240229',
    api_key: ENV['ANTHROPIC_API_KEY'])

  # Claude 3 Sonnet (balanced)
  c.lm = DSPy::LM.new('anthropic/claude-3-sonnet-20240229',
    api_key: ENV['ANTHROPIC_API_KEY'])

  # Claude 3 Haiku (fast, cost-effective)
  c.lm = DSPy::LM.new('anthropic/claude-3-haiku-20240307',
    api_key: ENV['ANTHROPIC_API_KEY'])
end
```

**Environment variable**: `ANTHROPIC_API_KEY`

### Google Gemini Configuration

**Required gem**: `dspy-gemini`

```ruby
DSPy.configure do |c|
  # Gemini 1.5 Pro (most capable)
  c.lm = DSPy::LM.new('gemini/gemini-1.5-pro',
    api_key: ENV['GOOGLE_API_KEY'])

  # Gemini 1.5 Flash (faster, cost-effective)
  c.lm = DSPy::LM.new('gemini/gemini-1.5-flash',
    api_key: ENV['GOOGLE_API_KEY'])
end
```

**Environment variable**: `GOOGLE_API_KEY` or `GEMINI_API_KEY`

### Ollama Configuration

**Required gem**: None (uses OpenAI compatibility layer)

```ruby
DSPy.configure do |c|
  # Local Ollama instance
  c.lm = DSPy::LM.new('ollama/llama3.1',
    base_url: 'http://localhost:11434')

  # Other Ollama models
  c.lm = DSPy::LM.new('ollama/mistral')
  c.lm = DSPy::LM.new('ollama/codellama')
end
```

**Note**: Ensure Ollama is running locally: `ollama serve`

### OpenRouter Configuration

**Required gem**: `dspy-openai` (uses OpenAI adapter)

```ruby
DSPy.configure do |c|
  # Access 200+ models through OpenRouter
  c.lm = DSPy::LM.new('openrouter/anthropic/claude-3.5-sonnet',
    api_key: ENV['OPENROUTER_API_KEY'],
    base_url: 'https://openrouter.ai/api/v1')

  # Other examples
  c.lm = DSPy::LM.new('openrouter/google/gemini-pro')
  c.lm = DSPy::LM.new('openrouter/meta-llama/llama-3.1-70b-instruct')
end
```

**Environment variable**: `OPENROUTER_API_KEY`

## Provider Compatibility Matrix

### Feature Support

| Feature | OpenAI | Anthropic | Gemini | Ollama |
|---------|--------|-----------|--------|--------|
| Structured Output | ✅ | ✅ | ✅ | ✅ |
| Vision (Images) | ✅ | ✅ | ✅ | ⚠️ Limited |
| Image URLs | ✅ | ❌ | ❌ | ❌ |
| Tool Calling | ✅ | ✅ | ✅ | Varies |
| Streaming | ❌ | ❌ | ❌ | ❌ |
| Function Calling | ✅ | ✅ | ✅ | Varies |

**Legend**: ✅ Full support | ⚠️ Partial support | ❌ Not supported

### Vision Capabilities

**Image URLs**: Only OpenAI supports direct URL references. For other providers, load images as base64 or from files.

```ruby
# OpenAI - supports URLs
DSPy::Image.from_url("https://example.com/image.jpg")

# Anthropic, Gemini - use file or base64
DSPy::Image.from_file("path/to/image.jpg")
DSPy::Image.from_base64(base64_data, mime_type: "image/jpeg")
```

**Ollama**: Limited multimodal functionality. Check specific model capabilities.

## Advanced Configuration

### Custom Parameters

Pass provider-specific parameters during configuration:

```ruby
DSPy.configure do |c|
  c.lm = DSPy::LM.new('openai/gpt-4o',
    api_key: ENV['OPENAI_API_KEY'],
    temperature: 0.7,
    max_tokens: 2000,
    top_p: 0.9
  )
end
```

### Multiple Providers

Use different models for different tasks:

```ruby
# Fast model for simple tasks
fast_lm = DSPy::LM.new('openai/gpt-4o-mini', api_key: ENV['OPENAI_API_KEY'])

# Powerful model for complex tasks
powerful_lm = DSPy::LM.new('anthropic/claude-3-5-sonnet-20241022',
  api_key: ENV['ANTHROPIC_API_KEY'])

# Use different models in different modules
class SimpleClassifier < DSPy::Module
  def initialize
    super
    DSPy.configure { |c| c.lm = fast_lm }
    @predictor = DSPy::Predict.new(SimpleSignature)
  end
end

class ComplexAnalyzer < DSPy::Module
  def initialize
    super
    DSPy.configure { |c| c.lm = powerful_lm }
    @predictor = DSPy::ChainOfThought.new(ComplexSignature)
  end
end
```

### Per-Request Configuration

Override configuration for specific predictions:

```ruby
predictor = DSPy::Predict.new(MySignature)

# Use default configuration
result1 = predictor.forward(input: "data")

# Override temperature for this request
result2 = predictor.forward(
  input: "data",
  config: { temperature: 0.2 }  # More deterministic
)
```

## Cost Optimization

### Model Selection Strategy

1. **Development**: Use cheaper, faster models (gpt-4o-mini, claude-3-haiku, gemini-1.5-flash)
2. **Production Simple Tasks**: Continue with cheaper models if quality is sufficient
3. **Production Complex Tasks**: Upgrade to more capable models (gpt-4o, claude-3.5-sonnet, gemini-1.5-pro)
4. **Local Development**: Use Ollama for privacy and zero API costs

### Example Cost-Conscious Setup

```ruby
# Development environment
if Rails.env.development?
  DSPy.configure do |c|
    c.lm = DSPy::LM.new('ollama/llama3.1')  # Free, local
  end
elsif Rails.env.test?
  DSPy.configure do |c|
    c.lm = DSPy::LM.new('openai/gpt-4o-mini',  # Cheap for testing
      api_key: ENV['OPENAI_API_KEY'])
  end
else  # production
  DSPy.configure do |c|
    c.lm = DSPy::LM.new('anthropic/claude-3-5-sonnet-20241022',
      api_key: ENV['ANTHROPIC_API_KEY'])
  end
end
```

## Provider-Specific Best Practices

### OpenAI

- Use `gpt-4o-mini` for development and simple tasks
- Use `gpt-4o` for production complex tasks
- Best vision support including URL loading
- Excellent function calling capabilities

### Anthropic

- Claude 3.5 Sonnet is currently the most capable model
- Excellent for complex reasoning and analysis
- Strong safety features and helpful outputs
- Requires base64 for images (no URL support)

### Google Gemini

- Gemini 1.5 Pro for complex tasks, Flash for speed
- Strong multimodal capabilities
- Good balance of cost and performance
- Requires base64 for images

### Ollama

- Best for privacy-sensitive applications
- Zero API costs
- Requires local hardware resources
- Limited multimodal support depending on model
- Good for development and testing

## Troubleshooting

### API Key Issues

```ruby
# Verify API key is set
if ENV['OPENAI_API_KEY'].nil?
  raise "OPENAI_API_KEY environment variable not set"
end

# Test connection
begin
  DSPy.configure { |c| c.lm = DSPy::LM.new('openai/gpt-4o-mini',
    api_key: ENV['OPENAI_API_KEY']) }
  predictor = DSPy::Predict.new(TestSignature)
  predictor.forward(test: "data")
  puts "✅ Connection successful"
rescue => e
  puts "❌ Connection failed: #{e.message}"
end
```

### Rate Limiting

Handle rate limits gracefully:

```ruby
def call_with_retry(predictor, input, max_retries: 3)
  retries = 0
  begin
    predictor.forward(input)
  rescue RateLimitError => e
    retries += 1
    if retries < max_retries
      sleep(2 ** retries)  # Exponential backoff
      retry
    else
      raise
    end
  end
end
```

### Model Not Found

Ensure the correct gem is installed:

```bash
# For OpenAI
gem install dspy-openai

# For Anthropic
gem install dspy-anthropic

# For Gemini
gem install dspy-gemini
```
