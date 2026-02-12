/// <reference types="@figma/plugin-typings" />

import { sendMessageToUI } from '../utils/figma-helpers';
import {
  validateCollectionStructure,
  validateTextStylesAgainstVariables,
  validateTextStyleBindings,
  validateAllComponentBindings
} from '../core/collection-validator';

/**
 * Main message handler for UI communication (CTDS Audit only)
 */
export async function handleUIMessage(msg: any): Promise<void> {
  const { type } = msg;
  console.log('Received message:', type);

  try {
    switch (type) {
      case 'analyze-system':
        await handleSystemAudit();
        break;
      default:
        console.warn('Unknown message type:', type);
    }
  } catch (error) {
    console.error('Error handling message:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    sendMessageToUI('system-audit-result', { error: errorMessage });
  }
}

/**
 * System audit (CTDS Audit) - validates design system structure
 */
async function handleSystemAudit(): Promise<void> {
  try {
    console.log('🔍 Running CTDS audit...');

    // Run all system-level validations
    const [collectionValidation, textStyleSync, textStyleBindings, componentBindings] = await Promise.all([
      validateCollectionStructure(),
      validateTextStylesAgainstVariables(),
      validateTextStyleBindings(),
      validateAllComponentBindings()
    ]);

    // Combine text style checks
    const combinedTextStyleSync = [
      ...textStyleSync.auditChecks,
      ...textStyleBindings.auditChecks
    ];

    // Calculate scores for each section with detailed counts
    const allChecks = [
      ...collectionValidation.auditChecks,
      ...combinedTextStyleSync,
      ...componentBindings.auditChecks
    ];

    const overallStats = calculateAuditStats(allChecks);
    const collectionStats = calculateAuditStats(collectionValidation.auditChecks);
    const textStyleStats = calculateAuditStats(combinedTextStyleSync);
    const componentStats = calculateAuditStats(componentBindings.auditChecks);

    // Send results to UI
    sendMessageToUI('system-audit-result', {
      collectionStructure: collectionValidation.auditChecks,
      textStyleSync: combinedTextStyleSync,
      componentBindings: componentBindings.auditChecks,
      scores: {
        overall: overallStats,
        collection: collectionStats,
        textStyle: textStyleStats,
        component: componentStats
      }
    });

    console.log('✅ CTDS audit complete');
  } catch (error) {
    console.error('❌ CTDS audit error:', error);
    sendMessageToUI('system-audit-result', {
      error: error instanceof Error ? error.message : 'Unknown error during system audit'
    });
  }
}

/**
 * Calculate audit statistics from checks
 */
function calculateAuditStats(checks: any[]): { score: number; passed: number; warnings: number; failed: number; total: number } {
  if (checks.length === 0) {
    return { score: 100, passed: 0, warnings: 0, failed: 0, total: 0 };
  }

  const passed = checks.filter(c => c.status === 'pass').length;
  const warnings = checks.filter(c => c.status === 'warning').length;
  const failed = checks.filter(c => c.status === 'fail').length;
  const total = checks.length;
  const score = Math.round((passed / total) * 100);

  return { score, passed, warnings, failed, total };
}

/**
 * Initialize plugin
 */
export function initializePlugin(): void {
  console.log('🚀 ctdsLint initialized (CTDS Audit only)');
}
