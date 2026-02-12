/// <reference types="@figma/plugin-typings" />

// Core Plugin Types
export interface PluginMessage {
  type: string;
  data?: any;
}

// Audit Types (used by collection-validator)
export interface AuditCheck {
  check: string;
  status: 'pass' | 'fail' | 'warning';
  suggestion: string;
}

// Utility Types
export type ValidNodeType = 'FRAME' | 'COMPONENT' | 'COMPONENT_SET' | 'INSTANCE' | 'GROUP';
