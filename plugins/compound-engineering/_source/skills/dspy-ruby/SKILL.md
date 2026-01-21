---
name: dspy-ruby
description: This skill should be used when working with DSPy.rb, a Ruby framework for building type-safe, composable LLM applications. Use this when implementing predictable AI features, creating LLM signatures and modules, configuring language model providers (OpenAI, Anthropic, Gemini, Ollama), building agent systems with tools, optimizing prompts, or testing LLM-powered functionality in Ruby applications.
---

# DSPy.rb Expert

## Overview

DSPy.rb is a Ruby framework that enables developers to **program LLMs, not prompt them**. Instead of manually crafting prompts, define application requirements through type-safe, composable modules that can be tested, optimized, and version-controlled like regular code.

This skill provides comprehensive guidance on:
- Creating type-safe signatures for LLM operations
- Building composable modules and workflows
- Configuring multiple LLM providers
- Implementing agents with tools
- Testing and optimizing LLM applications
- Production deployment patterns

## Core Capabilities

### 1. Type-Safe Signatures

Create input/output contracts for LLM operations with runtime type checking.

**When to use**: Defining any LLM task, from simple classification to complex analysis.

**Quick reference**:
```ruby
class EmailClassificationSignature < DSPy::Signature
  description "Classify customer support emails"

  input do
    const :email_subject, String
    const :email_body, String
  end

  output do
    const :category, T.enum(["Technical", "Billing", "General"])
    const :priority, T.enum(["Low", "Medium", "High"])
  end
end
```

**Templates**: See `assets/signature-template.rb` for comprehensive examples including:
- Basic signatures with multiple field types
- Vision signatures for multimodal tasks
- Sentiment analysis signatures
- Code generation signatures

**Best practices**:
- Always provide clear, specific descriptions
- Use enums for constrained outputs
- Include field descriptions with `desc:` parameter
- Prefer specific types over generic String when possible

**Full documentation**: See `references/core-concepts.md` sections on Signatures and Type Safety.

### 2. Composable Modules

Build reusable, chainable modules that encapsulate LLM operations.

**When to use**: Implementing any LLM-powered feature, especially complex multi-step workflows.

**Quick reference**:
```ruby
class EmailProcessor < DSPy::Module
  def initialize
    super
    @classifier = DSPy::Predict.new(EmailClassificationSignature)
  end

  def forward(email_subject:, email_body:)
    @classifier.forward(
      email_subject: email_subject,
      email_body: email_body
    )
  end
end
```

**Templates**: See `assets/module-template.rb` for comprehensive examples including:
- Basic modules with single predictors
- Multi-step pipelines that chain modules
- Modules with conditional logic
- Error handling and retry patterns
- Stateful modules with history
- Caching implementations

**Module composition**: Chain modules together to create complex workflows:
```ruby
class Pipeline < DSPy::Module
  def initialize
    super
    @step1 = Classifier.new
    @step2 = Analyzer.new
    @step3 = Responder.new
  end

  def forward(input)
    result1 = @step1.forward(input)
    result2 = @step2.forward(result1)
    @step3.forward(result2)
  end
end
```

**Full documentation**: See `references/core-concepts.md` sections on Modules and Module Composition.

### 3. Multiple Predictor Types

Choose the right predictor for your task:

**Predict**: Basic LLM inference with type-safe inputs/outputs
```ruby
predictor = DSPy::Predict.new(TaskSignature)
result = predictor.forward(input: "data")
```

**ChainOfThought**: Adds automatic reasoning for improved accuracy
```ruby
predictor = DSPy::ChainOfThought.new(TaskSignature)
result = predictor.forward(input: "data")
# Returns: { reasoning: "...", output: "..." }
```

**ReAct**: Tool-using agents with iterative reasoning
```ruby
predictor = DSPy::ReAct.new(
  TaskSignature,
  tools: [SearchTool.new, CalculatorTool.new],
  max_iterations: 5
)
```

**CodeAct**: Dynamic code generation (requires `dspy-code_act` gem)
```ruby
predictor = DSPy::CodeAct.new(TaskSignature)
result = predictor.forward(task: "Calculate factorial of 5")
```

**When to use each**:
- **Predict**: Simple tasks, classification, extraction
- **ChainOfThought**: Complex reasoning, analysis, multi-step thinking
- **ReAct**: Tasks requiring external tools (search, calculation, API calls)
- **CodeAct**: Tasks best solved with generated code

**Full documentation**: See `references/core-concepts.md` section on Predictors.

### 4. LLM Provider Configuration

Support for OpenAI, Anthropic Claude, Google Gemini, Ollama, and OpenRouter.

**Quick configuration examples**:
```ruby
# OpenAI
DSPy.configure do |c|
  c.lm = DSPy::LM.new('openai/gpt-4o-mini',
    api_key: ENV['OPENAI_API_KEY'])
end

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

# Local Ollama (free, private)
DSPy.configure do |c|
  c.lm = DSPy::LM.new('ollama/llama3.1')
end
```

**Templates**: See `assets/config-template.rb` for comprehensive examples including:
- Environment-based configuration
- Multi-model setups for different tasks
- Configuration with observability (OpenTelemetry, Langfuse)
- Retry logic and fallback strategies
- Budget tracking
- Rails initializer patterns

**Provider compatibility matrix**:

| Feature | OpenAI | Anthropic | Gemini | Ollama |
|---------|--------|-----------|--------|--------|
| Structured Output | ✅ | ✅ | ✅ | ✅ |
| Vision (Images) | ✅ | ✅ | ✅ | ⚠️ Limited |
| Image URLs | ✅ | ❌ | ❌ | ❌ |
| Tool Calling | ✅ | ✅ | ✅ | Varies |

**Cost optimization strategy**:
- Development: Ollama (free) or gpt-4o-mini (cheap)
- Testing: gpt-4o-mini with temperature=0.0
- Production simple tasks: gpt-4o-mini, claude-3-haiku, gemini-1.5-flash
- Production complex tasks: gpt-4o, claude-3-5-sonnet, gemini-1.5-pro

**Full documentation**: See `references/providers.md` for all configuration options, provider-specific features, and troubleshooting.

### 5. Multimodal & Vision Support

Process images alongside text using the unified `DSPy::Image` interface.

**Quick reference**:
```ruby
class VisionSignature < DSPy::Signature
  description "Analyze image and answer questions"

  input do
    const :image, DSPy::Image
    const :question, String
  end

  output do
    const :answer, String
  end
end

predictor = DSPy::Predict.new(VisionSignature)
result = predictor.forward(
  image: DSPy::Image.from_file("path/to/image.jpg"),
  question: "What objects are visible?"
)
```

**Image loading methods**:
```ruby
# From file
DSPy::Image.from_file("path/to/image.jpg")

# From URL (OpenAI only)
DSPy::Image.from_url("https://example.com/image.jpg")

# From base64
DSPy::Image.from_base64(base64_data, mime_type: "image/jpeg")
```

**Provider support**:
- OpenAI: Full support including URLs
- Anthropic, Gemini: Base64 or file loading only
- Ollama: Limited multimodal depending on model

**Full documentation**: See `references/core-concepts.md` section on Multimodal Support.

### 6. Testing LLM Applications

Write standard RSpec tests for LLM logic.

**Quick reference**:
```ruby
RSpec.describe EmailClassifier do
  before do
    DSPy.configure do |c|
      c.lm = DSPy::LM.new('openai/gpt-4o-mini',
        api_key: ENV['OPENAI_API_KEY'])
    end
  end

  it 'classifies technical emails correctly' do
    classifier = EmailClassifier.new
    result = classifier.forward(
      email_subject: "Can't log in",
      email_body: "Unable to access account"
    )

    expect(result[:category]).to eq('Technical')
    expect(result[:priority]).to be_in(['High', 'Medium', 'Low'])
  end
end
```

**Testing patterns**:
- Mock LLM responses for unit tests
- Use VCR for deterministic API testing
- Test type safety and validation
- Test edge cases (empty inputs, special characters, long texts)
- Integration test complete workflows

**Full documentation**: See `references/optimization.md` section on Testing.

### 7. Optimization & Improvement

Automatically improve prompts and modules using optimization techniques.

**MIPROv2 optimization**:
```ruby
require 'dspy/mipro'

# Define evaluation metric
def accuracy_metric(example, prediction)
  example[:expected_output][:category] == prediction[:category] ? 1.0 : 0.0
end

# Prepare training data
training_examples = [
  {
    input: { email_subject: "...", email_body: "..." },
    expected_output: { category: 'Technical' }
  },
  # More examples...
]

# Run optimization
optimizer = DSPy::MIPROv2.new(
  metric: method(:accuracy_metric),
  num_candidates: 10
)

optimized_module = optimizer.compile(
  EmailClassifier.new,
  trainset: training_examples
)
```

**A/B testing different approaches**:
```ruby
# Test ChainOfThought vs ReAct
approach_a_score = evaluate_approach(ChainOfThoughtModule, test_set)
approach_b_score = evaluate_approach(ReActModule, test_set)
```

**Full documentation**: See `references/optimization.md` section on Optimization.

### 8. Observability & Monitoring

Track performance, token usage, and behavior in production.

**OpenTelemetry integration**:
```ruby
require 'opentelemetry/sdk'

OpenTelemetry::SDK.configure do |c|
  c.service_name = 'my-dspy-app'
  c.use_all
end

# DSPy automatically creates traces
```

**Langfuse tracing**:
```ruby
DSPy.configure do |c|
  c.lm = DSPy::LM.new('openai/gpt-4o-mini',
    api_key: ENV['OPENAI_API_KEY'])

  c.langfuse = {
    public_key: ENV['LANGFUSE_PUBLIC_KEY'],
    secret_key: ENV['LANGFUSE_SECRET_KEY']
  }
end
```

**Custom monitoring**:
- Token tracking
- Performance monitoring
- Error rate tracking
- Custom logging

**Full documentation**: See `references/optimization.md` section on Observability.

## Quick Start Workflow

### For New Projects

1. **Install DSPy.rb and provider gems**:
```bash
gem install dspy dspy-openai  # or dspy-anthropic, dspy-gemini
```

2. **Configure LLM provider** (see `assets/config-template.rb`):
```ruby
require 'dspy'

DSPy.configure do |c|
  c.lm = DSPy::LM.new('openai/gpt-4o-mini',
    api_key: ENV['OPENAI_API_KEY'])
end
```

3. **Create a signature** (see `assets/signature-template.rb`):
```ruby
class MySignature < DSPy::Signature
  description "Clear description of task"

  input do
    const :input_field, String, desc: "Description"
  end

  output do
    const :output_field, String, desc: "Description"
  end
end
```

4. **Create a module** (see `assets/module-template.rb`):
```ruby
class MyModule < DSPy::Module
  def initialize
    super
    @predictor = DSPy::Predict.new(MySignature)
  end

  def forward(input_field:)
    @predictor.forward(input_field: input_field)
  end
end
```

5. **Use the module**:
```ruby
module_instance = MyModule.new
result = module_instance.forward(input_field: "test")
puts result[:output_field]
```

6. **Add tests** (see `references/optimization.md`):
```ruby
RSpec.describe MyModule do
  it 'produces expected output' do
    result = MyModule.new.forward(input_field: "test")
    expect(result[:output_field]).to be_a(String)
  end
end
```

### For Rails Applications

1. **Add to Gemfile**:
```ruby
gem 'dspy'
gem 'dspy-openai'  # or other provider
```

2. **Create initializer** at `config/initializers/dspy.rb` (see `assets/config-template.rb` for full example):
```ruby
require 'dspy'

DSPy.configure do |c|
  c.lm = DSPy::LM.new('openai/gpt-4o-mini',
    api_key: ENV['OPENAI_API_KEY'])
end
```

3. **Create modules in** `app/llm/` directory:
```ruby
# app/llm/email_classifier.rb
class EmailClassifier < DSPy::Module
  # Implementation here
end
```

4. **Use in controllers/services**:
```ruby
class EmailsController < ApplicationController
  def classify
    classifier = EmailClassifier.new
    result = classifier.forward(
      email_subject: params[:subject],
      email_body: params[:body]
    )
    render json: result
  end
end
```

## Common Patterns

### Pattern: Multi-Step Analysis Pipeline

```ruby
class AnalysisPipeline < DSPy::Module
  def initialize
    super
    @extract = DSPy::Predict.new(ExtractSignature)
    @analyze = DSPy::ChainOfThought.new(AnalyzeSignature)
    @summarize = DSPy::Predict.new(SummarizeSignature)
  end

  def forward(text:)
    extracted = @extract.forward(text: text)
    analyzed = @analyze.forward(data: extracted[:data])
    @summarize.forward(analysis: analyzed[:result])
  end
end
```

### Pattern: Agent with Tools

```ruby
class ResearchAgent < DSPy::Module
  def initialize
    super
    @agent = DSPy::ReAct.new(
      ResearchSignature,
      tools: [
        WebSearchTool.new,
        DatabaseQueryTool.new,
        SummarizerTool.new
      ],
      max_iterations: 10
    )
  end

  def forward(question:)
    @agent.forward(question: question)
  end
end

class WebSearchTool < DSPy::Tool
  def call(query:)
    results = perform_search(query)
    { results: results }
  end
end
```

### Pattern: Conditional Routing

```ruby
class SmartRouter < DSPy::Module
  def initialize
    super
    @classifier = DSPy::Predict.new(ClassifySignature)
    @simple_handler = SimpleModule.new
    @complex_handler = ComplexModule.new
  end

  def forward(input:)
    classification = @classifier.forward(text: input)

    if classification[:complexity] == 'Simple'
      @simple_handler.forward(input: input)
    else
      @complex_handler.forward(input: input)
    end
  end
end
```

### Pattern: Retry with Fallback

```ruby
class RobustModule < DSPy::Module
  MAX_RETRIES = 3

  def forward(input, retry_count: 0)
    begin
      @predictor.forward(input)
    rescue DSPy::ValidationError => e
      if retry_count < MAX_RETRIES
        sleep(2 ** retry_count)
        forward(input, retry_count: retry_count + 1)
      else
        # Fallback to default or raise
        raise
      end
    end
  end
end
```

## Resources

This skill includes comprehensive reference materials and templates:

### References (load as needed for detailed information)

- [core-concepts.md](./references/core-concepts.md): Complete guide to signatures, modules, predictors, multimodal support, and best practices
- [providers.md](./references/providers.md): All LLM provider configurations, compatibility matrix, cost optimization, and troubleshooting
- [optimization.md](./references/optimization.md): Testing patterns, optimization techniques, observability setup, and monitoring

### Assets (templates for quick starts)

- [signature-template.rb](./assets/signature-template.rb): Examples of signatures including basic, vision, sentiment analysis, and code generation
- [module-template.rb](./assets/module-template.rb): Module patterns including pipelines, agents, error handling, caching, and state management
- [config-template.rb](./assets/config-template.rb): Configuration examples for all providers, environments, observability, and production patterns

## When to Use This Skill

Trigger this skill when:
- Implementing LLM-powered features in Ruby applications
- Creating type-safe interfaces for AI operations
- Building agent systems with tool usage
- Setting up or troubleshooting LLM providers
- Optimizing prompts and improving accuracy
- Testing LLM functionality
- Adding observability to AI applications
- Converting from manual prompt engineering to programmatic approach
- Debugging DSPy.rb code or configuration issues
