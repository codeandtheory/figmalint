/**
 * Figma REST API client for the CLI.
 *
 * Calls the Figma REST API with a Personal Access Token (PAT) and
 * returns the raw JSON responses typed just enough for the adapter
 * to convert them into the shared `LintData` types.
 */

const FIGMA_API_BASE = 'https://api.figma.com/v1';

// ============================================================================
// REST API Response Types
// ============================================================================

/** Subset of the GET /v1/files/:key response we actually use. */
export interface FigmaFileResponse {
  name: string;
  document: FigmaDocumentNode;
  components: Record<string, FigmaComponentMeta>;
  componentSets: Record<string, FigmaComponentMeta>;
  styles: Record<string, FigmaStyleMeta>;
}

export interface FigmaDocumentNode {
  id: string;
  name: string;
  type: string;
  children?: FigmaNode[];
}

export interface FigmaNode {
  id: string;
  name: string;
  type: string;
  visible?: boolean;
  children?: FigmaNode[];

  // Visual properties
  fills?: FigmaRestPaint[];
  strokes?: FigmaRestPaint[];
  effects?: FigmaRestEffect[];
  cornerRadius?: number;
  rectangleCornerRadii?: number[];

  // Auto-layout
  layoutMode?: string;
  paddingTop?: number;
  paddingRight?: number;
  paddingBottom?: number;
  paddingLeft?: number;
  itemSpacing?: number;

  // Typography (TEXT nodes)
  style?: FigmaTypeStyle;

  // Variable bindings
  boundVariables?: Record<string, FigmaRestBoundVariable | FigmaRestBoundVariable[]>;
}

export interface FigmaRestPaint {
  type: string;
  visible?: boolean;
  color?: FigmaRestColor;
  opacity?: number;
}

export interface FigmaRestColor {
  r: number;
  g: number;
  b: number;
  a: number;
}

export interface FigmaRestEffect {
  type: string;
  visible?: boolean;
  color?: FigmaRestColor;
  offset?: { x: number; y: number };
  radius?: number;
  spread?: number;
}

export interface FigmaRestBoundVariable {
  type: string; // "VARIABLE_ALIAS"
  id: string;
}

export interface FigmaTypeStyle {
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: number;
  letterSpacing?: number;
  lineHeightPx?: number;
  lineHeightPercent?: number;
  lineHeightPercentFontSize?: number;
  lineHeightUnit?: string;
  letterSpacingUnit?: string;
}

export interface FigmaComponentMeta {
  key: string;
  name: string;
  description: string;
}

export interface FigmaStyleMeta {
  key: string;
  name: string;
  styleType: string;
  description: string;
}

// ---- Variables API ----

/** Subset of GET /v1/files/:key/variables/local response */
export interface FigmaVariablesResponse {
  status: number;
  error: boolean;
  meta: {
    variableCollections: Record<string, FigmaRestVariableCollection>;
    variables: Record<string, FigmaRestVariable>;
  };
}

export interface FigmaRestVariableCollection {
  id: string;
  name: string;
  modes: Array<{ modeId: string; name: string }>;
  defaultModeId: string;
  variableIds: string[];
}

export interface FigmaRestVariable {
  id: string;
  name: string;
  variableCollectionId: string;
  resolvedType: string;
  valuesByMode: Record<string, FigmaRestVariableValue>;
}

export type FigmaRestVariableValue =
  | number
  | string
  | boolean
  | FigmaRestColor
  | FigmaRestVariableAlias;

export interface FigmaRestVariableAlias {
  type: 'VARIABLE_ALIAS';
  id: string;
}

// ---- Styles API ----

/** Subset of GET /v1/files/:key/styles response */
export interface FigmaStylesResponse {
  status: number;
  error: boolean;
  meta: {
    styles: FigmaPublishedStyle[];
  };
}

export interface FigmaPublishedStyle {
  key: string;
  file_key: string;
  node_id: string;
  style_type: string;
  name: string;
  description: string;
}

// ============================================================================
// Client
// ============================================================================

export interface FigmaApiClientOptions {
  token: string;
  /** Override the base URL (useful for tests / proxies) */
  baseUrl?: string;
}

export class FigmaApiClient {
  private token: string;
  private baseUrl: string;

  constructor(options: FigmaApiClientOptions) {
    this.token = options.token;
    this.baseUrl = options.baseUrl ?? FIGMA_API_BASE;
  }

  // ---- helpers ----

  private async request<T>(path: string): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const response = await fetch(url, {
      headers: {
        'X-Figma-Token': this.token,
      },
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(
        `Figma API ${response.status} ${response.statusText} – ${path}\n${body}`
      );
    }

    return response.json() as Promise<T>;
  }

  // ---- public methods ----

  /**
   * GET /v1/files/:key
   *
   * Returns the full document tree including node properties, fills,
   * strokes, effects, boundVariables, etc.
   */
  async getFile(fileKey: string): Promise<FigmaFileResponse> {
    return this.request<FigmaFileResponse>(`/files/${fileKey}`);
  }

  /**
   * GET /v1/files/:key/variables/local
   *
   * Returns all local variable collections and variables.
   * **Requires Figma Enterprise plan.**
   */
  async getLocalVariables(fileKey: string): Promise<FigmaVariablesResponse> {
    return this.request<FigmaVariablesResponse>(
      `/files/${fileKey}/variables/local`
    );
  }

  /**
   * GET /v1/files/:key/styles
   *
   * Returns published styles for the file.
   */
  async getStyles(fileKey: string): Promise<FigmaStylesResponse> {
    return this.request<FigmaStylesResponse>(`/files/${fileKey}/styles`);
  }

  /**
   * GET /v1/files/:key/nodes?ids=...
   *
   * Returns specific nodes by ID with full properties.
   */
  async getNodes(
    fileKey: string,
    nodeIds: string[]
  ): Promise<{ nodes: Record<string, { document: FigmaNode }> }> {
    const ids = nodeIds.join(',');
    return this.request(`/files/${fileKey}/nodes?ids=${encodeURIComponent(ids)}`);
  }
}
