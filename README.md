# ctdsLint

A design system audit tool for CT/DS (Code & Theory Design System) compliance. Available as a **Figma plugin** and a **CLI** that calls the Figma REST API. Validates variable collections, text styles, and component variable bindings to ensure your design system follows best practices.

## Features

### CT/DS Audit

Run a comprehensive system-level audit that validates:

- **Collection Structure** — Ensures variable collections follow expected patterns and contain required categories (e.g., Primitives, Brand, Theme collections with proper color, typography, spacing categories)
- **Text Style Sync** — Validates that font-family variables and text styles are synchronized (e.g., if you have `font-family/display` variables, you should have matching `display/...` text styles)
- **Text Style Bindings** — Checks that text styles use font-family variables instead of hard-coded font families
- **Component Bindings** — Validates that components use design tokens (variables) instead of hard-coded values for fills, strokes, spacing, typography, effects, and corner radius

### Audit Scoring

Each validation category receives a score based on:

- Pass/fail/warning status for individual checks
- Overall percentage of passing checks
- Detailed breakdown by category (collection structure, text styles, component bindings)

## Getting Started

### Figma Plugin

1. Clone this repository
2. `npm install`
3. `npm run build`
4. In Figma: Plugins > Development > Import plugin from manifest
5. Select the `manifest.json` from the project root
6. Open your Figma file, run the plugin, and click "Run CT/DS Audit"

### CLI

The CLI runs the same audit against any Figma file via the REST API and writes results to the console, a JSON file, or a standalone HTML report.

#### Prerequisites

- Node.js 18+
- A Figma Personal Access Token ([create one here](https://www.figma.com/developers/api#access-tokens))
- **Enterprise plan** required for variable/collection validation (component binding checks work on any plan)

#### Setup

```bash
npm install
npm run build

# Set environment variables (recommended)
export FIGMA_FILE_KEY=<your-figma-file-key>
export FIGMA_PERSONAL_ACCESS_TOKEN=<your-figma-personal-access-token>
```

The file key is the string in your Figma URL between `/design/` and the file name, e.g. for `https://figma.com/design/abc123DEF/MyFile` the key is `abc123DEF`.

#### Usage

```bash
# Run a full audit (console output)
node dist-cli/cli/index.js

# Or pass file key and token as flags
node dist-cli/cli/index.js -f abc123DEF -t figd_xxx

# JSON report
node dist-cli/cli/index.js -o report.json

# HTML report
node dist-cli/cli/index.js -o report.html

# Audit only components
node dist-cli/cli/index.js --audit-type components

# Audit only variables and text styles
node dist-cli/cli/index.js --audit-type variables-styles
```

#### CLI Options

| Flag | Env Variable | Description |
|---|---|---|
| `--file-key`, `-f` | `FIGMA_FILE_KEY` | Figma file key |
| `--token`, `-t` | `FIGMA_PERSONAL_ACCESS_TOKEN` | Figma Personal Access Token |
| `--output`, `-o` | | Output file path (e.g. `report.json`, `report.html`) |
| `--format` | | Output format: `json`, `html`, or `console` (default) |
| `--audit-type` | | Audit scope: `system` (default), `variables-styles`, or `components` |
| `--help`, `-h` | | Show help text |

The CLI exits with code `2` when any audit checks fail, making it suitable for CI pipelines.

## Architecture

```
src/
├── code.ts                      # Figma plugin entry point
├── types.ts                     # Shared TypeScript definitions
├── shared/
│   └── types.ts                 # API-agnostic data interfaces
├── core/
│   └── collection-validator.ts  # Validation logic (platform-independent)
├── plugin/
│   └── data-adapter.ts          # Figma Plugin API → shared types
├── cli/
│   ├── index.ts                 # CLI entry point
│   ├── figma-api.ts             # Figma REST API client
│   ├── data-adapter.ts          # REST API → shared types
│   └── reporters.ts             # Console, JSON, and HTML output
├── ui/
│   └── message-handler.ts       # Plugin ↔ UI message routing
└── utils/
    └── figma-helpers.ts         # Figma API utilities

ui-enhanced.html                 # Plugin interface (single-file HTML/CSS/JS)
```

The core validators in `collection-validator.ts` are platform-independent — they accept API-agnostic data types and never call Figma APIs directly. Each platform has its own adapter that fetches data and maps it into the shared types:

- **Plugin adapter** (`src/plugin/data-adapter.ts`) — calls the Figma Plugin API
- **CLI adapter** (`src/cli/data-adapter.ts`) — calls the Figma REST API

## Development

### Prerequisites

- Node.js 18+
- Figma Desktop app (for plugin development)

### Commands

```bash
npm install          # Install dependencies
npm run dev          # Plugin development build with watch mode
npm run dev:cli      # CLI development build with watch mode
npm run build        # Production build (plugin + CLI)
npm run build:plugin # Build plugin only
npm run build:cli    # Build CLI only
npm run lint         # Type checking (both plugin and CLI)
npm run clean        # Clean all build artifacts
```

## Collection Structure Requirements

By default, ctdsLint validates against these collection patterns:

- **Primitives** — Should contain `color` category
- **Brand** — Should contain `color` and `typography` categories (with font-family, font-weight, font-size, letter-spacing, line-height sub-categories)
- **Theme** — Should contain:
  - `colors` category (with bg, text, border sub-categories)
  - `font-family` category (with display, heading, body, label sub-categories)
  - `font-weight` category
  - `font-size` category (with t-shirt size naming: xs, sm, md, lg, xl, etc.)
  - `line-height` category (mirrors font-size)
  - `letter-spacing` category (mirrors font-size)
  - `spacing` category

You can customize these requirements in `src/core/collection-validator.ts`.

## Privacy & Security

- **Plugin mode** — All validation runs locally inside Figma. No external API calls, no data storage.
- **CLI mode** — Calls the Figma REST API with your Personal Access Token. Data is fetched, validated in memory, and written to local files only. No third-party services are contacted.
- Open source — inspect the code yourself.

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/your-feature`)
3. Commit your changes
4. Push and open a Pull Request

## License

ISC — see [LICENSE](LICENSE) for details.
