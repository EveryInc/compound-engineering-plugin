# DSPy.rb Testing, Optimization & Observability

## Testing

DSPy.rb enables standard RSpec testing patterns for LLM logic, making your AI applications testable and maintainable.

### Basic Testing Setup

```ruby
require 'rspec'
require 'dspy'

RSpec.describe EmailClassifier do
  before do
    DSPy.configure do |c|
      c.lm = DSPy::LM.new('openai/gpt-4o-mini', api_key: ENV['OPENAI_API_KEY'])
    end
  end

  describe '#classify' do
    it 'classifies technical support emails correctly' do
      classifier = EmailClassifier.new
      result = classifier.forward(
        email_subject: "Can't log in",
        email_body: "I'm unable to access my account"
      )

      expect(result[:category]).to eq('Technical')
      expect(result[:priority]).to be_in(['High', 'Medium', 'Low'])
    end
  end
end
```

### Mocking LLM Responses

Test your modules without making actual API calls:

```ruby
RSpec.describe MyModule do
  it 'handles mock responses correctly' do
    # Create a mock predictor that returns predetermined results
    mock_predictor = instance_double(DSPy::Predict)
    allow(mock_predictor).to receive(:forward).and_return({
      category: 'Technical',
      priority: 'High',
      confidence: 0.95
    })

    # Inject mock into your module
    module_instance = MyModule.new
    module_instance.instance_variable_set(:@predictor, mock_predictor)

    result = module_instance.forward(input: 'test data')
    expect(result[:category]).to eq('Technical')
  end
end
```

### Testing Type Safety

Verify that signatures enforce type constraints:

```ruby
RSpec.describe EmailClassificationSignature do
  it 'validates output types' do
    predictor = DSPy::Predict.new(EmailClassificationSignature)

    # This should work
    result = predictor.forward(
      email_subject: 'Test',
      email_body: 'Test body'
    )
    expect(result[:category]).to be_a(String)

    # Test that invalid types are caught
    expect {
      # Simulate LLM returning invalid type
      predictor.send(:validate_output, { category: 123 })
    }.to raise_error(DSPy::ValidationError)
  end
end
```

### Testing Edge Cases

Always test boundary conditions and error scenarios:

```ruby
RSpec.describe EmailClassifier do
  it 'handles empty emails' do
    classifier = EmailClassifier.new
    result = classifier.forward(
      email_subject: '',
      email_body: ''
    )
    # Define expected behavior for edge case
    expect(result[:category]).to eq('General')
  end

  it 'handles very long emails' do
    long_body = 'word ' * 10000
    classifier = EmailClassifier.new

    expect {
      classifier.forward(
        email_subject: 'Test',
        email_body: long_body
      )
    }.not_to raise_error
  end

  it 'handles special characters' do
    classifier = EmailClassifier.new
    result = classifier.forward(
      email_subject: 'Test <script>alert("xss")</script>',
      email_body: 'Body with émojis 🎉 and spëcial çharacters'
    )

    expect(result[:category]).to be_in(['Technical', 'Billing', 'General'])
  end
end
```

### Integration Testing

Test complete workflows end-to-end:

```ruby
RSpec.describe EmailProcessingPipeline do
  it 'processes email through complete pipeline' do
    pipeline = EmailProcessingPipeline.new

    result = pipeline.forward(
      email_subject: 'Billing question',
      email_body: 'How do I update my payment method?'
    )

    # Verify the complete pipeline output
    expect(result[:classification]).to eq('Billing')
    expect(result[:priority]).to eq('Medium')
    expect(result[:suggested_response]).to include('payment')
    expect(result[:assigned_team]).to eq('billing_support')
  end
end
```

### VCR for Deterministic Tests

Use VCR to record and replay API responses:

```ruby
require 'vcr'

VCR.configure do |config|
  config.cassette_library_dir = 'spec/vcr_cassettes'
  config.hook_into :webmock
  config.filter_sensitive_data('<OPENAI_API_KEY>') { ENV['OPENAI_API_KEY'] }
end

RSpec.describe EmailClassifier do
  it 'classifies emails consistently', :vcr do
    VCR.use_cassette('email_classification') do
      classifier = EmailClassifier.new
      result = classifier.forward(
        email_subject: 'Test subject',
        email_body: 'Test body'
      )

      expect(result[:category]).to eq('Technical')
    end
  end
end
```

## Optimization

DSPy.rb provides powerful optimization capabilities to automatically improve your prompts and modules.

### MIPROv2 Optimization

MIPROv2 is an advanced multi-prompt optimization technique that uses bootstrap sampling, instruction generation, and Bayesian optimization.

```ruby
require 'dspy/mipro'

# Define your module to optimize
class EmailClassifier < DSPy::Module
  def initialize
    super
    @predictor = DSPy::ChainOfThought.new(EmailClassificationSignature)
  end

  def forward(input)
    @predictor.forward(input)
  end
end

# Prepare training data
training_examples = [
  {
    input: { email_subject: "Can't log in", email_body: "Password reset not working" },
    expected_output: { category: 'Technical', priority: 'High' }
  },
  {
    input: { email_subject: "Billing question", email_body: "How much does premium cost?" },
    expected_output: { category: 'Billing', priority: 'Medium' }
  },
  # Add more examples...
]

# Define evaluation metric
def accuracy_metric(example, prediction)
  (example[:expected_output][:category] == prediction[:category]) ? 1.0 : 0.0
end

# Run optimization
optimizer = DSPy::MIPROv2.new(
  metric: method(:accuracy_metric),
  num_candidates: 10,
  num_threads: 4
)

optimized_module = optimizer.compile(
  EmailClassifier.new,
  trainset: training_examples
)

# Use optimized module
result = optimized_module.forward(
  email_subject: "New email",
  email_body: "New email content"
)
```

### Bootstrap Few-Shot Learning

Automatically generate few-shot examples from your training data:

```ruby
require 'dspy/teleprompt'

# Create a teleprompter for few-shot optimization
teleprompter = DSPy::BootstrapFewShot.new(
  metric: method(:accuracy_metric),
  max_bootstrapped_demos: 5,
  max_labeled_demos: 3
)

# Compile the optimized module
optimized = teleprompter.compile(
  MyModule.new,
  trainset: training_examples
)
```

### Custom Optimization Metrics

Define custom metrics for your specific use case:

```ruby
def custom_metric(example, prediction)
  score = 0.0

  # Category accuracy (60% weight)
  score += 0.6 if example[:expected_output][:category] == prediction[:category]

  # Priority accuracy (40% weight)
  score += 0.4 if example[:expected_output][:priority] == prediction[:priority]

  score
end

# Use in optimization
optimizer = DSPy::MIPROv2.new(
  metric: method(:custom_metric),
  num_candidates: 10
)
```

### A/B Testing Different Approaches

Compare different module implementations:

```ruby
# Approach A: ChainOfThought
class ApproachA < DSPy::Module
  def initialize
    super
    @predictor = DSPy::ChainOfThought.new(EmailClassificationSignature)
  end

  def forward(input)
    @predictor.forward(input)
  end
end

# Approach B: ReAct with tools
class ApproachB < DSPy::Module
  def initialize
    super
    @predictor = DSPy::ReAct.new(
      EmailClassificationSignature,
      tools: [KnowledgeBaseTool.new]
    )
  end

  def forward(input)
    @predictor.forward(input)
  end
end

# Evaluate both approaches
def evaluate_approach(approach_class, test_set)
  approach = approach_class.new
  scores = test_set.map do |example|
    prediction = approach.forward(example[:input])
    accuracy_metric(example, prediction)
  end
  scores.sum / scores.size
end

approach_a_score = evaluate_approach(ApproachA, test_examples)
approach_b_score = evaluate_approach(ApproachB, test_examples)

puts "Approach A accuracy: #{approach_a_score}"
puts "Approach B accuracy: #{approach_b_score}"
```

## Observability

Track your LLM application's performance, token usage, and behavior in production.

### OpenTelemetry Integration

DSPy.rb automatically integrates with OpenTelemetry when configured:

```ruby
require 'opentelemetry/sdk'
require 'dspy'

# Configure OpenTelemetry
OpenTelemetry::SDK.configure do |c|
  c.service_name = 'my-dspy-app'
  c.use_all # Use all available instrumentation
end

# DSPy automatically creates traces for predictions
predictor = DSPy::Predict.new(MySignature)
result = predictor.forward(input: 'data')
# Traces are automatically sent to your OpenTelemetry collector
```

### Langfuse Integration

Track detailed LLM execution traces with Langfuse:

```ruby
require 'dspy/langfuse'

# Configure Langfuse
DSPy.configure do |c|
  c.lm = DSPy::LM.new('openai/gpt-4o-mini', api_key: ENV['OPENAI_API_KEY'])
  c.langfuse = {
    public_key: ENV['LANGFUSE_PUBLIC_KEY'],
    secret_key: ENV['LANGFUSE_SECRET_KEY'],
    host: ENV['LANGFUSE_HOST'] || 'https://cloud.langfuse.com'
  }
end

# All predictions are automatically traced
predictor = DSPy::Predict.new(MySignature)
result = predictor.forward(input: 'data')
# View detailed traces in Langfuse dashboard
```

### Manual Token Tracking

Track token usage without external services:

```ruby
class TokenTracker
  def initialize
    @total_tokens = 0
    @request_count = 0
  end

  def track_prediction(predictor, input)
    start_time = Time.now
    result = predictor.forward(input)
    duration = Time.now - start_time

    # Get token usage from response metadata
    tokens = result.metadata[:usage][:total_tokens] rescue 0
    @total_tokens += tokens
    @request_count += 1

    puts "Request ##{@request_count}: #{tokens} tokens in #{duration}s"
    puts "Total tokens used: #{@total_tokens}"

    result
  end
end

# Usage
tracker = TokenTracker.new
predictor = DSPy::Predict.new(MySignature)

result = tracker.track_prediction(predictor, { input: 'data' })
```

### Custom Logging

Add detailed logging to your modules:

```ruby
class EmailClassifier < DSPy::Module
  def initialize
    super
    @predictor = DSPy::ChainOfThought.new(EmailClassificationSignature)
    @logger = Logger.new(STDOUT)
  end

  def forward(input)
    @logger.info "Classifying email: #{input[:email_subject]}"

    start_time = Time.now
    result = @predictor.forward(input)
    duration = Time.now - start_time

    @logger.info "Classification: #{result[:category]} (#{duration}s)"

    if result[:reasoning]
      @logger.debug "Reasoning: #{result[:reasoning]}"
    end

    result
  rescue => e
    @logger.error "Classification failed: #{e.message}"
    raise
  end
end
```

### Performance Monitoring

Monitor latency and performance metrics:

```ruby
class PerformanceMonitor
  def initialize
    @metrics = {
      total_requests: 0,
      total_duration: 0.0,
      errors: 0,
      success_count: 0
    }
  end

  def monitor_request
    start_time = Time.now
    @metrics[:total_requests] += 1

    begin
      result = yield
      @metrics[:success_count] += 1
      result
    rescue => e
      @metrics[:errors] += 1
      raise
    ensure
      duration = Time.now - start_time
      @metrics[:total_duration] += duration

      if @metrics[:total_requests] % 10 == 0
        print_stats
      end
    end
  end

  def print_stats
    avg_duration = @metrics[:total_duration] / @metrics[:total_requests]
    success_rate = @metrics[:success_count].to_f / @metrics[:total_requests]

    puts "\n=== Performance Stats ==="
    puts "Total requests: #{@metrics[:total_requests]}"
    puts "Average duration: #{avg_duration.round(3)}s"
    puts "Success rate: #{(success_rate * 100).round(2)}%"
    puts "Errors: #{@metrics[:errors]}"
    puts "========================\n"
  end
end

# Usage
monitor = PerformanceMonitor.new
predictor = DSPy::Predict.new(MySignature)

result = monitor.monitor_request do
  predictor.forward(input: 'data')
end
```

### Error Rate Tracking

Monitor and alert on error rates:

```ruby
class ErrorRateMonitor
  def initialize(alert_threshold: 0.1)
    @alert_threshold = alert_threshold
    @recent_results = []
    @window_size = 100
  end

  def track_result(success:)
    @recent_results << success
    @recent_results.shift if @recent_results.size > @window_size

    error_rate = calculate_error_rate
    alert_if_needed(error_rate)

    error_rate
  end

  private

  def calculate_error_rate
    failures = @recent_results.count(false)
    failures.to_f / @recent_results.size
  end

  def alert_if_needed(error_rate)
    if error_rate > @alert_threshold
      puts "⚠️  ALERT: Error rate #{(error_rate * 100).round(2)}% exceeds threshold!"
      # Send notification, page oncall, etc.
    end
  end
end
```

## Best Practices

### 1. Start with Tests

Write tests before optimizing:

```ruby
# Define test cases first
test_cases = [
  { input: {...}, expected: {...} },
  # More test cases...
]

# Ensure baseline functionality
test_cases.each do |tc|
  result = module.forward(tc[:input])
  assert result[:category] == tc[:expected][:category]
end

# Then optimize
optimized = optimizer.compile(module, trainset: test_cases)
```

### 2. Use Meaningful Metrics

Define metrics that align with business goals:

```ruby
def business_aligned_metric(example, prediction)
  # High-priority errors are more costly
  if example[:expected_output][:priority] == 'High'
    return prediction[:priority] == 'High' ? 1.0 : 0.0
  else
    return prediction[:category] == example[:expected_output][:category] ? 0.8 : 0.0
  end
end
```

### 3. Monitor in Production

Always track production performance:

```ruby
class ProductionModule < DSPy::Module
  def initialize
    super
    @predictor = DSPy::ChainOfThought.new(MySignature)
    @monitor = PerformanceMonitor.new
    @error_tracker = ErrorRateMonitor.new
  end

  def forward(input)
    @monitor.monitor_request do
      result = @predictor.forward(input)
      @error_tracker.track_result(success: true)
      result
    rescue => e
      @error_tracker.track_result(success: false)
      raise
    end
  end
end
```

### 4. Version Your Modules

Track which version of your module is deployed:

```ruby
class EmailClassifierV2 < DSPy::Module
  VERSION = '2.1.0'

  def initialize
    super
    @predictor = DSPy::ChainOfThought.new(EmailClassificationSignature)
  end

  def forward(input)
    result = @predictor.forward(input)
    result.merge(model_version: VERSION)
  end
end
```
