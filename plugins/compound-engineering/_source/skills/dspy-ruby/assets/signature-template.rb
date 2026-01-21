# frozen_string_literal: true

# Example DSPy Signature Template
# This template demonstrates best practices for creating type-safe signatures

class ExampleSignature < DSPy::Signature
  # Clear, specific description of what this signature does
  # Good: "Classify customer support emails into Technical, Billing, or General categories"
  # Avoid: "Classify emails"
  description "Describe what this signature accomplishes and what output it produces"

  # Input fields: Define what data the LLM receives
  input do
    # Basic field with description
    const :field_name, String, desc: "Clear description of this input field"

    # Numeric fields
    const :count, Integer, desc: "Number of items to process"
    const :score, Float, desc: "Confidence score between 0.0 and 1.0"

    # Boolean fields
    const :is_active, T::Boolean, desc: "Whether the item is currently active"

    # Array fields
    const :tags, T::Array[String], desc: "List of tags associated with the item"

    # Optional: Enum for constrained values
    const :priority, T.enum(["Low", "Medium", "High"]), desc: "Priority level"
  end

  # Output fields: Define what data the LLM produces
  output do
    # Primary output
    const :result, String, desc: "The main result of the operation"

    # Classification result with enum
    const :category, T.enum(["Technical", "Billing", "General"]),
      desc: "Category classification - must be one of: Technical, Billing, General"

    # Confidence/metadata
    const :confidence, Float, desc: "Confidence score (0.0-1.0) for this classification"

    # Optional reasoning (automatically added by ChainOfThought)
    # const :reasoning, String, desc: "Step-by-step reasoning for the classification"
  end
end

# Example with multimodal input (vision)
class VisionExampleSignature < DSPy::Signature
  description "Analyze an image and answer questions about its content"

  input do
    const :image, DSPy::Image, desc: "The image to analyze"
    const :question, String, desc: "Question about the image content"
  end

  output do
    const :answer, String, desc: "Detailed answer to the question about the image"
    const :confidence, Float, desc: "Confidence in the answer (0.0-1.0)"
  end
end

# Example for complex analysis task
class SentimentAnalysisSignature < DSPy::Signature
  description "Analyze the sentiment of text with nuanced emotion detection"

  input do
    const :text, String, desc: "The text to analyze for sentiment"
    const :context, String, desc: "Additional context about the text source or situation"
  end

  output do
    const :sentiment, T.enum(["Positive", "Negative", "Neutral", "Mixed"]),
      desc: "Overall sentiment - must be Positive, Negative, Neutral, or Mixed"

    const :emotions, T::Array[String],
      desc: "List of specific emotions detected (e.g., joy, anger, sadness, fear)"

    const :intensity, T.enum(["Low", "Medium", "High"]),
      desc: "Intensity of the detected sentiment"

    const :confidence, Float,
      desc: "Confidence in the sentiment classification (0.0-1.0)"
  end
end

# Example for code generation task
class CodeGenerationSignature < DSPy::Signature
  description "Generate Ruby code based on natural language requirements"

  input do
    const :requirements, String,
      desc: "Natural language description of what the code should do"

    const :constraints, String,
      desc: "Any specific requirements or constraints (e.g., libraries to use, style preferences)"
  end

  output do
    const :code, String,
      desc: "Complete, working Ruby code that fulfills the requirements"

    const :explanation, String,
      desc: "Brief explanation of how the code works and any important design decisions"

    const :dependencies, T::Array[String],
      desc: "List of required gems or dependencies"
  end
end

# Usage Examples:
#
# Basic usage with Predict:
#   predictor = DSPy::Predict.new(ExampleSignature)
#   result = predictor.forward(
#     field_name: "example value",
#     count: 5,
#     score: 0.85,
#     is_active: true,
#     tags: ["tag1", "tag2"],
#     priority: "High"
#   )
#   puts result[:result]
#   puts result[:category]
#   puts result[:confidence]
#
# With Chain of Thought reasoning:
#   predictor = DSPy::ChainOfThought.new(SentimentAnalysisSignature)
#   result = predictor.forward(
#     text: "I absolutely love this product! It exceeded all my expectations.",
#     context: "Product review on e-commerce site"
#   )
#   puts result[:reasoning]  # See the LLM's step-by-step thinking
#   puts result[:sentiment]
#   puts result[:emotions]
#
# With Vision:
#   predictor = DSPy::Predict.new(VisionExampleSignature)
#   result = predictor.forward(
#     image: DSPy::Image.from_file("path/to/image.jpg"),
#     question: "What objects are visible in this image?"
#   )
#   puts result[:answer]
