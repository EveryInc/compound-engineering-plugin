# Andrew Kane Gem Writer Skill

Write Ruby gems following Andrew Kane's proven patterns from 100+ gems with 374M+ downloads.

## What This Skill Does

This skill applies battle-tested patterns from gems like Searchkick, PgHero, and Chartkick:

- **Entry point structure** - Proper lib/gemname.rb organization
- **Class macro DSL** - The signature Kane pattern for configuration
- **Rails integration** - Safe ActiveSupport.on_load patterns
- **Zero dependencies** - Minimal runtime dependencies philosophy
- **Configuration** - Class accessor patterns, not Configuration objects
- **Testing** - Minitest-only testing patterns

## Common Workflows

### 1. Create Gem Entry Point
Structure the main gem file correctly.

```ruby
# lib/gemname.rb
require "forwardable"
require_relative "gemname/model"
require_relative "gemname/version"
require_relative "gemname/railtie" if defined?(Rails)

module GemName
  class Error < StandardError; end

  class << self
    attr_accessor :timeout, :logger
  end

  self.timeout = 10
end
```

### 2. Implement Class Macro DSL
Create the signature single-method configuration pattern.

```ruby
class Product < ApplicationRecord
  searchkick word_start: [:name]  # One method call configures everything
end
```

### 3. Add Rails Integration
Use ActiveSupport.on_load, never require Rails directly.

```ruby
ActiveSupport.on_load(:active_record) do
  extend GemName::Model
end
```

### 4. Configure Without Objects
Use class accessors instead of Configuration classes.

```ruby
module GemName
  class << self
    attr_accessor :timeout, :logger
  end
  self.timeout = 10
end
```

### 5. Write Minitest Tests
Follow the Minitest-only testing pattern.

```ruby
class ModelTest < Minitest::Test
  def test_basic_functionality
    assert_equal expected, actual
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
skilz install andrew-kane-gem-writer --agent claude-code
```

#### Option 2: Install for OpenCode

```bash
skilz install andrew-kane-gem-writer --agent opencode
```

#### Option 3: Install for Gemini CLI

```bash
skilz install andrew-kane-gem-writer --agent gemini
```

#### Option 4: Install for OpenAI Codex

```bash
skilz install andrew-kane-gem-writer --agent codex
```

### Install from SkillzWave Marketplace

Visit [SkillzWave.ai](https://skillzwave.ai) to browse and install skills with one click.

## License

MIT
