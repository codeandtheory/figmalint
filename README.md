# ctdsLint

A Figma plugin that audits your design system for CTDS (Code & Theory Design System) compliance. Validates variable collections, text styles, and component variable bindings to ensure your design system follows best practices.

## Features

### CTDS Audit

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

### Manual Installation (Development)

1. Clone this repository
2. `npm install`
3. `npm run build`
4. In Figma: Plugins > Development > Import plugin from manifest
5. Select the `manifest.json` from the project root

### Usage

1. Open your Figma file with variable collections and components
2. Run the plugin: Plugins > ctdsLint
3. Click "Run CTDS Audit" to validate your design system
4. Review the audit results organized by category
5. Address any failures or warnings identified

## Architecture

```
src/
├── code.ts                      # Plugin entry point
├── types.ts                     # TypeScript definitions
├── core/
│   └── collection-validator.ts  # CTDS validation logic
├── ui/
│   └── message-handler.ts       # Plugin ↔ UI message routing
└── utils/
    └── figma-helpers.ts         # Figma API utilities

ui-enhanced.html                 # Plugin interface (single-file HTML/CSS/JS)
```

## Development

### Prerequisites

- Node.js 16+
- Figma Desktop app (for plugin development)

### Commands

```bash
npm install          # Install dependencies
npm run dev          # Development build with watch mode
npm run build        # Production build
npm run lint         # Type checking
npm run clean        # Clean build artifacts
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

- No external API calls — all validation runs locally in Figma
- No data storage — analysis happens in real-time
- Open source — inspect the code yourself

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/your-feature`)
3. Commit your changes
4. Push and open a Pull Request

## License

ISC — see [LICENSE](LICENSE) for details.
