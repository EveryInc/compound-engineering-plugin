---
name: dspy-ruby
description: This skill should be used when working with DSPy.rb for building type-safe LLM applications in Ruby. Triggers on "DSPy", "DSPy.rb", "LLM in Ruby", "Ruby AI", "type-safe LLM", "Ruby language model", or requests to create signatures, modules, agents, or integrate OpenAI/Anthropic/Gemini/Ollama in Ruby applications.
license: MIT
allowed-tools:
  - Bash
  - Read
  - Write
  - Edit
metadata:
  version: "1.1.0"
  category: ruby
  tags: [llm, ai, dspy, type-safe, ruby, agents]
---

# DSPy.rb Expert

## Contents

- [Overview](#overview)
- [Core Capabilities](#core-capabilities)
- [Quick Start Workflow](#quick-start-workflow)
- [Implementation Checklist](#implementation-checklist)
- [References](#references)

## Overview

DSPy.rb is a Ruby framework that enables developers to **program LLMs, not prompt them**. Instead of manually crafting prompts, define application requirements through type-safe, composable modules that can be tested, optimized, and version-controlled like regular code.

**Capabilities:**
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

**Templates**: See [signature-template.rb](./assets/signature-template.rb) for comprehensive examples including vision signatures, sentiment analysis, and code generation.

**Full documentation**: See [core-concepts.md](./references/core-concepts.md) sections on Signatures and Type Safety.

### 2. Composable Modules

Build reusable, chainable modules that encapsulate LLM operations.

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

**Templates**: See [module-template.rb](./assets/module-template.rb) for multi-step pipelines, conditional logic, error handling, and caching patterns.

**Full documentation**: See [core-concepts.md](./references/core-concepts.md) sections on Modules and Module Composition.

### 3. Multiple Predictor Types

Choose the right predictor for the task:

| Predictor | Use Case | Example |
|-----------|----------|---------|
| **Predict** | Simple tasks, classification, extraction | `DSPy::Predict.new(Sig)` |
| **ChainOfThought** | Complex reasoning, analysis | `DSPy::ChainOfThought.new(Sig)` |
| **ReAct** | Tasks requiring external tools | `DSPy::ReAct.new(Sig, tools: [...])` |
| **CodeAct** | Tasks best solved with generated code | `DSPy::CodeAct.new(Sig)` |

**Full documentation**: See [core-concepts.md](./references/core-concepts.md) section on Predictors.

### 4. LLM Provider Configuration

Support for OpenAI, Anthropic Claude, Google Gemini, Ollama, and OpenRouter.

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

# Local Ollama (free, private)
DSPy.configure do |c|
  c.lm = DSPy::LM.new('ollama/llama3.1')
end
```

**Provider compatibility matrix**:

| Feature | OpenAI | Anthropic | Gemini | Ollama |
|---------|--------|-----------|--------|--------|
| Structured Output | ✅ | ✅ | ✅ | ✅ |
| Vision (Images) | ✅ | ✅ | ✅ | ⚠️ Limited |
| Tool Calling | ✅ | ✅ | ✅ | Varies |

**Templates**: See [config-template.rb](./assets/config-template.rb) for environment-based configuration, multi-model setups, and observability.

**Full documentation**: See [providers.md](./references/providers.md) for all configuration options and troubleshooting.

### 5. Multimodal & Vision Support

Process images alongside text using the unified `DSPy::Image` interface.

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

**Full documentation**: See [core-concepts.md](./references/core-concepts.md) section on Multimodal Support.

### 6. Testing LLM Applications

Write standard RSpec tests for LLM logic.

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
  end
end
```

**Full documentation**: See [optimization.md](./references/optimization.md) section on Testing.

### 7. Optimization & Observability

Automatically improve prompts and track performance in production.

**MIPROv2 optimization**:
```ruby
require 'dspy/mipro'

optimizer = DSPy::MIPROv2.new(
  metric: method(:accuracy_metric),
  num_candidates: 10
)

optimized_module = optimizer.compile(
  EmailClassifier.new,
  trainset: training_examples
)
```

**OpenTelemetry/Langfuse integration** for production monitoring.

**Full documentation**: See [optimization.md](./references/optimization.md) for optimization techniques and observability setup.

## Quick Start Workflow

### For New Projects

1. **Install DSPy.rb and provider gems**:
```bash
gem install dspy dspy-openai  # or dspy-anthropic, dspy-gemini
```

2. **Configure LLM provider** (see [config-template.rb](./assets/config-template.rb)):
```ruby
require 'dspy'

DSPy.configure do |c|
  c.lm = DSPy::LM.new('openai/gpt-4o-mini',
    api_key: ENV['OPENAI_API_KEY'])
end
```

3. **Create a signature** (see [signature-template.rb](./assets/signature-template.rb)):
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

4. **Create a module** (see [module-template.rb](./assets/module-template.rb)):
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
result = MyModule.new.forward(input_field: "test")
puts result[:output_field]
```

### For Rails Applications

1. Add to Gemfile: `gem 'dspy'` and `gem 'dspy-openai'`
2. Create initializer at `config/initializers/dspy.rb`
3. Create modules in `app/llm/` directory
4. Use in controllers/services

## Implementation Checklist

When implementing DSPy.rb features:

- [ ] **Signature defined** with clear description and typed fields
- [ ] **Module created** extending `DSPy::Module` with `forward` method
- [ ] **Provider configured** with appropriate API key
- [ ] **Error handling** for LLM failures and validation errors
- [ ] **Tests written** covering expected outputs and edge cases
- [ ] **Cost optimization** considered (use cheaper models for development)
- [ ] **Observability** added for production (OpenTelemetry or Langfuse)

## References

### Reference Documentation

| File | Purpose |
|------|---------|
| [core-concepts.md](./references/core-concepts.md) | Signatures, modules, predictors, multimodal support |
| [providers.md](./references/providers.md) | LLM provider configurations, compatibility, troubleshooting |
| [optimization.md](./references/optimization.md) | Testing patterns, optimization, observability |
| [common-patterns.md](./references/common-patterns.md) | Multi-step pipelines, agents, routing, retry logic |

### Assets (Templates)

| File | Purpose |
|------|---------|
| [signature-template.rb](./assets/signature-template.rb) | Signature examples: basic, vision, sentiment, code generation |
| [module-template.rb](./assets/module-template.rb) | Module patterns: pipelines, agents, caching, state management |
| [config-template.rb](./assets/config-template.rb) | Configuration for all providers, environments, production |
