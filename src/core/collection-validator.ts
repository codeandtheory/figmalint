/**
 * Core validation logic for CT/DS design system auditing.
 *
 * All validators accept API-agnostic data types from `../shared/types`
 * so they work identically whether driven by the Figma Plugin API
 * or the Figma REST API via the CLI.
 */

import { AuditCheck } from '../types';
import type {
  LintVariable,
  LintVariableCollection,
  LintVariableAlias,
  LintTextStyle,
  LintNode,
  LintComponent,
  LintRGBA,
  LintSolidPaint,
  LintBoundVariable,
} from '../shared/types';

// ============================================================================
// Types
// ============================================================================

/**
 * Expected structure for a variable collection
 */
export interface CollectionRequirement {
  /** Pattern to match collection name (case-insensitive) */
  namePattern: RegExp;
  /** Human-readable name for error messages */
  displayName: string;
  /** Required top-level categories (variable name prefixes before first "/") */
  requiredCategories: CategoryRequirement[];
}

/**
 * Required category within a collection
 */
export interface CategoryRequirement {
  /** Category name (e.g., "color", "space") */
  name: string;
  /** Optional sub-categories required within this category */
  subCategories?: string[];
  /** If true, sub-categories can partially match (contain) the required names. Default: false (exact match) */
  subCategoryPartialMatch?: boolean;
  /** Optional pattern that sub-categories must follow (e.g., t-shirt sizes) */
  subCategoryPattern?: {
    /** Regex pattern to match valid sub-category names */
    pattern: RegExp;
    /** Human-readable description of the expected pattern */
    description: string;
    /** Example valid values */
    examples: string[];
  };
  /** Optional: mirror sub-categories from another category (e.g., line-height mirrors font-size) */
  mirrorCategory?: string;
}

/**
 * Result of validating a single collection
 */
export interface CollectionValidationResult {
  /** Collection name */
  collectionName: string;
  /** Which requirement it matched */
  matchedRequirement: string;
  /** Whether all requirements are met */
  isValid: boolean;
  /** Categories that were found */
  foundCategories: string[];
  /** Categories that are missing */
  missingCategories: string[];
  /** Sub-category validation results */
  subCategoryResults: SubCategoryResult[];
}

/**
 * Result of validating sub-categories
 */
export interface SubCategoryResult {
  /** Parent category name */
  category: string;
  /** Found sub-categories */
  found: string[];
  /** Missing sub-categories */
  missing: string[];
  /** Pattern validation result (if pattern was used) */
  patternValidation?: {
    /** Whether all sub-categories match the pattern */
    allMatch: boolean;
    /** Sub-categories that don't match the pattern */
    invalidNames: string[];
    /** Description of the expected pattern */
    patternDescription: string;
    /** Example valid values */
    examples: string[];
  };
  /** Mirror validation result (if mirrorCategory was used) */
  mirrorValidation?: {
    /** The category being mirrored */
    sourceCategory: string;
    /** Sub-categories that exist in source but missing in this category */
    missingSizes: string[];
    /** Sub-categories that exist in this category but not in source */
    extraSizes: string[];
    /** Whether this category fully mirrors the source */
    isFullMatch: boolean;
  };
}

/**
 * Overall validation result for all collections
 */
export interface CollectionStructureValidation {
  /** Whether all required collections exist */
  hasAllCollections: boolean;
  /** Collections that were found and validated */
  validatedCollections: CollectionValidationResult[];
  /** Required collections that are missing entirely */
  missingCollections: string[];
  /** Audit checks to display in UI */
  auditChecks: AuditCheck[];
}

// ============================================================================
// Default Requirements Configuration
// ============================================================================

/**
 * Default collection structure requirements
 * Customize this to match your design system's conventions
 */
export const DEFAULT_COLLECTION_REQUIREMENTS: CollectionRequirement[] = [
  {
    namePattern: /primitives?/i,
    displayName: 'Primitives',
    requiredCategories: [
      { name: 'color' }
    ]
  },
  {
    namePattern: /brand/i,
    displayName: 'Brand',
    requiredCategories: [
      { name: 'color' },
      { 
        name: 'typography',
        subCategories: ['font-family', 'font-weight', 'font-size', 'letter-spacing', 'line-height']
      }
    ]
  },
  {
    namePattern: /theme/i,
    displayName: 'Theme',
    requiredCategories: [
      { 
        name: 'colors',
        subCategories: ['bg', 'text', 'border']
      },
      { 
        name: 'font-family',
        subCategories: ['display', 'heading', 'body', 'label'],
        subCategoryPartialMatch: true // e.g., "display-primary" matches "display"
      },
      { name: 'font-weight' },
      { 
        name: 'font-size',
        subCategoryPattern: {
          pattern: /^(\d+)?(x+)?(xs|sm|md|lg|xl)$/i,
          description: 't-shirt size naming convention',
          examples: ['xs', 'sm', 'md', 'lg', 'xl', '2xl', '3xl', '2xs', '3xs']
        }
      },
      { 
        name: 'line-height',
        mirrorCategory: 'font-size'
      },
      { 
        name: 'letter-spacing',
        mirrorCategory: 'font-size'
      },
      { name: 'spacing' }
    ]
  }
];

// ============================================================================
// Validation Functions
// ============================================================================

/**
 * Validate all variable collections against the required structure.
 *
 * @param collections - Variable collections from the adapter
 * @param allVariables - All variables from the adapter
 * @param requirements - Collection requirements to validate against (defaults to DEFAULT_COLLECTION_REQUIREMENTS)
 * @returns Validation results with audit checks
 */
export function validateCollectionStructure(
  collections: LintVariableCollection[],
  allVariables: LintVariable[],
  requirements: CollectionRequirement[] = DEFAULT_COLLECTION_REQUIREMENTS
): CollectionStructureValidation {
  console.log('🔍 [COLLECTION] Starting collection structure validation...');
  
  const validatedCollections: CollectionValidationResult[] = [];
  const missingCollections: string[] = [];
  const auditChecks: AuditCheck[] = [];
  
  try {
    console.log(`🔍 [COLLECTION] Found ${collections.length} local collections:`, collections.map(c => c.name));
    console.log(`🔍 [COLLECTION] Found ${allVariables.length} total variables`);
    
    // Group variables by collection ID
    const variablesByCollection = new Map<string, LintVariable[]>();
    for (const variable of allVariables) {
      const existing = variablesByCollection.get(variable.variableCollectionId) || [];
      existing.push(variable);
      variablesByCollection.set(variable.variableCollectionId, existing);
    }
    
    // Pre-check: Find Primitives and Theme collections for alias checking
    const primitivesCollection = collections.find(c => /primitives?/i.test(c.name));
    const themeCollection = collections.find(c => /theme/i.test(c.name));
    const brandCollection = collections.find(c => /brand/i.test(c.name));
    
    // Check if Theme variables are aliased to Primitives
    let themeConnectedToPrimitives = false;
    if (primitivesCollection && themeCollection && !brandCollection) {
      const themeVariables = variablesByCollection.get(themeCollection.id) || [];
      const primitivesVariableIds = new Set(
        (variablesByCollection.get(primitivesCollection.id) || []).map(v => v.id)
      );
      
      // Check if any Theme variables reference Primitives variables
      let aliasCount = 0;
      for (const themeVar of themeVariables) {
        const valuesByMode = themeVar.valuesByMode;
        for (const modeId of Object.keys(valuesByMode)) {
          const value = valuesByMode[modeId];
          // Check if value is an alias (references another variable)
          if (value && typeof value === 'object' && 'type' in value && (value as LintVariableAlias).type === 'VARIABLE_ALIAS') {
            const aliasId = (value as LintVariableAlias).id;
            if (primitivesVariableIds.has(aliasId)) {
              aliasCount++;
            }
          }
        }
      }
      
      // Consider connected if at least 10% of theme variables reference primitives
      themeConnectedToPrimitives = aliasCount > 0 && (aliasCount / themeVariables.length) >= 0.1;
      console.log(`🔗 [COLLECTION] Theme-Primitives connection: ${aliasCount} aliases found, connected=${themeConnectedToPrimitives}`);
    }
    
    // Check each requirement
    for (const requirement of requirements) {
      // Find matching collection
      const matchingCollection = collections.find(c => 
        requirement.namePattern.test(c.name)
      );
      
      if (!matchingCollection) {
        // Special case: Brand collection is optional if Theme is connected to Primitives
        if (requirement.displayName === 'Brand' && themeConnectedToPrimitives) {
          console.log(`✅ [COLLECTION] Brand collection optional - Theme is connected to Primitives`);
          auditChecks.push({
            check: `${requirement.displayName} collection`,
            status: 'pass',
            suggestion: `Brand collection not required - Theme variables are connected directly to Primitives. This is a valid design token architecture.`
          });
          continue;
        }
        
        // Collection doesn't exist - suggest creating it (info, not failure)
        console.log(`ℹ️ [COLLECTION] No "${requirement.displayName}" collection found - suggesting creation`);
        const examples = requirement.requiredCategories.map(cat => {
          switch (cat.name) {
            case 'color':
              return `  - color/primary, color/secondary, color/accent (brand colors)`;
            case 'space':
              return `  - space/xs, space/sm, space/md, space/lg, space/xl (spacing scale)`;
            case 'radius':
              return `  - radius/sm, radius/md, radius/lg (corner radii)`;
            default:
              return `  - ${cat.name}/...`;
          }
        }).join('\n');

        auditChecks.push({
          check: `${requirement.displayName} collection`,
          status: 'fail',
          suggestion: `No "${requirement.displayName}" collection found. Create one with these categories:\n\n${examples}\n\nThis collection is required for a complete design system structure.`
        });
        continue;
      }
      
      console.log(`✅ [COLLECTION] Found ${requirement.displayName} collection: "${matchingCollection.name}"`);
      
      // Get variables in this collection
      const collectionVariables = variablesByCollection.get(matchingCollection.id) || [];
      
      // Extract top-level categories from variable names
      const categories = extractCategories(collectionVariables);
      console.log(`🔍 [COLLECTION] Categories in ${matchingCollection.name}:`, Array.from(categories.keys()));
      
      // Validate required categories
      const validationResult = validateCategories(
        matchingCollection.name,
        requirement,
        categories
      );
      
      validatedCollections.push(validationResult);
      
      // Generate audit checks for this collection
      if (validationResult.isValid) {
        auditChecks.push({
          check: `${requirement.displayName} collection structure`,
          status: 'pass',
          suggestion: `"${matchingCollection.name}" has all required categories: ${validationResult.foundCategories.join(', ')}`
        });
      } else {
        // Missing top-level categories
        if (validationResult.missingCategories.length > 0) {
          const missingExamples = validationResult.missingCategories.map(cat => {
            switch (cat) {
              case 'color':
                return `  - ${cat}/primary, ${cat}/secondary, ${cat}/accent`;
              case 'space':
                return `  - ${cat}/xs, ${cat}/sm, ${cat}/md, ${cat}/lg`;
              case 'radius':
                return `  - ${cat}/sm, ${cat}/md, ${cat}/lg`;
              default:
                return `  - ${cat}/*`;
            }
          }).join('\n');

          auditChecks.push({
            check: `${requirement.displayName} collection categories`,
            status: 'fail',
            suggestion: `"${matchingCollection.name}" collection is missing required categories: ${validationResult.missingCategories.join(', ')}.\n\nAdd variables following these patterns:\n${missingExamples}\n\nThese categories are essential for a complete ${requirement.displayName} collection.`
          });
        }
        
        // Missing sub-categories (exact match)
        for (const subResult of validationResult.subCategoryResults) {
          if (subResult.missing.length > 0) {
            const missingList = subResult.missing.slice(0, 5).join(', ') + (subResult.missing.length > 5 ? `, and ${subResult.missing.length - 5} more` : '');
            const exampleVars = subResult.missing.slice(0, 3).map(m => `  - ${subResult.category}/${m}`).join('\n');

            auditChecks.push({
              check: `${requirement.displayName} ${subResult.category} sub-categories`,
              status: 'fail',
              suggestion: `"${matchingCollection.name}" ${subResult.category} category is missing sub-categories: ${missingList}.\n\nAdd these variables to complete your ${subResult.category} scale:\n${exampleVars}\n\nConsistent sub-categories across all categories are required for a complete design system.`
            });
          }
          
          // Pattern validation issues
          if (subResult.patternValidation) {
            const { patternDescription, examples } = subResult.patternValidation;
            if (subResult.found.length === 0) {
              // No valid sub-categories at all - this is a real problem
              const exampleVars = examples.slice(0, 3).map(ex => `  - ${ex}`).join('\n');

              auditChecks.push({
                check: `${requirement.displayName} ${subResult.category} naming`,
                status: 'fail',
                suggestion: `"${matchingCollection.name}" ${subResult.category} category has no sub-categories following the expected naming pattern.\n\nExpected pattern: ${patternDescription}\n\nAdd variables like:\n${exampleVars}\n\nConsistent naming is required for a predictable design system.`
              });
            } else {
              // Has valid sub-categories - pass!
              const foundList = subResult.found.slice(0, 5).join(', ') + (subResult.found.length > 5 ? `... (${subResult.found.length} total)` : '');

              auditChecks.push({
                check: `${requirement.displayName} ${subResult.category} naming`,
                status: 'pass',
                suggestion: `"${matchingCollection.name}" ${subResult.category} follows the correct naming pattern with sizes: ${foundList}`
              });
            }
          }
          
          // Mirror validation issues (e.g., line-height should mirror font-size)
          if (subResult.mirrorValidation) {
            const { sourceCategory, missingSizes, extraSizes, isFullMatch } = subResult.mirrorValidation;
            if (missingSizes.length > 0) {
              const missingList = missingSizes.slice(0, 5).join(', ') + (missingSizes.length > 5 ? `, and ${missingSizes.length - 5} more` : '');
              const exampleVars = missingSizes.slice(0, 3).map(sz => `  - ${subResult.category}/${sz}`).join('\n');

              auditChecks.push({
                check: `${requirement.displayName} ${subResult.category} sizes`,
                status: 'fail',
                suggestion: `"${matchingCollection.name}" ${subResult.category} is missing sizes that exist in ${sourceCategory}: ${missingList}.\n\nAdd these variables to mirror your ${sourceCategory} scale:\n${exampleVars}\n\nKeeping ${subResult.category} and ${sourceCategory} synchronized is required for consistent typography.`
              });
            }
            if (extraSizes.length > 0) {
              const extraList = extraSizes.slice(0, 5).join(', ') + (extraSizes.length > 5 ? `, and ${extraSizes.length - 5} more` : '');

              auditChecks.push({
                check: `${requirement.displayName} ${subResult.category} extra sizes`,
                status: 'fail',
                suggestion: `"${matchingCollection.name}" ${subResult.category} has sizes that don't exist in ${sourceCategory}: ${extraList}.\n\nFix by either:\n  - Adding these sizes to ${sourceCategory} (if they're needed)\n  - Removing them from ${subResult.category} (if they're unused)\n\nMatched scales are required for consistent typography.`
              });
            }
            if (isFullMatch && subResult.found.length > 0) {
              auditChecks.push({
                check: `${requirement.displayName} ${subResult.category} mirrors ${sourceCategory}`,
                status: 'pass',
                suggestion: `"${matchingCollection.name}" ${subResult.category} correctly mirrors all ${sourceCategory} sizes (${subResult.found.length} sizes matched)`
              });
            }
          }
        }
      }
    }
    
    const hasAllCollections = missingCollections.length === 0;
    
    // Add summary check if we found and validated collections
    if (validatedCollections.length > 0) {
      if (validatedCollections.every(v => v.isValid)) {
        auditChecks.unshift({
          check: 'Variable collection structure',
          status: 'pass',
          suggestion: `All detected collections (${validatedCollections.map(v => v.matchedRequirement).join(', ')}) have proper structure`
        });
      }
    }
    
    console.log('✅ [COLLECTION] Validation complete:', {
      hasAllCollections,
      validatedCount: validatedCollections.length,
      missingCount: missingCollections.length
    });
    
    return {
      hasAllCollections,
      validatedCollections,
      missingCollections,
      auditChecks
    };
    
  } catch (error) {
    console.error('❌ [COLLECTION] Error validating collections:', error);
    return {
      hasAllCollections: false,
      validatedCollections: [],
      missingCollections: requirements.map(r => r.displayName),
      auditChecks: [{
        check: 'Variable collection structure',
        status: 'fail',
        suggestion: `Could not validate variable collections: ${error instanceof Error ? error.message : 'Unknown error'}`
      }]
    };
  }
}

/**
 * Extract category hierarchy from variable names
 * 
 * @param variables - Variables to analyze
 * @returns Map of top-level category to set of sub-categories
 */
function extractCategories(variables: LintVariable[]): Map<string, Set<string>> {
  const categories = new Map<string, Set<string>>();
  
  for (const variable of variables) {
    const parts = variable.name.split('/');
    if (parts.length === 0) continue;
    
    // Get top-level category (normalize to lowercase for comparison)
    const topCategory = parts[0].toLowerCase().trim();
    
    if (!categories.has(topCategory)) {
      categories.set(topCategory, new Set<string>());
    }
    
    // Get sub-categories if they exist
    // Add ALL levels after the first as sub-categories
    // This handles both 2-level (font-size/xl) and 3-level (font-size/display/xl) structures
    for (let i = 1; i < parts.length; i++) {
      const subCategory = parts[i].toLowerCase().trim();
      categories.get(topCategory)!.add(subCategory);
    }
  }
  
  return categories;
}

/**
 * Validate categories against requirements
 */
function validateCategories(
  collectionName: string,
  requirement: CollectionRequirement,
  categories: Map<string, Set<string>>
): CollectionValidationResult {
  const foundCategories: string[] = [];
  const missingCategories: string[] = [];
  const subCategoryResults: SubCategoryResult[] = [];
  
  for (const reqCategory of requirement.requiredCategories) {
    const categoryName = reqCategory.name.toLowerCase();
    
    // Check if category exists with exact name match
    const hasCategory = categories.has(categoryName);
    
    if (hasCategory) {
      foundCategories.push(reqCategory.name);
      const subCategories = categories.get(categoryName) || new Set();
      
      // Check sub-categories if required
      if (reqCategory.subCategories && reqCategory.subCategories.length > 0) {
        const foundSubs: string[] = [];
        const missingSubs: string[] = [];
        const usePartialMatch = reqCategory.subCategoryPartialMatch === true;
        const subCategoriesArray = Array.from(subCategories);
        
        for (const reqSub of reqCategory.subCategories) {
          const subName = reqSub.toLowerCase();
          
          let hasSubCategory: boolean;
          if (usePartialMatch) {
            // Check if any sub-category contains the required name
            hasSubCategory = subCategoriesArray.some(actual => actual.includes(subName));
          } else {
            // Check for exact match only
            hasSubCategory = subCategories.has(subName);
          }
          
          if (hasSubCategory) {
            foundSubs.push(reqSub);
          } else {
            missingSubs.push(reqSub);
          }
        }
        
        subCategoryResults.push({
          category: reqCategory.name,
          found: foundSubs,
          missing: missingSubs
        });
      }
      
      // Check sub-category pattern if specified
      if (reqCategory.subCategoryPattern) {
        const { pattern, description, examples } = reqCategory.subCategoryPattern;
        const subCategoryArray = Array.from(subCategories);
        const invalidNames = subCategoryArray.filter(name => !pattern.test(name));
        const validNames = subCategoryArray.filter(name => pattern.test(name));
        
        subCategoryResults.push({
          category: reqCategory.name,
          found: validNames,
          missing: [], // Pattern validation doesn't have "missing" in the same sense
          patternValidation: {
            allMatch: invalidNames.length === 0 && subCategoryArray.length > 0,
            invalidNames,
            patternDescription: description,
            examples
          }
        });
      }
      
      // Check mirror category if specified (e.g., line-height should mirror font-size)
      if (reqCategory.mirrorCategory) {
        const sourceCategory = reqCategory.mirrorCategory.toLowerCase();
        const sourceSubCategories = categories.get(sourceCategory) || new Set();
        const currentSubCategories = Array.from(subCategories);
        const sourceSubCategoriesArray = Array.from(sourceSubCategories);
        
        // Find sizes that exist in source but missing in current
        const missingSizes = sourceSubCategoriesArray.filter(size => !subCategories.has(size));
        // Find sizes that exist in current but not in source
        const extraSizes = currentSubCategories.filter(size => !sourceSubCategories.has(size));
        
        subCategoryResults.push({
          category: reqCategory.name,
          found: currentSubCategories.filter(size => sourceSubCategories.has(size)),
          missing: missingSizes,
          mirrorValidation: {
            sourceCategory: reqCategory.mirrorCategory,
            missingSizes,
            extraSizes,
            isFullMatch: missingSizes.length === 0 && extraSizes.length === 0
          }
        });
      }
    } else {
      missingCategories.push(reqCategory.name);
    }
  }
  
  // Collection is valid if all top-level categories exist, all exact sub-categories exist, patterns are followed, and mirrors match
  const hasAllCategories = missingCategories.length === 0;
  const hasAllSubCategories = subCategoryResults.every(r => {
    // For exact sub-category matches
    if (r.missing.length > 0) return false;
    // For pattern validation - pass if at least some match (supports 3-level structures)
    if (r.patternValidation && r.patternValidation.allMatch === false && r.found.length === 0) return false;
    // For mirror validation
    if (r.mirrorValidation && !r.mirrorValidation.isFullMatch) return false;
    return true;
  });
  
  return {
    collectionName,
    matchedRequirement: requirement.displayName,
    isValid: hasAllCategories && hasAllSubCategories,
    foundCategories,
    missingCategories,
    subCategoryResults
  };
}

// ============================================================================
// Text Style & Font-Family Variable Validation
// ============================================================================

/**
 * Result of validating text styles against font-family variables
 */
export interface TextStyleValidationResult {
  /** Font-family variable names found (e.g., display, heading, body, label) */
  fontFamilyVariables: string[];
  /** Text style names found (top-level category before "/") */
  textStyleCategories: string[];
  /** Variables that don't have matching text styles */
  variablesMissingStyles: string[];
  /** Text styles that don't have matching variables */
  stylesMissingVariables: string[];
  /** Whether all font-family variables have matching text styles and vice versa */
  isFullMatch: boolean;
}

/**
 * Validate that font-family variables and text styles are in sync.
 *
 * @param collections - Variable collections
 * @param allVariables - All variables
 * @param textStyles - All text styles
 * @returns Validation result with audit checks
 */
export function validateTextStylesAgainstVariables(
  collections: LintVariableCollection[],
  allVariables: LintVariable[],
  textStyles: LintTextStyle[]
): {
  validation: TextStyleValidationResult;
  auditChecks: AuditCheck[];
} {
  const auditChecks: AuditCheck[] = [];
  
  try {
    // Find the Theme collection
    const themeCollection = collections.find(c => /theme/i.test(c.name));
    
    // Get font-family variable sub-categories
    const fontFamilyVariables: string[] = [];
    if (themeCollection) {
      const themeVariables = allVariables.filter(v => v.variableCollectionId === themeCollection.id);
      for (const variable of themeVariables) {
        const parts = variable.name.split('/').map(p => p.toLowerCase().trim());
        if (parts[0] === 'font-family' && parts.length > 1) {
          const subCategory = parts[1];
          if (!fontFamilyVariables.includes(subCategory)) {
            fontFamilyVariables.push(subCategory);
          }
        }
      }
    }
    
    // Get text styles and extract their top-level categories
    const textStyleCategories: string[] = [];
    
    for (const style of textStyles) {
      const parts = style.name.split('/').map(p => p.toLowerCase().trim());
      const topCategory = parts[0];
      if (!textStyleCategories.includes(topCategory)) {
        textStyleCategories.push(topCategory);
      }
    }
    
    console.log('📝 [TEXT STYLE] Font-family variables:', fontFamilyVariables);
    console.log('📝 [TEXT STYLE] Text style categories:', textStyleCategories);
    
    // Compare using partial matching:
    // - A variable "display" matches a text style category "display-primary" or "display"
    // - A text style category "heading" matches a variable "heading-sans" or "heading"
    
    // Which variables don't have matching text styles? (partial match)
    const variablesMissingStyles = fontFamilyVariables.filter(
      v => !textStyleCategories.some(cat => cat.includes(v) || v.includes(cat))
    );
    
    // Compare: which text style categories don't have matching variables?
    // Only check categories that match common typography patterns
    const typographyPatterns = ['display', 'heading', 'body', 'label', 'caption', 'title', 'subtitle', 'overline'];
    const relevantTextCategories = textStyleCategories.filter(
      cat => typographyPatterns.some(pattern => cat.includes(pattern))
    );
    // Which text style categories don't have matching variables? (partial match)
    const stylesMissingVariables = relevantTextCategories.filter(
      s => !fontFamilyVariables.some(v => s.includes(v) || v.includes(s))
    );
    
    const isFullMatch = variablesMissingStyles.length === 0 && stylesMissingVariables.length === 0;
    
    const validation: TextStyleValidationResult = {
      fontFamilyVariables,
      textStyleCategories,
      variablesMissingStyles,
      stylesMissingVariables,
      isFullMatch
    };
    
    // Generate audit checks
    if (fontFamilyVariables.length === 0 && textStyles.length === 0) {
      // No font-family variables and no text styles - skip validation
      console.log('📝 [TEXT STYLE] No font-family variables or text styles found, skipping validation');
    } else if (fontFamilyVariables.length === 0 && textStyles.length > 0) {
      // Text styles exist but no font-family variables
      const categoryList = relevantTextCategories.slice(0, 3).join(', ') + (relevantTextCategories.length > 3 ? `, and ${relevantTextCategories.length - 3} more` : '');
      const exampleVars = relevantTextCategories.slice(0, 3).map(cat => `  - font-family/${cat}`).join('\n');

      auditChecks.push({
        check: 'Font-family variables',
        status: 'warning',
        suggestion: `You have text styles (${categoryList}) but no matching font-family variables.\n\nAdd these variables to your Theme collection:\n${exampleVars}\n\nThis allows text styles to reference font families as variables instead of hard-coded font names.`
      });
    } else if (fontFamilyVariables.length > 0 && textStyles.length === 0) {
      // Font-family variables exist but no text styles
      const varList = fontFamilyVariables.slice(0, 3).join(', ') + (fontFamilyVariables.length > 3 ? `, and ${fontFamilyVariables.length - 3} more` : '');
      const exampleStyles = fontFamilyVariables.slice(0, 3).map(v => `  - ${v}/xl, ${v}/lg, ${v}/md, etc.`).join('\n');

      auditChecks.push({
        check: 'Text styles',
        status: 'warning',
        suggestion: `You have font-family variables (${varList}) but no matching text styles.\n\nCreate text styles following these patterns:\n${exampleStyles}\n\nText styles make typography consistent and easier to apply across your designs.`
      });
    } else {
      // Both exist, check for mismatches
      if (variablesMissingStyles.length > 0) {
        const varList = variablesMissingStyles.slice(0, 3).join(', ') + (variablesMissingStyles.length > 3 ? `, and ${variablesMissingStyles.length - 3} more` : '');
        const exampleStyles = variablesMissingStyles.slice(0, 3).map(v => `  - ${v}/xl, ${v}/lg, ${v}/md`).join('\n');

        auditChecks.push({
          check: 'Text styles for font-family variables',
          status: 'fail',
          suggestion: `These font-family variables don't have matching text styles: ${varList}.\n\nCreate text styles using these patterns:\n${exampleStyles}\n\nAll font-family variables must have matching text styles.`
        });
      }

      if (stylesMissingVariables.length > 0) {
        const styleList = stylesMissingVariables.slice(0, 3).join(', ') + (stylesMissingVariables.length > 3 ? `, and ${stylesMissingVariables.length - 3} more` : '');
        const exampleVars = stylesMissingVariables.slice(0, 3).map(s => `  - font-family/${s}`).join('\n');

        auditChecks.push({
          check: 'Font-family variables for text styles',
          status: 'fail',
          suggestion: `These text style categories don't have matching font-family variables: ${styleList}.\n\nAdd these variables to your Theme collection:\n${exampleVars}\n\nText styles must reference font-family variables dynamically.`
        });
      }

      // Only show pass message if there are NO mismatches
      if (isFullMatch && fontFamilyVariables.length > 0) {
        auditChecks.push({
          check: 'Text styles & font-family sync',
          status: 'pass',
          suggestion: `All font-family variables (${fontFamilyVariables.join(', ')}) have matching text styles`
        });
      }
    }
    
    return { validation, auditChecks };
    
  } catch (error) {
    console.error('❌ [TEXT STYLE] Error validating text styles:', error);
    return {
      validation: {
        fontFamilyVariables: [],
        textStyleCategories: [],
        variablesMissingStyles: [],
        stylesMissingVariables: [],
        isFullMatch: false
      },
      auditChecks: [{
        check: 'Text style validation',
        status: 'fail',
        suggestion: `Could not validate text styles: ${error instanceof Error ? error.message : 'Unknown error'}`
      }]
    };
  }
}

// ============================================================================
// Text Style Variable Binding Validation
// ============================================================================

/**
 * Typography properties that should be bound to variables
 */
const TYPOGRAPHY_PROPERTIES = [
  'fontFamily',
  'fontSize',
  'letterSpacing',
  'lineHeight'
] as const;

type TypographyProperty = typeof TYPOGRAPHY_PROPERTIES[number];

/**
 * Result of validating a single text style's variable bindings
 */
export interface TextStyleBindingResult {
  /** Text style name */
  styleName: string;
  /** Category extracted from style name (e.g., "display" from "display/xl") */
  category: string;
  /** Size/variant extracted from style name (e.g., "xl" from "display/xl") */
  size: string;
  /** Properties bound to variables */
  boundProperties: Array<{
    property: TypographyProperty;
    variableName: string;
    isCorrectBinding: boolean;
    expectedPattern: string;
  }>;
  /** Properties with raw/hard-coded values (not bound to variables) */
  unboundProperties: TypographyProperty[];
  /** Whether all typography properties are correctly bound */
  isFullyBound: boolean;
  /** Whether all bindings follow the correct naming pattern */
  hasCorrectBindings: boolean;
}

/**
 * Validate that text styles use theme variables for typography properties
 * and that variable names match the text style structure.
 *
 * @param textStyles - All text styles from the adapter
 * @param allVariables - All variables from the adapter
 * @returns Validation results with audit checks
 */
export function validateTextStyleBindings(
  textStyles: LintTextStyle[],
  allVariables: LintVariable[]
): {
  results: TextStyleBindingResult[];
  auditChecks: AuditCheck[];
} {
  const auditChecks: AuditCheck[] = [];
  const results: TextStyleBindingResult[] = [];
  
  try {
    // Create a map of variable IDs to names for quick lookup
    const variableIdToName = new Map<string, string>();
    for (const variable of allVariables) {
      variableIdToName.set(variable.id, variable.name.toLowerCase());
    }
    
    console.log('🔤 [TEXT BINDING] Validating', textStyles.length, 'text styles');
    
    if (textStyles.length === 0) {
      return { results, auditChecks };
    }
    
    const stylesWithIssues: Array<{
      styleName: string;
      unboundProps: string[];
      incorrectBindings: Array<{ prop: string; actual: string; expected: string }>;
    }> = [];
    
    for (const style of textStyles) {
      // Parse text style name: "category/size/weight" (e.g., "display/2xl/light")
      const nameParts = style.name.split('/').map(p => p.toLowerCase().trim());

      // Skip styles that don't follow the expected pattern
      if (nameParts.length < 2) {
        console.log(`🔤 [TEXT BINDING] Skipping "${style.name}" - doesn't match category/size pattern`);
        continue;
      }

      const category = nameParts[0]; // e.g., "display", "heading", "body"
      // For 3-part names like "display/2xl/light", size is the middle part (2xl)
      // For 2-part names like "display/2xl", size is the last part (2xl)
      const size = nameParts.length >= 3 ? nameParts[1] : nameParts[nameParts.length - 1];
      
      const boundProperties: TextStyleBindingResult['boundProperties'] = [];
      const unboundProperties: TypographyProperty[] = [];
      
      // Check each typography property
      const boundVars = style.boundVariables || {};

      // Debug: log what boundVariables actually contains for first few styles
      if (results.length < 3) {
        console.log(`🔍 [DEBUG] Style "${style.name}" boundVariables:`, Object.keys(boundVars).length > 0 ? Object.keys(boundVars) : 'none');
      }

      for (const prop of TYPOGRAPHY_PROPERTIES) {
        const binding = boundVars[prop] as LintBoundVariable | undefined;
        
        if (binding && binding.id) {
          // Property is bound to a variable
          const variableName = variableIdToName.get(binding.id) || 'unknown';
          
          // Determine expected pattern based on property
          let expectedPattern: string;
          let isCorrectBinding: boolean;
          
          switch (prop) {
            case 'fontFamily':
              // font-family should include the category, can have modifiers like "body-bold"
              expectedPattern = `font-family/${category}`;
              isCorrectBinding = variableName.includes('font-family') &&
                                 variableName.includes(category);
              break;
            case 'fontSize':
              // font-size can be "font-size/{size}" or "font-size/{category}/{size}"
              expectedPattern = `font-size/${size}`;
              isCorrectBinding = variableName.includes('font-size') &&
                                 (variableName.endsWith(size) || variableName.includes(`/${size}`));
              break;
            case 'letterSpacing':
              // letter-spacing can be "letter-spacing/{size}" or "letter-spacing/{category}/{size}"
              expectedPattern = `letter-spacing/${size}`;
              isCorrectBinding = variableName.includes('letter-spacing') &&
                                 (variableName.endsWith(size) || variableName.includes(`/${size}`));
              break;
            case 'lineHeight':
              // line-height can be "line-height/{size}" or "line-height/{category}/{size}"
              expectedPattern = `line-height/${size}`;
              isCorrectBinding = variableName.includes('line-height') &&
                                 (variableName.endsWith(size) || variableName.includes(`/${size}`));
              break;
            default:
              expectedPattern = '';
              isCorrectBinding = true;
          }
          
          boundProperties.push({
            property: prop,
            variableName,
            isCorrectBinding,
            expectedPattern
          });
        } else {
          // Property has a raw value (not bound)
          unboundProperties.push(prop);
        }
      }
      
      const isFullyBound = unboundProperties.length === 0;
      const hasCorrectBindings = boundProperties.every(b => b.isCorrectBinding);

      // Debug logging for first few styles to help diagnose issues
      if (results.length < 3) {
        console.log(`🔤 [TEXT BINDING] Style "${style.name}":`);
        console.log(`  - Unbound: ${unboundProperties.length > 0 ? unboundProperties.join(', ') : 'none'}`);
        console.log(`  - Bound: ${boundProperties.length}`);
        boundProperties.forEach(bp => {
          console.log(`    • ${bp.property}: "${bp.variableName}" ${bp.isCorrectBinding ? '✓' : '✗ (expected: ' + bp.expectedPattern + ')'}`);
        });
      }

      results.push({
        styleName: style.name,
        category,
        size,
        boundProperties,
        unboundProperties,
        isFullyBound,
        hasCorrectBindings
      });
      
      // Track issues for audit reporting
      if (unboundProperties.length > 0 || !hasCorrectBindings) {
        const incorrectBindings = boundProperties
          .filter(b => !b.isCorrectBinding)
          .map(b => ({
            prop: b.property,
            actual: b.variableName,
            expected: b.expectedPattern
          }));
        
        stylesWithIssues.push({
          styleName: style.name,
          unboundProps: unboundProperties,
          incorrectBindings
        });
      }
    }
    
    // Generate audit checks
    const totalStyles = results.length;
    const fullyCompliantStyles = results.filter(r => r.isFullyBound && r.hasCorrectBindings).length;
    
    if (totalStyles === 0) {
      return { results, auditChecks };
    }
    
    // Group issues by type for cleaner reporting
    const unboundIssues = stylesWithIssues.filter(s => s.unboundProps.length > 0);
    const bindingIssues = stylesWithIssues.filter(s => s.incorrectBindings.length > 0);
    
    if (unboundIssues.length > 0) {
      // Report ALL unbound properties with detailed explanations
      const issueDescriptions = unboundIssues.map(s => {
        const style = results.find(r => r.styleName === s.styleName);
        if (!style) return `• "${s.styleName}": ${s.unboundProps.join(', ')}`;

        const cat = style.category;
        const sz = style.size;

        const propsDetail = s.unboundProps.map(prop => {
          switch (prop) {
            case 'fontFamily':
              return `  - ${prop} has a hard-coded value. Connect it to "font-family/${cat}" variable`;
            case 'fontSize':
              return `  - ${prop} has a hard-coded value. Connect it to "font-size/${cat}/${sz}" variable`;
            case 'lineHeight':
              return `  - ${prop} has a hard-coded value. Connect it to "line-height/${cat}/${sz}" variable`;
            case 'letterSpacing':
              return `  - ${prop} has a hard-coded value. Connect it to "letter-spacing/${cat}/${sz}" variable`;
            default:
              return `  - ${prop} has a hard-coded value`;
          }
        });

        return `• Text style "${s.styleName}" (category: ${cat}, size: ${sz}):\n${propsDetail.join('\n')}`;
      });

      auditChecks.push({
        check: 'Text style variable bindings',
        status: 'fail',
        suggestion: `${unboundIssues.length} text style(s) have hard-coded values instead of using theme variables:\n\n${issueDescriptions.join('\n\n')}\n\nTo fix: Select each text style in Figma, then connect the listed properties to their corresponding variables using the variable binding feature.`
      });
    }

    if (bindingIssues.length > 0) {
      // Report ALL incorrect bindings with detailed explanations
      const issueDescriptions = bindingIssues.map(s => {
        const nameParts = s.styleName.split('/');
        const cat = nameParts[0];
        const sz = nameParts.length >= 3 ? nameParts[1] : nameParts[nameParts.length - 1];

        const examples = s.incorrectBindings.map(b => {
          const propType = b.prop;
          return `  - ${propType} is bound to "${b.actual}" but should contain "/${sz}" to match this text style's size`;
        });

        return `• Text style "${s.styleName}" (category: ${cat}, size: ${sz}):\n${examples.join('\n')}`;
      });

      auditChecks.push({
        check: 'Text style variable naming',
        status: 'fail',
        suggestion: `${bindingIssues.length} text style(s) are connected to variables with mismatched size values:\n\n${issueDescriptions.join('\n\n')}\n\nEach text style must be bound to variables that match its size. For example, "heading/sm/light" should use "letter-spacing/heading/sm", not "letter-spacing/heading/md".`
      });
    }

    // Only show pass message if there are NO issues at all
    if (unboundIssues.length === 0 && bindingIssues.length === 0 && totalStyles > 0) {
      auditChecks.push({
        check: 'Text style variable bindings',
        status: 'pass',
        suggestion: `All ${totalStyles} text styles use correctly named theme variables for typography properties`
      });
    }
    
    console.log('🔤 [TEXT BINDING] Validation complete:', {
      total: totalStyles,
      compliant: fullyCompliantStyles,
      withIssues: stylesWithIssues.length
    });
    
    return { results, auditChecks };
    
  } catch (error) {
    console.error('❌ [TEXT BINDING] Error validating text style bindings:', error);
    return {
      results,
      auditChecks: [{
        check: 'Text style variable bindings',
        status: 'fail',
        suggestion: `Could not validate text style bindings: ${error instanceof Error ? error.message : 'Unknown error'}`
      }]
    };
  }
}

// ============================================================================
// Component Variable Binding Validation
// ============================================================================

/**
 * Property categories that should use theme variables in components
 */
type ComponentPropertyCategory = 'fill' | 'stroke' | 'effect' | 'spacing' | 'cornerRadius' | 'typography';

/**
 * Result of checking a single node for raw values
 */
interface NodeRawValueResult {
  nodeId: string;
  nodeName: string;
  nodeType: string;
  rawValues: Array<{
    category: ComponentPropertyCategory;
    property: string;
    value: string;
  }>;
}

/**
 * Result of validating component variable bindings
 */
export interface ComponentBindingValidationResult {
  /** Component name */
  componentName: string;
  /** Component node ID */
  componentId: string;
  /** Total nodes checked in component */
  totalNodes: number;
  /** Nodes with raw values */
  nodesWithRawValues: NodeRawValueResult[];
  /** Summary counts by category */
  rawValueCounts: Record<ComponentPropertyCategory, number>;
  /** Whether component is fully bound to variables */
  isFullyBound: boolean;
}

/**
 * Check if a color is effectively transparent/invisible
 */
function isTransparentColor(color: LintRGBA): boolean {
  if (color.a === 0) return true;
  return false;
}

/**
 * Format a color value for display
 */
function formatColor(color: LintRGBA): string {
  const r = Math.round(color.r * 255);
  const g = Math.round(color.g * 255);
  const b = Math.round(color.b * 255);
  if (color.a < 1) {
    return `rgba(${r}, ${g}, ${b}, ${color.a.toFixed(2)})`;
  }
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

/**
 * Check a node for raw values that should be using variables
 */
function checkNodeForRawValues(node: LintNode): NodeRawValueResult {
  const rawValues: NodeRawValueResult['rawValues'] = [];
  const boundVars = node.boundVariables || {};
  
  // Check fills (colors)
  if (node.fills && Array.isArray(node.fills)) {
    const fillBindings = (boundVars.fills as LintBoundVariable[] | undefined) || [];
    
    node.fills.forEach((fill, index) => {
      if (fill.type === 'SOLID' && fill.visible !== false) {
        const solidFill = fill as LintSolidPaint;
        const hasBinding = fillBindings[index] && fillBindings[index].id;
        if (!hasBinding && !isTransparentColor(solidFill.color)) {
          rawValues.push({
            category: 'fill',
            property: 'fill color',
            value: formatColor(solidFill.color)
          });
        }
      }
    });
  }
  
  // Check strokes (border colors)
  if (node.strokes && Array.isArray(node.strokes)) {
    const strokeBindings = (boundVars.strokes as LintBoundVariable[] | undefined) || [];
    
    node.strokes.forEach((stroke, index) => {
      if (stroke.type === 'SOLID' && stroke.visible !== false) {
        const solidStroke = stroke as LintSolidPaint;
        const hasBinding = strokeBindings[index] && strokeBindings[index].id;
        if (!hasBinding && !isTransparentColor(solidStroke.color)) {
          rawValues.push({
            category: 'stroke',
            property: 'stroke color',
            value: formatColor(solidStroke.color)
          });
        }
      }
    });
  }
  
  // Check corner radius
  if (typeof node.cornerRadius === 'number' && node.cornerRadius > 0) {
    const binding = boundVars.cornerRadius as LintBoundVariable | undefined;
    const hasBinding = binding && binding.id;
    if (!hasBinding) {
      rawValues.push({
        category: 'cornerRadius',
        property: 'corner radius',
        value: `${node.cornerRadius}px`
      });
    }
  }
  
  // Check auto-layout spacing properties
  if (node.layoutMode && node.layoutMode !== 'NONE') {
    // Padding
    const paddingProps = ['paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft'] as const;
    for (const prop of paddingProps) {
      const value = node[prop];
      if (typeof value === 'number' && value > 0) {
        const binding = boundVars[prop] as LintBoundVariable | undefined;
        const hasBinding = binding && binding.id;
        if (!hasBinding) {
          rawValues.push({
            category: 'spacing',
            property: prop,
            value: `${value}px`
          });
        }
      }
    }
    
    // Gap (itemSpacing)
    if (typeof node.itemSpacing === 'number' && node.itemSpacing > 0) {
      const binding = boundVars.itemSpacing as LintBoundVariable | undefined;
      const hasBinding = binding && binding.id;
      if (!hasBinding) {
        rawValues.push({
          category: 'spacing',
          property: 'gap',
          value: `${node.itemSpacing}px`
        });
      }
    }
  }
  
  // Check typography (for text nodes)
  if (node.type === 'TEXT') {
    const typographyProps = ['fontSize', 'lineHeight', 'letterSpacing'] as const;
    
    for (const prop of typographyProps) {
      const binding = boundVars[prop] as LintBoundVariable | undefined;
      const hasBinding = binding && binding.id;
      if (!hasBinding) {
        let value: string;
        if (prop === 'fontSize') {
          value = typeof node.fontSize === 'number' ? `${node.fontSize}px` : 'mixed';
        } else if (prop === 'lineHeight') {
          const lh = node.lineHeight;
          if (lh && typeof lh === 'object' && 'value' in lh) {
            value = lh.unit === 'PERCENT' ? `${lh.value}%` : `${lh.value}px`;
          } else {
            value = 'auto';
          }
        } else {
          const ls = node.letterSpacing;
          if (ls && typeof ls === 'object' && 'value' in ls) {
            value = ls.unit === 'PERCENT' ? `${ls.value}%` : `${ls.value}px`;
          } else {
            value = '0';
          }
        }
        
        // Skip auto/0 values as they're often intentional defaults
        if (value !== 'auto' && value !== '0' && value !== '0px' && value !== '0%') {
          rawValues.push({
            category: 'typography',
            property: prop,
            value
          });
        }
      }
    }
  }
  
  // Check effects (shadows, blurs)
  if (node.effects && Array.isArray(node.effects)) {
    const effectBindings = (boundVars.effects as LintBoundVariable[] | undefined) || [];
    
    node.effects.forEach((effect, index) => {
      if (effect.visible !== false) {
        const hasBinding = effectBindings[index] && effectBindings[index].id;
        if (!hasBinding) {
          let effectDesc = effect.type.toLowerCase().replace('_', ' ');
          if ((effect.type === 'DROP_SHADOW' || effect.type === 'INNER_SHADOW') && effect.color) {
            effectDesc = `${effectDesc} (${formatColor(effect.color)})`;
          }
          rawValues.push({
            category: 'effect',
            property: effect.type.toLowerCase(),
            value: effectDesc
          });
        }
      }
    });
  }
  
  return {
    nodeId: node.id,
    nodeName: node.name,
    nodeType: node.type,
    rawValues
  };
}

/**
 * Recursively collect all nodes in a component
 */
function collectAllNodes(node: LintNode): LintNode[] {
  const nodes: LintNode[] = [node];
  
  if (node.children) {
    for (const child of node.children) {
      nodes.push(...collectAllNodes(child));
    }
  }
  
  return nodes;
}

/**
 * Validate that a component uses theme variables for all visual properties.
 *
 * @param componentNode - The component or component set to validate
 * @returns Validation result with raw value locations
 */
export function validateComponentBindings(componentNode: LintNode): ComponentBindingValidationResult {
  const allNodes = collectAllNodes(componentNode);
  const nodesWithRawValues: NodeRawValueResult[] = [];
  const rawValueCounts: Record<ComponentPropertyCategory, number> = {
    fill: 0,
    stroke: 0,
    effect: 0,
    spacing: 0,
    cornerRadius: 0,
    typography: 0
  };
  
  for (const node of allNodes) {
    const result = checkNodeForRawValues(node);
    if (result.rawValues.length > 0) {
      nodesWithRawValues.push(result);
      for (const rv of result.rawValues) {
        rawValueCounts[rv.category]++;
      }
    }
  }
  
  return {
    componentName: componentNode.name,
    componentId: componentNode.id,
    totalNodes: allNodes.length,
    nodesWithRawValues,
    rawValueCounts,
    isFullyBound: nodesWithRawValues.length === 0
  };
}

/**
 * Validate all components for variable bindings.
 *
 * @param components - Components discovered by the adapter, annotated with page name
 * @param onProgress - Optional callback for progress updates
 * @returns Audit checks for component variable usage
 */
export function validateAllComponentBindings(
  components: LintComponent[],
  onProgress?: (message: string) => void
): {
  results: ComponentBindingValidationResult[];
  auditChecks: AuditCheck[];
} {
  const auditChecks: AuditCheck[] = [];
  const results: ComponentBindingValidationResult[] = [];
  
  try {
    console.log('🧩 [COMPONENT BINDING] Starting validation...');
    console.log('🧩 [COMPONENT BINDING] Found', components.length, 'components');

    if (components.length === 0) {
      return { results, auditChecks };
    }

    // Validate each component
    const componentsWithIssues: Array<{
      name: string;
      pageName: string;
      counts: Record<ComponentPropertyCategory, number>;
      totalRawValues: number;
    }> = [];

    const totalComponents = components.length;
    onProgress?.(`${totalComponents} component${totalComponents !== 1 ? 's are' : ' is'} being scanned, please wait patiently...`);

    for (let i = 0; i < totalComponents; i++) {
      const component = components[i];

      // Update progress message every 10 components
      if (i % 10 === 0 || i === totalComponents - 1) {
        onProgress?.(`Scanning ${totalComponents} component${totalComponents !== 1 ? 's' : ''}: ${i + 1}/${totalComponents} validated...`);
      }

      const result = validateComponentBindings(component.node);
      results.push(result);

      if (!result.isFullyBound) {
        const totalRawValues = Object.values(result.rawValueCounts).reduce((a, b) => a + b, 0);
        componentsWithIssues.push({
          name: result.componentName,
          pageName: component.pageName,
          counts: result.rawValueCounts,
          totalRawValues
        });
      }
    }

    // Final progress update
    onProgress?.(`Completed scanning ${totalComponents} component${totalComponents !== 1 ? 's' : ''}!`);

    // Generate audit checks - one per component (pass/fail only)
    const compliantComponents = results.filter(r => r.isFullyBound).length;
    
    // Create one audit check per component with page information
    for (const component of components) {
      const result = results.find(r => r.componentName === component.node.name);
      if (!result) continue;

      if (result.isFullyBound) {
        // Component passes - fully bound to variables
        auditChecks.push({
          check: `${result.componentName}`,
          status: 'pass',
          suggestion: `Component uses theme variables for all visual properties`,
          pageName: component.pageName
        });
      } else {
        // Component fails - has hard-coded values
        const comp = componentsWithIssues.find(c => c.name === result.componentName);
        if (comp) {
          const issues: string[] = [];

          if (comp.counts.fill > 0) {
            issues.push(`- ${comp.counts.fill} fill color${comp.counts.fill > 1 ? 's' : ''} (should use color/* variables)`);
          }
          if (comp.counts.stroke > 0) {
            issues.push(`- ${comp.counts.stroke} stroke color${comp.counts.stroke > 1 ? 's' : ''} (should use color/* variables)`);
          }
          if (comp.counts.spacing > 0) {
            issues.push(`- ${comp.counts.spacing} spacing value${comp.counts.spacing > 1 ? 's' : ''} (should use space/* variables for padding/gap)`);
          }
          if (comp.counts.cornerRadius > 0) {
            issues.push(`- ${comp.counts.cornerRadius} corner radi${comp.counts.cornerRadius > 1 ? 'i' : 'us'} (should use radius/* variables)`);
          }
          if (comp.counts.typography > 0) {
            issues.push(`- ${comp.counts.typography} typography value${comp.counts.typography > 1 ? 's' : ''} (should use font-* variables)`);
          }
          if (comp.counts.effect > 0) {
            issues.push(`- ${comp.counts.effect} effect${comp.counts.effect > 1 ? 's' : ''} (should use effect/* variables)`);
          }

          auditChecks.push({
            check: `${result.componentName}`,
            status: 'fail',
            suggestion: `${comp.totalRawValues} hard-coded value${comp.totalRawValues > 1 ? 's' : ''}:\n${issues.join('\n')}\n\nTo fix: Select this component in Figma, then bind the listed properties to their corresponding variables in your Theme collection.`,
            pageName: component.pageName
          });
        }
      }
    }

    console.log('🧩 [COMPONENT BINDING] Validation complete:', {
      total: totalComponents,
      compliant: compliantComponents,
      withIssues: componentsWithIssues.length
    });
    
    return { results, auditChecks };
    
  } catch (error) {
    console.error('❌ [COMPONENT BINDING] Error validating component bindings:', error);
    return {
      results,
      auditChecks: [{
        check: 'Component variable bindings',
        status: 'warning',
        suggestion: `Could not validate component bindings: ${error instanceof Error ? error.message : 'Unknown error'}`
      }]
    };
  }
}

/**
 * Validate components on the current page for variable bindings
 * 
 * @returns Audit checks for component variable usage on current page
 */
export async function validateCurrentPageComponentBindings(): Promise<{
  results: ComponentBindingValidationResult[];
  auditChecks: AuditCheck[];
}> {
  const auditChecks: AuditCheck[] = [];
  const results: ComponentBindingValidationResult[] = [];
  
  try {
    console.log('🧩 [COMPONENT BINDING - CURRENT PAGE] Starting validation...');

    // Find all components and component sets on the CURRENT page only
    const components: Array<{
      node: ComponentNode | ComponentSetNode;
      pageName: string;
    }> = [];

    let nodesProcessed = 0;
    const currentPage = figma.currentPage;
    const pageName = currentPage.name;

    // Async recursive function with periodic yields
    async function findComponents(node: SceneNode): Promise<void> {
      if (node.type === 'COMPONENT' || node.type === 'COMPONENT_SET') {
        components.push({ node, pageName });
      }

      if ('children' in node) {
        for (const child of node.children) {
          nodesProcessed++;

          // Yield every 50 nodes to keep UI responsive on large pages
          if (nodesProcessed % 50 === 0) {
            await new Promise(resolve => setTimeout(resolve, 0));
          }

          await findComponents(child);
        }
      }
    }

    // Scan current page only (no need to load all pages)
    console.log('🧩 [COMPONENT BINDING - CURRENT PAGE] Scanning page:', pageName);
    figma.ui.postMessage({
      type: 'audit-progress',
      data: { message: `Scanning current page: "${pageName}"` }
    });

    for (const child of currentPage.children) {
      await findComponents(child);
    }

    console.log('🧩 [COMPONENT BINDING - CURRENT PAGE] Found', components.length, 'components on page:', pageName);

    if (components.length === 0) {
      return { results, auditChecks };
    }

    // Validate each component
    const componentsWithIssues: Array<{
      name: string;
      pageName: string;
      counts: Record<ComponentPropertyCategory, number>;
      totalRawValues: number;
    }> = [];

    const totalComponents = components.length;
    figma.ui.postMessage({
      type: 'audit-progress',
      data: { message: `${totalComponents} component${totalComponents !== 1 ? 's are' : ' is'} being scanned, please wait patiently...` }
    });

    for (let i = 0; i < totalComponents; i++) {
      const component = components[i];

      // Update progress message every 10 components to avoid too many UI updates
      if (i % 10 === 0 || i === totalComponents - 1) {
        figma.ui.postMessage({
          type: 'audit-progress',
          data: { message: `Scanning ${totalComponents} component${totalComponents !== 1 ? 's' : ''}: ${i + 1}/${totalComponents} validated...` }
        });
      }

      // Yield to event loop after EVERY component to keep UI responsive
      await new Promise(resolve => setTimeout(resolve, 0));

      const result = validateComponentBindings(component.node);
      results.push(result);

      if (!result.isFullyBound) {
        const totalRawValues = Object.values(result.rawValueCounts).reduce((a, b) => a + b, 0);
        componentsWithIssues.push({
          name: result.componentName,
          pageName: component.pageName,
          counts: result.rawValueCounts,
          totalRawValues
        });
      }
    }

    // Final progress update
    figma.ui.postMessage({
      type: 'audit-progress',
      data: { message: `Completed scanning ${totalComponents} component${totalComponents !== 1 ? 's' : ''}!` }
    });

    // Generate audit checks - one per component (pass/fail only)
    const totalValidated = results.length;
    const compliantComponents = results.filter(r => r.isFullyBound).length;
    
    // Create one audit check per component with page information
    for (const component of components) {
      const result = results.find(r => r.componentName === component.node.name);
      if (!result) continue;

      if (result.isFullyBound) {
        // Component passes - fully bound to variables
        auditChecks.push({
          check: `${result.componentName}`,
          status: 'pass',
          suggestion: `Component uses theme variables for all visual properties`,
          pageName: component.pageName
        });
      } else {
        // Component fails - has hard-coded values
        const comp = componentsWithIssues.find(c => c.name === result.componentName);
        if (comp) {
          const issues: string[] = [];

          if (comp.counts.fill > 0) {
            issues.push(`- ${comp.counts.fill} fill color${comp.counts.fill > 1 ? 's' : ''} (should use color/* variables)`);
          }
          if (comp.counts.stroke > 0) {
            issues.push(`- ${comp.counts.stroke} stroke color${comp.counts.stroke > 1 ? 's' : ''} (should use color/* variables)`);
          }
          if (comp.counts.spacing > 0) {
            issues.push(`- ${comp.counts.spacing} spacing value${comp.counts.spacing > 1 ? 's' : ''} (should use space/* variables for padding/gap)`);
          }
          if (comp.counts.cornerRadius > 0) {
            issues.push(`- ${comp.counts.cornerRadius} corner radi${comp.counts.cornerRadius > 1 ? 'i' : 'us'} (should use radius/* variables)`);
          }
          if (comp.counts.typography > 0) {
            issues.push(`- ${comp.counts.typography} typography value${comp.counts.typography > 1 ? 's' : ''} (should use font-* variables)`);
          }
          if (comp.counts.effect > 0) {
            issues.push(`- ${comp.counts.effect} effect${comp.counts.effect > 1 ? 's' : ''} (should use effect/* variables)`);
          }

          auditChecks.push({
            check: `${result.componentName}`,
            status: 'fail',
            suggestion: `${comp.totalRawValues} hard-coded value${comp.totalRawValues > 1 ? 's' : ''}:\n${issues.join('\n')}\n\nTo fix: Select this component in Figma, then bind the listed properties to their corresponding variables in your Theme collection.`,
            pageName: component.pageName
          });
        }
      }
    }

    console.log('🧩 [COMPONENT BINDING - CURRENT PAGE] Validation complete:', {
      page: pageName,
      total: totalValidated,
      compliant: compliantComponents,
      withIssues: componentsWithIssues.length
    });
    
    return { results, auditChecks };
    
  } catch (error) {
    console.error('❌ [COMPONENT BINDING - CURRENT PAGE] Error validating component bindings:', error);
    return {
      results,
      auditChecks: [{
        check: 'Component variable bindings (current page)',
        status: 'warning',
        suggestion: `Could not validate component bindings: ${error instanceof Error ? error.message : 'Unknown error'}`
      }]
    };
  }
}
