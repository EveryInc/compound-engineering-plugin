# frozen_string_literal: true

# Example DSPy Module Template
# This template demonstrates best practices for creating composable modules

# Basic module with single predictor
class BasicModule < DSPy::Module
  def initialize
    super
    # Initialize predictor with signature
    @predictor = DSPy::Predict.new(ExampleSignature)
  end

  def forward(input_hash)
    # Forward pass through the predictor
    @predictor.forward(input_hash)
  end
end

# Module with Chain of Thought reasoning
class ChainOfThoughtModule < DSPy::Module
  def initialize
    super
    # ChainOfThought automatically adds reasoning to output
    @predictor = DSPy::ChainOfThought.new(EmailClassificationSignature)
  end

  def forward(email_subject:, email_body:)
    result = @predictor.forward(
      email_subject: email_subject,
      email_body: email_body
    )

    # Result includes :reasoning field automatically
    {
      category: result[:category],
      priority: result[:priority],
      reasoning: result[:reasoning],
      confidence: calculate_confidence(result)
    }
  end

  private

  def calculate_confidence(result)
    # Add custom logic to calculate confidence
    # For example, based on reasoning length or specificity
    result[:confidence] || 0.8
  end
end

# Composable module that chains multiple steps
class MultiStepPipeline < DSPy::Module
  def initialize
    super
    # Initialize multiple predictors for different steps
    @step1 = DSPy::Predict.new(Step1Signature)
    @step2 = DSPy::ChainOfThought.new(Step2Signature)
    @step3 = DSPy::Predict.new(Step3Signature)
  end

  def forward(input)
    # Chain predictors together
    result1 = @step1.forward(input)
    result2 = @step2.forward(result1)
    result3 = @step3.forward(result2)

    # Combine results as needed
    {
      step1_output: result1,
      step2_output: result2,
      final_result: result3
    }
  end
end

# Module with conditional logic
class ConditionalModule < DSPy::Module
  def initialize
    super
    @simple_classifier = DSPy::Predict.new(SimpleClassificationSignature)
    @complex_analyzer = DSPy::ChainOfThought.new(ComplexAnalysisSignature)
  end

  def forward(text:, complexity_threshold: 100)
    # Use different predictors based on input characteristics
    if text.length < complexity_threshold
      @simple_classifier.forward(text: text)
    else
      @complex_analyzer.forward(text: text)
    end
  end
end

# Module with error handling and retry logic
class RobustModule < DSPy::Module
  MAX_RETRIES = 3

  def initialize
    super
    @predictor = DSPy::Predict.new(RobustSignature)
    @logger = Logger.new(STDOUT)
  end

  def forward(input, retry_count: 0)
    @logger.info "Processing input: #{input.inspect}"

    begin
      result = @predictor.forward(input)
      validate_result!(result)
      result
    rescue DSPy::ValidationError => e
      @logger.error "Validation error: #{e.message}"

      if retry_count < MAX_RETRIES
        @logger.info "Retrying (#{retry_count + 1}/#{MAX_RETRIES})..."
        sleep(2 ** retry_count) # Exponential backoff
        forward(input, retry_count: retry_count + 1)
      else
        @logger.error "Max retries exceeded"
        raise
      end
    end
  end

  private

  def validate_result!(result)
    # Add custom validation logic
    raise DSPy::ValidationError, "Invalid result" unless result[:category]
    raise DSPy::ValidationError, "Low confidence" if result[:confidence] && result[:confidence] < 0.5
  end
end

# Module with ReAct agent and tools
class AgentModule < DSPy::Module
  def initialize
    super

    # Define tools for the agent
    tools = [
      SearchTool.new,
      CalculatorTool.new,
      DatabaseQueryTool.new
    ]

    # ReAct provides iterative reasoning and tool usage
    @agent = DSPy::ReAct.new(
      AgentSignature,
      tools: tools,
      max_iterations: 5
    )
  end

  def forward(task:)
    # Agent will autonomously use tools to complete the task
    @agent.forward(task: task)
  end
end

# Tool definition example
class SearchTool < DSPy::Tool
  def call(query:)
    # Implement search functionality
    results = perform_search(query)
    { results: results }
  end

  private

  def perform_search(query)
    # Actual search implementation
    # Could call external API, database, etc.
    ["result1", "result2", "result3"]
  end
end

# Module with state management
class StatefulModule < DSPy::Module
  attr_reader :history

  def initialize
    super
    @predictor = DSPy::ChainOfThought.new(StatefulSignature)
    @history = []
  end

  def forward(input)
    # Process with context from history
    context = build_context_from_history
    result = @predictor.forward(
      input: input,
      context: context
    )

    # Store in history
    @history << {
      input: input,
      result: result,
      timestamp: Time.now
    }

    result
  end

  def reset!
    @history.clear
  end

  private

  def build_context_from_history
    @history.last(5).map { |h| h[:result][:summary] }.join("\n")
  end
end

# Module that uses different LLMs for different tasks
class MultiModelModule < DSPy::Module
  def initialize
    super

    # Fast, cheap model for simple classification
    @fast_predictor = create_predictor(
      'openai/gpt-4o-mini',
      SimpleClassificationSignature
    )

    # Powerful model for complex analysis
    @powerful_predictor = create_predictor(
      'anthropic/claude-3-5-sonnet-20241022',
      ComplexAnalysisSignature
    )
  end

  def forward(input, use_complex: false)
    if use_complex
      @powerful_predictor.forward(input)
    else
      @fast_predictor.forward(input)
    end
  end

  private

  def create_predictor(model, signature)
    lm = DSPy::LM.new(model, api_key: ENV["#{model.split('/').first.upcase}_API_KEY"])
    DSPy::Predict.new(signature, lm: lm)
  end
end

# Module with caching
class CachedModule < DSPy::Module
  def initialize
    super
    @predictor = DSPy::Predict.new(CachedSignature)
    @cache = {}
  end

  def forward(input)
    # Create cache key from input
    cache_key = create_cache_key(input)

    # Return cached result if available
    if @cache.key?(cache_key)
      puts "Cache hit for #{cache_key}"
      return @cache[cache_key]
    end

    # Compute and cache result
    result = @predictor.forward(input)
    @cache[cache_key] = result
    result
  end

  def clear_cache!
    @cache.clear
  end

  private

  def create_cache_key(input)
    # Create deterministic hash from input
    Digest::MD5.hexdigest(input.to_s)
  end
end

# Usage Examples:
#
# Basic usage:
#   module = BasicModule.new
#   result = module.forward(field_name: "value")
#
# Chain of Thought:
#   module = ChainOfThoughtModule.new
#   result = module.forward(
#     email_subject: "Can't log in",
#     email_body: "I'm unable to access my account"
#   )
#   puts result[:reasoning]
#
# Multi-step pipeline:
#   pipeline = MultiStepPipeline.new
#   result = pipeline.forward(input_data)
#
# With error handling:
#   module = RobustModule.new
#   begin
#     result = module.forward(input_data)
#   rescue DSPy::ValidationError => e
#     puts "Failed after retries: #{e.message}"
#   end
#
# Agent with tools:
#   agent = AgentModule.new
#   result = agent.forward(task: "Find the population of Tokyo")
#
# Stateful processing:
#   module = StatefulModule.new
#   result1 = module.forward("First input")
#   result2 = module.forward("Second input")  # Has context from first
#   module.reset!  # Clear history
#
# With caching:
#   module = CachedModule.new
#   result1 = module.forward(input)  # Computes result
#   result2 = module.forward(input)  # Returns cached result
