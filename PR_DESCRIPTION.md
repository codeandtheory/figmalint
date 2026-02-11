# Remove Component Audit, Keep CTDS Audit Only

## Summary

This PR simplifies FigmaLint by removing all AI-based Component Audit features and focusing exclusively on the CTDS (Comprehensive Design Token System) Audit. The API key is now only required for the Chat feature, making the core audit functionality immediately accessible to all users.

## Motivation

- **Reduce Friction**: Users can now run CTDS Audit without needing to obtain and configure an API key
- **Focus on Core Value**: CTDS Audit provides deterministic, local validation of design system compliance
- **Clear Separation**: Distinguishes between local validation (CTDS) and AI-powered features (Chat)
- **Simpler UX**: Streamlined interface with reduced cognitive load

## Changes

### UI Changes (`ui-enhanced.html`)

#### Analyze Tab (Simplified)
**Removed:**
- ❌ Component Audit section (AI-based analysis)
- ❌ Property Cheat Sheet
- ❌ Token Analysis with AI suggestions
- ❌ AI Interpretation section
- ❌ Component Metadata
- ❌ Developer Handoff export
- ❌ Quick Actions bar
- ❌ API key configuration card
- ❌ Batch mode toggle

**Added:**
- ✅ Single "Run CTDS Audit" button (always visible, no API key needed)
- ✅ CTDS Audit Results display

#### Chat Tab (Enhanced)
**Added:**
- ✅ Complete API key configuration (moved from Analyze tab)
- ✅ Provider selection (Anthropic Claude / OpenAI GPT / Google Gemini)
- ✅ Model selection dropdown
- ✅ API key input with save/clear functionality
- ✅ Status messages for API key state

**Removed:**
- ❌ Footer "Clear API key" link (now in Chat tab config)

### Backend Changes (`src/ui/message-handler.ts`)

**Removed Message Handlers:**
- ❌ `case 'analyze'`
- ❌ `case 'analyze-enhanced'`

**Commented Out Functions:**
- `handleEnhancedAnalyze()` (~150 lines) - AI-based component analysis
- `handleBatchAnalysis()` (~90 lines) - Batch component analysis
- `handleAnalyzeComponent()` - Legacy wrapper

**Kept Unchanged:**
- ✅ `handleSystemAudit()` - CTDS Audit (already didn't require API key)
- ✅ `handleChatMessage()` - Chat feature (requires API key)
- ✅ All CTDS validation functions in `collection-validator.ts`
- ✅ All auto-fix handlers (token fixes, naming fixes, etc.)

### Files Modified

- `ui-enhanced.html` - Complete UI restructuring
- `src/ui/message-handler.ts` - Removed Component Audit handlers
- `dist/code.js` - Rebuilt bundle
- `dist/ui-enhanced.html` - Rebuilt UI

### Files Unchanged (No Changes Needed)

- `src/core/collection-validator.ts` - All CTDS validation logic is local
- `src/core/token-analyzer.ts` - Only used by removed Component Audit
- `src/core/component-analyzer.ts` - Only used by removed Component Audit
- `src/api/*` - AI provider integration (used only by Chat now)

## What Still Works

### ✅ CTDS Audit (No API Key Required)
All design system validation features work immediately:

1. **Variable Collection Structure**
   - Validates collection naming (Primitives, Brand, Theme)
   - Checks variable categorization
   - Verifies Theme→Primitives aliasing patterns

2. **Text Style Validation**
   - Checks text style naming sync with font-family variables
   - Validates typography pattern consistency

3. **Text Style Variable Bindings**
   - Ensures text styles use variables for font-family, font-size, line-height, letter-spacing
   - Detects raw/hard-coded values

4. **Component Variable Bindings**
   - Scans all components for raw values vs variable bindings
   - Categorizes by type (fill, stroke, effect, spacing, corner radius, typography)

### ✅ Chat (Requires API Key)
- Design systems Q&A with AI
- Access to design systems knowledge base
- Component context awareness
- CTDS Audit results integration

## Testing

### Build Status
```bash
npm run build
✅ dist/code.js  164.6kb
⚡ Done in 10ms
```

### Manual Testing Checklist
- [ ] CTDS Audit button is visible on Analyze tab without API key
- [ ] Click "Run CTDS Audit" - should run and display results
- [ ] Navigate to Chat tab - API key configuration is visible
- [ ] Chat input disabled until API key saved
- [ ] Save API key - Chat becomes enabled
- [ ] Clear API key - Chat becomes disabled, CTDS Audit still works
- [ ] Switch between tabs - state persists correctly

## Migration Notes

### For Users
- **No action needed** - CTDS Audit works immediately
- To use Chat, configure API key in Chat tab (not Analyze tab)
- All previous CTDS Audit features remain unchanged

### For Developers
- Component Audit code commented out (not deleted) for reference
- Can be restored if needed in future
- All commented code clearly marked with `// Removed:` comments

## Impact

### Before
- ❌ Users had to obtain API key before using any features
- ❌ Component Audit required AI calls (cost, latency, API limits)
- ❌ Mixed AI and local features created confusion

### After
- ✅ Users can run CTDS Audit immediately
- ✅ Clear separation: CTDS (local) vs Chat (AI)
- ✅ Reduced barrier to entry
- ✅ Lower cognitive load

## Screenshots

_TODO: Add screenshots of new UI showing:_
1. Analyze tab with single CTDS Audit button
2. CTDS Audit results display
3. Chat tab with API key configuration

## Breaking Changes

⚠️ **Component Audit Features Removed:**
- AI-based component analysis
- Property extraction and suggestions
- Token analysis with AI recommendations
- AI interpretation of components
- Developer handoff exports
- Batch mode analysis

Users relying on these features should continue using v2.3.0 until alternative solutions are available.

## Next Steps

Potential follow-up work:
- [ ] Add more CTDS validation rules
- [ ] Enhance CTDS Audit results visualization
- [ ] Export CTDS Audit results (JSON/CSV)
- [ ] Add filtering/sorting to audit results
- [ ] Consider adding non-AI component metadata extraction

---

**Size Impact:**
- Lines removed: 5,585
- Lines added: 1,709
- Net reduction: **-3,876 lines** (simplified codebase)
- Bundle size: 164.6kb (unchanged)

**Commit:** `503a570`
**Branch:** `feature/ctds-only`
