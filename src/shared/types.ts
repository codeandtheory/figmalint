/**
 * API-agnostic types used by the core validators.
 *
 * Both the Figma Plugin adapter and the REST API adapter map their
 * platform-specific data into these shapes before passing them to
 * the validators in `collection-validator.ts`.
 */

// Re-export audit types that are shared everywhere
export { AuditCheck } from '../types';

// ============================================================================
// Variable / Collection Types
// ============================================================================

/**
 * Represents a value that aliases (references) another variable.
 */
export interface LintVariableAlias {
  type: 'VARIABLE_ALIAS';
  /** The ID of the referenced variable */
  id: string;
}

/**
 * A single variable value – either a primitive or an alias.
 */
export type LintVariableValue =
  | string
  | number
  | boolean
  | { r: number; g: number; b: number; a: number }
  | LintVariableAlias;

/**
 * Platform-neutral representation of a Figma variable.
 */
export interface LintVariable {
  id: string;
  name: string;
  variableCollectionId: string;
  /** Values keyed by mode ID */
  valuesByMode: Record<string, LintVariableValue>;
}

/**
 * Platform-neutral representation of a Figma variable collection.
 */
export interface LintVariableCollection {
  id: string;
  name: string;
}

// ============================================================================
// Text Style Types
// ============================================================================

/**
 * A bound-variable reference on a text style property.
 */
export interface LintBoundVariable {
  id: string;
}

/**
 * Platform-neutral representation of a Figma text style.
 */
export interface LintTextStyle {
  name: string;
  /** Variable bindings keyed by property name (fontFamily, fontSize, etc.) */
  boundVariables: Record<string, LintBoundVariable | undefined>;
}

// ============================================================================
// Node / Component Types
// ============================================================================

/** Color with optional alpha */
export interface LintRGBA {
  r: number;
  g: number;
  b: number;
  a: number;
}

/** A solid paint fill or stroke */
export interface LintSolidPaint {
  type: 'SOLID';
  color: LintRGBA;
  visible: boolean;
}

/** A non-solid paint (gradient, image, etc.) – treated as opaque */
export interface LintOtherPaint {
  type: string; // GRADIENT_LINEAR, IMAGE, etc.
  visible: boolean;
}

export type LintPaint = LintSolidPaint | LintOtherPaint;

/** A visual effect (shadow, blur, etc.) */
export interface LintEffect {
  type: string; // DROP_SHADOW, INNER_SHADOW, LAYER_BLUR, etc.
  visible: boolean;
  /** Only present for shadow effects */
  color?: LintRGBA;
}

/** Line height value */
export interface LintLineHeight {
  value: number;
  unit: 'PIXELS' | 'PERCENT' | 'AUTO';
}

/** Letter spacing value */
export interface LintLetterSpacing {
  value: number;
  unit: 'PIXELS' | 'PERCENT';
}

/**
 * Platform-neutral representation of a Figma scene node,
 * containing only the fields the validators inspect.
 */
export interface LintNode {
  id: string;
  name: string;
  type: string;
  /** Variable bindings keyed by property name.
   *  For array properties (fills, strokes, effects) the value is an array. */
  boundVariables: Record<string, LintBoundVariable | LintBoundVariable[] | undefined>;

  // Visual properties (optional – only present when the node actually has them)
  fills?: LintPaint[];
  strokes?: LintPaint[];
  effects?: LintEffect[];
  cornerRadius?: number | 'MIXED';

  // Auto-layout
  layoutMode?: 'NONE' | 'HORIZONTAL' | 'VERTICAL';
  paddingTop?: number;
  paddingRight?: number;
  paddingBottom?: number;
  paddingLeft?: number;
  itemSpacing?: number;

  // Typography (TEXT nodes only)
  fontSize?: number | 'MIXED';
  lineHeight?: LintLineHeight | 'MIXED';
  letterSpacing?: LintLetterSpacing | 'MIXED';

  /** Recursive children */
  children?: LintNode[];
}

/**
 * A component (or component set) discovered during scanning,
 * annotated with its containing page name.
 */
export interface LintComponent {
  node: LintNode;
  pageName: string;
}

// ============================================================================
// Data bundle that the adapters produce for the validators
// ============================================================================

/**
 * All data needed to run the full audit, fetched once by the adapter.
 */
export interface LintData {
  collections: LintVariableCollection[];
  variables: LintVariable[];
  textStyles: LintTextStyle[];
  /** Top-level pages, each containing a tree of nodes */
  pages: Array<{ name: string; children: LintNode[] }>;
}
