# Common Patterns Reference

## Multi-Step Analysis Pipeline

Chain multiple modules for complex workflows:

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

## Agent with Tools

Create agents that use external tools:

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

## Conditional Routing

Route to different handlers based on classification:

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

## Retry with Fallback

Handle failures with exponential backoff:

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
        raise
      end
    end
  end
end
```

## Batch Processing

Process multiple items efficiently:

```ruby
class BatchProcessor < DSPy::Module
  def initialize
    super
    @predictor = DSPy::Predict.new(ItemSignature)
  end

  def forward(items:)
    items.map do |item|
      @predictor.forward(item: item)
    end
  end
end
```

## Caching Layer

Cache expensive operations:

```ruby
class CachedModule < DSPy::Module
  def initialize
    super
    @predictor = DSPy::Predict.new(ExpensiveSignature)
    @cache = {}
  end

  def forward(input:)
    cache_key = input.hash
    return @cache[cache_key] if @cache.key?(cache_key)

    result = @predictor.forward(input: input)
    @cache[cache_key] = result
    result
  end
end
```

## Stateful Conversation

Maintain context across interactions:

```ruby
class ConversationModule < DSPy::Module
  def initialize
    super
    @predictor = DSPy::Predict.new(ConversationSignature)
    @history = []
  end

  def forward(message:)
    result = @predictor.forward(
      message: message,
      history: @history.join("\n")
    )
    @history << "User: #{message}"
    @history << "Assistant: #{result[:response]}"
    result
  end
end
```
