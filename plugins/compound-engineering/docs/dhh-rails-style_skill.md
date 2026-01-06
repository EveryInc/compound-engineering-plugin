# DHH Rails Style Skill

Write Ruby and Rails code in DHH's distinctive 37signals style, embodying REST purity, fat models, thin controllers, and the "clarity over cleverness" philosophy.

## What This Skill Does

This skill applies 37signals/DHH Rails conventions extracted from production codebases:

- **REST mapping** - CRUD controllers over custom actions
- **Rich domain models** - Fat models over service objects
- **Concerns** - Horizontal code sharing via concerns
- **State as records** - Records instead of boolean columns
- **Database-backed** - Database for everything, no Redis
- **Vanilla Rails** - Build solutions before reaching for gems

## Common Workflows

### 1. Map Actions to REST
Convert custom actions to CRUD resources.

```ruby
# Instead of: POST /cards/:id/close
# Use: POST /cards/:id/closure

class Cards::ClosuresController < ApplicationController
  def create
    @card.close
    redirect_to @card
  end

  def destroy
    @card.reopen
    redirect_to @card
  end
end
```

### 2. Create Model Concerns
Share behavior across models with concerns.

```ruby
# app/models/concerns/closeable.rb
module Closeable
  extend ActiveSupport::Concern

  def close
    closures.create!
  end

  def closed?
    closures.exists?
  end
end
```

### 3. Use State Records
Track state with records, not booleans.

```ruby
# Instead of: card.closed = true
# Use: card.closures.create!

Card.joins(:closure)         # closed cards
Card.where.missing(:closure) # open cards
```

### 4. Add Authorization to Models
Put authorization logic on the User model.

```ruby
class User < ApplicationRecord
  def can_administer?(message)
    message.creator == self || admin?
  end
end
```

### 5. Apply Ruby Syntax Preferences
Use DHH's preferred syntax patterns.

```ruby
# Symbol arrays with spaces inside brackets
before_action :set_message, only: %i[ show edit update destroy ]

# Private method indentation
  private
    def set_message
      @message = Message.find(params[:id])
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
skilz install dhh-rails-style --agent claude-code
```

#### Option 2: Install for OpenCode

```bash
skilz install dhh-rails-style --agent opencode
```

#### Option 3: Install for Gemini CLI

```bash
skilz install dhh-rails-style --agent gemini
```

#### Option 4: Install for OpenAI Codex

```bash
skilz install dhh-rails-style --agent codex
```

### Install from SkillzWave Marketplace

Visit [SkillzWave.ai](https://skillzwave.ai) to browse and install skills with one click.

## License

MIT
