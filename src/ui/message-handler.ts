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
  const { type, data } = msg;
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

    // Calculate scores for each section
    const collectionScore = calculateAuditScore(collectionValidation.auditChecks);
    const textStyleScore = calculateAuditScore(combinedTextStyleSync);
    const componentScore = calculateAuditScore(componentBindings.auditChecks);

    // Calculate overall score (weighted average)
    const allChecks = [
      ...collectionValidation.auditChecks,
      ...combinedTextStyleSync,
      ...componentBindings.auditChecks
    ];
    const overallScore = calculateAuditScore(allChecks);

    // Send results to UI
    sendMessageToUI('system-audit-result', {
      collectionStructure: collectionValidation.auditChecks,
      textStyleSync: combinedTextStyleSync,
      componentBindings: componentBindings.auditChecks,
      scores: {
        overall: overallScore,
        collection: collectionScore,
        textStyle: textStyleScore,
        component: componentScore
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
 * Calculate audit score from checks
 */
function calculateAuditScore(checks: any[]): number {
  if (checks.length === 0) return 100;

  const passCount = checks.filter(c => c.status === 'pass').length;
  const totalCount = checks.length;

  return Math.round((passCount / totalCount) * 100);
}

/**
 * Initialize plugin
 */
export function initializePlugin(): void {
  console.log('🚀 ctdsLint initialized (CTDS Audit only)');
}
