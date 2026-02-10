/// <reference types="@figma/plugin-typings" />

import { AuditCheck } from '../types';

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
      { name: 'color' },
      { name: 'space' }
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
 * Validate all variable collections against the required structure
 * 
 * @param requirements - Collection requirements to validate against (defaults to DEFAULT_COLLECTION_REQUIREMENTS)
 * @returns Validation results with audit checks
 */
export async function validateCollectionStructure(
  requirements: CollectionRequirement[] = DEFAULT_COLLECTION_REQUIREMENTS
): Promise<CollectionStructureValidation> {
  console.log('🔍 [COLLECTION] Starting collection structure validation...');
  
  const validatedCollections: CollectionValidationResult[] = [];
  const missingCollections: string[] = [];
  const auditChecks: AuditCheck[] = [];
  
  try {
    // Get all local variable collections
    const collections = await figma.variables.getLocalVariableCollectionsAsync();
    console.log(`🔍 [COLLECTION] Found ${collections.length} local collections:`, collections.map(c => c.name));
    
    // Get all local variables for category analysis
    const allVariables = await figma.variables.getLocalVariablesAsync();
    console.log(`🔍 [COLLECTION] Found ${allVariables.length} total variables`);
    
    // Group variables by collection ID
    const variablesByCollection = new Map<string, Variable[]>();
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
          if (value && typeof value === 'object' && 'type' in value && value.type === 'VARIABLE_ALIAS') {
            const aliasId = (value as VariableAlias).id;
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
        const categoryList = requirement.requiredCategories.map(c => c.name).join(', ');
        auditChecks.push({
          check: `${requirement.displayName} collection`,
          status: 'warning',
          suggestion: `Consider creating a "${requirement.displayName}" collection with ${categoryList} categories for better design token organization.`
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
          auditChecks.push({
            check: `${requirement.displayName} collection categories`,
            status: 'fail',
            suggestion: `"${matchingCollection.name}" is missing required categories: ${validationResult.missingCategories.join(', ')}. Add variables with these prefixes (e.g., "${validationResult.missingCategories[0]}/...").`
          });
        }
        
        // Missing sub-categories (exact match)
        for (const subResult of validationResult.subCategoryResults) {
          if (subResult.missing.length > 0) {
            auditChecks.push({
              check: `${requirement.displayName} ${subResult.category} sub-categories`,
              status: 'warning',
              suggestion: `"${matchingCollection.name}" ${subResult.category} category is missing sub-categories: ${subResult.missing.join(', ')}. Add variables like "${subResult.category}/${subResult.missing[0]}/...".`
            });
          }
          
          // Pattern validation issues
          if (subResult.patternValidation) {
            const { allMatch, invalidNames, patternDescription, examples } = subResult.patternValidation;
            if (subResult.found.length === 0) {
              // No valid sub-categories at all - this is a real problem
              auditChecks.push({
                check: `${requirement.displayName} ${subResult.category} naming`,
                status: 'warning',
                suggestion: `"${matchingCollection.name}" ${subResult.category} category has no sub-categories following ${patternDescription}. Add variables like ${examples.slice(0, 3).join(', ')}.`
              });
            } else {
              // Has valid sub-categories - pass! (ignore category names like "display", "heading")
              // The "invalidNames" might just be intermediate category names in a 3-level structure
              auditChecks.push({
                check: `${requirement.displayName} ${subResult.category} naming`,
                status: 'pass',
                suggestion: `"${matchingCollection.name}" ${subResult.category} has valid sizes: ${subResult.found.slice(0, 5).join(', ')}${subResult.found.length > 5 ? '...' : ''}`
              });
            }
          }
          
          // Mirror validation issues (e.g., line-height should mirror font-size)
          if (subResult.mirrorValidation) {
            const { sourceCategory, missingSizes, extraSizes, isFullMatch } = subResult.mirrorValidation;
            if (missingSizes.length > 0) {
              auditChecks.push({
                check: `${requirement.displayName} ${subResult.category} sizes`,
                status: 'warning',
                suggestion: `"${matchingCollection.name}" ${subResult.category} is missing sizes that exist in ${sourceCategory}: ${missingSizes.join(', ')}. Add matching variables for each ${sourceCategory} size.`
              });
            }
            if (extraSizes.length > 0) {
              auditChecks.push({
                check: `${requirement.displayName} ${subResult.category} extra sizes`,
                status: 'warning',
                suggestion: `"${matchingCollection.name}" ${subResult.category} has sizes not in ${sourceCategory}: ${extraSizes.join(', ')}. Consider adding these to ${sourceCategory} or removing them.`
              });
            }
            if (isFullMatch && subResult.found.length > 0) {
              auditChecks.push({
                check: `${requirement.displayName} ${subResult.category} mirrors ${sourceCategory}`,
                status: 'pass',
                suggestion: `"${matchingCollection.name}" ${subResult.category} correctly mirrors all ${sourceCategory} sizes`
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
      // Individual collection checks are already added above
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
        status: 'warning',
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
function extractCategories(variables: Variable[]): Map<string, Set<string>> {
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

/**
 * Quick check if any variable collections exist
 */
export async function hasVariableCollections(): Promise<boolean> {
  try {
    const collections = await figma.variables.getLocalVariableCollectionsAsync();
    return collections.length > 0;
  } catch {
    return false;
  }
}

/**
 * Get a summary of all variable collections for display
 */
export async function getCollectionSummary(): Promise<Array<{
  name: string;
  variableCount: number;
  categories: string[];
}>> {
  try {
    const collections = await figma.variables.getLocalVariableCollectionsAsync();
    const allVariables = await figma.variables.getLocalVariablesAsync();
    
    const variablesByCollection = new Map<string, Variable[]>();
    for (const variable of allVariables) {
      const existing = variablesByCollection.get(variable.variableCollectionId) || [];
      existing.push(variable);
      variablesByCollection.set(variable.variableCollectionId, existing);
    }
    
    return collections.map(collection => {
      const variables = variablesByCollection.get(collection.id) || [];
      const categories = extractCategories(variables);
      
      return {
        name: collection.name,
        variableCount: variables.length,
        categories: Array.from(categories.keys())
      };
    });
  } catch (error) {
    console.error('Error getting collection summary:', error);
    return [];
  }
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
 * Rules:
 * - If font-family variables exist (e.g., font-family/display, font-family/heading),
 *   there should be matching text styles with those names as top-level categories
 * - If text styles exist with categories like "display/...", "heading/...",
 *   there should be matching font-family variables
 * 
 * @returns Validation result with audit checks
 */
export async function validateTextStylesAgainstVariables(): Promise<{
  validation: TextStyleValidationResult;
  auditChecks: AuditCheck[];
}> {
  const auditChecks: AuditCheck[] = [];
  
  try {
    // Get all variables and find font-family sub-categories from Theme collection
    const collections = await figma.variables.getLocalVariableCollectionsAsync();
    const allVariables = await figma.variables.getLocalVariablesAsync();
    
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
    const textStyles = await figma.getLocalTextStylesAsync();
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
    // Only check categories that match common typography patterns (display, heading, body, label, etc.)
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
      auditChecks.push({
        check: 'Font-family variables',
        status: 'warning',
        suggestion: `Text styles exist (${relevantTextCategories.join(', ')}) but no font-family variables found. Consider adding font-family variables to your Theme collection to match your text styles.`
      });
    } else if (fontFamilyVariables.length > 0 && textStyles.length === 0) {
      // Font-family variables exist but no text styles
      auditChecks.push({
        check: 'Text styles',
        status: 'warning',
        suggestion: `Font-family variables exist (${fontFamilyVariables.join(', ')}) but no text styles found. Create text styles with matching names (e.g., "${fontFamilyVariables[0]}/...").`
      });
    } else {
      // Both exist, check for mismatches
      if (variablesMissingStyles.length > 0) {
        auditChecks.push({
          check: 'Text styles for font-family variables',
          status: 'warning',
          suggestion: `Font-family variables missing matching text styles: ${variablesMissingStyles.join(', ')}. Create text styles like "${variablesMissingStyles[0]}/..." to match.`
        });
      }
      
      if (stylesMissingVariables.length > 0) {
        auditChecks.push({
          check: 'Font-family variables for text styles',
          status: 'warning',
          suggestion: `Text styles missing matching font-family variables: ${stylesMissingVariables.join(', ')}. Add font-family/${stylesMissingVariables[0]} to your Theme collection.`
        });
      }
      
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
        status: 'warning',
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
  'fontWeight',
  'letterSpacing',
  'lineHeight'
] as const;

type TypographyProperty = typeof TYPOGRAPHY_PROPERTIES[number];

/**
 * Maps Figma text style bound variable keys to our property names
 */
const FIGMA_BOUND_VAR_KEYS: Record<string, TypographyProperty> = {
  'fontFamily': 'fontFamily',
  'fontSize': 'fontSize',
  'fontWeight': 'fontWeight',
  'letterSpacing': 'letterSpacing',
  'lineHeight': 'lineHeight'
};

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
 * Expected patterns:
 * - Text style: "{category}/{size}" (e.g., "display/xl", "heading/lg")
 * - font-family: "font-family/{category}" (e.g., "font-family/display")
 * - font-size: "font-size/{size}" (e.g., "font-size/xl")
 * - font-weight: "font-weight/{any}" (flexible)
 * - letter-spacing: "letter-spacing/{size}" (e.g., "letter-spacing/xl")
 * - line-height: "line-height/{size}" (e.g., "line-height/xl")
 * 
 * @returns Validation results with audit checks
 */
export async function validateTextStyleBindings(): Promise<{
  results: TextStyleBindingResult[];
  auditChecks: AuditCheck[];
}> {
  const auditChecks: AuditCheck[] = [];
  const results: TextStyleBindingResult[] = [];
  
  try {
    const textStyles = await figma.getLocalTextStylesAsync();
    const allVariables = await figma.variables.getLocalVariablesAsync();
    
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
      // Parse text style name: "category/size" or "category/subcategory/size"
      const nameParts = style.name.split('/').map(p => p.toLowerCase().trim());
      
      // Skip styles that don't follow the category/size pattern
      if (nameParts.length < 2) {
        console.log(`🔤 [TEXT BINDING] Skipping "${style.name}" - doesn't match category/size pattern`);
        continue;
      }
      
      const category = nameParts[0]; // e.g., "display", "heading", "body"
      const size = nameParts[nameParts.length - 1]; // e.g., "xl", "lg", "md" (last part)
      
      const boundProperties: TextStyleBindingResult['boundProperties'] = [];
      const unboundProperties: TypographyProperty[] = [];
      
      // Check each typography property
      const boundVars = (style as any).boundVariables || {};
      
      for (const prop of TYPOGRAPHY_PROPERTIES) {
        const binding = boundVars[prop];
        
        if (binding && binding.id) {
          // Property is bound to a variable
          const variableName = variableIdToName.get(binding.id) || 'unknown';
          
          // Determine expected pattern based on property
          let expectedPattern: string;
          let isCorrectBinding: boolean;
          
          switch (prop) {
            case 'fontFamily':
              // font-family should be "font-family/{category}"
              expectedPattern = `font-family/${category}`;
              isCorrectBinding = variableName.includes('font-family') && 
                                 variableName.includes(category);
              break;
            case 'fontSize':
              // font-size should be "font-size/{size}"
              expectedPattern = `font-size/${size}`;
              isCorrectBinding = variableName.includes('font-size') && 
                                 variableName.endsWith(size);
              break;
            case 'fontWeight':
              // font-weight is more flexible, just needs to be a font-weight variable
              expectedPattern = `font-weight/*`;
              isCorrectBinding = variableName.includes('font-weight');
              break;
            case 'letterSpacing':
              // letter-spacing should be "letter-spacing/{size}"
              expectedPattern = `letter-spacing/${size}`;
              isCorrectBinding = variableName.includes('letter-spacing') && 
                                 variableName.endsWith(size);
              break;
            case 'lineHeight':
              // line-height should be "line-height/{size}"
              expectedPattern = `line-height/${size}`;
              isCorrectBinding = variableName.includes('line-height') && 
                                 variableName.endsWith(size);
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
      // No text styles following the pattern
      return { results, auditChecks };
    }
    
    // Group issues by type for cleaner reporting
    const unboundIssues = stylesWithIssues.filter(s => s.unboundProps.length > 0);
    const bindingIssues = stylesWithIssues.filter(s => s.incorrectBindings.length > 0);
    
    if (unboundIssues.length > 0) {
      // Report unbound properties
      const sampleIssues = unboundIssues.slice(0, 3);
      const issueDescriptions = sampleIssues.map(s => 
        `"${s.styleName}" missing: ${s.unboundProps.join(', ')}`
      );
      
      auditChecks.push({
        check: 'Text style variable bindings',
        status: 'warning',
        suggestion: `${unboundIssues.length} text style(s) have raw values instead of theme variables. ${issueDescriptions.join('; ')}${unboundIssues.length > 3 ? ` and ${unboundIssues.length - 3} more...` : ''}`
      });
    }
    
    if (bindingIssues.length > 0) {
      // Report incorrect bindings
      const sampleIssues = bindingIssues.slice(0, 2);
      const issueDescriptions = sampleIssues.map(s => {
        const wrongBinding = s.incorrectBindings[0];
        return `"${s.styleName}" ${wrongBinding.prop} uses "${wrongBinding.actual}" but should use "${wrongBinding.expected}"`;
      });
      
      auditChecks.push({
        check: 'Text style variable naming',
        status: 'warning',
        suggestion: `${bindingIssues.length} text style(s) use incorrectly named variables. ${issueDescriptions.join('; ')}${bindingIssues.length > 2 ? ` and ${bindingIssues.length - 2} more...` : ''}`
      });
    }
    
    if (fullyCompliantStyles === totalStyles && totalStyles > 0) {
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
        status: 'warning',
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
function isTransparentColor(color: RGB | RGBA): boolean {
  if ('a' in color && color.a === 0) return true;
  return false;
}

/**
 * Format a color value for display
 */
function formatColor(color: RGB | RGBA): string {
  const r = Math.round(color.r * 255);
  const g = Math.round(color.g * 255);
  const b = Math.round(color.b * 255);
  if ('a' in color && color.a < 1) {
    return `rgba(${r}, ${g}, ${b}, ${color.a.toFixed(2)})`;
  }
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

/**
 * Check a node for raw values that should be using variables
 */
function checkNodeForRawValues(node: SceneNode): NodeRawValueResult {
  const rawValues: NodeRawValueResult['rawValues'] = [];
  const boundVars = (node as any).boundVariables || {};
  
  // Check fills (colors)
  if ('fills' in node && Array.isArray(node.fills)) {
    const fills = node.fills as readonly Paint[];
    const fillBindings = boundVars.fills || [];
    
    fills.forEach((fill, index) => {
      if (fill.type === 'SOLID' && fill.visible !== false) {
        const hasBinding = fillBindings[index] && fillBindings[index].id;
        if (!hasBinding && !isTransparentColor(fill.color)) {
          rawValues.push({
            category: 'fill',
            property: 'fill color',
            value: formatColor(fill.color)
          });
        }
      }
    });
  }
  
  // Check strokes (border colors)
  if ('strokes' in node && Array.isArray(node.strokes)) {
    const strokes = node.strokes as readonly Paint[];
    const strokeBindings = boundVars.strokes || [];
    
    strokes.forEach((stroke, index) => {
      if (stroke.type === 'SOLID' && stroke.visible !== false) {
        const hasBinding = strokeBindings[index] && strokeBindings[index].id;
        if (!hasBinding && !isTransparentColor(stroke.color)) {
          rawValues.push({
            category: 'stroke',
            property: 'stroke color',
            value: formatColor(stroke.color)
          });
        }
      }
    });
  }
  
  // Check corner radius
  if ('cornerRadius' in node && typeof node.cornerRadius === 'number' && node.cornerRadius > 0) {
    const hasBinding = boundVars.cornerRadius && boundVars.cornerRadius.id;
    if (!hasBinding) {
      rawValues.push({
        category: 'cornerRadius',
        property: 'corner radius',
        value: `${node.cornerRadius}px`
      });
    }
  }
  
  // Check auto-layout spacing properties
  if ('layoutMode' in node && node.layoutMode !== 'NONE') {
    // Padding
    if ('paddingTop' in node) {
      const paddingProps = ['paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft'] as const;
      for (const prop of paddingProps) {
        const value = (node as any)[prop];
        if (typeof value === 'number' && value > 0) {
          const hasBinding = boundVars[prop] && boundVars[prop].id;
          if (!hasBinding) {
            rawValues.push({
              category: 'spacing',
              property: prop,
              value: `${value}px`
            });
          }
        }
      }
    }
    
    // Gap (itemSpacing)
    if ('itemSpacing' in node && typeof node.itemSpacing === 'number' && node.itemSpacing > 0) {
      const hasBinding = boundVars.itemSpacing && boundVars.itemSpacing.id;
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
    const textNode = node as TextNode;
    const typographyProps = ['fontSize', 'lineHeight', 'letterSpacing'] as const;
    
    for (const prop of typographyProps) {
      const hasBinding = boundVars[prop] && boundVars[prop].id;
      if (!hasBinding) {
        let value: string;
        if (prop === 'fontSize') {
          value = typeof textNode.fontSize === 'number' ? `${textNode.fontSize}px` : 'mixed';
        } else if (prop === 'lineHeight') {
          const lh = textNode.lineHeight;
          if (typeof lh === 'object' && 'value' in lh) {
            value = lh.unit === 'PERCENT' ? `${lh.value}%` : `${lh.value}px`;
          } else {
            value = 'auto';
          }
        } else {
          const ls = textNode.letterSpacing;
          if (typeof ls === 'object' && 'value' in ls) {
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
  if ('effects' in node && Array.isArray(node.effects)) {
    const effects = node.effects as readonly Effect[];
    const effectBindings = boundVars.effects || [];
    
    effects.forEach((effect, index) => {
      if (effect.visible !== false) {
        const hasBinding = effectBindings[index] && effectBindings[index].id;
        if (!hasBinding) {
          let effectDesc = effect.type.toLowerCase().replace('_', ' ');
          if (effect.type === 'DROP_SHADOW' || effect.type === 'INNER_SHADOW') {
            const shadow = effect as DropShadowEffect;
            effectDesc = `${effectDesc} (${formatColor(shadow.color)})`;
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
function collectAllNodes(node: SceneNode): SceneNode[] {
  const nodes: SceneNode[] = [node];
  
  if ('children' in node) {
    for (const child of node.children) {
      nodes.push(...collectAllNodes(child));
    }
  }
  
  return nodes;
}

/**
 * Validate that a component uses theme variables for all visual properties.
 * 
 * Checks for raw values in:
 * - Fill colors
 * - Stroke colors
 * - Corner radius
 * - Auto-layout spacing (padding, gap)
 * - Typography (font size, line height, letter spacing)
 * - Effects (shadows, blurs)
 * 
 * @param componentNode - The component or component set to validate
 * @returns Validation result with raw value locations
 */
export function validateComponentBindings(componentNode: ComponentNode | ComponentSetNode): ComponentBindingValidationResult {
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
 * Validate all local components for variable bindings
 * 
 * @returns Audit checks for component variable usage
 */
export async function validateAllComponentBindings(): Promise<{
  results: ComponentBindingValidationResult[];
  auditChecks: AuditCheck[];
}> {
  const auditChecks: AuditCheck[] = [];
  const results: ComponentBindingValidationResult[] = [];
  
  try {
    // Get the current selection or current page components
    const currentPage = figma.currentPage;
    
    // Find all components and component sets on the current page
    const components: (ComponentNode | ComponentSetNode)[] = [];
    
    function findComponents(node: SceneNode) {
      if (node.type === 'COMPONENT' || node.type === 'COMPONENT_SET') {
        components.push(node);
      } else if ('children' in node) {
        for (const child of node.children) {
          findComponents(child);
        }
      }
    }
    
    for (const child of currentPage.children) {
      findComponents(child);
    }
    
    console.log('🧩 [COMPONENT BINDING] Found', components.length, 'components to validate');
    
    if (components.length === 0) {
      return { results, auditChecks };
    }
    
    // Validate each component
    const componentsWithIssues: Array<{
      name: string;
      counts: Record<ComponentPropertyCategory, number>;
      totalRawValues: number;
    }> = [];
    
    for (const component of components) {
      const result = validateComponentBindings(component);
      results.push(result);
      
      if (!result.isFullyBound) {
        const totalRawValues = Object.values(result.rawValueCounts).reduce((a, b) => a + b, 0);
        componentsWithIssues.push({
          name: result.componentName,
          counts: result.rawValueCounts,
          totalRawValues
        });
      }
    }
    
    // Generate audit checks
    const totalComponents = results.length;
    const compliantComponents = results.filter(r => r.isFullyBound).length;
    
    if (componentsWithIssues.length > 0) {
      // Aggregate counts across all components
      const totalCounts: Record<ComponentPropertyCategory, number> = {
        fill: 0,
        stroke: 0,
        effect: 0,
        spacing: 0,
        cornerRadius: 0,
        typography: 0
      };
      
      for (const comp of componentsWithIssues) {
        for (const cat of Object.keys(comp.counts) as ComponentPropertyCategory[]) {
          totalCounts[cat] += comp.counts[cat];
        }
      }
      
      // Report by category
      const categoryMessages: string[] = [];
      
      if (totalCounts.fill > 0) {
        categoryMessages.push(`${totalCounts.fill} fill colors`);
      }
      if (totalCounts.stroke > 0) {
        categoryMessages.push(`${totalCounts.stroke} stroke colors`);
      }
      if (totalCounts.spacing > 0) {
        categoryMessages.push(`${totalCounts.spacing} spacing values`);
      }
      if (totalCounts.cornerRadius > 0) {
        categoryMessages.push(`${totalCounts.cornerRadius} corner radii`);
      }
      if (totalCounts.typography > 0) {
        categoryMessages.push(`${totalCounts.typography} typography values`);
      }
      if (totalCounts.effect > 0) {
        categoryMessages.push(`${totalCounts.effect} effects`);
      }
      
      const sampleComponents = componentsWithIssues.slice(0, 3).map(c => `"${c.name}"`).join(', ');
      
      auditChecks.push({
        check: 'Component variable bindings',
        status: 'warning',
        suggestion: `${componentsWithIssues.length} component(s) have raw values: ${categoryMessages.join(', ')}. Components: ${sampleComponents}${componentsWithIssues.length > 3 ? ` and ${componentsWithIssues.length - 3} more` : ''}. Use theme variables instead.`
      });
      
      // Add specific category warnings for high counts
      if (totalCounts.fill > 5) {
        auditChecks.push({
          check: 'Component fill colors',
          status: 'warning',
          suggestion: `${totalCounts.fill} fill colors are using raw values. Bind to color variables from your Theme collection (e.g., colors/bg/*, colors/text/*).`
        });
      }
      
      if (totalCounts.spacing > 5) {
        auditChecks.push({
          check: 'Component spacing',
          status: 'warning',
          suggestion: `${totalCounts.spacing} spacing values (padding, gap) are using raw values. Bind to spacing variables from your Theme collection.`
        });
      }
    }
    
    if (compliantComponents === totalComponents && totalComponents > 0) {
      auditChecks.push({
        check: 'Component variable bindings',
        status: 'pass',
        suggestion: `All ${totalComponents} components use theme variables for visual properties`
      });
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
