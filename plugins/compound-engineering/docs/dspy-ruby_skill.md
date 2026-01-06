# DSPy.rb Expert Skill

Build type-safe, composable LLM applications in Ruby using the DSPy.rb framework.

## What This Skill Does

This skill provides comprehensive guidance for building LLM-powered applications in Ruby:

- **Type-safe signatures** - Define input/output contracts with runtime type checking
- **Composable modules** - Build reusable, chainable LLM operations
- **Multiple predictors** - Choose Predict, ChainOfThought, ReAct, or CodeAct
- **Provider support** - Configure OpenAI, Anthropic, Gemini, or Ollama
- **Vision capabilities** - Process images alongside text
- **Testing patterns** - Write RSpec tests for LLM functionality

## Common Workflows

### 1. Create a Type-Safe Signature
Define an LLM task with typed inputs and outputs.

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

### 2. Build a Composable Module
Create reusable LLM operations that can be chained together.

```ruby
class EmailProcessor < DSPy::Module
  def initialize
    super
    @classifier = DSPy::Predict.new(EmailClassificationSignature)
  end

  def forward(email_subject:, email_body:)
    @classifier.forward(email_subject: email_subject, email_body: email_body)
  end
end
```

### 3. Configure LLM Providers
Set up OpenAI, Anthropic, or local Ollama.

```ruby
DSPy.configure do |c|
  c.lm = DSPy::LM.new('anthropic/claude-3-5-sonnet-20241022',
    api_key: ENV['ANTHROPIC_API_KEY'])
end
```

### 4. Process Images with Vision
Analyze images using multimodal capabilities.

```ruby
result = predictor.forward(
  image: DSPy::Image.from_file("path/to/image.jpg"),
  question: "What objects are visible?"
)
```

### 5. Test LLM Applications
Write RSpec tests for LLM-powered features.

```ruby
RSpec.describe EmailClassifier do
  it 'classifies technical emails correctly' do
    result = classifier.forward(email_subject: "Can't log in", email_body: "Unable to access")
    expect(result[:category]).to eq('Technical')
  end
end
```

## Agent Skill Standard

This skill follows the [Agent Skill Standard](https://agentskills.io/), an open standard for portable AI coding agent skills. This means it works across 14+ AI coding agents including:

- Claude Code
- OpenAI Codex
- OpenCode
- Cursor
- Gemini CLI
- GitHub Copilot CLI
- Windsurf
- And more...

## Installing with Skilz (Universal Installer)

The recommended way to install this skill across different AI coding agents is using the **skilz** universal installer.

### Install Skilz

```bash
pip install skilz
```

### Installation Options

#### Option 1: Install for Claude Code

```bash
skilz install dspy-ruby --agent claude-code
```

#### Option 2: Install for OpenCode

```bash
skilz install dspy-ruby --agent opencode
```

#### Option 3: Install for Gemini CLI

```bash
skilz install dspy-ruby --agent gemini
```

#### Option 4: Install for OpenAI Codex

```bash
skilz install dspy-ruby --agent codex
```

### Install from SkillzWave Marketplace

Visit [SkillzWave.ai](https://skillzwave.ai) to browse and install skills with one click.

## Requirements

- Ruby 3.1+
- `gem install dspy`
- API key for chosen provider (OpenAI, Anthropic, Gemini, or Ollama)

## License

MIT
