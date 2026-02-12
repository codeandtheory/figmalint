"use strict";
(() => {
  var __defProp = Object.defineProperty;
  var __defProps = Object.defineProperties;
  var __getOwnPropDescs = Object.getOwnPropertyDescriptors;
  var __getOwnPropSymbols = Object.getOwnPropertySymbols;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __propIsEnum = Object.prototype.propertyIsEnumerable;
  var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
  var __spreadValues = (a, b) => {
    for (var prop in b || (b = {}))
      if (__hasOwnProp.call(b, prop))
        __defNormalProp(a, prop, b[prop]);
    if (__getOwnPropSymbols)
      for (var prop of __getOwnPropSymbols(b)) {
        if (__propIsEnum.call(b, prop))
          __defNormalProp(a, prop, b[prop]);
      }
    return a;
  };
  var __spreadProps = (a, b) => __defProps(a, __getOwnPropDescs(b));

  // src/utils/figma-helpers.ts
  function rgbToHex(r, g, b) {
    const toHex = (n) => {
      const hex = Math.round(n * 255).toString(16);
      return hex.length === 1 ? "0" + hex : hex;
    };
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  }
  function sendMessageToUI(type, data) {
    try {
      figma.ui.postMessage({ type, data });
    } catch (error) {
      console.error("Failed to send message to UI:", error);
    }
  }

  // src/core/collection-validator.ts
  var DEFAULT_COLLECTION_REQUIREMENTS = [
    {
      namePattern: /primitives?/i,
      displayName: "Primitives",
      requiredCategories: [
        { name: "color" }
      ]
    },
    {
      namePattern: /brand/i,
      displayName: "Brand",
      requiredCategories: [
        { name: "color" },
        {
          name: "typography",
          subCategories: ["font-family", "font-weight", "font-size", "letter-spacing", "line-height"]
        }
      ]
    },
    {
      namePattern: /theme/i,
      displayName: "Theme",
      requiredCategories: [
        {
          name: "colors",
          subCategories: ["bg", "text", "border"]
        },
        {
          name: "font-family",
          subCategories: ["display", "heading", "body", "label"],
          subCategoryPartialMatch: true
          // e.g., "display-primary" matches "display"
        },
        { name: "font-weight" },
        {
          name: "font-size",
          subCategoryPattern: {
            pattern: /^(\d+)?(x+)?(xs|sm|md|lg|xl)$/i,
            description: "t-shirt size naming convention",
            examples: ["xs", "sm", "md", "lg", "xl", "2xl", "3xl", "2xs", "3xs"]
          }
        },
        {
          name: "line-height",
          mirrorCategory: "font-size"
        },
        {
          name: "letter-spacing",
          mirrorCategory: "font-size"
        },
        { name: "spacing" }
      ]
    }
  ];
  async function validateCollectionStructure(requirements = DEFAULT_COLLECTION_REQUIREMENTS) {
    console.log("\u{1F50D} [COLLECTION] Starting collection structure validation...");
    const validatedCollections = [];
    const missingCollections = [];
    const auditChecks = [];
    try {
      const collections = await figma.variables.getLocalVariableCollectionsAsync();
      console.log(`\u{1F50D} [COLLECTION] Found ${collections.length} local collections:`, collections.map((c) => c.name));
      const allVariables = await figma.variables.getLocalVariablesAsync();
      console.log(`\u{1F50D} [COLLECTION] Found ${allVariables.length} total variables`);
      const variablesByCollection = /* @__PURE__ */ new Map();
      for (const variable of allVariables) {
        const existing = variablesByCollection.get(variable.variableCollectionId) || [];
        existing.push(variable);
        variablesByCollection.set(variable.variableCollectionId, existing);
      }
      const primitivesCollection = collections.find((c) => /primitives?/i.test(c.name));
      const themeCollection = collections.find((c) => /theme/i.test(c.name));
      const brandCollection = collections.find((c) => /brand/i.test(c.name));
      let themeConnectedToPrimitives = false;
      if (primitivesCollection && themeCollection && !brandCollection) {
        const themeVariables = variablesByCollection.get(themeCollection.id) || [];
        const primitivesVariableIds = new Set(
          (variablesByCollection.get(primitivesCollection.id) || []).map((v) => v.id)
        );
        let aliasCount = 0;
        for (const themeVar of themeVariables) {
          const valuesByMode = themeVar.valuesByMode;
          for (const modeId of Object.keys(valuesByMode)) {
            const value = valuesByMode[modeId];
            if (value && typeof value === "object" && "type" in value && value.type === "VARIABLE_ALIAS") {
              const aliasId = value.id;
              if (primitivesVariableIds.has(aliasId)) {
                aliasCount++;
              }
            }
          }
        }
        themeConnectedToPrimitives = aliasCount > 0 && aliasCount / themeVariables.length >= 0.1;
        console.log(`\u{1F517} [COLLECTION] Theme-Primitives connection: ${aliasCount} aliases found, connected=${themeConnectedToPrimitives}`);
      }
      for (const requirement of requirements) {
        const matchingCollection = collections.find(
          (c) => requirement.namePattern.test(c.name)
        );
        if (!matchingCollection) {
          if (requirement.displayName === "Brand" && themeConnectedToPrimitives) {
            console.log(`\u2705 [COLLECTION] Brand collection optional - Theme is connected to Primitives`);
            auditChecks.push({
              check: `${requirement.displayName} collection`,
              status: "pass",
              suggestion: `Brand collection not required - Theme variables are connected directly to Primitives. This is a valid design token architecture.`
            });
            continue;
          }
          console.log(`\u2139\uFE0F [COLLECTION] No "${requirement.displayName}" collection found - suggesting creation`);
          const categoryList = requirement.requiredCategories.map((c) => c.name).join(", ");
          const examples = requirement.requiredCategories.map((cat) => {
            switch (cat.name) {
              case "color":
                return `  - color/primary, color/secondary, color/accent (brand colors)`;
              case "space":
                return `  - space/xs, space/sm, space/md, space/lg, space/xl (spacing scale)`;
              case "radius":
                return `  - radius/sm, radius/md, radius/lg (corner radii)`;
              default:
                return `  - ${cat.name}/...`;
            }
          }).join("\n");
          auditChecks.push({
            check: `${requirement.displayName} collection`,
            status: "warning",
            suggestion: `No "${requirement.displayName}" collection found. Consider creating one with these categories:

${examples}

This collection helps organize your ${categoryList} tokens for better design system structure.`
          });
          continue;
        }
        console.log(`\u2705 [COLLECTION] Found ${requirement.displayName} collection: "${matchingCollection.name}"`);
        const collectionVariables = variablesByCollection.get(matchingCollection.id) || [];
        const categories = extractCategories(collectionVariables);
        console.log(`\u{1F50D} [COLLECTION] Categories in ${matchingCollection.name}:`, Array.from(categories.keys()));
        const validationResult = validateCategories(
          matchingCollection.name,
          requirement,
          categories
        );
        validatedCollections.push(validationResult);
        if (validationResult.isValid) {
          auditChecks.push({
            check: `${requirement.displayName} collection structure`,
            status: "pass",
            suggestion: `"${matchingCollection.name}" has all required categories: ${validationResult.foundCategories.join(", ")}`
          });
        } else {
          if (validationResult.missingCategories.length > 0) {
            const missingExamples = validationResult.missingCategories.map((cat) => {
              switch (cat) {
                case "color":
                  return `  - ${cat}/primary, ${cat}/secondary, ${cat}/accent`;
                case "space":
                  return `  - ${cat}/xs, ${cat}/sm, ${cat}/md, ${cat}/lg`;
                case "radius":
                  return `  - ${cat}/sm, ${cat}/md, ${cat}/lg`;
                default:
                  return `  - ${cat}/*`;
              }
            }).join("\n");
            auditChecks.push({
              check: `${requirement.displayName} collection categories`,
              status: "fail",
              suggestion: `"${matchingCollection.name}" collection is missing required categories: ${validationResult.missingCategories.join(", ")}.

Add variables following these patterns:
${missingExamples}

These categories are essential for a complete ${requirement.displayName} collection.`
            });
          }
          for (const subResult of validationResult.subCategoryResults) {
            if (subResult.missing.length > 0) {
              const missingList = subResult.missing.slice(0, 5).join(", ") + (subResult.missing.length > 5 ? `, and ${subResult.missing.length - 5} more` : "");
              const exampleVars = subResult.missing.slice(0, 3).map((m) => `  - ${subResult.category}/${m}`).join("\n");
              auditChecks.push({
                check: `${requirement.displayName} ${subResult.category} sub-categories`,
                status: "warning",
                suggestion: `"${matchingCollection.name}" ${subResult.category} category is missing sub-categories: ${missingList}.

Add these variables to complete your ${subResult.category} scale:
${exampleVars}

Consistent sub-categories across all categories make your design system more predictable.`
              });
            }
            if (subResult.patternValidation) {
              const { allMatch, invalidNames, patternDescription, examples } = subResult.patternValidation;
              if (subResult.found.length === 0) {
                const exampleVars = examples.slice(0, 3).map((ex) => `  - ${ex}`).join("\n");
                auditChecks.push({
                  check: `${requirement.displayName} ${subResult.category} naming`,
                  status: "warning",
                  suggestion: `"${matchingCollection.name}" ${subResult.category} category has no sub-categories following the expected naming pattern.

Expected pattern: ${patternDescription}

Add variables like:
${exampleVars}

Consistent naming makes variables easier to find and use.`
                });
              } else {
                const foundList = subResult.found.slice(0, 5).join(", ") + (subResult.found.length > 5 ? `... (${subResult.found.length} total)` : "");
                auditChecks.push({
                  check: `${requirement.displayName} ${subResult.category} naming`,
                  status: "pass",
                  suggestion: `"${matchingCollection.name}" ${subResult.category} follows the correct naming pattern with sizes: ${foundList}`
                });
              }
            }
            if (subResult.mirrorValidation) {
              const { sourceCategory, missingSizes, extraSizes, isFullMatch } = subResult.mirrorValidation;
              if (missingSizes.length > 0) {
                const missingList = missingSizes.slice(0, 5).join(", ") + (missingSizes.length > 5 ? `, and ${missingSizes.length - 5} more` : "");
                const exampleVars = missingSizes.slice(0, 3).map((sz) => `  - ${subResult.category}/${sz}`).join("\n");
                auditChecks.push({
                  check: `${requirement.displayName} ${subResult.category} sizes`,
                  status: "warning",
                  suggestion: `"${matchingCollection.name}" ${subResult.category} is missing sizes that exist in ${sourceCategory}: ${missingList}.

Add these variables to mirror your ${sourceCategory} scale:
${exampleVars}

Keeping ${subResult.category} and ${sourceCategory} synchronized ensures typography remains consistent.`
                });
              }
              if (extraSizes.length > 0) {
                const extraList = extraSizes.slice(0, 5).join(", ") + (extraSizes.length > 5 ? `, and ${extraSizes.length - 5} more` : "");
                auditChecks.push({
                  check: `${requirement.displayName} ${subResult.category} extra sizes`,
                  status: "warning",
                  suggestion: `"${matchingCollection.name}" ${subResult.category} has sizes that don't exist in ${sourceCategory}: ${extraList}.

Consider either:
  - Adding these sizes to ${sourceCategory} (if they're needed)
  - Removing them from ${subResult.category} (if they're unused)

Mismatched scales can lead to inconsistent typography.`
                });
              }
              if (isFullMatch && subResult.found.length > 0) {
                auditChecks.push({
                  check: `${requirement.displayName} ${subResult.category} mirrors ${sourceCategory}`,
                  status: "pass",
                  suggestion: `"${matchingCollection.name}" ${subResult.category} correctly mirrors all ${sourceCategory} sizes (${subResult.found.length} sizes matched)`
                });
              }
            }
          }
        }
      }
      const hasAllCollections = missingCollections.length === 0;
      if (validatedCollections.length > 0) {
        if (validatedCollections.every((v) => v.isValid)) {
          auditChecks.unshift({
            check: "Variable collection structure",
            status: "pass",
            suggestion: `All detected collections (${validatedCollections.map((v) => v.matchedRequirement).join(", ")}) have proper structure`
          });
        }
      }
      console.log("\u2705 [COLLECTION] Validation complete:", {
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
      console.error("\u274C [COLLECTION] Error validating collections:", error);
      return {
        hasAllCollections: false,
        validatedCollections: [],
        missingCollections: requirements.map((r) => r.displayName),
        auditChecks: [{
          check: "Variable collection structure",
          status: "warning",
          suggestion: `Could not validate variable collections: ${error instanceof Error ? error.message : "Unknown error"}`
        }]
      };
    }
  }
  function extractCategories(variables) {
    const categories = /* @__PURE__ */ new Map();
    for (const variable of variables) {
      const parts = variable.name.split("/");
      if (parts.length === 0) continue;
      const topCategory = parts[0].toLowerCase().trim();
      if (!categories.has(topCategory)) {
        categories.set(topCategory, /* @__PURE__ */ new Set());
      }
      for (let i = 1; i < parts.length; i++) {
        const subCategory = parts[i].toLowerCase().trim();
        categories.get(topCategory).add(subCategory);
      }
    }
    return categories;
  }
  function validateCategories(collectionName, requirement, categories) {
    const foundCategories = [];
    const missingCategories = [];
    const subCategoryResults = [];
    for (const reqCategory of requirement.requiredCategories) {
      const categoryName = reqCategory.name.toLowerCase();
      const hasCategory = categories.has(categoryName);
      if (hasCategory) {
        foundCategories.push(reqCategory.name);
        const subCategories = categories.get(categoryName) || /* @__PURE__ */ new Set();
        if (reqCategory.subCategories && reqCategory.subCategories.length > 0) {
          const foundSubs = [];
          const missingSubs = [];
          const usePartialMatch = reqCategory.subCategoryPartialMatch === true;
          const subCategoriesArray = Array.from(subCategories);
          for (const reqSub of reqCategory.subCategories) {
            const subName = reqSub.toLowerCase();
            let hasSubCategory;
            if (usePartialMatch) {
              hasSubCategory = subCategoriesArray.some((actual) => actual.includes(subName));
            } else {
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
        if (reqCategory.subCategoryPattern) {
          const { pattern, description, examples } = reqCategory.subCategoryPattern;
          const subCategoryArray = Array.from(subCategories);
          const invalidNames = subCategoryArray.filter((name) => !pattern.test(name));
          const validNames = subCategoryArray.filter((name) => pattern.test(name));
          subCategoryResults.push({
            category: reqCategory.name,
            found: validNames,
            missing: [],
            // Pattern validation doesn't have "missing" in the same sense
            patternValidation: {
              allMatch: invalidNames.length === 0 && subCategoryArray.length > 0,
              invalidNames,
              patternDescription: description,
              examples
            }
          });
        }
        if (reqCategory.mirrorCategory) {
          const sourceCategory = reqCategory.mirrorCategory.toLowerCase();
          const sourceSubCategories = categories.get(sourceCategory) || /* @__PURE__ */ new Set();
          const currentSubCategories = Array.from(subCategories);
          const sourceSubCategoriesArray = Array.from(sourceSubCategories);
          const missingSizes = sourceSubCategoriesArray.filter((size) => !subCategories.has(size));
          const extraSizes = currentSubCategories.filter((size) => !sourceSubCategories.has(size));
          subCategoryResults.push({
            category: reqCategory.name,
            found: currentSubCategories.filter((size) => sourceSubCategories.has(size)),
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
    const hasAllCategories = missingCategories.length === 0;
    const hasAllSubCategories = subCategoryResults.every((r) => {
      if (r.missing.length > 0) return false;
      if (r.patternValidation && r.patternValidation.allMatch === false && r.found.length === 0) return false;
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
  async function validateTextStylesAgainstVariables() {
    const auditChecks = [];
    try {
      const collections = await figma.variables.getLocalVariableCollectionsAsync();
      const allVariables = await figma.variables.getLocalVariablesAsync();
      const themeCollection = collections.find((c) => /theme/i.test(c.name));
      const fontFamilyVariables = [];
      if (themeCollection) {
        const themeVariables = allVariables.filter((v) => v.variableCollectionId === themeCollection.id);
        for (const variable of themeVariables) {
          const parts = variable.name.split("/").map((p) => p.toLowerCase().trim());
          if (parts[0] === "font-family" && parts.length > 1) {
            const subCategory = parts[1];
            if (!fontFamilyVariables.includes(subCategory)) {
              fontFamilyVariables.push(subCategory);
            }
          }
        }
      }
      const textStyles = await figma.getLocalTextStylesAsync();
      const textStyleCategories = [];
      for (const style of textStyles) {
        const parts = style.name.split("/").map((p) => p.toLowerCase().trim());
        const topCategory = parts[0];
        if (!textStyleCategories.includes(topCategory)) {
          textStyleCategories.push(topCategory);
        }
      }
      console.log("\u{1F4DD} [TEXT STYLE] Font-family variables:", fontFamilyVariables);
      console.log("\u{1F4DD} [TEXT STYLE] Text style categories:", textStyleCategories);
      const variablesMissingStyles = fontFamilyVariables.filter(
        (v) => !textStyleCategories.some((cat) => cat.includes(v) || v.includes(cat))
      );
      const typographyPatterns = ["display", "heading", "body", "label", "caption", "title", "subtitle", "overline"];
      const relevantTextCategories = textStyleCategories.filter(
        (cat) => typographyPatterns.some((pattern) => cat.includes(pattern))
      );
      const stylesMissingVariables = relevantTextCategories.filter(
        (s) => !fontFamilyVariables.some((v) => s.includes(v) || v.includes(s))
      );
      const isFullMatch = variablesMissingStyles.length === 0 && stylesMissingVariables.length === 0;
      const validation = {
        fontFamilyVariables,
        textStyleCategories,
        variablesMissingStyles,
        stylesMissingVariables,
        isFullMatch
      };
      if (fontFamilyVariables.length === 0 && textStyles.length === 0) {
        console.log("\u{1F4DD} [TEXT STYLE] No font-family variables or text styles found, skipping validation");
      } else if (fontFamilyVariables.length === 0 && textStyles.length > 0) {
        const categoryList = relevantTextCategories.slice(0, 3).join(", ") + (relevantTextCategories.length > 3 ? `, and ${relevantTextCategories.length - 3} more` : "");
        const exampleVars = relevantTextCategories.slice(0, 3).map((cat) => `  - font-family/${cat}`).join("\n");
        auditChecks.push({
          check: "Font-family variables",
          status: "warning",
          suggestion: `You have text styles (${categoryList}) but no matching font-family variables.

Add these variables to your Theme collection:
${exampleVars}

This allows text styles to reference font families as variables instead of hard-coded font names.`
        });
      } else if (fontFamilyVariables.length > 0 && textStyles.length === 0) {
        const varList = fontFamilyVariables.slice(0, 3).join(", ") + (fontFamilyVariables.length > 3 ? `, and ${fontFamilyVariables.length - 3} more` : "");
        const exampleStyles = fontFamilyVariables.slice(0, 3).map((v) => `  - ${v}/xl, ${v}/lg, ${v}/md, etc.`).join("\n");
        auditChecks.push({
          check: "Text styles",
          status: "warning",
          suggestion: `You have font-family variables (${varList}) but no matching text styles.

Create text styles following these patterns:
${exampleStyles}

Text styles make typography consistent and easier to apply across your designs.`
        });
      } else {
        if (variablesMissingStyles.length > 0) {
          const varList = variablesMissingStyles.slice(0, 3).join(", ") + (variablesMissingStyles.length > 3 ? `, and ${variablesMissingStyles.length - 3} more` : "");
          const exampleStyles = variablesMissingStyles.slice(0, 3).map((v) => `  - ${v}/xl, ${v}/lg, ${v}/md`).join("\n");
          auditChecks.push({
            check: "Text styles for font-family variables",
            status: "warning",
            suggestion: `These font-family variables don't have matching text styles: ${varList}.

Create text styles using these patterns:
${exampleStyles}

This ensures all font-family variables are used in your text style system.`
          });
        }
        if (stylesMissingVariables.length > 0) {
          const styleList = stylesMissingVariables.slice(0, 3).join(", ") + (stylesMissingVariables.length > 3 ? `, and ${stylesMissingVariables.length - 3} more` : "");
          const exampleVars = stylesMissingVariables.slice(0, 3).map((s) => `  - font-family/${s}`).join("\n");
          auditChecks.push({
            check: "Font-family variables for text styles",
            status: "warning",
            suggestion: `These text style categories don't have matching font-family variables: ${styleList}.

Add these variables to your Theme collection:
${exampleVars}

This allows your text styles to reference font families dynamically.`
          });
        }
        if (isFullMatch && fontFamilyVariables.length > 0) {
          auditChecks.push({
            check: "Text styles & font-family sync",
            status: "pass",
            suggestion: `All font-family variables (${fontFamilyVariables.join(", ")}) have matching text styles`
          });
        }
      }
      return { validation, auditChecks };
    } catch (error) {
      console.error("\u274C [TEXT STYLE] Error validating text styles:", error);
      return {
        validation: {
          fontFamilyVariables: [],
          textStyleCategories: [],
          variablesMissingStyles: [],
          stylesMissingVariables: [],
          isFullMatch: false
        },
        auditChecks: [{
          check: "Text style validation",
          status: "warning",
          suggestion: `Could not validate text styles: ${error instanceof Error ? error.message : "Unknown error"}`
        }]
      };
    }
  }
  var TYPOGRAPHY_PROPERTIES = [
    "fontFamily",
    "fontSize",
    "letterSpacing",
    "lineHeight"
  ];
  async function validateTextStyleBindings() {
    const auditChecks = [];
    const results = [];
    try {
      const textStyles = await figma.getLocalTextStylesAsync();
      const allVariables = await figma.variables.getLocalVariablesAsync();
      const variableIdToName = /* @__PURE__ */ new Map();
      for (const variable of allVariables) {
        variableIdToName.set(variable.id, variable.name.toLowerCase());
      }
      console.log("\u{1F524} [TEXT BINDING] Validating", textStyles.length, "text styles");
      if (textStyles.length === 0) {
        return { results, auditChecks };
      }
      const stylesWithIssues = [];
      for (const style of textStyles) {
        const nameParts = style.name.split("/").map((p) => p.toLowerCase().trim());
        if (nameParts.length < 2) {
          console.log(`\u{1F524} [TEXT BINDING] Skipping "${style.name}" - doesn't match category/size pattern`);
          continue;
        }
        const category = nameParts[0];
        const size = nameParts.length >= 3 ? nameParts[1] : nameParts[nameParts.length - 1];
        const boundProperties = [];
        const unboundProperties = [];
        const boundVars = style.boundVariables || {};
        if (results.length < 3) {
          console.log(`\u{1F50D} [DEBUG] Style "${style.name}" boundVariables:`, Object.keys(boundVars).length > 0 ? Object.keys(boundVars) : "none");
        }
        for (const prop of TYPOGRAPHY_PROPERTIES) {
          const binding = boundVars[prop];
          if (binding && binding.id) {
            const variableName = variableIdToName.get(binding.id) || "unknown";
            let expectedPattern;
            let isCorrectBinding;
            switch (prop) {
              case "fontFamily":
                expectedPattern = `font-family/${category}`;
                isCorrectBinding = variableName.includes("font-family") && variableName.includes(category);
                break;
              case "fontSize":
                expectedPattern = `font-size/${size}`;
                isCorrectBinding = variableName.includes("font-size") && (variableName.endsWith(size) || variableName.includes(`/${size}`));
                break;
              case "letterSpacing":
                expectedPattern = `letter-spacing/${size}`;
                isCorrectBinding = variableName.includes("letter-spacing") && (variableName.endsWith(size) || variableName.includes(`/${size}`));
                break;
              case "lineHeight":
                expectedPattern = `line-height/${size}`;
                isCorrectBinding = variableName.includes("line-height") && (variableName.endsWith(size) || variableName.includes(`/${size}`));
                break;
              default:
                expectedPattern = "";
                isCorrectBinding = true;
            }
            boundProperties.push({
              property: prop,
              variableName,
              isCorrectBinding,
              expectedPattern
            });
          } else {
            unboundProperties.push(prop);
          }
        }
        const isFullyBound = unboundProperties.length === 0;
        const hasCorrectBindings = boundProperties.every((b) => b.isCorrectBinding);
        if (results.length < 3) {
          console.log(`\u{1F524} [TEXT BINDING] Style "${style.name}":`);
          console.log(`  - Unbound: ${unboundProperties.length > 0 ? unboundProperties.join(", ") : "none"}`);
          console.log(`  - Bound: ${boundProperties.length}`);
          boundProperties.forEach((bp) => {
            console.log(`    \u2022 ${bp.property}: "${bp.variableName}" ${bp.isCorrectBinding ? "\u2713" : "\u2717 (expected: " + bp.expectedPattern + ")"}`);
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
        if (unboundProperties.length > 0 || !hasCorrectBindings) {
          const incorrectBindings = boundProperties.filter((b) => !b.isCorrectBinding).map((b) => ({
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
      const totalStyles = results.length;
      const fullyCompliantStyles = results.filter((r) => r.isFullyBound && r.hasCorrectBindings).length;
      if (totalStyles === 0) {
        return { results, auditChecks };
      }
      const unboundIssues = stylesWithIssues.filter((s) => s.unboundProps.length > 0);
      const bindingIssues = stylesWithIssues.filter((s) => s.incorrectBindings.length > 0);
      if (unboundIssues.length > 0) {
        const issueDescriptions = unboundIssues.map((s) => {
          const style = results.find((r) => r.styleName === s.styleName);
          if (!style) return `\u2022 "${s.styleName}": ${s.unboundProps.join(", ")}`;
          const category = style.category;
          const size = style.size;
          const propsDetail = s.unboundProps.map((prop) => {
            switch (prop) {
              case "fontFamily":
                return `  - ${prop} has a hard-coded value. Connect it to "font-family/${category}" variable`;
              case "fontSize":
                return `  - ${prop} has a hard-coded value. Connect it to "font-size/${category}/${size}" variable`;
              case "lineHeight":
                return `  - ${prop} has a hard-coded value. Connect it to "line-height/${category}/${size}" variable`;
              case "letterSpacing":
                return `  - ${prop} has a hard-coded value. Connect it to "letter-spacing/${category}/${size}" variable`;
              default:
                return `  - ${prop} has a hard-coded value`;
            }
          });
          return `\u2022 Text style "${s.styleName}" (category: ${category}, size: ${size}):
${propsDetail.join("\n")}`;
        });
        auditChecks.push({
          check: "Text style variable bindings",
          status: "warning",
          suggestion: `${unboundIssues.length} text style(s) have hard-coded values instead of using theme variables:

${issueDescriptions.join("\n\n")}

To fix: Select each text style in Figma, then connect the listed properties to their corresponding variables using the variable binding feature.`
        });
      }
      if (bindingIssues.length > 0) {
        const issueDescriptions = bindingIssues.map((s) => {
          const nameParts = s.styleName.split("/");
          const category = nameParts[0];
          const size = nameParts.length >= 3 ? nameParts[1] : nameParts[nameParts.length - 1];
          const examples = s.incorrectBindings.map((b) => {
            const propType = b.prop;
            return `  - ${propType} is bound to "${b.actual}" but should contain "/${size}" to match this text style's size`;
          });
          return `\u2022 Text style "${s.styleName}" (category: ${category}, size: ${size}):
${examples.join("\n")}`;
        });
        auditChecks.push({
          check: "Text style variable naming",
          status: "warning",
          suggestion: `${bindingIssues.length} text style(s) are connected to variables with mismatched size values:

${issueDescriptions.join("\n\n")}

Each text style should be bound to variables that match its size. For example, "heading/sm/light" should use "letter-spacing/heading/sm", not "letter-spacing/heading/md".`
        });
      }
      if (unboundIssues.length === 0 && bindingIssues.length === 0 && totalStyles > 0) {
        auditChecks.push({
          check: "Text style variable bindings",
          status: "pass",
          suggestion: `All ${totalStyles} text styles use correctly named theme variables for typography properties`
        });
      }
      console.log("\u{1F524} [TEXT BINDING] Validation complete:", {
        total: totalStyles,
        compliant: fullyCompliantStyles,
        withIssues: stylesWithIssues.length
      });
      return { results, auditChecks };
    } catch (error) {
      console.error("\u274C [TEXT BINDING] Error validating text style bindings:", error);
      return {
        results,
        auditChecks: [{
          check: "Text style variable bindings",
          status: "warning",
          suggestion: `Could not validate text style bindings: ${error instanceof Error ? error.message : "Unknown error"}`
        }]
      };
    }
  }
  function isTransparentColor(color) {
    if ("a" in color && color.a === 0) return true;
    return false;
  }
  function formatColor(color) {
    const r = Math.round(color.r * 255);
    const g = Math.round(color.g * 255);
    const b = Math.round(color.b * 255);
    if ("a" in color && color.a < 1) {
      return `rgba(${r}, ${g}, ${b}, ${color.a.toFixed(2)})`;
    }
    return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
  }
  function checkNodeForRawValues(node) {
    const rawValues = [];
    const boundVars = node.boundVariables || {};
    if ("fills" in node && Array.isArray(node.fills)) {
      const fills = node.fills;
      const fillBindings = boundVars.fills || [];
      fills.forEach((fill, index) => {
        if (fill.type === "SOLID" && fill.visible !== false) {
          const hasBinding = fillBindings[index] && fillBindings[index].id;
          if (!hasBinding && !isTransparentColor(fill.color)) {
            rawValues.push({
              category: "fill",
              property: "fill color",
              value: formatColor(fill.color)
            });
          }
        }
      });
    }
    if ("strokes" in node && Array.isArray(node.strokes)) {
      const strokes = node.strokes;
      const strokeBindings = boundVars.strokes || [];
      strokes.forEach((stroke, index) => {
        if (stroke.type === "SOLID" && stroke.visible !== false) {
          const hasBinding = strokeBindings[index] && strokeBindings[index].id;
          if (!hasBinding && !isTransparentColor(stroke.color)) {
            rawValues.push({
              category: "stroke",
              property: "stroke color",
              value: formatColor(stroke.color)
            });
          }
        }
      });
    }
    if ("cornerRadius" in node && typeof node.cornerRadius === "number" && node.cornerRadius > 0) {
      const hasBinding = boundVars.cornerRadius && boundVars.cornerRadius.id;
      if (!hasBinding) {
        rawValues.push({
          category: "cornerRadius",
          property: "corner radius",
          value: `${node.cornerRadius}px`
        });
      }
    }
    if ("layoutMode" in node && node.layoutMode !== "NONE") {
      if ("paddingTop" in node) {
        const paddingProps = ["paddingTop", "paddingRight", "paddingBottom", "paddingLeft"];
        for (const prop of paddingProps) {
          const value = node[prop];
          if (typeof value === "number" && value > 0) {
            const hasBinding = boundVars[prop] && boundVars[prop].id;
            if (!hasBinding) {
              rawValues.push({
                category: "spacing",
                property: prop,
                value: `${value}px`
              });
            }
          }
        }
      }
      if ("itemSpacing" in node && typeof node.itemSpacing === "number" && node.itemSpacing > 0) {
        const hasBinding = boundVars.itemSpacing && boundVars.itemSpacing.id;
        if (!hasBinding) {
          rawValues.push({
            category: "spacing",
            property: "gap",
            value: `${node.itemSpacing}px`
          });
        }
      }
    }
    if (node.type === "TEXT") {
      const textNode = node;
      const typographyProps = ["fontSize", "lineHeight", "letterSpacing"];
      for (const prop of typographyProps) {
        const hasBinding = boundVars[prop] && boundVars[prop].id;
        if (!hasBinding) {
          let value;
          if (prop === "fontSize") {
            value = typeof textNode.fontSize === "number" ? `${textNode.fontSize}px` : "mixed";
          } else if (prop === "lineHeight") {
            const lh = textNode.lineHeight;
            if (typeof lh === "object" && "value" in lh) {
              value = lh.unit === "PERCENT" ? `${lh.value}%` : `${lh.value}px`;
            } else {
              value = "auto";
            }
          } else {
            const ls = textNode.letterSpacing;
            if (typeof ls === "object" && "value" in ls) {
              value = ls.unit === "PERCENT" ? `${ls.value}%` : `${ls.value}px`;
            } else {
              value = "0";
            }
          }
          if (value !== "auto" && value !== "0" && value !== "0px" && value !== "0%") {
            rawValues.push({
              category: "typography",
              property: prop,
              value
            });
          }
        }
      }
    }
    if ("effects" in node && Array.isArray(node.effects)) {
      const effects = node.effects;
      const effectBindings = boundVars.effects || [];
      effects.forEach((effect, index) => {
        if (effect.visible !== false) {
          const hasBinding = effectBindings[index] && effectBindings[index].id;
          if (!hasBinding) {
            let effectDesc = effect.type.toLowerCase().replace("_", " ");
            if (effect.type === "DROP_SHADOW" || effect.type === "INNER_SHADOW") {
              const shadow = effect;
              effectDesc = `${effectDesc} (${formatColor(shadow.color)})`;
            }
            rawValues.push({
              category: "effect",
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
  function collectAllNodes(node) {
    const nodes = [node];
    if ("children" in node) {
      for (const child of node.children) {
        nodes.push(...collectAllNodes(child));
      }
    }
    return nodes;
  }
  function validateComponentBindings(componentNode) {
    const allNodes = collectAllNodes(componentNode);
    const nodesWithRawValues = [];
    const rawValueCounts = {
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
  async function validateAllComponentBindings() {
    const auditChecks = [];
    const results = [];
    try {
      let findComponents2 = function(node, pageName) {
        if (node.type === "COMPONENT" || node.type === "COMPONENT_SET") {
          components.push({ node, pageName });
        } else if ("children" in node) {
          for (const child of node.children) {
            findComponents2(child, pageName);
          }
        }
      };
      var findComponents = findComponents2;
      console.log("\u{1F9E9} [COMPONENT BINDING] Starting validation...");
      const components = [];
      console.log("\u{1F9E9} [COMPONENT BINDING] Loading all pages...");
      figma.ui.postMessage({
        type: "audit-progress",
        data: { message: "Loading all pages..." }
      });
      await figma.loadAllPagesAsync();
      console.log("\u{1F9E9} [COMPONENT BINDING] All pages loaded");
      const totalPages = figma.root.children.length;
      console.log("\u{1F9E9} [COMPONENT BINDING] Scanning", totalPages, "pages for components...");
      for (let i = 0; i < totalPages; i++) {
        const page = figma.root.children[i];
        figma.ui.postMessage({
          type: "audit-progress",
          data: { message: `Scanning page ${i + 1}/${totalPages}: "${page.name}"` }
        });
        await new Promise((resolve) => setTimeout(resolve, 0));
        for (const child of page.children) {
          findComponents2(child, page.name);
        }
      }
      console.log("\u{1F9E9} [COMPONENT BINDING] Found", components.length, "components across", figma.root.children.length, "pages");
      if (components.length === 0) {
        return { results, auditChecks };
      }
      const componentsWithIssues = [];
      const totalComponents = components.length;
      figma.ui.postMessage({
        type: "audit-progress",
        data: { message: `${totalComponents} component${totalComponents !== 1 ? "s are" : " is"} being scanned, please wait patiently...` }
      });
      for (let i = 0; i < totalComponents; i++) {
        const component = components[i];
        if (i % 10 === 0 || i === totalComponents - 1) {
          figma.ui.postMessage({
            type: "audit-progress",
            data: { message: `Scanning ${totalComponents} component${totalComponents !== 1 ? "s" : ""}: ${i + 1}/${totalComponents} validated...` }
          });
        }
        await new Promise((resolve) => setTimeout(resolve, 0));
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
      figma.ui.postMessage({
        type: "audit-progress",
        data: { message: `Completed scanning ${totalComponents} component${totalComponents !== 1 ? "s" : ""}!` }
      });
      const totalValidated = results.length;
      const compliantComponents = results.filter((r) => r.isFullyBound).length;
      if (componentsWithIssues.length > 0) {
        const totalCounts = {
          fill: 0,
          stroke: 0,
          effect: 0,
          spacing: 0,
          cornerRadius: 0,
          typography: 0
        };
        for (const comp of componentsWithIssues) {
          for (const cat of Object.keys(comp.counts)) {
            totalCounts[cat] += comp.counts[cat];
          }
        }
        const componentDescriptions = componentsWithIssues.map((comp) => {
          const issues = [];
          if (comp.counts.fill > 0) {
            issues.push(`  - ${comp.counts.fill} fill color${comp.counts.fill > 1 ? "s" : ""} (should use color/* variables)`);
          }
          if (comp.counts.stroke > 0) {
            issues.push(`  - ${comp.counts.stroke} stroke color${comp.counts.stroke > 1 ? "s" : ""} (should use color/* variables)`);
          }
          if (comp.counts.spacing > 0) {
            issues.push(`  - ${comp.counts.spacing} spacing value${comp.counts.spacing > 1 ? "s" : ""} (should use space/* variables for padding/gap)`);
          }
          if (comp.counts.cornerRadius > 0) {
            issues.push(`  - ${comp.counts.cornerRadius} corner radi${comp.counts.cornerRadius > 1 ? "i" : "us"} (should use radius/* variables)`);
          }
          if (comp.counts.typography > 0) {
            issues.push(`  - ${comp.counts.typography} typography value${comp.counts.typography > 1 ? "s" : ""} (should use font-* variables)`);
          }
          if (comp.counts.effect > 0) {
            issues.push(`  - ${comp.counts.effect} effect${comp.counts.effect > 1 ? "s" : ""} (should use effect/* variables)`);
          }
          return `\u2022 Component "${comp.name}" on page "${comp.pageName}" has ${comp.totalRawValues} hard-coded value${comp.totalRawValues > 1 ? "s" : ""}:
${issues.join("\n")}`;
        });
        auditChecks.push({
          check: "Component variable bindings",
          status: "warning",
          suggestion: `${componentsWithIssues.length} component(s) have hard-coded values instead of using theme variables:

${componentDescriptions.join("\n\n")}

To fix: Select each component in Figma, then bind the listed properties to their corresponding variables in your Theme collection. This ensures consistent styling and makes design updates easier.`
        });
      }
      if (compliantComponents === totalValidated && totalValidated > 0) {
        auditChecks.push({
          check: "Component variable bindings",
          status: "pass",
          suggestion: `All ${totalValidated} components use theme variables for visual properties`
        });
      }
      console.log("\u{1F9E9} [COMPONENT BINDING] Validation complete:", {
        total: totalValidated,
        compliant: compliantComponents,
        withIssues: componentsWithIssues.length
      });
      return { results, auditChecks };
    } catch (error) {
      console.error("\u274C [COMPONENT BINDING] Error validating component bindings:", error);
      return {
        results,
        auditChecks: [{
          check: "Component variable bindings",
          status: "warning",
          suggestion: `Could not validate component bindings: ${error instanceof Error ? error.message : "Unknown error"}`
        }]
      };
    }
  }

  // src/core/consistency-engine.ts
  var ComponentConsistencyEngine = class {
    constructor(config = {}) {
      this.cache = /* @__PURE__ */ new Map();
      this.designSystemsKnowledge = null;
      this.config = __spreadValues({
        enableCaching: true,
        enableMCPIntegration: true,
        mcpServerUrl: "https://design-systems-mcp.southleft-llc.workers.dev/mcp",
        consistencyThreshold: 0.95
      }, config);
    }
    /**
     * Generate a deterministic hash for a component based on its structure
     */
    generateComponentHash(context, tokens) {
      var _a, _b;
      const hashInput = {
        name: context.name,
        type: context.type,
        hierarchy: this.normalizeHierarchy(context.hierarchy),
        frameStructure: context.frameStructure,
        detectedStyles: context.detectedStyles,
        tokenFingerprint: this.generateTokenFingerprint(tokens),
        // Don't include dynamic context that could vary
        staticProperties: {
          hasInteractiveElements: ((_a = context.additionalContext) == null ? void 0 : _a.hasInteractiveElements) || false,
          componentFamily: ((_b = context.additionalContext) == null ? void 0 : _b.componentFamily) || "generic"
        }
      };
      return this.createHash(JSON.stringify(hashInput));
    }
    /**
     * Get cached analysis if available and valid
     */
    getCachedAnalysis(hash) {
      if (!this.config.enableCaching) return null;
      const cached = this.cache.get(hash);
      if (!cached) return null;
      const isExpired = Date.now() - cached.timestamp > 24 * 60 * 60 * 1e3;
      if (isExpired) {
        this.cache.delete(hash);
        return null;
      }
      console.log("\u2705 Using cached analysis for component hash:", hash);
      return cached;
    }
    /**
     * Cache analysis result
     */
    cacheAnalysis(hash, result) {
      var _a;
      if (!this.config.enableCaching) return;
      this.cache.set(hash, {
        hash,
        result,
        timestamp: Date.now(),
        mcpKnowledgeVersion: ((_a = this.designSystemsKnowledge) == null ? void 0 : _a.version) || "1.0.0"
      });
      console.log("\u{1F4BE} Cached analysis for component hash:", hash);
    }
    /**
    * Load design systems knowledge from MCP server
    */
    async loadDesignSystemsKnowledge() {
      if (!this.config.enableMCPIntegration) {
        console.log("\u{1F4DA} MCP integration disabled, using fallback knowledge");
        this.loadFallbackKnowledge();
        return;
      }
      try {
        console.log("\u{1F504} Loading design systems knowledge from MCP...");
        const connectivityTest = await this.testMCPConnectivity();
        if (!connectivityTest) {
          console.warn("\u26A0\uFE0F MCP server not accessible, using fallback knowledge");
          this.loadFallbackKnowledge();
          return;
        }
        const [componentKnowledge, tokenKnowledge, accessibilityKnowledge, scoringKnowledge] = await Promise.allSettled([
          this.queryMCP("component analysis best practices"),
          this.queryMCP("design token naming conventions and patterns"),
          this.queryMCP("design system accessibility requirements"),
          this.queryMCP("design system component scoring methodology")
        ]);
        this.designSystemsKnowledge = {
          version: "1.0.0",
          components: this.processComponentKnowledge(
            componentKnowledge.status === "fulfilled" ? componentKnowledge.value : null
          ),
          tokens: this.processKnowledgeContent(
            tokenKnowledge.status === "fulfilled" ? tokenKnowledge.value : null
          ),
          accessibility: this.processKnowledgeContent(
            accessibilityKnowledge.status === "fulfilled" ? accessibilityKnowledge.value : null
          ),
          scoring: this.processKnowledgeContent(
            scoringKnowledge.status === "fulfilled" ? scoringKnowledge.value : null
          ),
          lastUpdated: Date.now()
        };
        const successfulQueries = [componentKnowledge, tokenKnowledge, accessibilityKnowledge, scoringKnowledge].filter((result) => result.status === "fulfilled").length;
        if (successfulQueries > 0) {
          console.log(`\u2705 Design systems knowledge loaded successfully (${successfulQueries}/4 queries successful)`);
        } else {
          console.warn("\u26A0\uFE0F All MCP queries failed, using fallback knowledge");
          this.loadFallbackKnowledge();
        }
      } catch (error) {
        console.warn("\u26A0\uFE0F Failed to load design systems knowledge:", error);
        this.loadFallbackKnowledge();
      }
    }
    /**
    * Test MCP server connectivity using MCP initialization instead of health endpoint
    */
    async testMCPConnectivity() {
      var _a, _b;
      try {
        console.log("\u{1F517} Testing MCP server connectivity...");
        const timeoutPromise = new Promise(
          (_, reject) => setTimeout(() => reject(new Error("Connectivity test timeout")), 5e3)
        );
        const initPayload = {
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: {
            protocolVersion: "2024-11-05",
            capabilities: { roots: { listChanged: true } },
            clientInfo: { name: "figmalint", version: "2.0.0" }
          }
        };
        if (!this.config.mcpServerUrl) {
          throw new Error("MCP server URL not configured");
        }
        const fetchPromise = fetch(this.config.mcpServerUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify(initPayload)
        });
        const response = await Promise.race([fetchPromise, timeoutPromise]);
        if (response.ok) {
          const data = await response.json();
          if ((_b = (_a = data.result) == null ? void 0 : _a.serverInfo) == null ? void 0 : _b.name) {
            console.log(`\u2705 MCP server accessible: ${data.result.serverInfo.name}`);
            return true;
          }
        }
        console.warn(`\u26A0\uFE0F MCP server returned ${response.status}`);
        return false;
      } catch (error) {
        console.warn("\u26A0\uFE0F MCP server connectivity test failed:", error);
        return false;
      }
    }
    /**
     * Query the design systems MCP server using proper JSON-RPC protocol
     */
    async queryMCP(query) {
      try {
        console.log(`\u{1F50D} Querying MCP for: "${query}"`);
        const timeoutPromise = new Promise(
          (_, reject) => setTimeout(() => reject(new Error("MCP query timeout")), 5e3)
        );
        if (!this.config.mcpServerUrl) {
          throw new Error("MCP server URL not configured");
        }
        const searchPayload = {
          jsonrpc: "2.0",
          id: Math.floor(Math.random() * 1e3) + 2,
          // Random ID > 1 (1 is used for init)
          method: "tools/call",
          params: {
            name: "search_design_knowledge",
            arguments: {
              query,
              limit: 5,
              category: "components"
            }
          }
        };
        const fetchPromise = fetch(this.config.mcpServerUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify(searchPayload)
        });
        const response = await Promise.race([fetchPromise, timeoutPromise]);
        if (!response.ok) {
          throw new Error(`MCP query failed: ${response.status} ${response.statusText}`);
        }
        const result = await response.json();
        console.log(`\u2705 MCP query successful for: "${query}"`);
        if (result.result && result.result.content) {
          return {
            results: result.result.content.map((item) => ({
              title: item.title || "Design System Knowledge",
              content: item.content || item.description || "Knowledge content",
              category: "design-systems"
            }))
          };
        }
        return { results: [] };
      } catch (error) {
        console.warn(`\u26A0\uFE0F MCP query failed for "${query}":`, error);
        return this.getFallbackKnowledgeForQuery(query);
      }
    }
    /**
     * Create deterministic analysis prompt with MCP knowledge
     */
    createDeterministicPrompt(context) {
      const basePrompt = this.createBasePrompt(context);
      const mcpGuidance = this.getMCPGuidance(context);
      const scoringCriteria = this.getScoringCriteria(context);
      return `${basePrompt}

**CONSISTENCY REQUIREMENTS:**
- Use DETERMINISTIC analysis based on the exact component structure provided
- Apply CONSISTENT scoring criteria for identical components
- Follow established design system patterns and conventions
- Provide REPRODUCIBLE results for the same input

**DESIGN SYSTEMS GUIDANCE:**
${mcpGuidance}

**SCORING METHODOLOGY:**
${scoringCriteria}

**DETERMINISTIC SETTINGS:**
- Analysis must be based solely on the provided component structure
- Scores must be calculated using objective criteria
- Recommendations must follow established design system patterns
- Response format must be exactly as specified (JSON only)

**RESPONSE FORMAT (JSON only - no explanatory text):**
{
  "component": "Component name and purpose",
  "description": "Detailed component description based on structure analysis",
  "score": {
    "overall": 85,
    "breakdown": {
      "structure": 90,
      "tokens": 80,
      "accessibility": 85,
      "consistency": 90
    }
  },
  "props": [...],
  "states": [...],
  "slots": [...],
  "variants": {...},
  "usage": "Usage guidelines",
  "accessibility": {...},
  "tokens": {...},
  "audit": {...},
  "mcpReadiness": {...}
}`;
    }
    /**
     * Validate analysis result for consistency
     */
    validateAnalysisConsistency(result, context) {
      var _a, _b, _c, _d, _e;
      const issues = [];
      if (!((_a = result.metadata) == null ? void 0 : _a.component)) issues.push("Missing component name");
      if (!((_b = result.metadata) == null ? void 0 : _b.description)) issues.push("Missing component description");
      if (!this.isValidScore((_d = (_c = result.metadata) == null ? void 0 : _c.mcpReadiness) == null ? void 0 : _d.score)) {
        issues.push("Invalid or missing MCP readiness score");
      }
      const family = (_e = context.additionalContext) == null ? void 0 : _e.componentFamily;
      if (family && !this.validateComponentFamilyConsistency(result, family)) {
        issues.push(`Inconsistent analysis for ${family} component family`);
      }
      if (!this.validateTokenRecommendations(result.tokens)) {
        issues.push("Inconsistent token recommendations");
      }
      if (issues.length > 0) {
        console.warn("\u26A0\uFE0F Analysis consistency issues found:", issues);
        return false;
      }
      return true;
    }
    /**
     * Apply consistency corrections to analysis result
     */
    applyConsistencyCorrections(result, context) {
      var _a;
      const corrected = __spreadValues({}, result);
      if ((_a = context.additionalContext) == null ? void 0 : _a.componentFamily) {
        corrected.metadata = this.applyComponentFamilyCorrections(
          corrected.metadata,
          context.additionalContext.componentFamily
        );
      }
      corrected.tokens = this.applyTokenConsistencyCorrections(corrected.tokens);
      corrected.metadata.mcpReadiness = this.ensureConsistentScoring(
        corrected.metadata.mcpReadiness || {},
        context
      );
      return corrected;
    }
    // Private helper methods
    normalizeHierarchy(hierarchy) {
      return hierarchy.map((item) => ({
        name: item.name.toLowerCase().trim(),
        type: item.type,
        depth: item.depth
      }));
    }
    generateTokenFingerprint(tokens) {
      const fingerprint = tokens.map((token) => `${token.type}:${token.isToken}:${token.source}`).sort().join("|");
      return this.createHash(fingerprint);
    }
    createHash(input) {
      let hash = 0;
      if (input.length === 0) return hash.toString();
      for (let i = 0; i < input.length; i++) {
        const char = input.charCodeAt(i);
        hash = (hash << 5) - hash + char;
        hash = hash & hash;
      }
      return Math.abs(hash).toString(36);
    }
    createBasePrompt(context) {
      var _a, _b, _c, _d;
      return `You are an expert design system architect analyzing a Figma component for comprehensive metadata and design token recommendations.

**Component Analysis Context:**
- Component Name: ${context.name}
- Component Type: ${context.type}
- Layer Structure: ${JSON.stringify(context.hierarchy, null, 2)}
- Frame Structure: ${JSON.stringify(context.frameStructure)}
- Detected Styles: ${JSON.stringify(context.detectedStyles)}
- Component Family: ${((_a = context.additionalContext) == null ? void 0 : _a.componentFamily) || "generic"}
- Interactive Elements: ${((_b = context.additionalContext) == null ? void 0 : _b.hasInteractiveElements) || false}
- Design Patterns: ${((_d = (_c = context.additionalContext) == null ? void 0 : _c.designPatterns) == null ? void 0 : _d.join(", ")) || "none"}`;
    }
    getMCPGuidance(context) {
      var _a;
      if (!this.designSystemsKnowledge) {
        return this.getFallbackGuidance(context);
      }
      const family = ((_a = context.additionalContext) == null ? void 0 : _a.componentFamily) || "generic";
      const guidance = this.designSystemsKnowledge.components[family] || this.designSystemsKnowledge.components.generic;
      return guidance || this.getFallbackGuidance(context);
    }
    getScoringCriteria(context) {
      var _a;
      if (!((_a = this.designSystemsKnowledge) == null ? void 0 : _a.scoring)) {
        return this.getFallbackScoringCriteria();
      }
      return this.designSystemsKnowledge.scoring;
    }
    processComponentKnowledge(knowledge) {
      if (!knowledge || !knowledge.results || !Array.isArray(knowledge.results)) {
        console.log("\u{1F4DD} No component knowledge available, using defaults");
        return this.getDefaultComponentKnowledge();
      }
      const processed = {};
      knowledge.results.forEach((result) => {
        if (result.title && result.content) {
          const componentType = this.extractComponentType(result.title);
          processed[componentType] = result.content;
        }
      });
      const defaults = this.getDefaultComponentKnowledge();
      return __spreadValues(__spreadValues({}, defaults), processed);
    }
    extractComponentType(title) {
      const titleLower = title.toLowerCase();
      if (titleLower.includes("button")) return "button";
      if (titleLower.includes("avatar")) return "avatar";
      if (titleLower.includes("input") || titleLower.includes("field")) return "input";
      if (titleLower.includes("card")) return "card";
      if (titleLower.includes("badge") || titleLower.includes("tag")) return "badge";
      return "generic";
    }
    processKnowledgeContent(knowledge) {
      if (!knowledge || !knowledge.results || !Array.isArray(knowledge.results)) {
        return "";
      }
      return knowledge.results.map((result) => result.content).filter((content) => content).join("\n\n");
    }
    getDefaultComponentKnowledge() {
      return {
        button: "Button components require comprehensive state management (default, hover, focus, active, disabled). Score based on state completeness (45%), semantic token usage (35%), and accessibility (20%).",
        avatar: "Avatar components should support multiple sizes and states. Interactive avatars need hover/focus states. Score based on size variants (25%), state coverage (25%), image handling (25%), and fallback mechanisms (25%).",
        card: "Card components need consistent spacing, proper content hierarchy, and optional interactive states. Score based on content structure (30%), spacing consistency (25%), optional interactivity (25%), and token usage (20%).",
        badge: "Badge components are typically status indicators with semantic color usage. Score based on semantic color mapping (40%), size variants (30%), content clarity (20%), and accessibility (10%).",
        input: "Form input components require comprehensive state management and accessibility. Score based on state completeness (35%), accessibility compliance (30%), validation feedback (20%), and token usage (15%).",
        icon: "Icon components should be scalable and consistent. Score based on sizing flexibility (35%), accessibility (35%), and style consistency (30%).",
        generic: "Generic components should follow basic design system principles. Score based on structure clarity (35%), token usage (35%), and accessibility basics (30%)."
      };
    }
    getFallbackKnowledgeForQuery(query) {
      return {
        results: [
          {
            title: `Fallback guidance for ${query}`,
            content: this.getFallbackContentForQuery(query),
            category: "fallback"
          }
        ]
      };
    }
    getFallbackContentForQuery(query) {
      if (query.includes("component analysis")) {
        return "Components should follow consistent naming, use design tokens, implement proper states, and maintain accessibility standards.";
      }
      if (query.includes("token")) {
        return "Design tokens should use semantic naming patterns like semantic-color-primary, spacing-md-16px, and text-size-lg-18px.";
      }
      if (query.includes("accessibility")) {
        return "Ensure WCAG 2.1 AA compliance with proper ARIA labels, keyboard support, and color contrast.";
      }
      if (query.includes("scoring")) {
        return "Score components based on structure (25%), token usage (25%), accessibility (25%), and consistency (25%).";
      }
      return "Follow established design system best practices for consistency and scalability.";
    }
    getFallbackGuidance(context) {
      var _a;
      const family = ((_a = context.additionalContext) == null ? void 0 : _a.componentFamily) || "generic";
      const guidanceMap = {
        button: "Buttons require all interactive states (default, hover, focus, active, disabled). Score based on state completeness (45%), semantic token usage (35%), and accessibility (20%).",
        avatar: "Avatars should support multiple sizes and states. Interactive avatars need hover/focus states. Score based on size variants (25%), state coverage (25%), image handling (25%), and fallback mechanisms (25%).",
        card: "Cards need consistent spacing, proper content hierarchy, and optional interactive states. Score based on content structure (30%), spacing consistency (25%), optional interactivity (25%), and token usage (20%).",
        badge: "Badges are typically status indicators with semantic color usage. Score based on semantic color mapping (40%), size variants (30%), content clarity (20%), and accessibility (10%).",
        input: "Form inputs require comprehensive state management and accessibility. Score based on state completeness (35%), accessibility compliance (30%), validation feedback (20%), and token usage (15%).",
        generic: "Generic components should follow basic design system principles. Score based on structure clarity (35%), token usage (35%), and accessibility basics (30%)."
      };
      return guidanceMap[family] || guidanceMap.generic;
    }
    getFallbackScoringCriteria() {
      return `
    **MCP Readiness Scoring (0-100):**
    - **Structure (25%)**: Clear hierarchy, logical organization, proper nesting
    - **Tokens (25%)**: Design token usage vs hard-coded values
    - **Accessibility (25%)**: WCAG compliance, keyboard support, ARIA labels
    - **Consistency (25%)**: Naming conventions, pattern adherence, scalability

    **Score Calculation:**
    - 90-100: Production ready, comprehensive implementation
    - 80-89: Good implementation, minor improvements needed
    - 70-79: Solid foundation, some important gaps
    - 60-69: Basic implementation, significant improvements needed
    - Below 60: Major issues, substantial rework required
    `;
    }
    loadFallbackKnowledge() {
      this.designSystemsKnowledge = {
        version: "1.0.0-fallback",
        components: {
          button: "Button components require comprehensive state management",
          avatar: "Avatar components should support size variants and interactive states",
          card: "Card components need consistent spacing and content hierarchy",
          badge: "Badge components should use semantic colors for status indication",
          input: "Input components require comprehensive accessibility and validation",
          generic: "Generic components should follow basic design system principles"
        },
        tokens: "Use semantic token naming: semantic-color-primary, spacing-md-16px, text-size-lg-18px",
        accessibility: "Ensure WCAG 2.1 AA compliance with proper ARIA labels and keyboard support",
        scoring: this.getFallbackScoringCriteria(),
        lastUpdated: Date.now()
      };
    }
    isValidScore(score) {
      return typeof score === "number" && score >= 0 && score <= 100;
    }
    validateComponentFamilyConsistency(result, family) {
      const metadata = result.metadata;
      switch (family) {
        case "button":
          return this.validateButtonComponent(metadata);
        case "avatar":
          return this.validateAvatarComponent(metadata);
        case "input":
          return this.validateInputComponent(metadata);
        default:
          return true;
      }
    }
    validateButtonComponent(metadata) {
      var _a;
      const hasInteractiveStates = (_a = metadata.states) == null ? void 0 : _a.some(
        (state) => ["hover", "focus", "active", "disabled"].includes(state.toLowerCase())
      );
      return hasInteractiveStates || false;
    }
    validateAvatarComponent(metadata) {
      var _a, _b, _c;
      const hasSizeVariants = ((_b = (_a = metadata.variants) == null ? void 0 : _a.size) == null ? void 0 : _b.length) > 0;
      const hasSizeProps = (_c = metadata.props) == null ? void 0 : _c.some(
        (prop) => prop.name.toLowerCase().includes("size")
      );
      return hasSizeVariants || hasSizeProps || false;
    }
    validateInputComponent(metadata) {
      var _a;
      const hasFormStates = (_a = metadata.states) == null ? void 0 : _a.some(
        (state) => ["focus", "error", "disabled", "filled"].includes(state.toLowerCase())
      );
      return hasFormStates || false;
    }
    validateTokenRecommendations(tokens) {
      var _a;
      const hasSemanticColors = (_a = tokens.colors) == null ? void 0 : _a.some(
        (token) => token.name.includes("semantic-") || token.name.includes("primary") || token.name.includes("secondary")
      );
      return hasSemanticColors !== false;
    }
    applyComponentFamilyCorrections(metadata, family) {
      var _a, _b, _c;
      const corrected = __spreadValues({}, metadata);
      switch (family) {
        case "button":
          if (!((_a = corrected.states) == null ? void 0 : _a.includes("hover"))) {
            corrected.states = [...corrected.states || [], "hover", "focus", "active", "disabled"];
          }
          break;
        case "avatar":
          if (!((_b = corrected.variants) == null ? void 0 : _b.size) && !((_c = corrected.props) == null ? void 0 : _c.some((p) => p.name.includes("size")))) {
            corrected.variants = __spreadProps(__spreadValues({}, corrected.variants), { size: ["small", "medium", "large"] });
          }
          break;
      }
      return corrected;
    }
    applyTokenConsistencyCorrections(tokens) {
      if (!tokens) return tokens;
      const corrected = __spreadValues({}, tokens);
      return corrected;
    }
    ensureConsistentScoring(mcpReadiness, context) {
      return __spreadProps(__spreadValues({}, mcpReadiness), {
        score: mcpReadiness.score || 0
      });
    }
  };
  var consistency_engine_default = ComponentConsistencyEngine;

  // src/api/providers/types.ts
  var LLMError = class extends Error {
    constructor(message, code, statusCode, retryAfter) {
      super(message);
      this.code = code;
      this.statusCode = statusCode;
      this.retryAfter = retryAfter;
      this.name = "LLMError";
    }
  };
  var DEFAULT_MODELS = {
    anthropic: "claude-sonnet-4-5-20250929",
    openai: "gpt-5.2",
    google: "gemini-2.5-pro"
  };

  // src/api/providers/anthropic.ts
  var ANTHROPIC_MODELS = [
    {
      id: "claude-opus-4-5-20251218",
      name: "Claude Opus 4.5",
      description: "Flagship model - Most capable, best for complex analysis and reasoning",
      contextWindow: 2e5,
      isDefault: false
    },
    {
      id: "claude-sonnet-4-5-20250929",
      name: "Claude Sonnet 4.5",
      description: "Standard model - Balanced performance and cost, recommended for most tasks",
      contextWindow: 2e5,
      isDefault: true
    },
    {
      id: "claude-haiku-4-5-20251001",
      name: "Claude Haiku 4.5",
      description: "Economy model - Fastest responses, ideal for quick analysis",
      contextWindow: 2e5,
      isDefault: false
    }
  ];
  var AnthropicProvider = class {
    constructor() {
      this.name = "Anthropic";
      this.id = "anthropic";
      this.endpoint = "https://api.anthropic.com/v1/messages";
      this.keyPrefix = "sk-ant-";
      this.keyPlaceholder = "sk-ant-...";
      this.models = ANTHROPIC_MODELS;
    }
    /**
     * Format a request for the Anthropic API
     */
    formatRequest(config) {
      const request = {
        model: config.model,
        messages: [
          {
            role: "user",
            content: config.prompt.trim()
          }
        ],
        max_tokens: config.maxTokens
      };
      if (config.temperature !== void 0) {
        request.temperature = config.temperature;
      }
      if (config.additionalParams) {
        Object.assign(request, config.additionalParams);
      }
      return request;
    }
    /**
     * Parse Anthropic API response into standardized format
     */
    parseResponse(response) {
      const anthropicResponse = response;
      if (!anthropicResponse.content || !Array.isArray(anthropicResponse.content)) {
        throw new LLMError(
          "Invalid response format from Anthropic API: missing content array",
          "INVALID_REQUEST" /* INVALID_REQUEST */
        );
      }
      const textContent = anthropicResponse.content.filter((block) => block.type === "text").map((block) => block.text).join("\n");
      if (!textContent) {
        throw new LLMError(
          "Invalid response format from Anthropic API: no text content found",
          "INVALID_REQUEST" /* INVALID_REQUEST */
        );
      }
      return {
        content: textContent.trim(),
        model: anthropicResponse.model,
        usage: anthropicResponse.usage ? {
          promptTokens: anthropicResponse.usage.input_tokens,
          completionTokens: anthropicResponse.usage.output_tokens,
          totalTokens: anthropicResponse.usage.input_tokens + anthropicResponse.usage.output_tokens
        } : void 0,
        metadata: {
          id: anthropicResponse.id,
          stopReason: anthropicResponse.stop_reason
        }
      };
    }
    /**
     * Validate API key format for Anthropic
     */
    validateApiKey(apiKey) {
      if (!apiKey || typeof apiKey !== "string") {
        return {
          isValid: false,
          error: "API Key Required: Please provide a valid Claude API key."
        };
      }
      const trimmedKey = apiKey.trim();
      if (trimmedKey.length === 0) {
        return {
          isValid: false,
          error: "API Key Required: The Claude API key cannot be empty."
        };
      }
      if (!trimmedKey.startsWith(this.keyPrefix)) {
        return {
          isValid: false,
          error: `Invalid API Key Format: Claude API keys should start with "${this.keyPrefix}". Please check your API key.`
        };
      }
      if (trimmedKey.length < 40) {
        return {
          isValid: false,
          error: "Invalid API Key Format: The API key appears to be too short. Please verify you copied the complete key."
        };
      }
      return { isValid: true };
    }
    /**
     * Get HTTP headers for Anthropic API requests
     */
    getHeaders(apiKey) {
      return {
        "content-type": "application/json",
        "x-api-key": apiKey.trim(),
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true"
      };
    }
    /**
     * Get the default model for Anthropic
     */
    getDefaultModel() {
      const defaultModel = this.models.find((model) => model.isDefault);
      return defaultModel || this.models[1];
    }
    /**
     * Handle Anthropic-specific error responses
     */
    handleError(statusCode, response) {
      var _a;
      const errorResponse = response;
      const errorMessage = ((_a = errorResponse == null ? void 0 : errorResponse.error) == null ? void 0 : _a.message) || (typeof response === "string" ? response : "Unknown error");
      switch (statusCode) {
        case 400:
          return new LLMError(
            `Claude API Error (400): ${errorMessage}. Please check your request format.`,
            "INVALID_REQUEST" /* INVALID_REQUEST */,
            400
          );
        case 401:
          return new LLMError(
            "Claude API Error (401): Invalid API key. Please check your Claude API key in settings.",
            "INVALID_API_KEY" /* INVALID_API_KEY */,
            401
          );
        case 403:
          return new LLMError(
            "Claude API Error (403): Access forbidden. Please check your API key permissions.",
            "INVALID_API_KEY" /* INVALID_API_KEY */,
            403
          );
        case 404:
          return new LLMError(
            `Claude API Error (404): ${errorMessage}. The requested model may not be available.`,
            "MODEL_NOT_FOUND" /* MODEL_NOT_FOUND */,
            404
          );
        case 429:
          return new LLMError(
            "Claude API Error (429): Rate limit exceeded. Please try again later.",
            "RATE_LIMIT_EXCEEDED" /* RATE_LIMIT_EXCEEDED */,
            429
          );
        case 500:
          return new LLMError(
            "Claude API Error (500): Server error. The Claude API is experiencing issues. Please try again later.",
            "SERVER_ERROR" /* SERVER_ERROR */,
            500
          );
        case 503:
          return new LLMError(
            "Claude API Error (503): Service unavailable. The Claude API is temporarily down. Please try again later.",
            "SERVICE_UNAVAILABLE" /* SERVICE_UNAVAILABLE */,
            503
          );
        default:
          return new LLMError(
            `Claude API Error (${statusCode}): ${errorMessage}`,
            "UNKNOWN_ERROR" /* UNKNOWN_ERROR */,
            statusCode
          );
      }
    }
  };
  var anthropicProvider = new AnthropicProvider();

  // src/api/providers/openai.ts
  var OPENAI_MODELS = [
    {
      id: "gpt-5.2",
      name: "GPT-5.2",
      description: "Flagship model with advanced reasoning capabilities",
      contextWindow: 128e3,
      isDefault: true
    },
    {
      id: "gpt-5.2-pro",
      name: "GPT-5.2 Pro",
      description: "Premium model with extended reasoning for complex tasks",
      contextWindow: 128e3,
      isDefault: false
    },
    {
      id: "gpt-5-mini",
      name: "GPT-5 Mini",
      description: "Economy model - fast and cost-effective",
      contextWindow: 128e3,
      isDefault: false
    }
  ];
  var OpenAIProviderClass = class {
    constructor() {
      this.name = "OpenAI";
      this.id = "openai";
      this.endpoint = "https://api.openai.com/v1/chat/completions";
      this.keyPrefix = "sk-";
      this.keyPlaceholder = "sk-...";
      this.models = OPENAI_MODELS;
    }
    /**
     * Format a request for OpenAI's chat completions API
     */
    formatRequest(config) {
      const request = {
        model: config.model,
        messages: [
          {
            role: "user",
            content: config.prompt
          }
        ],
        max_completion_tokens: config.maxTokens,
        temperature: config.temperature
      };
      if (config.additionalParams) {
        Object.assign(request, config.additionalParams);
      }
      return request;
    }
    /**
     * Parse OpenAI's response into standardized format
     */
    parseResponse(response) {
      const openaiResponse = response;
      if (!openaiResponse.choices || openaiResponse.choices.length === 0) {
        throw new LLMError(
          "Invalid response format: no choices returned",
          "INVALID_REQUEST" /* INVALID_REQUEST */
        );
      }
      const choice = openaiResponse.choices[0];
      if (!choice.message || typeof choice.message.content !== "string") {
        throw new LLMError(
          "Invalid response format: missing message content",
          "INVALID_REQUEST" /* INVALID_REQUEST */
        );
      }
      const result = {
        content: choice.message.content.trim(),
        model: openaiResponse.model
      };
      if (openaiResponse.usage) {
        result.usage = {
          promptTokens: openaiResponse.usage.prompt_tokens,
          completionTokens: openaiResponse.usage.completion_tokens,
          totalTokens: openaiResponse.usage.total_tokens
        };
      }
      result.metadata = {
        id: openaiResponse.id,
        finishReason: choice.finish_reason,
        created: openaiResponse.created
      };
      return result;
    }
    /**
     * Validate OpenAI API key format
     */
    validateApiKey(apiKey) {
      if (!apiKey || typeof apiKey !== "string") {
        return {
          isValid: false,
          error: "API Key Required: Please provide a valid OpenAI API key."
        };
      }
      const trimmedKey = apiKey.trim();
      if (trimmedKey.length === 0) {
        return {
          isValid: false,
          error: "API Key Required: The OpenAI API key cannot be empty."
        };
      }
      if (!trimmedKey.startsWith(this.keyPrefix)) {
        return {
          isValid: false,
          error: `Invalid API Key Format: OpenAI API keys should start with "${this.keyPrefix}". Please check your API key.`
        };
      }
      if (trimmedKey.length < 20) {
        return {
          isValid: false,
          error: "Invalid API Key Format: The API key appears to be too short. Please verify you copied the complete key."
        };
      }
      return { isValid: true };
    }
    /**
     * Get headers required for OpenAI API requests
     */
    getHeaders(apiKey) {
      return {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey.trim()}`
      };
    }
    /**
     * Get the default model for OpenAI
     */
    getDefaultModel() {
      const defaultModel = this.models.find((model) => model.isDefault);
      return defaultModel || this.models[0];
    }
    /**
     * Handle OpenAI-specific error responses
     */
    handleError(statusCode, response) {
      var _a;
      const errorResponse = response;
      const errorMessage = ((_a = errorResponse == null ? void 0 : errorResponse.error) == null ? void 0 : _a.message) || (errorResponse == null ? void 0 : errorResponse.message) || "Unknown error occurred";
      switch (statusCode) {
        case 400:
          if (errorMessage.toLowerCase().includes("context_length_exceeded") || errorMessage.toLowerCase().includes("maximum context length")) {
            return new LLMError(
              `OpenAI API Error (400): Context length exceeded. ${errorMessage}`,
              "CONTEXT_LENGTH_EXCEEDED" /* CONTEXT_LENGTH_EXCEEDED */,
              statusCode
            );
          }
          return new LLMError(
            `OpenAI API Error (400): ${errorMessage}. Please check your request format.`,
            "INVALID_REQUEST" /* INVALID_REQUEST */,
            statusCode
          );
        case 401:
          return new LLMError(
            "OpenAI API Error (401): Invalid API key. Please check your OpenAI API key in settings.",
            "INVALID_API_KEY" /* INVALID_API_KEY */,
            statusCode
          );
        case 403:
          return new LLMError(
            "OpenAI API Error (403): Access forbidden. Please check your API key permissions or account status.",
            "INVALID_API_KEY" /* INVALID_API_KEY */,
            statusCode
          );
        case 404:
          return new LLMError(
            `OpenAI API Error (404): Model not found. ${errorMessage}`,
            "MODEL_NOT_FOUND" /* MODEL_NOT_FOUND */,
            statusCode
          );
        case 429:
          const retryMatch = errorMessage.match(/try again in (\d+)/i);
          const retryAfter = retryMatch ? parseInt(retryMatch[1], 10) : void 0;
          return new LLMError(
            `OpenAI API Error (429): Rate limit exceeded. ${retryAfter ? `Please try again in ${retryAfter} seconds.` : "Please try again later."}`,
            "RATE_LIMIT_EXCEEDED" /* RATE_LIMIT_EXCEEDED */,
            statusCode,
            retryAfter
          );
        case 500:
          return new LLMError(
            "OpenAI API Error (500): Server error. The OpenAI API is experiencing issues. Please try again later.",
            "SERVER_ERROR" /* SERVER_ERROR */,
            statusCode
          );
        case 502:
          return new LLMError(
            "OpenAI API Error (502): Bad gateway. The OpenAI API is temporarily unavailable. Please try again later.",
            "SERVICE_UNAVAILABLE" /* SERVICE_UNAVAILABLE */,
            statusCode
          );
        case 503:
          return new LLMError(
            "OpenAI API Error (503): Service unavailable. The OpenAI API is temporarily down. Please try again later.",
            "SERVICE_UNAVAILABLE" /* SERVICE_UNAVAILABLE */,
            statusCode
          );
        case 504:
          return new LLMError(
            "OpenAI API Error (504): Gateway timeout. The request took too long. Please try again.",
            "SERVICE_UNAVAILABLE" /* SERVICE_UNAVAILABLE */,
            statusCode
          );
        default:
          return new LLMError(
            `OpenAI API Error (${statusCode}): ${errorMessage}`,
            "UNKNOWN_ERROR" /* UNKNOWN_ERROR */,
            statusCode
          );
      }
    }
  };
  var OpenAIProvider = new OpenAIProviderClass();

  // src/api/providers/google.ts
  var GOOGLE_MODELS = [
    {
      id: "gemini-3-pro-preview",
      name: "Gemini 3 Pro",
      description: "Flagship model with advanced reasoning and multimodal capabilities",
      contextWindow: 1e6,
      isDefault: true
    },
    {
      id: "gemini-2.5-pro",
      name: "Gemini 2.5 Pro",
      description: "Standard reasoning model with excellent performance",
      contextWindow: 1e6,
      isDefault: false
    },
    {
      id: "gemini-2.5-flash",
      name: "Gemini 2.5 Flash",
      description: "Economy model optimized for speed and efficiency",
      contextWindow: 1e6,
      isDefault: false
    }
  ];
  var GoogleProvider = class {
    constructor() {
      this.name = "Google";
      this.id = "google";
      this.endpoint = "https://generativelanguage.googleapis.com/v1beta/models";
      this.keyPrefix = "AIza";
      this.keyPlaceholder = "AIza...";
      this.models = GOOGLE_MODELS;
    }
    /**
     * Format a request for the Gemini API
     *
     * Gemini uses a different request structure than OpenAI/Anthropic:
     * - contents: Array of content objects with parts
     * - generationConfig: Configuration for the generation
     *
     * @param config - Request configuration
     * @returns Formatted request body for Gemini API
     */
    formatRequest(config) {
      const request = {
        contents: [
          {
            parts: [
              {
                text: config.prompt
              }
            ]
          }
        ],
        generationConfig: {
          maxOutputTokens: config.maxTokens,
          temperature: config.temperature
        }
      };
      if (config.additionalParams) {
        const { topP, topK, stopSequences } = config.additionalParams;
        if (topP !== void 0) {
          request.generationConfig.topP = topP;
        }
        if (topK !== void 0) {
          request.generationConfig.topK = topK;
        }
        if (stopSequences !== void 0) {
          request.generationConfig.stopSequences = stopSequences;
        }
      }
      return request;
    }
    /**
     * Parse Gemini API response into standardized format
     *
     * Gemini response structure:
     * {
     *   candidates: [{
     *     content: {
     *       parts: [{ text: "..." }]
     *     }
     *   }],
     *   usageMetadata: { ... }
     * }
     *
     * @param response - Raw API response
     * @returns Standardized LLM response
     * @throws Error if response format is invalid
     */
    parseResponse(response) {
      var _a;
      const geminiResponse = response;
      if (geminiResponse.error) {
        throw new LLMError(
          geminiResponse.error.message || "Unknown Gemini API error",
          this.mapErrorCodeToLLMErrorCode(geminiResponse.error.code, geminiResponse.error.status),
          geminiResponse.error.code
        );
      }
      if (!geminiResponse.candidates || geminiResponse.candidates.length === 0) {
        const keys = Object.keys(geminiResponse);
        throw new LLMError(
          `No candidates in Gemini response. Response keys: [${keys.join(", ")}]${geminiResponse.error ? `. Error: ${geminiResponse.error.message}` : ""}`,
          "INVALID_REQUEST" /* INVALID_REQUEST */
        );
      }
      const candidate = geminiResponse.candidates[0];
      if (candidate.finishReason === "SAFETY") {
        throw new LLMError(
          "Gemini response blocked by safety filters. Try rephrasing the prompt.",
          "INVALID_REQUEST" /* INVALID_REQUEST */
        );
      }
      const parts = (_a = candidate.content) == null ? void 0 : _a.parts;
      if (!parts || parts.length === 0) {
        throw new LLMError(
          `No content parts in Gemini response. Finish reason: ${candidate.finishReason || "unknown"}. Has content: ${!!candidate.content}`,
          "INVALID_REQUEST" /* INVALID_REQUEST */
        );
      }
      const textPart = parts.find((p) => typeof p.text === "string");
      if (!textPart || !textPart.text) {
        const partTypes = parts.map((p) => Object.keys(p).join(",")).join("; ");
        throw new LLMError(
          `No text content in Gemini response parts. Part types: [${partTypes}]. Finish reason: ${candidate.finishReason || "unknown"}`,
          "INVALID_REQUEST" /* INVALID_REQUEST */
        );
      }
      const text = textPart.text;
      const llmResponse = {
        content: text,
        model: "gemini"
        // Model info not always returned in response
      };
      if (geminiResponse.usageMetadata) {
        llmResponse.usage = {
          promptTokens: geminiResponse.usageMetadata.promptTokenCount || 0,
          completionTokens: geminiResponse.usageMetadata.candidatesTokenCount || 0,
          totalTokens: geminiResponse.usageMetadata.totalTokenCount || 0
        };
      }
      return llmResponse;
    }
    /**
     * Validate Google API key format
     *
     * Google API keys:
     * - Start with 'AIza'
     * - Are typically 39 characters long
     * - Contain alphanumeric characters and underscores
     *
     * @param apiKey - The API key to validate
     * @returns Validation result
     */
    validateApiKey(apiKey) {
      if (!apiKey || typeof apiKey !== "string") {
        return {
          isValid: false,
          error: "API key is required"
        };
      }
      const trimmedKey = apiKey.trim();
      if (trimmedKey.length === 0) {
        return {
          isValid: false,
          error: "API key cannot be empty"
        };
      }
      if (!trimmedKey.startsWith(this.keyPrefix)) {
        return {
          isValid: false,
          error: `Google API keys should start with "${this.keyPrefix}". Please check your API key.`
        };
      }
      if (trimmedKey.length < 30 || trimmedKey.length > 50) {
        return {
          isValid: false,
          error: "API key appears to have an invalid length. Please verify you copied the complete key."
        };
      }
      if (!/^[A-Za-z0-9_-]+$/.test(trimmedKey)) {
        return {
          isValid: false,
          error: "API key contains invalid characters"
        };
      }
      return { isValid: true };
    }
    /**
     * Get headers for API requests
     *
     * Note: Google uses URL-based authentication, so the API key is not
     * included in headers. It is appended to the URL instead.
     *
     * @param _apiKey - The API key (not used in headers for Google)
     * @returns Request headers
     */
    getHeaders(_apiKey) {
      return {
        "Content-Type": "application/json"
      };
    }
    /**
     * Get the full endpoint URL for a specific model and API key
     *
     * Google's API uses URL-based authentication:
     * https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={API_KEY}
     *
     * @param model - The model ID to use
     * @param apiKey - The API key for authentication
     * @returns Full endpoint URL with API key
     */
    getEndpoint(model, apiKey) {
      const trimmedKey = apiKey.trim();
      return `${this.endpoint}/${model}:generateContent?key=${trimmedKey}`;
    }
    /**
     * Get the default model for this provider
     *
     * @returns The default Gemini model
     */
    getDefaultModel() {
      const defaultModel = this.models.find((m) => m.isDefault);
      return defaultModel || this.models[0];
    }
    /**
     * Handle provider-specific error responses
     *
     * @param statusCode - HTTP status code
     * @param response - Error response body
     * @returns Formatted LLMError
     */
    handleError(statusCode, response) {
      var _a, _b;
      const errorResponse = response;
      const errorInfo = errorResponse == null ? void 0 : errorResponse.error;
      const message = (errorInfo == null ? void 0 : errorInfo.message) || "Unknown Google API error";
      const status = errorInfo == null ? void 0 : errorInfo.status;
      const code = (errorInfo == null ? void 0 : errorInfo.code) || statusCode;
      const llmErrorCode = this.mapErrorCodeToLLMErrorCode(code, status);
      let retryAfter;
      if (statusCode === 429) {
        retryAfter = 6e4;
        const retryDetail = (_a = errorInfo == null ? void 0 : errorInfo.details) == null ? void 0 : _a.find(
          (d) => {
            var _a2;
            return (_a2 = d["@type"]) == null ? void 0 : _a2.includes("RetryInfo");
          }
        );
        if ((_b = retryDetail == null ? void 0 : retryDetail.metadata) == null ? void 0 : _b.retryDelay) {
          const delayMatch = retryDetail.metadata.retryDelay.match(/(\d+)s/);
          if (delayMatch) {
            retryAfter = parseInt(delayMatch[1], 10) * 1e3;
          }
        }
      }
      let userMessage = message;
      switch (llmErrorCode) {
        case "INVALID_API_KEY" /* INVALID_API_KEY */:
          userMessage = "Google API Error: Invalid API key. Please check your API key in settings.";
          break;
        case "RATE_LIMIT_EXCEEDED" /* RATE_LIMIT_EXCEEDED */:
          userMessage = `Google API Error: Rate limit exceeded. ${retryAfter ? `Please try again in ${Math.ceil(retryAfter / 1e3)} seconds.` : "Please try again later."}`;
          break;
        case "MODEL_NOT_FOUND" /* MODEL_NOT_FOUND */:
          userMessage = "Google API Error: Model not found. Please select a valid model.";
          break;
        case "CONTEXT_LENGTH_EXCEEDED" /* CONTEXT_LENGTH_EXCEEDED */:
          userMessage = "Google API Error: Input too long. Please reduce the size of your request.";
          break;
        case "SERVER_ERROR" /* SERVER_ERROR */:
          userMessage = "Google API Error: Server error. Please try again later.";
          break;
        case "SERVICE_UNAVAILABLE" /* SERVICE_UNAVAILABLE */:
          userMessage = "Google API Error: Service temporarily unavailable. Please try again later.";
          break;
      }
      return new LLMError(userMessage, llmErrorCode, statusCode, retryAfter);
    }
    /**
     * Map Google error codes/status to LLMErrorCode
     *
     * @param code - HTTP status code or Google error code
     * @param status - Google error status string
     * @returns Appropriate LLMErrorCode
     */
    mapErrorCodeToLLMErrorCode(code, status) {
      if (status) {
        const statusUpper = status.toUpperCase();
        if (statusUpper === "INVALID_ARGUMENT") {
          return "INVALID_REQUEST" /* INVALID_REQUEST */;
        }
        if (statusUpper === "PERMISSION_DENIED" || statusUpper === "UNAUTHENTICATED") {
          return "INVALID_API_KEY" /* INVALID_API_KEY */;
        }
        if (statusUpper === "NOT_FOUND") {
          return "MODEL_NOT_FOUND" /* MODEL_NOT_FOUND */;
        }
        if (statusUpper === "RESOURCE_EXHAUSTED") {
          return "RATE_LIMIT_EXCEEDED" /* RATE_LIMIT_EXCEEDED */;
        }
        if (statusUpper === "UNAVAILABLE") {
          return "SERVICE_UNAVAILABLE" /* SERVICE_UNAVAILABLE */;
        }
      }
      switch (code) {
        case 400:
          return "INVALID_REQUEST" /* INVALID_REQUEST */;
        case 401:
        case 403:
          return "INVALID_API_KEY" /* INVALID_API_KEY */;
        case 404:
          return "MODEL_NOT_FOUND" /* MODEL_NOT_FOUND */;
        case 429:
          return "RATE_LIMIT_EXCEEDED" /* RATE_LIMIT_EXCEEDED */;
        case 500:
          return "SERVER_ERROR" /* SERVER_ERROR */;
        case 503:
          return "SERVICE_UNAVAILABLE" /* SERVICE_UNAVAILABLE */;
        default:
          return "UNKNOWN_ERROR" /* UNKNOWN_ERROR */;
      }
    }
  };
  var googleProvider = new GoogleProvider();

  // src/api/providers/index.ts
  var providers = {
    anthropic: anthropicProvider,
    openai: OpenAIProvider,
    google: googleProvider
  };
  function getProvider(providerId) {
    const provider = providers[providerId];
    if (!provider) {
      throw new LLMError(
        `Unknown provider: ${providerId}`,
        "INVALID_REQUEST" /* INVALID_REQUEST */,
        400
      );
    }
    return provider;
  }
  async function callProvider(providerId, apiKey, config) {
    var _a, _b;
    const provider = getProvider(providerId);
    const validation = provider.validateApiKey(apiKey);
    if (!validation.isValid) {
      throw new LLMError(
        validation.error || "Invalid API key format",
        "INVALID_API_KEY" /* INVALID_API_KEY */,
        401
      );
    }
    const requestBody = provider.formatRequest(config);
    const headers = provider.getHeaders(apiKey);
    let endpoint = provider.endpoint;
    if (providerId === "google") {
      endpoint = `${provider.endpoint}/${config.model}:generateContent?key=${apiKey.trim()}`;
    }
    try {
      console.log(`Making ${provider.name} API call to ${endpoint}...`);
      const response = await fetch(endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify(requestBody)
      });
      if (!response.ok) {
        let errorData;
        try {
          errorData = await response.json();
        } catch (e) {
          errorData = await response.text();
        }
        throw provider.handleError(response.status, errorData);
      }
      const data = await response.json();
      console.log(`${provider.name} API response status: ${response.status}`);
      console.log(`${provider.name} API response keys:`, Object.keys(data));
      if (providerId === "google") {
        console.log(`Gemini response candidates:`, data.candidates ? data.candidates.length : "none");
        if ((_a = data.candidates) == null ? void 0 : _a[0]) {
          console.log(`Gemini candidate[0] keys:`, Object.keys(data.candidates[0]));
          if (data.candidates[0].content) {
            console.log(`Gemini content parts:`, ((_b = data.candidates[0].content.parts) == null ? void 0 : _b.length) || "none");
          }
        }
        if (data.error) {
          console.log(`Gemini error:`, JSON.stringify(data.error));
        }
      }
      return provider.parseResponse(data);
    } catch (error) {
      if (error instanceof LLMError) {
        throw error;
      }
      if (error instanceof Error) {
        if (error.message.includes("Failed to fetch") || error.message.includes("NetworkError")) {
          throw new LLMError(
            `Network error connecting to ${provider.name}. Please check your internet connection.`,
            "NETWORK_ERROR" /* NETWORK_ERROR */
          );
        }
      }
      throw new LLMError(
        `Unexpected error calling ${provider.name}: ${error instanceof Error ? error.message : "Unknown error"}`,
        "UNKNOWN_ERROR" /* UNKNOWN_ERROR */
      );
    }
  }
  var STORAGE_KEYS = {
    /** Selected provider ID */
    SELECTED_PROVIDER: "selected-provider",
    /** Selected model ID */
    SELECTED_MODEL: "selected-model",
    /** API key storage (per provider) */
    apiKey: (providerId) => `${providerId}-api-key`,
    /** Legacy Claude key (for migration) */
    LEGACY_CLAUDE_KEY: "claude-api-key",
    LEGACY_CLAUDE_MODEL: "claude-model"
  };
  var DEFAULTS = {
    provider: "anthropic",
    model: DEFAULT_MODELS.anthropic
  };
  async function checkLegacyMigration() {
    try {
      const legacyKeyClient = await figma.clientStorage.getAsync(STORAGE_KEYS.LEGACY_CLAUDE_KEY);
      const legacyKeyRoot = figma.root.getPluginData(STORAGE_KEYS.LEGACY_CLAUDE_KEY);
      const legacyKey = legacyKeyClient || legacyKeyRoot;
      const legacyModelClient = await figma.clientStorage.getAsync(STORAGE_KEYS.LEGACY_CLAUDE_MODEL);
      const legacyModelRoot = figma.root.getPluginData(STORAGE_KEYS.LEGACY_CLAUDE_MODEL);
      const legacyModel = legacyModelClient || legacyModelRoot;
      if (legacyKey) {
        return {
          needsMigration: true,
          legacyKey,
          legacyModel
        };
      }
      return { needsMigration: false };
    } catch (e) {
      return { needsMigration: false };
    }
  }
  async function migrateLegacyStorage() {
    const migration = await checkLegacyMigration();
    if (!migration.needsMigration) {
      return;
    }
    console.log("Migrating legacy Claude storage to multi-provider format...");
    if (migration.legacyKey) {
      figma.root.setPluginData(STORAGE_KEYS.apiKey("anthropic"), migration.legacyKey);
    }
    figma.root.setPluginData(STORAGE_KEYS.SELECTED_PROVIDER, "anthropic");
    if (migration.legacyModel) {
      figma.root.setPluginData(STORAGE_KEYS.SELECTED_MODEL, migration.legacyModel);
    }
    await figma.clientStorage.deleteAsync(STORAGE_KEYS.LEGACY_CLAUDE_KEY);
    await figma.clientStorage.deleteAsync(STORAGE_KEYS.LEGACY_CLAUDE_MODEL);
    figma.root.setPluginData(STORAGE_KEYS.LEGACY_CLAUDE_KEY, "");
    figma.root.setPluginData(STORAGE_KEYS.LEGACY_CLAUDE_MODEL, "");
    console.log("Migration complete");
  }
  async function loadProviderConfig() {
    await migrateLegacyStorage();
    const providerId = figma.root.getPluginData(STORAGE_KEYS.SELECTED_PROVIDER) || DEFAULTS.provider;
    const modelId = figma.root.getPluginData(STORAGE_KEYS.SELECTED_MODEL) || DEFAULT_MODELS[providerId];
    const apiKey = figma.root.getPluginData(STORAGE_KEYS.apiKey(providerId)) || null;
    return { providerId, modelId, apiKey };
  }
  async function saveProviderConfig(providerId, modelId, apiKey) {
    figma.root.setPluginData(STORAGE_KEYS.SELECTED_PROVIDER, providerId);
    figma.root.setPluginData(STORAGE_KEYS.SELECTED_MODEL, modelId);
    if (apiKey !== void 0) {
      figma.root.setPluginData(STORAGE_KEYS.apiKey(providerId), apiKey);
    }
  }
  async function clearProviderKey(providerId) {
    figma.root.setPluginData(STORAGE_KEYS.apiKey(providerId), "");
  }

  // src/fixes/token-fixer.ts
  async function bindColorToken(node, propertyType, variableId, paintIndex = 0) {
    try {
      if (!(propertyType in node)) {
        return {
          success: false,
          message: `Node does not support ${propertyType}`,
          error: `Property ${propertyType} not found on node type ${node.type}`
        };
      }
      const variable = await figma.variables.getVariableByIdAsync(variableId);
      if (!variable) {
        return {
          success: false,
          message: "Variable not found",
          error: `Could not find variable with ID: ${variableId}`
        };
      }
      if (variable.resolvedType !== "COLOR") {
        return {
          success: false,
          message: "Variable is not a color type",
          error: `Variable ${variable.name} is of type ${variable.resolvedType}, expected COLOR`
        };
      }
      const nodeWithPaints = node;
      const paints = [...nodeWithPaints[propertyType]];
      if (paintIndex >= paints.length) {
        return {
          success: false,
          message: "Paint index out of range",
          error: `Paint index ${paintIndex} does not exist. Node has ${paints.length} ${propertyType}.`
        };
      }
      const currentPaint = paints[paintIndex];
      if (currentPaint.type !== "SOLID") {
        return {
          success: false,
          message: "Can only bind to solid paints",
          error: `Paint at index ${paintIndex} is of type ${currentPaint.type}, expected SOLID`
        };
      }
      const boundPaint = figma.variables.setBoundVariableForPaint(
        currentPaint,
        "color",
        variable
      );
      paints[paintIndex] = boundPaint;
      if (propertyType === "fills") {
        node.fills = paints;
      } else {
        node.strokes = paints;
      }
      return {
        success: true,
        message: `Successfully bound ${variable.name} to ${propertyType}[${paintIndex}]`,
        appliedFix: {
          nodeId: node.id,
          nodeName: node.name,
          propertyPath: `${propertyType}[${paintIndex}]`,
          beforeValue: currentPaint.type === "SOLID" && currentPaint.color ? rgbToHex(currentPaint.color.r, currentPaint.color.g, currentPaint.color.b) : "unknown",
          afterValue: variable.name,
          tokenId: variableId,
          tokenName: variable.name,
          fixType: "color"
        }
      };
    } catch (error) {
      return {
        success: false,
        message: "Failed to bind color token",
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }
  async function bindSpacingToken(node, property, variableId) {
    try {
      if (!(property in node)) {
        return {
          success: false,
          message: `Node does not support ${property}`,
          error: `Property ${property} not found on node type ${node.type}`
        };
      }
      const variable = await figma.variables.getVariableByIdAsync(variableId);
      if (!variable) {
        return {
          success: false,
          message: "Variable not found",
          error: `Could not find variable with ID: ${variableId}`
        };
      }
      if (variable.resolvedType !== "FLOAT") {
        return {
          success: false,
          message: "Variable is not a number type",
          error: `Variable ${variable.name} is of type ${variable.resolvedType}, expected FLOAT`
        };
      }
      const currentValue = node[property];
      const bindableNode = node;
      bindableNode.setBoundVariable(property, variable);
      return {
        success: true,
        message: `Successfully bound ${variable.name} to ${property}`,
        appliedFix: {
          nodeId: node.id,
          nodeName: node.name,
          propertyPath: property,
          beforeValue: typeof currentValue === "number" ? `${currentValue}px` : String(currentValue),
          afterValue: variable.name,
          tokenId: variableId,
          tokenName: variable.name,
          fixType: property.includes("Radius") ? "border" : "spacing"
        }
      };
    } catch (error) {
      return {
        success: false,
        message: "Failed to bind spacing token",
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }
  async function findMatchingColorVariable(hexColor, tolerance = 0) {
    try {
      const targetRgb = hexToRgb(hexColor);
      if (!targetRgb) {
        return [];
      }
      const suggestions = [];
      const colorVariables = await figma.variables.getLocalVariablesAsync("COLOR");
      const collections = await figma.variables.getLocalVariableCollectionsAsync();
      const collectionMap = /* @__PURE__ */ new Map();
      for (const collection of collections) {
        collectionMap.set(collection.id, collection);
      }
      for (const variable of colorVariables) {
        const collection = collectionMap.get(variable.variableCollectionId);
        if (!collection) continue;
        const modeId = collection.modes[0].modeId;
        const value = variable.valuesByMode[modeId];
        if (!value || typeof value !== "object" || !("r" in value)) {
          continue;
        }
        const varColor = value;
        const matchScore = calculateColorMatchScore(targetRgb, varColor);
        if (matchScore >= 1 - tolerance) {
          suggestions.push({
            variableId: variable.id,
            variableName: variable.name,
            collectionName: collection.name,
            value: rgbToHex(varColor.r, varColor.g, varColor.b),
            matchScore,
            type: "color"
          });
        }
      }
      return suggestions.sort((a, b) => b.matchScore - a.matchScore);
    } catch (error) {
      console.error("Error finding matching color variable:", error);
      return [];
    }
  }
  async function findMatchingSpacingVariable(pixelValue, tolerance = 0) {
    try {
      const suggestions = [];
      const numberVariables = await figma.variables.getLocalVariablesAsync("FLOAT");
      const collections = await figma.variables.getLocalVariableCollectionsAsync();
      const collectionMap = /* @__PURE__ */ new Map();
      for (const collection of collections) {
        collectionMap.set(collection.id, collection);
      }
      for (const variable of numberVariables) {
        const collection = collectionMap.get(variable.variableCollectionId);
        if (!collection) continue;
        const modeId = collection.modes[0].modeId;
        const value = variable.valuesByMode[modeId];
        if (typeof value !== "number") {
          continue;
        }
        const difference = Math.abs(value - pixelValue);
        if (difference <= tolerance) {
          const matchScore = difference === 0 ? 1 : 1 - difference / (tolerance || 1);
          suggestions.push({
            variableId: variable.id,
            variableName: variable.name,
            collectionName: collection.name,
            value: `${value}px`,
            matchScore,
            type: "number"
          });
        }
      }
      return suggestions.sort((a, b) => b.matchScore - a.matchScore);
    } catch (error) {
      console.error("Error finding matching spacing variable:", error);
      return [];
    }
  }
  async function findBestMatchingVariable(pixelValue, propertyPath, tolerance = 2) {
    const suggestions = await findMatchingSpacingVariable(pixelValue, tolerance);
    if (suggestions.length === 0) return suggestions;
    const affinityMap = {
      strokeWeight: ["stroke", "border-width", "border/width", "borderwidth"],
      cornerRadius: ["radius", "corner", "round", "border-radius"],
      topLeftRadius: ["radius", "corner", "round"],
      topRightRadius: ["radius", "corner", "round"],
      bottomLeftRadius: ["radius", "corner", "round"],
      bottomRightRadius: ["radius", "corner", "round"],
      paddingTop: ["padding", "spacing", "space"],
      paddingRight: ["padding", "spacing", "space"],
      paddingBottom: ["padding", "spacing", "space"],
      paddingLeft: ["padding", "spacing", "space"],
      itemSpacing: ["gap", "spacing", "space"],
      counterAxisSpacing: ["gap", "spacing", "space"]
    };
    const keywords = affinityMap[propertyPath] || [];
    if (keywords.length === 0) return suggestions;
    const boosted = suggestions.map((s) => {
      const nameLower = s.variableName.toLowerCase();
      const hasAffinity = keywords.some((kw) => nameLower.includes(kw));
      return __spreadProps(__spreadValues({}, s), {
        matchScore: hasAffinity ? Math.min(s.matchScore + 0.3, 1) : s.matchScore
      });
    });
    return boosted.sort((a, b) => b.matchScore - a.matchScore);
  }
  async function applyColorFix(node, propertyPath, tokenId) {
    const match = propertyPath.match(/^(fills|strokes)\[(\d+)\]$/);
    if (!match) {
      return {
        success: false,
        message: "Invalid property path",
        error: `Expected format: fills[n] or strokes[n], got: ${propertyPath}`
      };
    }
    const [, propertyType, indexStr] = match;
    const paintIndex = parseInt(indexStr, 10);
    return bindColorToken(
      node,
      propertyType,
      tokenId,
      paintIndex
    );
  }
  async function applySpacingFix(node, propertyPath, tokenId) {
    const validProperties = [
      "paddingTop",
      "paddingRight",
      "paddingBottom",
      "paddingLeft",
      "itemSpacing",
      "counterAxisSpacing",
      "cornerRadius",
      "topLeftRadius",
      "topRightRadius",
      "bottomLeftRadius",
      "bottomRightRadius",
      "strokeWeight"
    ];
    if (!validProperties.includes(propertyPath)) {
      return {
        success: false,
        message: "Invalid property path",
        error: `Property ${propertyPath} is not a valid spacing property`
      };
    }
    if (propertyPath === "cornerRadius") {
      const corners = [
        "topLeftRadius",
        "topRightRadius",
        "bottomLeftRadius",
        "bottomRightRadius"
      ];
      const results = [];
      for (const corner of corners) {
        const result = await bindSpacingToken(node, corner, tokenId);
        results.push(result);
        if (!result.success) {
          return {
            success: false,
            message: `Failed to bind ${corner}`,
            error: result.error
          };
        }
      }
      return {
        success: true,
        message: `Successfully bound variable to all 4 corner radii`,
        appliedFix: results[0].appliedFix ? __spreadProps(__spreadValues({}, results[0].appliedFix), { propertyPath: "cornerRadius" }) : void 0
      };
    }
    return bindSpacingToken(
      node,
      propertyPath,
      tokenId
    );
  }
  async function previewFix(node, propertyPath, tokenId) {
    try {
      const variable = await figma.variables.getVariableByIdAsync(tokenId);
      if (!variable) {
        return null;
      }
      let fixType;
      let beforeValue;
      const colorMatch = propertyPath.match(/^(fills|strokes)\[(\d+)\]$/);
      if (colorMatch) {
        fixType = "color";
        const [, propertyType, indexStr] = colorMatch;
        const paintIndex = parseInt(indexStr, 10);
        if (!(propertyType in node)) {
          return null;
        }
        const nodeWithPaints = node;
        const paints = nodeWithPaints[propertyType];
        if (paintIndex >= paints.length) {
          return null;
        }
        const paint = paints[paintIndex];
        if (paint.type === "SOLID" && paint.color) {
          beforeValue = rgbToHex(paint.color.r, paint.color.g, paint.color.b);
        } else {
          beforeValue = paint.type;
        }
      } else {
        if (!(propertyPath in node)) {
          return null;
        }
        const currentValue = node[propertyPath];
        beforeValue = typeof currentValue === "number" ? `${currentValue}px` : String(currentValue);
        fixType = propertyPath.includes("Radius") ? "border" : "spacing";
      }
      let afterValue = variable.name;
      const collection = await figma.variables.getVariableCollectionByIdAsync(variable.variableCollectionId);
      if (collection) {
        const modeId = collection.modes[0].modeId;
        const value = variable.valuesByMode[modeId];
        if (typeof value === "number") {
          afterValue = `${variable.name} (${value}px)`;
        } else if (value && typeof value === "object" && "r" in value) {
          const rgb = value;
          afterValue = `${variable.name} (${rgbToHex(rgb.r, rgb.g, rgb.b)})`;
        }
      }
      return {
        nodeId: node.id,
        nodeName: node.name,
        propertyPath,
        beforeValue,
        afterValue,
        tokenId,
        tokenName: variable.name,
        fixType
      };
    } catch (error) {
      console.error("Error generating fix preview:", error);
      return null;
    }
  }
  function hexToRgb(hex) {
    const cleanHex = hex.replace(/^#/, "");
    let fullHex = cleanHex;
    if (cleanHex.length === 3) {
      fullHex = cleanHex[0] + cleanHex[0] + cleanHex[1] + cleanHex[1] + cleanHex[2] + cleanHex[2];
    }
    if (fullHex.length !== 6) {
      return null;
    }
    const r = parseInt(fullHex.substring(0, 2), 16);
    const g = parseInt(fullHex.substring(2, 4), 16);
    const b = parseInt(fullHex.substring(4, 6), 16);
    if (isNaN(r) || isNaN(g) || isNaN(b)) {
      return null;
    }
    return {
      r: r / 255,
      g: g / 255,
      b: b / 255
    };
  }
  function calculateColorMatchScore(color1, color2) {
    const dr = color1.r - color2.r;
    const dg = color1.g - color2.g;
    const db = color1.b - color2.b;
    const distance = Math.sqrt(dr * dr + dg * dg + db * db);
    const maxDistance = Math.sqrt(3);
    return 1 - distance / maxDistance;
  }

  // src/fixes/naming-fixer.ts
  var GENERIC_NAMES = /^(Frame|Rectangle|Ellipse|Group|Vector|Line|Polygon|Star|Text|Component|Instance|Slice|Boolean|Union|Subtract|Intersect|Exclude)\s*\d*$/i;
  var COMPONENT_PREFIXES = {
    button: "btn",
    icon: "ico",
    input: "input",
    text: "txt",
    image: "img",
    container: "container",
    card: "card",
    list: "list",
    "list-item": "list-item",
    nav: "nav",
    header: "header",
    footer: "footer",
    modal: "modal",
    dropdown: "dropdown",
    checkbox: "checkbox",
    radio: "radio",
    toggle: "toggle",
    avatar: "avatar",
    badge: "badge",
    divider: "divider",
    spacer: "spacer",
    link: "link",
    tab: "tab",
    tooltip: "tooltip",
    alert: "alert",
    progress: "progress",
    skeleton: "skeleton",
    unknown: "layer"
  };
  var TYPE_KEYWORD_ENTRIES = [
    ["btn", "button"],
    ["button", "button"],
    ["cta", "button"],
    ["submit", "button"],
    ["icon", "icon"],
    ["ico", "icon"],
    ["glyph", "icon"],
    ["symbol", "icon"],
    ["arrow", "icon"],
    ["chevron", "icon"],
    ["close", "icon"],
    ["plus", "icon"],
    ["minus", "icon"],
    ["txt", "text"],
    ["label", "text"],
    ["title", "text"],
    ["heading", "text"],
    ["paragraph", "text"],
    ["description", "text"],
    ["caption", "text"],
    ["subtitle", "text"],
    ["input", "input"],
    ["field", "input"],
    ["textfield", "input"],
    ["textarea", "input"],
    ["searchfield", "input"],
    ["searchbox", "input"],
    ["image", "image"],
    ["img", "image"],
    ["photo", "image"],
    ["picture", "image"],
    ["thumbnail", "image"],
    ["cover", "image"],
    ["container", "container"],
    ["wrapper", "container"],
    ["content", "container"],
    ["section", "container"],
    ["block", "container"],
    ["box", "container"],
    ["card", "card"],
    ["tile", "card"],
    ["panel", "card"],
    ["list", "list"],
    ["items", "list"],
    ["item", "list-item"],
    ["row", "list-item"],
    ["listitem", "list-item"],
    ["nav", "nav"],
    ["navbar", "nav"],
    ["navigation", "nav"],
    ["sidebar", "nav"],
    ["breadcrumb", "nav"],
    ["menu", "nav"],
    ["header", "header"],
    ["topbar", "header"],
    ["footer", "footer"],
    ["bottombar", "footer"],
    ["modal", "modal"],
    ["dialog", "modal"],
    ["popup", "modal"],
    ["overlay", "modal"],
    ["dropdown", "dropdown"],
    ["select", "dropdown"],
    ["picker", "dropdown"],
    ["combobox", "dropdown"],
    ["checkbox", "checkbox"],
    ["checkmark", "checkbox"],
    ["radio", "radio"],
    ["toggle", "toggle"],
    ["switch", "toggle"],
    ["avatar", "avatar"],
    ["profile", "avatar"],
    ["userpic", "avatar"],
    ["badge", "badge"],
    ["tag", "badge"],
    ["chip", "badge"],
    ["pill", "badge"],
    ["status", "badge"],
    ["divider", "divider"],
    ["separator", "divider"],
    ["hr", "divider"],
    ["spacer", "spacer"],
    ["gap", "spacer"],
    ["link", "link"],
    ["anchor", "link"],
    ["href", "link"],
    ["tab", "tab"],
    ["tabs", "tab"],
    ["tabbar", "tab"],
    ["tooltip", "tooltip"],
    ["hint", "tooltip"],
    ["popover", "tooltip"],
    ["alert", "alert"],
    ["notification", "alert"],
    ["toast", "alert"],
    ["message", "alert"],
    ["snackbar", "alert"],
    ["banner", "alert"],
    ["progress", "progress"],
    ["loader", "progress"],
    ["loading", "progress"],
    ["spinner", "progress"],
    ["progressbar", "progress"],
    ["skeleton", "skeleton"],
    ["placeholder", "skeleton"],
    ["shimmer", "skeleton"]
  ];
  function isGenericName(name) {
    if (!name || typeof name !== "string") {
      return true;
    }
    const trimmedName = name.trim();
    if (GENERIC_NAMES.test(trimmedName)) {
      return true;
    }
    if (trimmedName.length === 1) {
      return true;
    }
    if (/^\d+$/.test(trimmedName)) {
      return true;
    }
    return false;
  }
  function detectLayerType(node) {
    const name = node.name.toLowerCase();
    for (let i = 0; i < TYPE_KEYWORD_ENTRIES.length; i++) {
      const entry = TYPE_KEYWORD_ENTRIES[i];
      if (name.indexOf(entry[0]) !== -1) {
        return entry[1];
      }
    }
    switch (node.type) {
      case "TEXT":
        return "text";
      case "VECTOR":
      case "STAR":
      case "POLYGON":
      case "BOOLEAN_OPERATION":
        return "icon";
      case "RECTANGLE":
      case "ELLIPSE":
      case "LINE":
        if ("fills" in node && Array.isArray(node.fills)) {
          const fills = node.fills;
          let hasImageFill = false;
          for (let i = 0; i < fills.length; i++) {
            const fill = fills[i];
            if (fill.type === "IMAGE" && fill.visible !== false) {
              hasImageFill = true;
              break;
            }
          }
          if (hasImageFill) {
            return "image";
          }
        }
        if ("width" in node && "height" in node) {
          const width = node.width;
          const height = node.height;
          const aspectRatio = width / height;
          if (height <= 2 && width > 20) {
            return "divider";
          }
          if (width <= 2 && height > 20) {
            return "divider";
          }
          if (width <= 32 && height <= 32 && aspectRatio > 0.5 && aspectRatio < 2) {
            return "spacer";
          }
        }
        return "unknown";
      case "FRAME":
      case "GROUP":
        return detectFrameType(node);
      case "COMPONENT":
      case "INSTANCE":
        return detectComponentType(node);
      case "COMPONENT_SET":
        return detectComponentSetType(node);
      default:
        return "unknown";
    }
  }
  function detectFrameType(node) {
    if (!("children" in node) || node.children.length === 0) {
      return "container";
    }
    const children = node.children;
    const childTypes = [];
    const childNames = [];
    for (let i = 0; i < children.length; i++) {
      childTypes.push(children[i].type);
      childNames.push(children[i].name.toLowerCase());
    }
    let hasText = false;
    let hasIcon = false;
    for (let i = 0; i < childTypes.length; i++) {
      if (childTypes[i] === "TEXT") {
        hasText = true;
      }
      if (childTypes[i] === "VECTOR" || childNames[i].indexOf("icon") !== -1) {
        hasIcon = true;
      }
    }
    const isSmall = "width" in node && "height" in node && node.width < 300 && node.height < 100;
    if (hasText && isSmall && (hasIcon || children.length <= 3)) {
      if ("layoutMode" in node && node.layoutMode !== "NONE") {
        return "button";
      }
    }
    let hasImage = false;
    for (let i = 0; i < childTypes.length; i++) {
      if (childTypes[i] === "RECTANGLE" || childNames[i].indexOf("image") !== -1) {
        hasImage = true;
        break;
      }
    }
    if (hasText && hasImage && children.length >= 2) {
      return "card";
    }
    if (children.length >= 3) {
      const firstChildType = children[0].type;
      let allSameType = true;
      for (let i = 1; i < children.length; i++) {
        if (children[i].type !== firstChildType) {
          allSameType = false;
          break;
        }
      }
      if (allSameType && (firstChildType === "FRAME" || firstChildType === "INSTANCE")) {
        return "list";
      }
    }
    if ("cornerRadius" in node && node.cornerRadius && children.length <= 2) {
      if (hasText && isSmall) {
        return "input";
      }
    }
    if ("layoutMode" in node && node.layoutMode === "HORIZONTAL") {
      let clickableCount = 0;
      for (let i = 0; i < children.length; i++) {
        const childType = children[i].type;
        if (childType === "FRAME" || childType === "INSTANCE" || childType === "TEXT") {
          clickableCount++;
        }
      }
      if (clickableCount >= 3 && isSmall) {
        return "nav";
      }
    }
    return "container";
  }
  function detectComponentType(node) {
    const name = node.name.toLowerCase();
    for (let i = 0; i < TYPE_KEYWORD_ENTRIES.length; i++) {
      const entry = TYPE_KEYWORD_ENTRIES[i];
      if (name.indexOf(entry[0]) !== -1) {
        return entry[1];
      }
    }
    if ("children" in node) {
      return detectFrameType(node);
    }
    return "unknown";
  }
  function detectComponentSetType(node) {
    const name = node.name.toLowerCase();
    for (let i = 0; i < TYPE_KEYWORD_ENTRIES.length; i++) {
      const entry = TYPE_KEYWORD_ENTRIES[i];
      if (name.indexOf(entry[0]) !== -1) {
        return entry[1];
      }
    }
    if ("children" in node && node.children.length > 0) {
      return detectComponentType(node.children[0]);
    }
    return "unknown";
  }
  function suggestLayerName(node) {
    const layerType = detectLayerType(node);
    if (node.type === "TEXT") {
      return generateTextName(node);
    }
    if (node.type === "VECTOR" || node.type === "STAR" || node.type === "POLYGON" || node.type === "BOOLEAN_OPERATION") {
      return generateIconName(node);
    }
    if ("children" in node && node.children.length > 0) {
      return generateContainerName(node);
    }
    return COMPONENT_PREFIXES[layerType] || "layer";
  }
  function generateIconName(node) {
    const name = node.name.toLowerCase();
    const meaningfulPart = name.replace(GENERIC_NAMES, "").replace(/[_\-\s]+/g, "-").replace(/^-|-$/g, "").trim();
    if (meaningfulPart && meaningfulPart.length > 1) {
      return `icon-${toKebabCase(meaningfulPart)}`;
    }
    if ("children" in node && node.children.length > 0) {
      const childTypes = [];
      for (let i = 0; i < node.children.length; i++) {
        childTypes.push(node.children[i].type);
      }
      for (let i = 0; i < childTypes.length; i++) {
        if (childTypes[i] === "ELLIPSE") {
          return "icon-circle";
        }
        if (childTypes[i] === "STAR") {
          return "icon-star";
        }
        if (childTypes[i] === "POLYGON") {
          return "icon-shape";
        }
      }
    }
    if ("width" in node && "height" in node) {
      const aspectRatio = node.width / node.height;
      if (aspectRatio > 1.5 || aspectRatio < 0.67) {
        return "icon-arrow";
      }
    }
    return "icon";
  }
  function generateTextName(node) {
    const text = node.characters || "";
    const trimmedText = text.trim();
    if (!trimmedText) {
      return "text-empty";
    }
    const words = trimmedText.split(/\s+/);
    if (words.length <= 2 && trimmedText.length <= 30) {
      const kebab = toKebabCase(trimmedText);
      if (kebab) {
        return `text-${kebab}`;
      }
      return "text-content";
    }
    const firstWord = words[0].toLowerCase();
    const headingKeywords = ["welcome", "about", "contact", "services", "features", "pricing"];
    const labelKeywords = ["name", "email", "password", "username", "address", "phone"];
    const buttonKeywords = ["submit", "cancel", "save", "delete", "edit", "add", "remove", "ok", "yes", "no"];
    const linkKeywords = ["learn", "read", "view", "see", "click", "here", "more"];
    const errorKeywords = ["error", "invalid", "required", "failed", "wrong"];
    const successKeywords = ["success", "done", "complete", "saved", "updated"];
    const lowerText = trimmedText.toLowerCase();
    for (let i = 0; i < headingKeywords.length; i++) {
      if (firstWord.indexOf(headingKeywords[i]) !== -1 || lowerText.indexOf(headingKeywords[i]) !== -1) {
        return `text-heading-${toKebabCase(words.slice(0, 2).join(" "))}`;
      }
    }
    for (let i = 0; i < labelKeywords.length; i++) {
      if (firstWord.indexOf(labelKeywords[i]) !== -1 || lowerText.indexOf(labelKeywords[i]) !== -1) {
        return `text-label-${toKebabCase(words.slice(0, 2).join(" "))}`;
      }
    }
    for (let i = 0; i < buttonKeywords.length; i++) {
      if (firstWord.indexOf(buttonKeywords[i]) !== -1 || lowerText.indexOf(buttonKeywords[i]) !== -1) {
        return `text-button-${toKebabCase(words.slice(0, 2).join(" "))}`;
      }
    }
    for (let i = 0; i < linkKeywords.length; i++) {
      if (firstWord.indexOf(linkKeywords[i]) !== -1 || lowerText.indexOf(linkKeywords[i]) !== -1) {
        return `text-link-${toKebabCase(words.slice(0, 2).join(" "))}`;
      }
    }
    for (let i = 0; i < errorKeywords.length; i++) {
      if (firstWord.indexOf(errorKeywords[i]) !== -1 || lowerText.indexOf(errorKeywords[i]) !== -1) {
        return `text-error-${toKebabCase(words.slice(0, 2).join(" "))}`;
      }
    }
    for (let i = 0; i < successKeywords.length; i++) {
      if (firstWord.indexOf(successKeywords[i]) !== -1 || lowerText.indexOf(successKeywords[i]) !== -1) {
        return `text-success-${toKebabCase(words.slice(0, 2).join(" "))}`;
      }
    }
    const defaultKebab = toKebabCase(words.slice(0, 2).join(" "));
    return defaultKebab ? `text-${defaultKebab}` : "text-content";
  }
  function generateContainerName(node) {
    const layerType = detectLayerType(node);
    const prefix = COMPONENT_PREFIXES[layerType];
    if ("children" in node && node.children.length > 0) {
      let textChild;
      for (let i = 0; i < node.children.length; i++) {
        if (node.children[i].type === "TEXT") {
          textChild = node.children[i];
          break;
        }
      }
      if (textChild && textChild.characters) {
        const text = textChild.characters.trim();
        const words = text.split(/\s+/).slice(0, 2);
        if (words.length > 0 && words[0].length > 0) {
          return `${prefix}-${toKebabCase(words.join(" "))}`;
        }
      }
      if (layerType === "button" || layerType === "input") {
        let iconChild;
        for (let i = 0; i < node.children.length; i++) {
          const child = node.children[i];
          if (child.type === "VECTOR" || child.name.toLowerCase().indexOf("icon") !== -1) {
            iconChild = child;
            break;
          }
        }
        if (iconChild) {
          const iconName = iconChild.name.toLowerCase().replace(/icon[-_\s]*/gi, "");
          if (iconName && !isGenericName(iconName)) {
            return `${prefix}-${toKebabCase(iconName)}`;
          }
        }
      }
    }
    return prefix;
  }
  function renameLayer(node, newName) {
    if (!node || !newName || typeof newName !== "string") {
      return false;
    }
    const trimmedName = newName.trim();
    if (trimmedName.length === 0) {
      return false;
    }
    try {
      node.name = trimmedName;
      return true;
    } catch (error) {
      console.error("Failed to rename layer:", error);
      return false;
    }
  }
  function previewRename(node, newName) {
    return {
      nodeId: node.id,
      currentName: node.name,
      newName: newName.trim(),
      layerType: detectLayerType(node),
      willChange: node.name !== newName.trim()
    };
  }
  function toKebabCase(str) {
    return str.replace(/([a-z])([A-Z])/g, "$1-$2").replace(/[\s_]+/g, "-").replace(/[^a-zA-Z0-9-]/g, "").replace(/-+/g, "-").replace(/^-|-$/g, "").toLowerCase();
  }

  // src/ui/message-handler.ts
  var storedApiKey = null;
  var selectedModel = "claude-sonnet-4-5-20250929";
  var selectedProvider = "anthropic";
  function isValidApiKeyFormat(apiKey, provider = selectedProvider) {
    const trimmed = (apiKey == null ? void 0 : apiKey.trim()) || "";
    switch (provider) {
      case "anthropic":
        return trimmed.startsWith("sk-ant-") && trimmed.length >= 40;
      case "openai":
        return trimmed.startsWith("sk-") && trimmed.length >= 20;
      case "google":
        return trimmed.startsWith("AIza") && trimmed.length >= 35;
      default:
        return false;
    }
  }
  var lastAnalyzedMetadata = null;
  var lastAnalyzedNode = null;
  var lastSystemAuditResults = null;
  var consistencyEngine = new consistency_engine_default({
    enableCaching: true,
    enableMCPIntegration: true,
    mcpServerUrl: "https://design-systems-mcp.southleft-llc.workers.dev/mcp"
  });
  async function handleUIMessage(msg) {
    const { type, data } = msg;
    console.log("Received message:", type, data);
    try {
      switch (type) {
        case "check-api-key":
          await handleCheckApiKey();
          break;
        case "save-api-key":
          await handleSaveApiKey(data.apiKey, data.model, data.provider);
          break;
        case "update-model":
          await handleUpdateModel(data.model);
          break;
        case "analyze-system":
          await handleSystemAudit();
          break;
        // Removed: 'analyze' and 'analyze-enhanced' (Component Audit removed)
        case "clear-api-key":
          await handleClearApiKey();
          break;
        case "chat-message":
          await handleChatMessage(data);
          break;
        case "chat-clear-history":
          await handleClearChatHistory();
          break;
        case "select-node":
          await handleSelectNode(data);
          break;
        // Auto-fix handlers
        case "preview-fix":
          await handlePreviewFix(data);
          break;
        case "apply-token-fix":
          await handleApplyTokenFix(data);
          break;
        case "apply-naming-fix":
          await handleApplyNamingFix(data);
          break;
        case "apply-batch-fix":
          await handleApplyBatchFix(data);
          break;
        case "update-description":
          await handleUpdateDescription(data);
          break;
        case "add-component-property":
          await handleAddComponentProperty(data);
          break;
        default:
          console.warn("Unknown message type:", type);
      }
    } catch (error) {
      console.error("Error handling message:", error);
      const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
      sendMessageToUI("analysis-error", { error: errorMessage });
    }
  }
  async function handleCheckApiKey() {
    try {
      await migrateLegacyStorage();
      const config = await loadProviderConfig();
      selectedProvider = config.providerId;
      selectedModel = config.modelId;
      if (storedApiKey) {
        sendMessageToUI("api-key-status", {
          hasKey: true,
          provider: selectedProvider,
          model: selectedModel
        });
        return;
      }
      if (config.apiKey && isValidApiKeyFormat(config.apiKey, config.providerId)) {
        storedApiKey = config.apiKey;
        sendMessageToUI("api-key-status", {
          hasKey: true,
          provider: selectedProvider,
          model: selectedModel
        });
      } else {
        sendMessageToUI("api-key-status", {
          hasKey: false,
          provider: selectedProvider,
          model: selectedModel
        });
      }
    } catch (error) {
      console.error("Error checking API key:", error);
      sendMessageToUI("api-key-status", { hasKey: false, provider: "anthropic" });
    }
  }
  async function handleSaveApiKey(apiKey, model, provider) {
    try {
      const providerId = provider || selectedProvider;
      if (!isValidApiKeyFormat(apiKey, providerId)) {
        const providerObj2 = getProvider(providerId);
        throw new Error(`Invalid API key format for ${providerObj2.name}. Expected format: ${providerObj2.keyPlaceholder}`);
      }
      selectedProvider = providerId;
      storedApiKey = apiKey;
      if (model) {
        selectedModel = model;
      }
      await saveProviderConfig(providerId, selectedModel, apiKey);
      console.log(`${providerId} API key and model saved successfully`);
      const providerObj = getProvider(providerId);
      sendMessageToUI("api-key-saved", { success: true, provider: providerId });
      figma.notify(`${providerObj.name} API key saved successfully`, { timeout: 2e3 });
    } catch (error) {
      console.error("Error saving API key:", error);
      const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
      sendMessageToUI("api-key-saved", { success: false, error: errorMessage });
      figma.notify(`Failed to save API key: ${errorMessage}`, { error: true });
    }
  }
  async function handleUpdateModel(model) {
    try {
      selectedModel = model;
      await saveProviderConfig(selectedProvider, model);
      console.log("Model updated to:", model);
      figma.notify(`Model updated to ${model}`, { timeout: 2e3 });
    } catch (error) {
      console.error("Error updating model:", error);
      figma.notify("Failed to update model", { error: true });
    }
  }
  function calculateAuditScore(checks) {
    if (checks.length === 0) {
      return { score: 100, total: 0, passed: 0, warnings: 0, failed: 0 };
    }
    let passed = 0;
    let warnings = 0;
    let failed = 0;
    checks.forEach((check) => {
      if (check.status === "pass") {
        passed++;
      } else if (check.status === "warning") {
        warnings++;
      } else {
        failed++;
      }
    });
    const total = checks.length;
    const points = passed * 100 + warnings * 50 + failed * 0;
    const maxPoints = total * 100;
    const score = Math.round(points / maxPoints * 100);
    return { score, total, passed, warnings, failed };
  }
  async function handleSystemAudit() {
    try {
      console.log("\u{1F50D} Running CTDS audit...");
      const [collectionValidation, textStyleSync, textStyleBindings, componentBindings] = await Promise.all([
        validateCollectionStructure(),
        validateTextStylesAgainstVariables(),
        validateTextStyleBindings(),
        validateAllComponentBindings()
      ]);
      const combinedTextStyleSync = [
        ...textStyleSync.auditChecks,
        ...textStyleBindings.auditChecks
      ];
      const collectionScore = calculateAuditScore(collectionValidation.auditChecks);
      const textStyleScore = calculateAuditScore(combinedTextStyleSync);
      const componentScore = calculateAuditScore(componentBindings.auditChecks);
      const allChecks = [
        ...collectionValidation.auditChecks,
        ...combinedTextStyleSync,
        ...componentBindings.auditChecks
      ];
      const overallScore = calculateAuditScore(allChecks);
      lastSystemAuditResults = {
        collectionStructure: collectionValidation.auditChecks,
        textStyleSync: combinedTextStyleSync,
        componentBindings: componentBindings.auditChecks,
        timestamp: Date.now()
      };
      sendMessageToUI("system-audit-result", {
        collectionStructure: collectionValidation.auditChecks,
        textStyleSync: combinedTextStyleSync,
        componentBindings: componentBindings.auditChecks,
        scores: {
          overall: overallScore,
          collections: collectionScore,
          textStyles: textStyleScore,
          components: componentScore
        }
      });
      console.log("\u2705 CTDS audit complete - Score:", overallScore.score);
    } catch (error) {
      console.error("\u274C CTDS audit error:", error);
      sendMessageToUI("system-audit-result", {
        error: error instanceof Error ? error.message : "Unknown error during system audit"
      });
    }
  }
  async function handleClearApiKey() {
    try {
      storedApiKey = null;
      await clearProviderKey(selectedProvider);
      const providerName = getProvider(selectedProvider).name;
      sendMessageToUI("api-key-cleared", { success: true });
      figma.notify(`${providerName} API key cleared`, { timeout: 2e3 });
    } catch (error) {
      console.error("Error clearing API key:", error);
    }
  }
  async function handleChatMessage(data) {
    try {
      console.log("Processing chat message:", data.message);
      if (!storedApiKey) {
        const providerName = getProvider(selectedProvider).name;
        throw new Error(`API key not found. Please save your ${providerName} API key first.`);
      }
      sendMessageToUI("chat-response-loading", { isLoading: true });
      const componentContext = getCurrentComponentContext();
      const mcpResponse = await queryDesignSystemsMCP(data.message);
      const enhancedPrompt = createChatPromptWithContext(data.message, mcpResponse, data.history, componentContext);
      const llmResponse = await callProvider(selectedProvider, storedApiKey, {
        prompt: enhancedPrompt,
        model: selectedModel,
        maxTokens: 2048,
        temperature: 0.7
      });
      const chatResponse = {
        message: llmResponse.content,
        sources: mcpResponse.sources || []
      };
      sendMessageToUI("chat-response", { response: chatResponse });
    } catch (error) {
      console.error("Error handling chat message:", error);
      const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
      sendMessageToUI("chat-error", { error: errorMessage });
    }
  }
  async function handleClearChatHistory() {
    try {
      sendMessageToUI("chat-history-cleared", { success: true });
      figma.notify("Chat history cleared", { timeout: 2e3 });
    } catch (error) {
      console.error("Error clearing chat history:", error);
    }
  }
  async function handleSelectNode(data) {
    try {
      console.log("\u{1F3AF} Attempting to select node:", data.nodeId);
      const node = await figma.getNodeByIdAsync(data.nodeId);
      if (!node) {
        console.warn("\u26A0\uFE0F Node not found:", data.nodeId);
        figma.notify("Node not found - it may have been deleted or moved", { error: true });
        return;
      }
      if (!isNodeOnCurrentPage(node)) {
        console.warn("\u26A0\uFE0F Node is not on current page:", data.nodeId);
        figma.notify("Node is on a different page", { error: true });
        return;
      }
      figma.currentPage.selection = [node];
      figma.viewport.scrollAndZoomIntoView([node]);
      console.log("\u2705 Successfully selected and zoomed to node:", node.name);
      figma.notify(`Selected "${node.name}"`, { timeout: 2e3 });
    } catch (error) {
      console.error("Error selecting node:", error);
      const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
      figma.notify(`Failed to select node: ${errorMessage}`, { error: true });
    }
  }
  function isNodeOnCurrentPage(node) {
    try {
      let currentNode = node;
      const maxDepth = 50;
      let depth = 0;
      while (currentNode && currentNode.parent && depth < maxDepth) {
        currentNode = currentNode.parent;
        depth++;
        if (currentNode === figma.currentPage) {
          return true;
        }
      }
      if (currentNode === figma.currentPage) {
        return true;
      }
      if (node.parent === figma.currentPage) {
        return true;
      }
      const allPages = figma.root.children.filter((child) => child.type === "PAGE");
      const currentPage = figma.currentPage;
      if (node.type === "COMPONENT" || node.type === "COMPONENT_SET") {
        return findNodeInPage(currentPage, node.id);
      }
      return false;
    } catch (error) {
      console.warn("Error checking node page:", error);
      return false;
    }
  }
  function findNodeInPage(page, nodeId) {
    try {
      const allNodes = page.findAll();
      return allNodes.some((node) => node.id === nodeId);
    } catch (error) {
      return false;
    }
  }
  async function queryDesignSystemsMCP(query) {
    var _a;
    try {
      console.log("\u{1F50D} Querying MCP for chat:", query);
      const mcpServerUrl = ((_a = consistencyEngine["config"]) == null ? void 0 : _a.mcpServerUrl) || "https://design-systems-mcp.southleft-llc.workers.dev/mcp";
      const searchPromises = [
        // General design knowledge search
        searchMCPKnowledge(mcpServerUrl, query, { category: "general", limit: 3 }),
        // Component-specific search if the query mentions components
        query.toLowerCase().includes("component") ? searchMCPKnowledge(mcpServerUrl, query, { category: "components", limit: 2 }) : Promise.resolve({ results: [] }),
        // Token-specific search if the query mentions tokens/design tokens
        query.toLowerCase().includes("token") || query.toLowerCase().includes("design token") ? searchMCPKnowledge(mcpServerUrl, query, { category: "tokens", limit: 2 }) : Promise.resolve({ results: [] })
      ];
      const results = await Promise.allSettled(searchPromises);
      const allSources = [];
      results.forEach((result) => {
        if (result.status === "fulfilled" && result.value.results) {
          allSources.push(...result.value.results);
        }
      });
      console.log(`\u2705 Found ${allSources.length} relevant sources for chat query`);
      return { sources: allSources.slice(0, 5) };
    } catch (error) {
      console.warn("\u26A0\uFE0F MCP query failed for chat:", error);
      return { sources: [] };
    }
  }
  async function searchMCPKnowledge(serverUrl, query, options = {}) {
    const searchPayload = {
      jsonrpc: "2.0",
      id: Math.floor(Math.random() * 1e3) + 100,
      method: "tools/call",
      params: {
        name: "search_design_knowledge",
        arguments: __spreadValues({
          query,
          limit: options.limit || 5
        }, options.category && { category: options.category })
      }
    };
    const response = await fetch(serverUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(searchPayload)
    });
    if (!response.ok) {
      throw new Error(`MCP search failed: ${response.status}`);
    }
    const result = await response.json();
    if (result.result && result.result.content) {
      return {
        results: result.result.content.map((item) => ({
          title: item.title || "Design System Knowledge",
          content: item.content || item.description || "",
          category: item.category || "general"
        }))
      };
    }
    return { results: [] };
  }
  function getCurrentComponentContext() {
    try {
      const lastMetadata = lastAnalyzedMetadata;
      const lastNode = lastAnalyzedNode;
      const context = {
        timestamp: Date.now()
      };
      if (lastMetadata || lastNode) {
        context.hasCurrentComponent = true;
        if (lastNode) {
          context.component = {
            name: lastNode.name,
            type: lastNode.type,
            id: lastNode.id
          };
          const selection = figma.currentPage.selection;
          if (selection.length > 0) {
            context.selection = {
              count: selection.length,
              types: selection.map((node) => node.type),
              names: selection.map((node) => node.name)
            };
          }
        }
        if (lastMetadata) {
          context.analysis = {
            component: lastMetadata.component,
            description: lastMetadata.description,
            props: lastMetadata.props || [],
            states: lastMetadata.states || [],
            accessibility: lastMetadata.accessibility,
            audit: lastMetadata.audit,
            mcpReadiness: lastMetadata.mcpReadiness
          };
        }
      }
      if (lastSystemAuditResults) {
        context.hasSystemAudit = true;
        context.systemAudit = {
          timestamp: lastSystemAuditResults.timestamp,
          collectionStructure: lastSystemAuditResults.collectionStructure,
          textStyleSync: lastSystemAuditResults.textStyleSync,
          componentBindings: lastSystemAuditResults.componentBindings
        };
      }
      if (!context.hasCurrentComponent && !context.hasSystemAudit) {
        return null;
      }
      return context;
    } catch (error) {
      console.warn("Failed to get component context:", error);
      return null;
    }
  }
  function createChatPromptWithContext(userMessage, mcpResponse, history, componentContext) {
    let conversationContext = "";
    if (history.length > 0) {
      conversationContext = "\n**Previous Conversation:**\n";
      const recentMessages = history.slice(-6);
      recentMessages.forEach((msg) => {
        conversationContext += `${msg.role === "user" ? "User" : "Assistant"}: ${msg.content}
`;
      });
      conversationContext += "\n";
    }
    let currentComponentContext = "";
    if (componentContext && componentContext.hasCurrentComponent) {
      currentComponentContext = "\n**Current Component Context:**\n";
      if (componentContext.component) {
        currentComponentContext += `- Currently analyzing: ${componentContext.component.name} (${componentContext.component.type})
`;
      }
      if (componentContext.selection) {
        currentComponentContext += `- Selected: ${componentContext.selection.count} item(s) - ${componentContext.selection.names.join(", ")}
`;
      }
      if (componentContext.analysis) {
        currentComponentContext += `- Component: ${componentContext.analysis.component}
`;
        currentComponentContext += `- Description: ${componentContext.analysis.description}
`;
        if (componentContext.analysis.props && componentContext.analysis.props.length > 0) {
          currentComponentContext += `- Properties: ${componentContext.analysis.props.map((p) => typeof p === "string" ? p : p.name).join(", ")}
`;
        }
        if (componentContext.analysis.states && componentContext.analysis.states.length > 0) {
          currentComponentContext += `- States: ${componentContext.analysis.states.join(", ")}
`;
        }
        if (componentContext.analysis.audit) {
          const issues = [
            ...componentContext.analysis.audit.accessibilityIssues || [],
            ...componentContext.analysis.audit.namingIssues || [],
            ...componentContext.analysis.audit.consistencyIssues || []
          ];
          if (issues.length > 0) {
            currentComponentContext += `- Current Issues: ${issues.slice(0, 3).join("; ")}${issues.length > 3 ? "..." : ""}
`;
          }
        }
        if (componentContext.analysis.mcpReadiness) {
          currentComponentContext += `- MCP Readiness Score: ${componentContext.analysis.mcpReadiness.score || "Not scored"}
`;
        }
      }
      currentComponentContext += "\n";
    }
    let systemAuditContext = "";
    if (componentContext && componentContext.hasSystemAudit && componentContext.systemAudit) {
      const audit = componentContext.systemAudit;
      systemAuditContext = "\n**CTDS Audit Results (Design System Validation):**\n";
      if (audit.collectionStructure && audit.collectionStructure.length > 0) {
        systemAuditContext += "\n*Variable Collections:*\n";
        audit.collectionStructure.forEach((item) => {
          const icon = item.status === "pass" ? "\u2713" : item.status === "warning" ? "\u26A0" : "\u2717";
          systemAuditContext += `${icon} ${item.check}${item.suggestion ? ` - ${item.suggestion}` : ""}
`;
        });
      }
      if (audit.textStyleSync && audit.textStyleSync.length > 0) {
        systemAuditContext += "\n*Text Styles:*\n";
        audit.textStyleSync.forEach((item) => {
          const icon = item.status === "pass" ? "\u2713" : item.status === "warning" ? "\u26A0" : "\u2717";
          systemAuditContext += `${icon} ${item.check}${item.suggestion ? ` - ${item.suggestion}` : ""}
`;
        });
      }
      if (audit.componentBindings && audit.componentBindings.length > 0) {
        systemAuditContext += "\n*Component Variable Bindings:*\n";
        audit.componentBindings.forEach((item) => {
          const icon = item.status === "pass" ? "\u2713" : item.status === "warning" ? "\u26A0" : "\u2717";
          systemAuditContext += `${icon} ${item.check}${item.suggestion ? ` - ${item.suggestion}` : ""}
`;
        });
      }
      systemAuditContext += "\n";
    }
    let knowledgeContext = "";
    if (mcpResponse.sources && mcpResponse.sources.length > 0) {
      knowledgeContext = "\n**Relevant Design Systems Knowledge:**\n";
      mcpResponse.sources.forEach((source, index) => {
        knowledgeContext += `
${index + 1}. **${source.title}** (${source.category})
${source.content}
`;
      });
      knowledgeContext += "\n";
    }
    const hasComponentContext = componentContext && componentContext.hasCurrentComponent;
    const hasSystemAudit = componentContext && componentContext.hasSystemAudit;
    return `You are a specialized design systems assistant with access to comprehensive design systems knowledge. You're helping a user with their Figma plugin for design system analysis.

${conversationContext}**Current User Question:** ${userMessage}

${currentComponentContext}${systemAuditContext}${knowledgeContext}**Instructions:**
1. ${hasComponentContext ? "The user is currently working on a specific component in Figma. Use the component context above to provide specific, actionable advice about their current work." : "Provide helpful, accurate answers based on the design systems knowledge provided"}
2. ${hasComponentContext ? 'If they ask about "this component" or "my component", refer to the current component context provided above' : "If you need context about a specific component, suggest they select and analyze a component first"}
3. ${hasSystemAudit ? "The user has run a CTDS Audit on their design system. Use the audit results above to answer questions about variable collections, text styles, and component variable bindings." : "If the user wants design system-level validation (variable collections, text styles, component bindings), suggest they run a CTDS Audit first."}
4. Be conversational and practical in your responses
5. When discussing components, tokens, or patterns, provide specific guidance
6. If referencing the knowledge sources, mention them naturally in your response
7. Keep responses focused and actionable
8. If the user is asking about Figma-specific functionality, provide relevant plugin or design workflow advice
9. ${hasComponentContext ? "Help them improve their current component by addressing any issues mentioned in the analysis context" : "Provide general design systems guidance"}
10. ${hasSystemAudit ? "When asked about variable naming, text styles, or components using raw values, refer to the CTDS Audit results above for specific issues." : ""}

${hasComponentContext ? "Since you have context about their current component, prioritize advice that directly applies to what they're working on." : hasSystemAudit ? "Since you have CTDS Audit results, you can answer questions about variable collections, text styles, and component variable bindings." : "If the user wants component-specific advice, suggest they analyze a component. For design system validation, suggest they run a CTDS Audit."}

Respond naturally and helpfully to the user's question.`;
  }
  async function initializePlugin() {
    try {
      const config = await loadProviderConfig();
      selectedProvider = config.providerId;
      selectedModel = config.modelId;
      if (config.apiKey) {
        storedApiKey = config.apiKey;
        sendMessageToUI("api-key-status", {
          hasKey: true,
          provider: selectedProvider,
          model: selectedModel
        });
      } else {
        sendMessageToUI("api-key-status", {
          hasKey: false,
          provider: selectedProvider,
          model: selectedModel
        });
      }
      console.log(`Plugin initialized with provider: ${selectedProvider}, model: ${selectedModel}`);
      console.log("\u{1F504} Initializing design systems knowledge...");
      consistencyEngine.loadDesignSystemsKnowledge().then(() => {
        console.log("\u2705 Design systems knowledge loaded successfully");
      }).catch((error) => {
        console.warn("\u26A0\uFE0F Failed to load design systems knowledge, using fallback:", error);
      });
      console.log("Plugin initialized successfully");
    } catch (error) {
      console.error("Error initializing plugin:", error);
    }
  }
  async function handlePreviewFix(data) {
    try {
      const node = await figma.getNodeByIdAsync(data.nodeId);
      if (!node || !("type" in node)) {
        sendMessageToUI("fix-preview", {
          success: false,
          error: "Node not found or is not a valid scene node"
        });
        return;
      }
      const sceneNode = node;
      let preview = null;
      if (data.type === "token") {
        if (!data.propertyPath) {
          sendMessageToUI("fix-preview", {
            success: false,
            error: "Property path is required for token fixes"
          });
          return;
        }
        const matches = data.propertyPath.match(/^(fills|strokes)\[(\d+)\]$/);
        if (matches) {
          const colorMatches = await findMatchingColorVariable(data.suggestedValue || "", 0.1);
          if (colorMatches.length > 0) {
            preview = await previewFix(sceneNode, data.propertyPath, colorMatches[0].variableId);
          }
        } else {
          const pixelValue = parseFloat(data.suggestedValue || "0");
          const spacingMatches = await findBestMatchingVariable(pixelValue, data.propertyPath || "", 2);
          if (spacingMatches.length > 0) {
            preview = await previewFix(sceneNode, data.propertyPath, spacingMatches[0].variableId);
          }
        }
        if (preview) {
          const fixPreview = preview;
          sendMessageToUI("fix-preview", {
            success: true,
            type: "token",
            nodeId: fixPreview.nodeId,
            nodeName: fixPreview.nodeName,
            propertyPath: fixPreview.propertyPath,
            beforeValue: fixPreview.beforeValue,
            afterValue: fixPreview.afterValue,
            tokenId: fixPreview.tokenId,
            tokenName: fixPreview.tokenName
          });
        } else {
          sendMessageToUI("fix-preview", {
            success: false,
            error: "No matching token found for this value"
          });
        }
      } else if (data.type === "naming") {
        const suggestedName = data.suggestedValue || suggestLayerName(sceneNode);
        preview = previewRename(sceneNode, suggestedName);
        sendMessageToUI("fix-preview", { success: true, preview });
      } else {
        sendMessageToUI("fix-preview", {
          success: false,
          error: `Unknown fix type: ${data.type}`
        });
      }
    } catch (error) {
      console.error("Error previewing fix:", error);
      const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
      sendMessageToUI("fix-preview", { success: false, error: errorMessage });
    }
  }
  async function handleApplyTokenFix(data) {
    try {
      const node = await figma.getNodeByIdAsync(data.nodeId);
      if (!node || !("type" in node)) {
        sendMessageToUI("fix-applied", {
          success: false,
          error: "Node not found or is not a valid scene node"
        });
        figma.notify("Failed to apply fix: Node not found", { error: true });
        return;
      }
      const sceneNode = node;
      if (!data.propertyPath) {
        sendMessageToUI("fix-applied", {
          success: false,
          error: "Property path is required for token fixes"
        });
        figma.notify("Failed to apply fix: Property path missing", { error: true });
        return;
      }
      if (!data.tokenId) {
        sendMessageToUI("fix-applied", {
          success: false,
          error: "Token ID is required for token fixes"
        });
        figma.notify("Failed to apply fix: Token ID missing", { error: true });
        return;
      }
      let result;
      const isColorProperty = /^(fills|strokes)\[\d+\]$/.test(data.propertyPath);
      if (isColorProperty) {
        result = await applyColorFix(sceneNode, data.propertyPath, data.tokenId);
      } else {
        result = await applySpacingFix(sceneNode, data.propertyPath, data.tokenId);
      }
      sendMessageToUI("fix-applied", __spreadProps(__spreadValues({}, result), {
        fixType: "token",
        nodeId: data.nodeId,
        propertyPath: data.propertyPath
      }));
      if (result.success) {
        figma.notify(`Applied token to ${sceneNode.name}`, { timeout: 2e3 });
      } else {
        figma.notify(`Failed to apply token: ${result.error || result.message}`, { error: true });
      }
    } catch (error) {
      console.error("Error applying token fix:", error);
      const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
      sendMessageToUI("fix-applied", { success: false, error: errorMessage, fixType: "token", nodeId: data.nodeId });
      figma.notify(`Failed to apply fix: ${errorMessage}`, { error: true });
    }
  }
  async function handleApplyNamingFix(data) {
    try {
      const node = await figma.getNodeByIdAsync(data.nodeId);
      if (!node || !("type" in node)) {
        sendMessageToUI("fix-applied", {
          success: false,
          error: "Node not found or is not a valid scene node"
        });
        figma.notify("Failed to rename: Node not found", { error: true });
        return;
      }
      const sceneNode = node;
      const newName = data.newValue || suggestLayerName(sceneNode);
      const oldName = sceneNode.name;
      if (oldName === newName) {
        sendMessageToUI("fix-applied", {
          success: true,
          fixType: "naming",
          nodeId: data.nodeId,
          message: `Layer already named "${newName}"`,
          oldName,
          newName
        });
        figma.notify(`Layer already named "${newName}"`, { timeout: 2e3 });
        return;
      }
      const success = renameLayer(sceneNode, newName);
      const result = {
        success,
        fixType: "naming",
        nodeId: data.nodeId,
        message: success ? `Renamed "${oldName}" to "${newName}"` : `Failed to rename layer`,
        oldName,
        newName: success ? newName : oldName
      };
      sendMessageToUI("fix-applied", result);
      if (success) {
        figma.notify(`Renamed "${oldName}" to "${newName}"`, { timeout: 2e3 });
      } else {
        figma.notify("Failed to rename layer", { error: true });
      }
    } catch (error) {
      console.error("Error applying naming fix:", error);
      const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
      sendMessageToUI("fix-applied", { success: false, error: errorMessage });
      figma.notify(`Failed to rename: ${errorMessage}`, { error: true });
    }
  }
  async function handleApplyBatchFix(data) {
    try {
      const results = [];
      let successCount = 0;
      let errorCount = 0;
      for (const fix of data.fixes) {
        try {
          const node = await figma.getNodeByIdAsync(fix.nodeId);
          if (!node || !("type" in node)) {
            results.push({
              nodeId: fix.nodeId,
              success: false,
              message: "Node not found",
              error: "Node not found or is not a valid scene node"
            });
            errorCount++;
            continue;
          }
          const sceneNode = node;
          if (fix.type === "token") {
            if (!fix.propertyPath) {
              results.push({
                nodeId: fix.nodeId,
                success: false,
                message: "Missing property path",
                error: "Token fixes require a propertyPath"
              });
              errorCount++;
              continue;
            }
            let tokenId = fix.tokenId;
            const isColorProperty = /^(fills|strokes)\[\d+\]$/.test(fix.propertyPath);
            if (!tokenId && fix.newValue) {
              try {
                if (isColorProperty) {
                  const colorMatches = await findMatchingColorVariable(fix.newValue, 0.1);
                  if (colorMatches.length > 0) {
                    tokenId = colorMatches[0].variableId;
                  }
                } else {
                  const pixelValue = parseFloat(fix.newValue);
                  if (!isNaN(pixelValue)) {
                    const spacingMatches = await findBestMatchingVariable(pixelValue, fix.propertyPath || "", 2);
                    if (spacingMatches.length > 0) {
                      tokenId = spacingMatches[0].variableId;
                    }
                  }
                }
              } catch (matchError) {
                console.warn("Could not find matching variable:", matchError);
              }
            }
            if (!tokenId) {
              results.push({
                nodeId: fix.nodeId,
                success: false,
                message: "No matching design token found for this value",
                error: "Could not find a matching variable to bind"
              });
              errorCount++;
              continue;
            }
            let result;
            if (isColorProperty) {
              result = await applyColorFix(sceneNode, fix.propertyPath, tokenId);
            } else {
              result = await applySpacingFix(sceneNode, fix.propertyPath, tokenId);
            }
            results.push({
              nodeId: fix.nodeId,
              success: result.success,
              message: result.message,
              error: result.error
            });
            if (result.success) {
              successCount++;
            } else {
              errorCount++;
            }
          } else if (fix.type === "naming") {
            const newName = fix.newValue || suggestLayerName(sceneNode);
            const oldName = sceneNode.name;
            const success = renameLayer(sceneNode, newName);
            results.push({
              nodeId: fix.nodeId,
              success,
              message: success ? `Renamed "${oldName}" to "${newName}"` : "Failed to rename layer"
            });
            if (success) {
              successCount++;
            } else {
              errorCount++;
            }
          } else {
            results.push({
              nodeId: fix.nodeId,
              success: false,
              message: `Unknown fix type: ${fix.type}`,
              error: `Unsupported fix type: ${fix.type}`
            });
            errorCount++;
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : "Unknown error";
          results.push({
            nodeId: fix.nodeId,
            success: false,
            message: "Error applying fix",
            error: errorMessage
          });
          errorCount++;
        }
      }
      const summary = {
        total: data.fixes.length,
        success: successCount,
        errors: errorCount,
        results
      };
      sendMessageToUI("batch-fix-applied", summary);
      if (errorCount === 0) {
        figma.notify(`Applied ${successCount} fix${successCount !== 1 ? "es" : ""} successfully`, { timeout: 2e3 });
      } else if (successCount > 0) {
        figma.notify(`Applied ${successCount} fix${successCount !== 1 ? "es" : ""}, ${errorCount} failed`, { timeout: 3e3 });
      } else {
        figma.notify(`Failed to apply ${errorCount} fix${errorCount !== 1 ? "es" : ""}`, { error: true });
      }
    } catch (error) {
      console.error("Error applying batch fixes:", error);
      const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
      sendMessageToUI("batch-fix-applied", {
        total: data.fixes.length,
        success: 0,
        errors: data.fixes.length,
        error: errorMessage
      });
      figma.notify(`Batch fix failed: ${errorMessage}`, { error: true });
    }
  }
  async function handleUpdateDescription(data) {
    try {
      const node = await figma.getNodeByIdAsync(data.nodeId);
      if (!node) {
        sendMessageToUI("description-updated", {
          success: false,
          error: "Node not found"
        });
        figma.notify("Failed to update description: Node not found", { error: true });
        return;
      }
      if (node.type !== "COMPONENT" && node.type !== "COMPONENT_SET") {
        sendMessageToUI("description-updated", {
          success: false,
          error: "Node is not a component or component set"
        });
        figma.notify("Description can only be set on components", { error: true });
        return;
      }
      const componentNode = node;
      const oldDescription = componentNode.description;
      componentNode.description = data.description;
      sendMessageToUI("description-updated", {
        success: true,
        oldDescription,
        newDescription: data.description
      });
      figma.notify("Component description updated", { timeout: 2e3 });
    } catch (error) {
      console.error("Error updating description:", error);
      const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
      sendMessageToUI("description-updated", {
        success: false,
        error: errorMessage
      });
      figma.notify(`Failed to update description: ${errorMessage}`, { error: true });
    }
  }
  async function handleAddComponentProperty(data) {
    try {
      const { nodeId, propertyName, propertyType, defaultValue } = data;
      const node = await figma.getNodeByIdAsync(nodeId);
      if (!node) {
        sendMessageToUI("property-added", {
          success: false,
          propertyName,
          message: "Node not found"
        });
        figma.notify("Node not found", { error: true });
        return;
      }
      let targetNode = null;
      if (node.type === "COMPONENT") {
        const component = node;
        if (component.parent && component.parent.type === "COMPONENT_SET") {
          targetNode = component.parent;
        } else {
          targetNode = component;
        }
      } else if (node.type === "COMPONENT_SET") {
        targetNode = node;
      } else if (node.type === "INSTANCE") {
        const mainComponent = await node.getMainComponentAsync();
        if (mainComponent) {
          if (mainComponent.parent && mainComponent.parent.type === "COMPONENT_SET") {
            targetNode = mainComponent.parent;
          } else {
            targetNode = mainComponent;
          }
        }
      }
      if (!targetNode) {
        sendMessageToUI("property-added", {
          success: false,
          propertyName,
          message: "Selected node is not a component"
        });
        figma.notify("Selected node is not a component", { error: true });
        return;
      }
      const existingDefs = targetNode.componentPropertyDefinitions;
      for (const key of Object.keys(existingDefs)) {
        const baseName = key.replace(/#\d+:\d+$/, "");
        if (baseName.toLowerCase() === propertyName.toLowerCase()) {
          sendMessageToUI("property-added", {
            success: false,
            propertyName,
            message: `Property "${propertyName}" already exists`
          });
          figma.notify(`Property "${propertyName}" already exists`, { error: true });
          return;
        }
      }
      let figmaType;
      switch (propertyType.toLowerCase()) {
        case "boolean":
          figmaType = "BOOLEAN";
          break;
        case "text":
          figmaType = "TEXT";
          break;
        case "slot":
          figmaType = "INSTANCE_SWAP";
          break;
        case "variant":
          if (targetNode.type === "COMPONENT_SET") {
            figmaType = "VARIANT";
          } else {
            figmaType = "TEXT";
          }
          break;
        default:
          figmaType = "TEXT";
      }
      targetNode.addComponentProperty(propertyName, figmaType, defaultValue);
      let stagingNote = "";
      if (figmaType === "VARIANT" && targetNode.type === "COMPONENT_SET" && data.variantOptions && data.variantOptions.length > 1) {
        const componentSet = targetNode;
        const existingChildren = [...componentSet.children];
        const additionalOptions = data.variantOptions.slice(1);
        const searchStr = `${propertyName}=${defaultValue}`;
        const page = figma.currentPage;
        let containerNode = componentSet;
        while (containerNode.parent && containerNode.parent.type !== "PAGE") {
          containerNode = containerNode.parent;
        }
        const absX = containerNode.absoluteTransform[0][2];
        const absY = containerNode.absoluteTransform[1][2];
        const stagingX = absX;
        const stagingY = absY + containerNode.height + 50;
        const section = figma.createSection();
        section.name = `FigmaLint: ${propertyName} Variants`;
        page.appendChild(section);
        section.x = stagingX;
        section.y = stagingY;
        const label = figma.createText();
        await figma.loadFontAsync({ family: "Inter", style: "Medium" });
        label.fontName = { family: "Inter", style: "Medium" };
        label.characters = `New "${propertyName}" variants \u2014 drag into the ComponentSet`;
        label.fontSize = 14;
        label.fills = [{ type: "SOLID", color: { r: 0.4, g: 0.4, b: 0.4 } }];
        section.appendChild(label);
        label.x = 24;
        label.y = 24;
        const padding = 24;
        const childGap = 32;
        let currentY = label.y + label.height + 24;
        let maxWidth = label.width + padding * 2;
        for (const option of additionalOptions) {
          const replaceStr = `${propertyName}=${option}`;
          const optionLabel = figma.createText();
          await figma.loadFontAsync({ family: "Inter", style: "Semi Bold" });
          optionLabel.fontName = { family: "Inter", style: "Semi Bold" };
          optionLabel.characters = `${propertyName}=${option}`;
          optionLabel.fontSize = 12;
          optionLabel.fills = [{ type: "SOLID", color: { r: 0.6, g: 0.3, b: 0.9 } }];
          section.appendChild(optionLabel);
          optionLabel.x = padding;
          optionLabel.y = currentY;
          currentY += optionLabel.height + 12;
          let rowX = padding;
          let rowMaxHeight = 0;
          for (const child of existingChildren) {
            const clone = child.clone();
            clone.name = clone.name.replace(searchStr, replaceStr);
            section.appendChild(clone);
            clone.x = rowX;
            clone.y = currentY;
            rowX += clone.width + childGap;
            rowMaxHeight = Math.max(rowMaxHeight, clone.height);
          }
          maxWidth = Math.max(maxWidth, rowX - childGap + padding);
          currentY += rowMaxHeight + childGap;
        }
        section.resizeWithoutConstraints(
          Math.max(maxWidth, 400),
          currentY + padding
        );
        stagingNote = ` \u2014 new variants created in staging section to the right`;
      }
      sendMessageToUI("property-added", {
        success: true,
        propertyName,
        message: `Property "${propertyName}" added successfully${stagingNote}`
      });
      figma.notify(`Property "${propertyName}" added${stagingNote ? " (see staging section)" : ""}`, { timeout: 3e3 });
    } catch (error) {
      console.error("Error adding component property:", error);
      const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
      sendMessageToUI("property-added", {
        success: false,
        propertyName: data.propertyName,
        message: errorMessage
      });
      figma.notify(`Failed to add property: ${errorMessage}`, { error: true });
    }
  }

  // src/code.ts
  var PLUGIN_WINDOW_SIZE = { width: 400, height: 700 };
  try {
    figma.showUI(__html__, PLUGIN_WINDOW_SIZE);
    console.log("\u2705 FigmaLint v2.0 - UI shown successfully");
  } catch (error) {
    console.log("\u2139\uFE0F UI might already be shown in inspect panel:", error);
  }
  figma.ui.onmessage = handleUIMessage;
  initializePlugin();
  console.log("\u{1F680} FigmaLint v2.0 initialized with modular architecture");
})();
