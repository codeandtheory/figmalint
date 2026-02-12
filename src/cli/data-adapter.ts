/**
 * Adapter that converts Figma REST API responses into the API-agnostic
 * `LintData` types consumed by the core validators.
 */

import type {
  LintVariable,
  LintVariableCollection,
  LintVariableAlias,
  LintVariableValue,
  LintTextStyle,
  LintBoundVariable,
  LintNode,
  LintComponent,
  LintPaint,
  LintSolidPaint,
  LintOtherPaint,
  LintEffect,
  LintRGBA,
  LintData,
} from '../shared/types';

import type {
  FigmaFileResponse,
  FigmaVariablesResponse,
  FigmaNode,
  FigmaRestPaint,
  FigmaRestEffect,
  FigmaRestColor,
  FigmaRestVariable,
  FigmaRestVariableValue,
  FigmaRestVariableAlias,
  FigmaRestBoundVariable,
} from './figma-api';

// ============================================================================
// Variable / Collection Adapters
// ============================================================================

function isVariableAlias(v: FigmaRestVariableValue): v is FigmaRestVariableAlias {
  return typeof v === 'object' && v !== null && 'type' in v && (v as any).type === 'VARIABLE_ALIAS';
}

function isColor(v: FigmaRestVariableValue): v is FigmaRestColor {
  return typeof v === 'object' && v !== null && 'r' in v && !('type' in v);
}

function adaptVariableValue(value: FigmaRestVariableValue): LintVariableValue {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  if (isVariableAlias(value)) {
    return { type: 'VARIABLE_ALIAS', id: value.id } satisfies LintVariableAlias;
  }
  if (isColor(value)) {
    return { r: value.r, g: value.g, b: value.b, a: value.a ?? 1 };
  }
  return String(value);
}

export function adaptVariables(response: FigmaVariablesResponse): {
  collections: LintVariableCollection[];
  variables: LintVariable[];
} {
  const collections: LintVariableCollection[] = Object.values(
    response.meta.variableCollections
  ).map(c => ({ id: c.id, name: c.name }));

  const variables: LintVariable[] = Object.values(
    response.meta.variables
  ).map((v: FigmaRestVariable) => {
    const valuesByMode: Record<string, LintVariableValue> = {};
    for (const [modeId, val] of Object.entries(v.valuesByMode)) {
      valuesByMode[modeId] = adaptVariableValue(val);
    }
    return {
      id: v.id,
      name: v.name,
      variableCollectionId: v.variableCollectionId,
      valuesByMode,
    };
  });

  return { collections, variables };
}

// ============================================================================
// Text Style Adapter
// ============================================================================

/**
 * Extract text styles from the file response.
 *
 * The REST API does not have a dedicated text-styles endpoint that returns
 * boundVariable information. Instead, we:
 *   1. Look at the `styles` map for TEXT type styles to get names.
 *   2. Walk the document tree looking for nodes whose `styles.text` matches
 *      one of those style IDs, and collect `boundVariables` from those nodes.
 *
 * If the file tree already includes nodes that expose text style information
 * via boundVariables on text-style-defining nodes, we capture them.
 *
 * For a simpler (and more reliable) approach, we collect TEXT styles from
 * the styles map and then match them against text nodes in the tree that
 * carry boundVariables for typography properties.
 */
export function adaptTextStyles(
  fileResponse: FigmaFileResponse,
  _variablesResponse?: FigmaVariablesResponse
): LintTextStyle[] {
  // Collect TEXT styles from the styles metadata
  const textStyleEntries = Object.entries(fileResponse.styles).filter(
    ([_, meta]) => meta.styleType === 'TEXT'
  );

  // If no TEXT styles found, return empty array
  if (textStyleEntries.length === 0) return [];

  // Build a map from style node ID → style name
  const styleIdToName = new Map<string, string>();
  for (const [nodeId, meta] of textStyleEntries) {
    styleIdToName.set(nodeId, meta.name);
  }

  // Walk the tree to find text nodes that define styles with boundVariables.
  // In the REST API, text-style-defining nodes have `styles: { text: "nodeId" }`
  // and carry `boundVariables` for typography properties.
  const textStyleMap = new Map<string, LintTextStyle>();

  function walkForTextStyles(node: FigmaNode): void {
    // Check if this node has text style bindings
    if (node.type === 'TEXT' && node.boundVariables) {
      // Look through styles map entries to see if this node IS a text style node
      // or if it references a text style. In the REST API, style nodes are
      // embedded in the document tree.
      const styleName = styleIdToName.get(node.id);
      if (styleName && !textStyleMap.has(styleName)) {
        const bv: Record<string, LintBoundVariable | undefined> = {};
        for (const [key, binding] of Object.entries(node.boundVariables)) {
          if (binding && !Array.isArray(binding) && binding.id) {
            bv[key] = { id: binding.id };
          }
        }
        textStyleMap.set(styleName, { name: styleName, boundVariables: bv });
      }
    }

    if (node.children) {
      for (const child of node.children) {
        walkForTextStyles(child);
      }
    }
  }

  // Walk the document
  if (fileResponse.document.children) {
    for (const page of fileResponse.document.children) {
      walkForTextStyles(page);
    }
  }

  // For any TEXT style that we didn't find via the tree walk, add it with
  // empty boundVariables (they have hard-coded values).
  for (const [_, name] of styleIdToName) {
    if (!textStyleMap.has(name)) {
      textStyleMap.set(name, { name, boundVariables: {} });
    }
  }

  return Array.from(textStyleMap.values());
}

// ============================================================================
// Node Adapter
// ============================================================================

function adaptColor(color: FigmaRestColor): LintRGBA {
  return { r: color.r, g: color.g, b: color.b, a: color.a ?? 1 };
}

function adaptPaint(paint: FigmaRestPaint): LintPaint {
  if (paint.type === 'SOLID' && paint.color) {
    return {
      type: 'SOLID',
      color: adaptColor(paint.color),
      visible: paint.visible !== false,
    } satisfies LintSolidPaint;
  }
  return {
    type: paint.type,
    visible: paint.visible !== false,
  } satisfies LintOtherPaint;
}

function adaptEffect(effect: FigmaRestEffect): LintEffect {
  const result: LintEffect = {
    type: effect.type,
    visible: effect.visible !== false,
  };
  if (effect.color) {
    result.color = adaptColor(effect.color);
  }
  return result;
}

function adaptBoundVariables(
  bv: Record<string, FigmaRestBoundVariable | FigmaRestBoundVariable[]> | undefined
): LintNode['boundVariables'] {
  if (!bv) return {};
  const result: LintNode['boundVariables'] = {};

  for (const [key, binding] of Object.entries(bv)) {
    if (Array.isArray(binding)) {
      result[key] = binding
        .filter(b => b && b.id)
        .map(b => ({ id: b.id }));
    } else if (binding && binding.id) {
      result[key] = { id: binding.id };
    }
  }

  return result;
}

function adaptNode(node: FigmaNode): LintNode {
  const result: LintNode = {
    id: node.id,
    name: node.name,
    type: node.type,
    boundVariables: adaptBoundVariables(node.boundVariables),
  };

  // Fills / strokes
  if (node.fills) {
    result.fills = node.fills.map(adaptPaint);
  }
  if (node.strokes) {
    result.strokes = node.strokes.map(adaptPaint);
  }

  // Effects
  if (node.effects) {
    result.effects = node.effects.map(adaptEffect);
  }

  // Corner radius
  if (node.cornerRadius !== undefined) {
    result.cornerRadius = node.cornerRadius;
  }

  // Auto-layout
  if (node.layoutMode) {
    result.layoutMode = node.layoutMode as LintNode['layoutMode'];
  }
  if (node.paddingTop !== undefined) result.paddingTop = node.paddingTop;
  if (node.paddingRight !== undefined) result.paddingRight = node.paddingRight;
  if (node.paddingBottom !== undefined) result.paddingBottom = node.paddingBottom;
  if (node.paddingLeft !== undefined) result.paddingLeft = node.paddingLeft;
  if (node.itemSpacing !== undefined) result.itemSpacing = node.itemSpacing;

  // Typography (TEXT nodes)
  if (node.type === 'TEXT' && node.style) {
    const ts = node.style;
    if (ts.fontSize !== undefined) result.fontSize = ts.fontSize;
    if (ts.lineHeightPx !== undefined) {
      const unit = ts.lineHeightUnit === 'FONT_SIZE_%' ? 'PERCENT' : 'PIXELS';
      const value = unit === 'PERCENT' ? (ts.lineHeightPercentFontSize ?? ts.lineHeightPercent ?? ts.lineHeightPx) : ts.lineHeightPx;
      result.lineHeight = { value, unit };
    }
    if (ts.letterSpacing !== undefined) {
      const unit = ts.letterSpacingUnit === 'PERCENT' ? 'PERCENT' : 'PIXELS';
      result.letterSpacing = { value: ts.letterSpacing, unit };
    }
  }

  // Children
  if (node.children) {
    result.children = node.children.map(adaptNode);
  }

  return result;
}

// ============================================================================
// Public: Build LintData from REST API responses
// ============================================================================

/**
 * Convert Figma REST API responses into the shared `LintData` structure.
 *
 * @param fileResponse - Response from GET /v1/files/:key
 * @param variablesResponse - Response from GET /v1/files/:key/variables/local
 *   (optional — requires Enterprise plan; omit to skip variable/collection validation)
 */
export function buildLintData(
  fileResponse: FigmaFileResponse,
  variablesResponse?: FigmaVariablesResponse
): LintData {
  // Variables & collections
  let collections: LintVariableCollection[] = [];
  let variables: LintVariable[] = [];
  if (variablesResponse) {
    const adapted = adaptVariables(variablesResponse);
    collections = adapted.collections;
    variables = adapted.variables;
  }

  // Text styles
  const textStyles = adaptTextStyles(fileResponse, variablesResponse);

  // Pages
  const pages: LintData['pages'] = [];
  if (fileResponse.document.children) {
    for (const page of fileResponse.document.children) {
      pages.push({
        name: page.name,
        children: page.children ? page.children.map(adaptNode) : [],
      });
    }
  }

  return { collections, variables, textStyles, pages };
}

/**
 * Walk the adapted page tree and return all components annotated with
 * their containing page name.
 */
export function findComponents(pages: LintData['pages']): LintComponent[] {
  const components: LintComponent[] = [];

  function walk(node: LintNode, pageName: string): void {
    if (node.type === 'COMPONENT' || node.type === 'COMPONENT_SET') {
      components.push({ node, pageName });
    }
    if (node.children) {
      for (const child of node.children) {
        walk(child, pageName);
      }
    }
  }

  for (const page of pages) {
    for (const child of page.children) {
      walk(child, page.name);
    }
  }

  return components;
}
