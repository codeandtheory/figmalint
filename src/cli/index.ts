#!/usr/bin/env node

/**
 * ctdsLint CLI
 *
 * Runs the CT/DS design system audit against a Figma file via the REST API
 * and writes results to the console, a JSON file, or an HTML report.
 *
 * Usage:
 *   ctdslint --file-key <key> [options]
 *
 * Options:
 *   --file-key, -f    Figma file key (required)
 *   --token, -t       Figma Personal Access Token (or set FIGMA_PERSONAL_ACCESS_TOKEN env var)
 *   --output, -o      Output file path (e.g. report.json or report.html)
 *   --format          Output format: json | html | console (default: console)
 *   --audit-type      Audit scope: system | variables-styles | components (default: system)
 *   --help, -h        Show this help text
 */

import { FigmaApiClient } from './figma-api';
import { buildLintData, findComponents } from './data-adapter';
import {
  validateCollectionStructure,
  validateTextStylesAgainstVariables,
  validateTextStyleBindings,
  validateAllComponentBindings,
} from '../core/collection-validator';
import {
  AuditResults,
  calculateAuditStats,
  calculateComponentStats,
  reportToConsole,
  reportToJsonFile,
  reportToHtmlFile,
} from './reporters';

// ============================================================================
// Argument parsing (zero dependencies)
// ============================================================================

interface CliArgs {
  fileKey: string;
  token: string;
  output?: string;
  format: 'json' | 'html' | 'console';
  auditType: 'system' | 'variables-styles' | 'components';
  help: boolean;
}

function printHelp(): void {
  console.log(`
ctdsLint CLI — CT/DS Design System Auditor

Usage:
  ctdslint [options]

Options:
  --file-key, -f    Figma file key (or set FIGMA_FILE_KEY env var)
  --token, -t       Figma Personal Access Token (or set FIGMA_PERSONAL_ACCESS_TOKEN env var)
  --output, -o      Output file path (e.g. report.json or report.html)
  --format          Output format: json | html | console (default: console)
  --audit-type      Audit scope: system | variables-styles | components
                    (default: system)
  --help, -h        Show this help text

Environment Variables:
  FIGMA_FILE_KEY    Figma file key (used when --file-key is not provided)
  FIGMA_PERSONAL_ACCESS_TOKEN       Figma Personal Access Token (used when --token is not provided)

Examples:
  # Using env vars (recommended)
  export FIGMA_FILE_KEY=abc123DEF
  export FIGMA_PERSONAL_ACCESS_TOKEN=figd_xxx
  ctdslint

  # Using flags
  ctdslint -f abc123DEF -t figd_xxx

  # Output to file
  ctdslint --format json -o report.json
  ctdslint --format html -o report.html --audit-type components
`);
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    fileKey: process.env.FIGMA_FILE_KEY ?? '',
    token: process.env.FIGMA_PERSONAL_ACCESS_TOKEN ?? '',
    output: undefined,
    format: 'console',
    auditType: 'system',
    help: false,
  };

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    const next = argv[i + 1];

    switch (arg) {
      case '--file-key':
      case '-f':
        args.fileKey = next ?? '';
        i++;
        break;
      case '--token':
      case '-t':
        args.token = next ?? '';
        i++;
        break;
      case '--output':
      case '-o':
        args.output = next ?? '';
        i++;
        break;
      case '--format':
        args.format = (next ?? 'console') as CliArgs['format'];
        i++;
        break;
      case '--audit-type':
        args.auditType = (next ?? 'system') as CliArgs['auditType'];
        i++;
        break;
      case '--help':
      case '-h':
        args.help = true;
        break;
      default:
        if (!arg.startsWith('-') && !args.fileKey) {
          // Treat first positional argument as file key
          args.fileKey = arg;
        }
        break;
    }
  }

  // Infer format from output extension if not explicitly set
  if (args.output && args.format === 'console') {
    if (args.output.endsWith('.json')) args.format = 'json';
    else if (args.output.endsWith('.html') || args.output.endsWith('.htm')) args.format = 'html';
  }

  return args;
}

// ============================================================================
// Main
// ============================================================================

async function main(): Promise<void> {
  const args = parseArgs(process.argv);

  if (args.help) {
    printHelp();
    process.exit(0);
  }

  if (!args.fileKey) {
    console.error('Error: Figma file key is required. Pass --file-key or set FIGMA_FILE_KEY.');
    process.exit(1);
  }

  if (!args.token) {
    console.error('Error: Figma token is required. Pass --token or set FIGMA_PERSONAL_ACCESS_TOKEN.');
    process.exit(1);
  }

  const client = new FigmaApiClient({ token: args.token });

  // ---- Fetch data from Figma ----
  console.log(`Fetching Figma file ${args.fileKey}...`);

  const fileResponse = await client.getFile(args.fileKey);
  console.log(`File: "${fileResponse.name}"`);

  // Attempt to fetch variables (Enterprise-only)
  let variablesResponse;
  try {
    console.log('Fetching variables (requires Enterprise plan)...');
    variablesResponse = await client.getLocalVariables(args.fileKey);
    const numCollections = Object.keys(variablesResponse.meta.variableCollections).length;
    const numVars = Object.keys(variablesResponse.meta.variables).length;
    console.log(`Found ${numCollections} collections, ${numVars} variables.`);
  } catch (err) {
    console.warn(
      'Could not fetch variables (requires Enterprise plan). ' +
      'Collection and variable validation will be skipped.'
    );
    variablesResponse = undefined;
  }

  // ---- Adapt to shared types ----
  const data = buildLintData(fileResponse, variablesResponse);
  const components = findComponents(data.pages);
  console.log(`Discovered ${components.length} components across ${data.pages.length} pages.`);

  // ---- Run validators ----
  console.log(`Running ${args.auditType} audit...\n`);

  let collectionChecks: any[] = [];
  let textStyleChecks: any[] = [];
  let componentChecks: any[] = [];

  if (args.auditType === 'system' || args.auditType === 'variables-styles') {
    const collectionValidation = validateCollectionStructure(data.collections, data.variables);
    collectionChecks = collectionValidation.auditChecks;

    const textStyleSync = validateTextStylesAgainstVariables(
      data.collections, data.variables, data.textStyles
    );
    const textStyleBindings = validateTextStyleBindings(data.textStyles, data.variables);
    textStyleChecks = [...textStyleSync.auditChecks, ...textStyleBindings.auditChecks];
  }

  if (args.auditType === 'system' || args.auditType === 'components') {
    const componentBindings = validateAllComponentBindings(components, (msg) => {
      process.stdout.write(`\r  ${msg}`);
    });
    componentChecks = componentBindings.auditChecks;
    process.stdout.write('\r' + ' '.repeat(80) + '\r'); // clear progress line
  }

  // ---- Build results ----
  const allChecks = [...collectionChecks, ...textStyleChecks, ...componentChecks];
  const results: AuditResults = {
    fileKey: args.fileKey,
    fileName: fileResponse.name,
    timestamp: new Date().toISOString(),
    scores: {
      overall: calculateAuditStats(allChecks),
      collection: calculateAuditStats(collectionChecks),
      textStyle: calculateAuditStats(textStyleChecks),
      component: calculateComponentStats(componentChecks),
    },
    collectionStructure: collectionChecks,
    textStyleSync: textStyleChecks,
    componentBindings: componentChecks,
  };

  // ---- Output ----
  switch (args.format) {
    case 'json':
      if (args.output) {
        reportToJsonFile(results, args.output);
      } else {
        console.log(JSON.stringify(results, null, 2));
      }
      break;
    case 'html':
      if (args.output) {
        reportToHtmlFile(results, args.output);
      } else {
        console.error('HTML format requires --output path. Example: --output report.html');
        process.exit(1);
      }
      break;
    case 'console':
    default:
      reportToConsole(results);
      if (args.output) {
        // Also write JSON if an output file was specified alongside console output
        reportToJsonFile(results, args.output);
      }
      break;
  }

  // Exit with non-zero if any checks failed
  if (results.scores.overall.failed > 0) {
    process.exit(2);
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
