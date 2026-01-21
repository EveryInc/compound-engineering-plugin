# DSPy.rb Core Concepts

## Philosophy

DSPy.rb enables developers to **program LLMs, not prompt them**. Instead of manually crafting prompts, define application requirements through code using type-safe, composable modules.

## Signatures

Signatures define type-safe input/output contracts for LLM operations. They specify what data goes in and what data comes out, with runtime type checking.

### Basic Signature Structure

```ruby
class TaskSignature < DSPy::Signature
  description "Brief description of what this signature does"

  input do
    const :field_name, String, desc: "Description of this input field"
    const :another_field, Integer, desc: "Another input field"
  end

  output do
    const :result_field, String, desc: "Description of the output"
    const :confidence, Float, desc: "Confidence score (0.0-1.0)"
  end
end
```

### Type Safety

Signatures support Sorbet types including:
- `String` - Text data
- `Integer`, `Float` - Numeric data
- `T::Boolean` - Boolean values
- `T::Array[Type]` - Arrays of specific types
- Custom enums and classes

### Field Descriptions

Always provide clear field descriptions using the `desc:` parameter. These descriptions:
- Guide the LLM on expected input/output format
- Serve as documentation for developers
- Improve prediction accuracy

## Modules

Modules are composable building blocks that use signatures to perform LLM operations. They can be chained together to create complex workflows.

### Basic Module Structure

```ruby
class MyModule < DSPy::Module
  def initialize
    super
    @predictor = DSPy::Predict.new(MySignature)
  end

  def forward(input_hash)
    @predictor.forward(input_hash)
  end
end
```

### Module Composition

Modules can call other modules to create pipelines:

```ruby
class ComplexWorkflow < DSPy::Module
  def initialize
    super
    @step1 = FirstModule.new
    @step2 = SecondModule.new
  end

  def forward(input)
    result1 = @step1.forward(input)
    result2 = @step2.forward(result1)
    result2
  end
end
```

## Predictors

Predictors are the core execution engines that take signatures and perform LLM inference. DSPy.rb provides several predictor types.

### Predict

Basic LLM inference with type-safe inputs and outputs.

```ruby
predictor = DSPy::Predict.new(TaskSignature)
result = predictor.forward(field_name: "value", another_field: 42)
# Returns: { result_field: "...", confidence: 0.85 }
```

### ChainOfThought

Automatically adds a reasoning field to the output, improving accuracy for complex tasks.

```ruby
class EmailClassificationSignature < DSPy::Signature
  description "Classify customer support emails"

  input do
    const :email_subject, String
    const :email_body, String
  end

  output do
    const :category, String  # "Technical", "Billing", or "General"
    const :priority, String  # "High", "Medium", or "Low"
  end
end

predictor = DSPy::ChainOfThought.new(EmailClassificationSignature)
result = predictor.forward(
  email_subject: "Can't log in to my account",
  email_body: "I've been trying to access my account for hours..."
)
# Returns: {
#   reasoning: "This appears to be a technical issue...",
#   category: "Technical",
#   priority: "High"
# }
```

### ReAct

Tool-using agents with iterative reasoning. Enables autonomous problem-solving by allowing the LLM to use external tools.

```ruby
class SearchTool < DSPy::Tool
  def call(query:)
    # Perform search and return results
    { results: search_database(query) }
  end
end

predictor = DSPy::ReAct.new(
  TaskSignature,
  tools: [SearchTool.new],
  max_iterations: 5
)
```

### CodeAct

Dynamic code generation for solving problems programmatically. Requires the optional `dspy-code_act` gem.

```ruby
predictor = DSPy::CodeAct.new(TaskSignature)
result = predictor.forward(task: "Calculate the factorial of 5")
# The LLM generates and executes Ruby code to solve the task
```

## Multimodal Support

DSPy.rb supports vision capabilities across compatible models using the unified `DSPy::Image` interface.

```ruby
class VisionSignature < DSPy::Signature
  description "Describe what's in an image"

  input do
    const :image, DSPy::Image
    const :question, String
  end

  output do
    const :description, String
  end
end

predictor = DSPy::Predict.new(VisionSignature)
result = predictor.forward(
  image: DSPy::Image.from_file("path/to/image.jpg"),
  question: "What objects are visible in this image?"
)
```

### Image Input Methods

```ruby
# From file path
DSPy::Image.from_file("path/to/image.jpg")

# From URL (OpenAI only)
DSPy::Image.from_url("https://example.com/image.jpg")

# From base64-encoded data
DSPy::Image.from_base64(base64_string, mime_type: "image/jpeg")
```

## Best Practices

### 1. Clear Signature Descriptions

Always provide clear, specific descriptions for signatures and fields:

```ruby
# Good
description "Classify customer support emails into Technical, Billing, or General categories"

# Avoid
description "Classify emails"
```

### 2. Type Safety

Use specific types rather than generic String when possible:

```ruby
# Good - Use enums for constrained outputs
output do
  const :category, T.enum(["Technical", "Billing", "General"])
end

# Less ideal - Generic string
output do
  const :category, String, desc: "Must be Technical, Billing, or General"
end
```

### 3. Composable Architecture

Build complex workflows from simple, reusable modules:

```ruby
class EmailPipeline < DSPy::Module
  def initialize
    super
    @classifier = EmailClassifier.new
    @prioritizer = EmailPrioritizer.new
    @responder = EmailResponder.new
  end

  def forward(email)
    classification = @classifier.forward(email)
    priority = @prioritizer.forward(classification)
    @responder.forward(classification.merge(priority))
  end
end
```

### 4. Error Handling

Always handle potential type validation errors:

```ruby
begin
  result = predictor.forward(input_data)
rescue DSPy::ValidationError => e
  # Handle validation error
  logger.error "Invalid output from LLM: #{e.message}"
end
```

## Limitations

Current constraints to be aware of:
- No streaming support (single-request processing only)
- Limited multimodal support through Ollama for local deployments
- Vision capabilities vary by provider (see providers.md for compatibility matrix)
