# Planning Examples

## Step 1: Understanding with Concrete Examples

To create an effective skill, gather concrete usage examples through questions like:

- "What functionality should the skill support?"
- "Can you give examples of how this skill would be used?"
- "What would a user say that should trigger this skill?"

Avoid overwhelming users with too many questions. Start with the most important and follow up as needed.

**Conclude when:** Clear sense of functionality the skill should support.

## Step 2: Planning Reusable Contents

Analyze each example by:
1. Considering how to execute from scratch
2. Identifying helpful scripts, references, and assets for repeated execution

### Example: PDF Editor Skill

**Query:** "Help me rotate this PDF"

**Analysis:**
1. Rotating a PDF requires re-writing the same code each time
2. A `scripts/rotate_pdf.py` script would be helpful

### Example: Frontend Webapp Builder Skill

**Query:** "Build me a todo app" or "Build me a dashboard"

**Analysis:**
1. Writing a frontend webapp requires the same boilerplate HTML/React
2. An `assets/hello-world/` template containing boilerplate would be helpful

### Example: BigQuery Skill

**Query:** "How many users have logged in today?"

**Analysis:**
1. Querying BigQuery requires re-discovering table schemas each time
2. A `references/schema.md` documenting table schemas would be helpful

## Establishing Skill Contents

For each concrete example, create a list of reusable resources:
- **Scripts:** Repeatable code tasks
- **References:** Domain knowledge, schemas, documentation
- **Assets:** Templates, boilerplate, binary files
