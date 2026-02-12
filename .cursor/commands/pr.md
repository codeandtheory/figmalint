# Pull Request Summary Generator

Generate a comprehensive PR summary following a structured template with proper analysis of changes.

## 🚨 CRITICAL REQUIREMENTS - READ FIRST

**TWO ABSOLUTE REQUIREMENTS THAT MUST BE FOLLOWED:**

1. **DEFAULT BRANCH IS `develop`** - NOT `main`, NOT `master` - ALWAYS use `develop` unless explicitly specified otherwise
2. **TEMPLATE COMPLIANCE IS MANDATORY** - Must use the exact 5-section template structure with no deviations

**FAILURE TO FOLLOW THESE REQUIREMENTS WILL RESULT IN INCORRECT PR SUMMARIES**

## ⚠️ CRITICAL: TEMPLATE COMPLIANCE REQUIRED

**MANDATORY OUTPUT FORMAT - NO EXCEPTIONS:**
The `/pr` command MUST output PR summaries using this EXACT template structure:

```markdown
# Related Tickets

# Description

# What Changed

# Validation

# Risks
```

**ENFORCEMENT RULES:**

- ✅ ALWAYS include all 5 sections in this exact order
- ✅ ALWAYS use exact header format: `# Section Name`
- ✅ ALWAYS fill in actual content for each section
- ❌ NEVER add extra sections or modify structure
- ❌ NEVER omit sections or change their order
- ❌ NEVER include HTML comment placeholders in output
- ❌ NEVER deviate from this template structure under any circumstances

## Shell Permissions

**MANDATORY**: Every Shell tool call made during execution of this command **MUST** use `required_permissions: ["all"]`. The sandbox environment breaks TLS certificate verification for GitHub CLI and other network operations. Do NOT use `required_permissions: ["full_network"]` — always use `["all"]` to disable the sandbox entirely.


## Instructions

When the user types `/pr`, `/pr [target-branch]`, `/pr [jira-tickets]`, `/pr [target-branch] [jira-tickets]`, `/pr --create`, or `/pr --analysis`:

1. Parse optional target branch, Jira ticket IDs, and flags from the command
2. **DEFAULT TO `develop` BRANCH** - This is the primary development branch, NOT `main`
3. **DETERMINE COMMIT RANGE** - Use smart logic to find the appropriate commit range:
   - **If this is a feature branch with existing PRs**: Find the last merged PR from this branch using `gh pr list --head [current-branch] --state merged --limit 1`
   - **Get the merge commit hash** from the last PR using `gh pr view [pr-number] --json mergeCommit`
   - **Use commit range**: `[merge-commit-hash]..HEAD` to analyze only new commits since the last PR
   - **Fallback**: If no previous PRs exist, use `[target-branch]...HEAD` as before
4. Run `git status` and `git diff [commit-range]` to get changes
5. Run `git log [commit-range] --format="%s %b"` to get full commit messages (subject and body) and extract JIRA ticket references
6. Run `git diff --name-only [commit-range]` to get list of changed files
7. Analyze the changes and generate a PR summary following the **EXACT TEMPLATE STRUCTURE**
8. Extract JIRA tickets from both command arguments and commit messages
9. If `--create` flag is present, automatically create the PR using GitHub CLI
10. Otherwise, output the PR summary for manual creation

**CRITICAL REMINDERS:**

- **DEFAULT BRANCH**: Always use `develop` unless explicitly specified otherwise
- **TEMPLATE COMPLIANCE**: Must use the exact 5-section template structure
- **SMART COMMIT RANGE**: Only analyze commits since the last PR from the current branch to avoid including already-reviewed changes

### Smart Commit Range Logic:

The `/pr` command now uses intelligent logic to determine which commits to analyze:

**For Feature Branches with Existing PRs:**

1. Find the last merged PR from the current branch: `gh pr list --head [current-branch] --state merged --limit 1`
2. Get the merge commit hash: `gh pr view [pr-number] --json mergeCommit`
3. Analyze only commits since that merge: `[merge-commit-hash]..HEAD`

**For New Feature Branches:**

- Use the traditional range: `[target-branch]...HEAD`

**Benefits:**

- **Focused Analysis**: Only reviews new changes since the last PR
- **Avoids Duplication**: Prevents re-analyzing already-reviewed commits
- **Accurate Summaries**: PR descriptions reflect only the incremental changes
- **Better Review Experience**: Reviewers see only what's new, not the entire feature history

**Example Workflow:**

```bash
# First PR from feature branch
/pr --create  # Analyzes all commits since develop

# After first PR is merged, make more changes
git commit -m "fix: Address review feedback"
git commit -m "feat: Add additional feature"

# Second PR from same branch
/pr --create  # Only analyzes the 2 new commits, not the entire feature history
```

### Template Structure:

**EXACT TEMPLATE - MUST BE FOLLOWED PRECISELY:**

```markdown
# Related Tickets

# Description

# What Changed

# Validation

# Risks
```

**TEMPLATE COMPLIANCE RULES:**

- Use this exact structure with no modifications
- Fill in actual content for each section based on analysis
- Maintain exact spacing and formatting
- Never add, remove, or reorder sections
- Never change header names
- Never include HTML comment placeholders in output

### Analysis Guidelines:

#### Related Tickets Section:

- Extract JIRA ticket IDs from **full commit messages** (both subject and body) using these patterns:
  - `PROJ-123` (standalone ticket ID anywhere in subject or body)
  - `Jira: PROJ-123` (explicit Jira prefix)
  - `Jira: PROJ-123, PROJ-456` (multiple tickets)
  - `[PROJ-123]` (bracketed ticket ID)
  - Case-insensitive matching for project codes
  - **Important**: Search both commit subject AND body text, not just subject lines
- If Jira tickets are provided in the command, add them as well
- Format all found tickets as links: `[DIAGEO-5005](https://codeandtheory.atlassian.net/browse/DIAGEO-5005)`
- Deduplicate tickets found in both command and commit messages
- If no tickets found, include the comment but leave empty for manual addition

#### Description Section:

- Analyze file changes to understand the overall purpose
- Look at added/modified files, function names, class names
- Summarize the high-level intent in 2-3 sentences
- Focus on business value and user impact, not implementation details
- Use clear, non-technical language when possible

#### What Changed Section:

- Group changes by category (Components, API, Configuration, Tests, etc.)
- For each significant file, provide:
  - Brief description of what changed in that file
  - Note if it's a new file, deletion, or modification
  - Include line counts for significant changes when helpful
- Focus on the most important files (limit to 8-12 key files)
- Use relative paths from repository root
- For large changesets, group related files together

#### Validation Section:

- Based on the type of changes, suggest appropriate validation methods:
  - **UI Changes**: Suggest screenshots, visual regression tests, browser testing
  - **API Changes**: Suggest API testing, curl examples, Postman collections
  - **Database Changes**: Suggest migration testing, data validation
  - **Configuration**: Suggest environment testing, deployment validation
  - **Tests**: Suggest running test suites, coverage reports
  - **Documentation**: Suggest reviewing rendered output, link validation
- Include specific commands or steps when applicable
- Mention any automated testing that should pass
  - Use GitHub checkbox format (`- [ ]`) instead of `-` to enable interactive checkboxes in GitHub PRs

#### Risks Section:

- **Keep it concise and impactful** - max 4-6 bullet points focusing on critical risks only
- Prioritize risks that could break production or require immediate action:
  - **Breaking Changes**: API modifications, schema changes, removed features that affect users
  - **Database Migrations**: Required schema changes that need coordination
  - **Environment Setup**: New required environment variables or configuration
  - **Dependencies**: Critical new packages that need security review
- Use clear, action-oriented language
- Lead with the highest impact risks first
- Skip minor risks that don't require reviewer attention
- Focus on deployment blockers and rollback considerations

### Change Analysis Patterns:

#### File Path Analysis:

- `src/components/`, `components/`: UI component changes
- `src/api/`, `api/`, `backend/`: API/backend changes
- `src/pages/`, `pages/`: Page/route changes
- `database/`, `migrations/`: Database changes
- `package.json`, `requirements.txt`: Dependency changes
- `config/`, `.env`: Configuration changes
- `test/`, `spec/`: Test changes
- `docs/`, `README.md`: Documentation changes

#### Code Pattern Analysis:

- New files: Feature additions
- Deleted files: Feature removal or refactoring
- Modified imports: Dependency changes
- Function/class renames: Refactoring
- Database schema: Data model changes
- API endpoints: Interface changes

### Output Guidelines:

**CRITICAL: STRICT TEMPLATE ADHERENCE REQUIRED**

- **MANDATORY**: Always include all five sections in exact order: Related Tickets, Description, What Changed, Validation, Risks
- **MANDATORY**: Use the exact template structure without HTML comments
- **MANDATORY**: Each section must start with the exact header format: `# Section Name`
- **MANDATORY**: Fill in relevant content based on analysis, never leave sections completely empty
- **MANDATORY**: If insufficient information, provide thoughtful prompts for manual completion within the section
- **MANDATORY**: Keep descriptions concise but comprehensive
- **MANDATORY**: Focus on reviewer needs and validation requirements
- **FORBIDDEN**: Adding extra sections, changing section order, or modifying header format
- **FORBIDDEN**: Omitting any of the five required sections
- **FORBIDDEN**: Including HTML comment placeholders in output

### Examples:

**Feature Addition:**

```markdown
# Related Tickets

[DIAGEO-5005](https://codeandtheory.atlassian.net/browse/DIAGEO-5005)

# Description

Implements OAuth2 authentication flow with Google and GitHub providers. Users can now sign in using their existing social accounts instead of creating new credentials. Includes proper token handling, refresh mechanisms, and security validations.

# What Changed

**Authentication Components:**

- `src/components/auth/OAuthButton.tsx` - New OAuth login button component
- `src/components/auth/LoginForm.tsx` - Updated to include OAuth options

**API Routes:**

- `src/app/api/auth/google/route.ts` - Google OAuth handler (new file)
- `src/app/api/auth/github/route.ts` - GitHub OAuth handler (new file)

**Configuration:**

- `package.json` - Added OAuth dependencies
- `.env.example` - OAuth environment variables

# Validation

- Test login flow with Google OAuth in browser
- Test login flow with GitHub OAuth in browser
- Verify token refresh works after expiration
- Check that user profiles are properly created/updated
- Run authentication test suite: `npm run test:auth`
- Validate redirect handling for unauthorized access

# Risks

- **Database Migration**: New user provider tracking table required before deployment
- **Breaking Change**: Existing local auth users need migration path to OAuth
- **Dependencies**: OAuth libraries require security audit before production
```

**Bug Fix:**

```markdown
# Related Tickets

[DIAGEO-4567](https://codeandtheory.atlassian.net/browse/DIAGEO-4567)

# Description

Fixes race condition in shopping cart calculation that caused incorrect totals when multiple items were added rapidly. The issue occurred when rapid clicks triggered overlapping API calls, leading to inconsistent state updates.

# What Changed

**Core Logic:**

- `src/lib/cart-calculations.ts` - Added mutex lock for cart operations
- `src/hooks/useCart.ts` - Debounced rapid state updates

**Tests:**

- `src/__tests__/cart-calculations.test.ts` - Added race condition test cases

# Validation

- Test rapid clicking of "Add to Cart" button
- Verify cart totals are accurate with multiple concurrent additions
- Run cart calculation test suite: `npm run test:cart`
- Test in different browsers and network conditions

# Risks

- **Regression**: Could break single item cart additions - test thoroughly
- **Performance**: Mutex locks may impact high-traffic cart operations
```

### JIRA Ticket Extraction:

The tool automatically extracts JIRA tickets from commit messages using regex patterns:

```regex
# Primary patterns (case-insensitive):
[A-Z]{2,10}-\d+           # PROJ-123, DIAGEO-5005, FOO-42
Jira:\s*([A-Z]{2,10}-\d+(?:,\s*[A-Z]{2,10}-\d+)*) # Jira: PROJ-123, PROJ-456
\[([A-Z]{2,10}-\d+)\]     # [PROJ-123]
```

**Example commit messages that will be detected:**

- `feat(auth): Add OAuth integration\n\nJira: AUTH-123`
- `fix: Resolve cart calculation bug CART-456`
- `docs: Update API documentation [DOC-789]`
- `refactor(ui): Improve button component\n\nJira: UI-101, UX-202`

### Command Variations:

**Summary Generation (Default):**

- `/pr` - Generate PR summary comparing against `develop` (DEFAULT) and auto-extract tickets from commits
- `/pr develop` - Generate PR summary comparing against `develop` branch
- `/pr origin/staging` - Generate PR summary comparing against `origin/staging` branch
- `/pr DIAGEO-5005` - Compare against `develop` (DEFAULT) and include specific Jira ticket + auto-extracted tickets
- `/pr develop DIAGEO-5005` - Compare against `develop` branch and include specific Jira ticket
- `/pr origin/staging DIAGEO-5005,DIAGEO-4567` - Compare against `origin/staging` and include multiple Jira tickets
- `/pr --analysis` - Compare against `develop` (DEFAULT) with detailed technical analysis in description

**Auto-Create PR:**

- `/pr --create` - Generate summary and create PR against `develop` (DEFAULT) using GitHub CLI
- `/pr main --create` - Generate summary and create PR against `main` branch (explicit override)
- `/pr develop PROJ-123 --create` - Create PR with specific Jira ticket included
- `/pr --create --analysis` - Create PR with enhanced technical analysis

**⚠️ IMPORTANT: `develop` is the DEFAULT branch - only use `main` when explicitly specified**

### Argument Parsing Logic:

- **First argument**: If it looks like a branch name (contains `/`, starts with `origin/`, or is a common branch name like `develop`, `staging`, `master`), treat as target branch
- **First argument**: If it matches JIRA pattern (`PROJ-123` format), treat as Jira tickets
- **Second argument**: Always treated as Jira tickets if present
- **Special flags**: `--create` to auto-create PR, `--analysis` for enhanced analysis
- **Flag positioning**: Flags can be used anywhere in the command
- **DEFAULT BEHAVIOR**: Compare against `develop` if no target branch specified (NOT `main`)

### Branch Name Detection:

**Recognized as branch names:**

- `develop`, `staging`, `master`, `main`
- Anything containing `/` (e.g., `origin/develop`, `feature/auth`)
- Anything starting with `origin/`, `upstream/`, `remote/`

**Recognized as JIRA tickets:**

- Pattern: `[A-Z]{2,10}-\d+` (e.g., `PROJ-123`, `DIAGEO-5005`)
- Comma-separated tickets: `PROJ-123,PROJ-456`

**Examples:**

```
/pr develop                    → Compare against develop, auto-extract tickets
/pr origin/staging PROJ-123    → Compare against origin/staging, include PROJ-123
/pr PROJ-123                   → Compare against develop (DEFAULT), include PROJ-123
/pr feature/auth --analysis    → Compare against feature/auth with detailed analysis
/pr --create                   → Generate summary and create PR against develop (DEFAULT)
/pr main --create PROJ-123     → Create PR against main with JIRA ticket (explicit override)
```

**⚠️ REMINDER: `develop` is the DEFAULT branch - only use `main` when explicitly specified**

### GitHub CLI Integration:

When `--create` flag is used, the command will:

1. **Check Prerequisites:**
   - Verify GitHub CLI (`gh`) is installed: `which gh`
   - Verify user is authenticated: `gh auth status`
   - Verify current branch is pushed to remote: `git rev-parse --abbrev-ref HEAD@{upstream}`

2. **Determine Smart Commit Range:**
   - Check for existing merged PRs from current branch: `gh pr list --head [current-branch] --state merged --limit 1`
   - If found, get merge commit hash: `gh pr view [pr-number] --json mergeCommit`
   - Use range `[merge-commit-hash]..HEAD` for analysis
   - If no previous PRs, use `[target-branch]...HEAD`

3. **Generate PR Title:**
   - Use the first commit message subject from the smart range as the PR title
   - Or generate a title from the overall change summary
   - Format: `feat(scope): Add new feature` or `Fix critical bug in authentication`

4. **Create Pull Request:**

   ```bash
   gh pr create \
     --base [target-branch] \
     --head [current-branch] \
     --title "[Generated Title]" \
     --body "[Generated PR Summary]" \
     --assignee @me
   ```

5. **Handle Errors:**
   - If `gh` not installed: Provide installation instructions
   - If not authenticated: Run `gh auth login`
   - If branch not pushed: Run `git push -u origin [current-branch]`
   - If PR already exists: Show link to existing PR

6. **Success Output:**
   - Display PR URL
   - Show PR number and status
   - Provide link to view in browser

**Prerequisites for `--create` flag:**

```bash
# Install GitHub CLI (if not installed)
brew install gh  # macOS
# or
sudo apt install gh  # Ubuntu

# Authenticate with GitHub
gh auth login

# Ensure current branch is pushed
git push -u origin [current-branch]
```

**Example Workflow:**

```bash
# 1. Make changes and commit
git add .
git commit -m "feat(auth): Add OAuth integration"

# 2. Push branch
git push -u origin feature/oauth

# 3. Create PR automatically
/pr --create
# → Generates summary, creates PR, returns URL
```

### Output Format:

**Without `--create` flag (Default):**
Present the PR summary in a markdown code block using the EXACT template structure:

````
```markdown
# Related Tickets

[DIAGEO-5005](https://codeandtheory.atlassian.net/browse/DIAGEO-5005)

# Description

Implements OAuth2 authentication flow with Google and GitHub providers. Users can now sign in using their existing social accounts instead of creating new credentials.

# What Changed

**Authentication Components:**
- `src/components/auth/OAuthButton.tsx` - New OAuth login button component
- `src/components/auth/LoginForm.tsx` - Updated to include OAuth options

# Validation

- Test login flow with Google OAuth in browser
- Test login flow with GitHub OAuth in browser
- Run authentication test suite: `npm run test:auth`

# Risks

- **Database Migration**: New user provider tracking table required before deployment
- **Breaking Change**: Existing local auth users need migration path to OAuth
```
````

**CRITICAL OUTPUT REQUIREMENTS:**

- Always use the exact template structure shown above
- Fill in actual content based on analysis for each section
- Never modify the template structure or header format
- Never omit any sections or change their order
- Never include HTML comment placeholders in output

**With `--create` flag:**

1. Generate the PR summary (same format as above)
2. Create the PR using GitHub CLI
3. Display success message with PR details:

```
✅ Pull Request Created Successfully!

PR #123: feat(auth): Add OAuth integration
URL: https://github.com/codeandtheory/ct-performance-benchmarking/pull/123
Base: develop ← Head: feature/oauth
Status: Open

You can view the PR in your browser or continue working on other tasks.
```

**Error Handling:**
If prerequisites are missing or errors occur:

```
❌ GitHub CLI not found. Please install it first:
   brew install gh  # macOS
   sudo apt install gh  # Ubuntu

❌ Not authenticated with GitHub. Please run:
   gh auth login

❌ Current branch not pushed. Please run:
   git push -u origin feature/oauth

❌ Pull request already exists:
   https://github.com/codeandtheory/ct-performance-benchmarking/pull/120
```

### File Selection Criteria:

- Prioritize new files, significant modifications, and deleted files
- Focus on core functionality changes (components, API routes, configuration)
- Limit to 8-12 most important files to avoid overwhelming reviewers
- Group related files under logical categories
- Include line counts for significant changes to give reviewers context

**FINAL OUTPUT REQUIREMENT:**
Output only the PR summary in the exact template format shown above. Never deviate from this structure. If user asks for explanation or analysis details, provide them separately after the PR summary.

**TEMPLATE ENFORCEMENT CHECKLIST:**

- [ ] All 5 sections present in correct order: Related Tickets, Description, What Changed, Validation, Risks
- [ ] Headers use exact format: `# Section Name`
- [ ] Content filled in based on analysis
- [ ] No HTML comment placeholders in output
- [ ] No extra sections or modifications
- [ ] Proper markdown formatting maintained
- [ ] DEFAULT branch is `develop` unless explicitly specified otherwise
- [ ] Template structure is followed EXACTLY with no deviations

**CRITICAL SUCCESS CRITERIA:**

1. **DEFAULT BRANCH**: Always use `develop` unless user explicitly specifies another branch
2. **TEMPLATE COMPLIANCE**: Must output the exact 5-section template structure
3. **NO DEVIATIONS**: Never add, remove, or reorder sections from the template

---

## 🚨 FINAL REMINDER - MANDATORY COMPLIANCE

**BEFORE EXECUTING THE `/pr` COMMAND, VERIFY:**

✅ **DEFAULT BRANCH**: Using `develop` as the target branch (unless explicitly overridden)  
✅ **TEMPLATE STRUCTURE**: Will output exactly 5 sections in this order:

- Related Tickets
- Description
- What Changed
- Validation
- Risks

**ANY DEVIATION FROM THESE REQUIREMENTS IS UNACCEPTABLE**
