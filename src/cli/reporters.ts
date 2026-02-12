/**
 * Output reporters for the CLI.
 *
 * Each reporter takes the structured audit results and writes them in a
 * particular format (JSON file, HTML standalone report, console summary).
 */

import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { AuditCheck } from '../types';

// ============================================================================
// Types
// ============================================================================

export interface AuditResults {
  fileKey: string;
  fileName: string;
  timestamp: string;
  scores: {
    overall: ScoreStats;
    collection: ScoreStats;
    textStyle: ScoreStats;
    component: ComponentScoreStats;
  };
  collectionStructure: AuditCheck[];
  textStyleSync: AuditCheck[];
  componentBindings: AuditCheck[];
}

export interface ScoreStats {
  score: number;
  passed: number;
  warnings: number;
  failed: number;
  total: number;
}

export interface ComponentScoreStats {
  score: number;
  passed: number;
  failed: number;
  total: number;
}

// ============================================================================
// Console Reporter
// ============================================================================

function statusIcon(status: string): string {
  switch (status) {
    case 'pass': return '\u2705'; // green check
    case 'fail': return '\u274C'; // red cross
    case 'warning': return '\u26A0\uFE0F'; // warning
    default: return '\u2022';
  }
}

export function reportToConsole(results: AuditResults): void {
  const { scores } = results;

  console.log('\n' + '='.repeat(60));
  console.log(`  ctdsLint Audit Report — ${results.fileName}`);
  console.log(`  ${results.timestamp}`);
  console.log('='.repeat(60));

  // Overall score
  console.log(`\n  Overall score: ${scores.overall.score}%  (${scores.overall.passed} passed, ${scores.overall.failed} failed of ${scores.overall.total})`);

  // Collection section
  if (results.collectionStructure.length > 0) {
    console.log(`\n--- Collection Structure (${scores.collection.score}%) ---`);
    for (const check of results.collectionStructure) {
      console.log(`  ${statusIcon(check.status)} ${check.check}`);
    }
  }

  // Text style section
  if (results.textStyleSync.length > 0) {
    console.log(`\n--- Text Styles (${scores.textStyle.score}%) ---`);
    for (const check of results.textStyleSync) {
      console.log(`  ${statusIcon(check.status)} ${check.check}`);
    }
  }

  // Component section
  if (results.componentBindings.length > 0) {
    console.log(`\n--- Components (${scores.component.score}%) ---`);
    for (const check of results.componentBindings) {
      const page = (check as any).pageName ? ` [${(check as any).pageName}]` : '';
      console.log(`  ${statusIcon(check.status)} ${check.check}${page}`);
    }
  }

  console.log('\n' + '='.repeat(60) + '\n');
}

// ============================================================================
// JSON Reporter
// ============================================================================

export function reportToJsonFile(results: AuditResults, outputPath: string): void {
  const absPath = resolve(outputPath);
  writeFileSync(absPath, JSON.stringify(results, null, 2), 'utf-8');
  console.log(`JSON report written to: ${absPath}`);
}

// ============================================================================
// HTML Reporter
// ============================================================================

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/\n/g, '<br>');
}

function htmlStatusBadge(status: string): string {
  const colors: Record<string, string> = {
    pass: '#22c55e',
    fail: '#ef4444',
    warning: '#f59e0b',
  };
  const bg = colors[status] || '#6b7280';
  return `<span style="display:inline-block;padding:2px 8px;border-radius:4px;background:${bg};color:#fff;font-size:12px;font-weight:600;">${status.toUpperCase()}</span>`;
}

function buildChecksHtml(checks: AuditCheck[]): string {
  if (checks.length === 0) return '<p style="color:#6b7280;">No checks in this section.</p>';
  return checks
    .map(c => {
      const page = (c as any).pageName ? ` <span style="color:#6b7280;font-size:12px;">[${escapeHtml((c as any).pageName)}]</span>` : '';
      return `<div style="margin:8px 0;padding:8px 12px;border-left:3px solid ${c.status === 'pass' ? '#22c55e' : c.status === 'fail' ? '#ef4444' : '#f59e0b'};background:#fafafa;border-radius:0 4px 4px 0;">
  <div>${htmlStatusBadge(c.status)} <strong>${escapeHtml(c.check)}</strong>${page}</div>
  <div style="margin-top:4px;font-size:13px;color:#374151;">${escapeHtml(c.suggestion)}</div>
</div>`;
    })
    .join('\n');
}

export function reportToHtmlFile(results: AuditResults, outputPath: string): void {
  const { scores } = results;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>ctdsLint Report — ${escapeHtml(results.fileName)}</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #1f2937; background: #f9fafb; padding: 32px; max-width: 900px; margin: 0 auto; }
  h1 { font-size: 24px; margin-bottom: 4px; }
  .meta { color: #6b7280; font-size: 14px; margin-bottom: 24px; }
  .score-card { display:flex; gap:16px; margin-bottom: 32px; flex-wrap: wrap; }
  .score-item { flex:1; min-width:160px; background:#fff; border-radius:8px; padding:16px; box-shadow:0 1px 3px rgba(0,0,0,0.1); text-align:center; }
  .score-number { font-size:36px; font-weight:700; }
  .score-label { font-size:13px; color:#6b7280; }
  .section { margin-bottom: 32px; }
  .section h2 { font-size: 18px; margin-bottom: 12px; padding-bottom: 8px; border-bottom: 1px solid #e5e7eb; }
</style>
</head>
<body>
<h1>ctdsLint Audit Report</h1>
<div class="meta">${escapeHtml(results.fileName)} &mdash; ${escapeHtml(results.timestamp)}</div>

<div class="score-card">
  <div class="score-item"><div class="score-number">${scores.overall.score}%</div><div class="score-label">Overall</div></div>
  <div class="score-item"><div class="score-number">${scores.collection.score}%</div><div class="score-label">Collections</div></div>
  <div class="score-item"><div class="score-number">${scores.textStyle.score}%</div><div class="score-label">Text Styles</div></div>
  <div class="score-item"><div class="score-number">${scores.component.score}%</div><div class="score-label">Components</div></div>
</div>

<div class="section">
  <h2>Collection Structure</h2>
  ${buildChecksHtml(results.collectionStructure)}
</div>

<div class="section">
  <h2>Text Styles</h2>
  ${buildChecksHtml(results.textStyleSync)}
</div>

<div class="section">
  <h2>Component Bindings</h2>
  ${buildChecksHtml(results.componentBindings)}
</div>

</body>
</html>`;

  const absPath = resolve(outputPath);
  writeFileSync(absPath, html, 'utf-8');
  console.log(`HTML report written to: ${absPath}`);
}

// ============================================================================
// Score Helpers (shared between CLI and reporters)
// ============================================================================

export function calculateAuditStats(checks: AuditCheck[]): ScoreStats {
  if (checks.length === 0) {
    return { score: 100, passed: 0, warnings: 0, failed: 0, total: 0 };
  }
  const passed = checks.filter(c => c.status === 'pass').length;
  const failed = checks.filter(c => c.status === 'fail').length;
  const total = checks.length;
  const score = Math.round((passed / total) * 100);
  return { score, passed, warnings: 0, failed, total };
}

export function calculateComponentStats(checks: AuditCheck[]): ComponentScoreStats {
  if (checks.length === 0) {
    return { score: 100, passed: 0, failed: 0, total: 0 };
  }
  const passed = checks.filter(c => c.status === 'pass').length;
  const failed = checks.filter(c => c.status === 'fail').length;
  const total = checks.length;
  const score = Math.round((passed / total) * 100);
  return { score, passed, failed, total };
}
