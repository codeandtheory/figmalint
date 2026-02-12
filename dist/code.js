"use strict";
(() => {
  // src/utils/figma-helpers.ts
  function sendMessageToUI(type, data) {
    try {
      figma.ui.postMessage({ type, data });
    } catch (error) {
      console.error("Failed to send message to UI:", error);
    }
  }

  // src/plugin/data-adapter.ts
  function adaptVariableValue(value) {
    if (value === null || value === void 0) return "";
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      return value;
    }
    if (typeof value === "object" && "type" in value && value.type === "VARIABLE_ALIAS") {
      const alias = value;
      return { type: "VARIABLE_ALIAS", id: alias.id };
    }
    if (typeof value === "object" && "r" in value) {
      const color = value;
      return { r: color.r, g: color.g, b: color.b, a: "a" in color ? color.a : 1 };
    }
    return String(value);
  }
  function adaptVariable(variable) {
    const valuesByMode = {};
    for (const [modeId, value] of Object.entries(variable.valuesByMode)) {
      valuesByMode[modeId] = adaptVariableValue(value);
    }
    return {
      id: variable.id,
      name: variable.name,
      variableCollectionId: variable.variableCollectionId,
      valuesByMode
    };
  }
  function adaptCollection(collection) {
    return {
      id: collection.id,
      name: collection.name
    };
  }
  function adaptTextStyle(style) {
    const boundVariables = {};
    const bv = style.boundVariables || {};
    for (const [key, binding] of Object.entries(bv)) {
      if (binding && typeof binding === "object" && "id" in binding) {
        boundVariables[key] = { id: binding.id };
      }
    }
    return {
      name: style.name,
      boundVariables
    };
  }
  function adaptColor(color) {
    return {
      r: color.r,
      g: color.g,
      b: color.b,
      a: "a" in color ? color.a : 1
    };
  }
  function adaptPaint(paint) {
    if (paint.type === "SOLID") {
      const solid = paint;
      return {
        type: "SOLID",
        color: adaptColor(solid.color),
        visible: solid.visible !== false
      };
    }
    return {
      type: paint.type,
      visible: paint.visible !== false
    };
  }
  function adaptEffect(effect) {
    const result = {
      type: effect.type,
      visible: "visible" in effect ? effect.visible !== false : true
    };
    if ((effect.type === "DROP_SHADOW" || effect.type === "INNER_SHADOW") && "color" in effect) {
      result.color = adaptColor(effect.color);
    }
    return result;
  }
  function adaptLineHeight(lh) {
    if (typeof lh === "symbol") return "MIXED";
    if (lh.unit === "AUTO") return { value: 0, unit: "AUTO" };
    return { value: lh.value, unit: lh.unit === "PERCENT" ? "PERCENT" : "PIXELS" };
  }
  function adaptLetterSpacing(ls) {
    if (typeof ls === "symbol") return "MIXED";
    return { value: ls.value, unit: ls.unit === "PERCENT" ? "PERCENT" : "PIXELS" };
  }
  function adaptBoundVariables(node) {
    const bv = node.boundVariables || {};
    const result = {};
    for (const [key, binding] of Object.entries(bv)) {
      if (Array.isArray(binding)) {
        result[key] = binding.map((b) => b && b.id ? { id: b.id } : void 0).filter(Boolean);
      } else if (binding && typeof binding === "object" && "id" in binding) {
        result[key] = { id: binding.id };
      }
    }
    return result;
  }
  function adaptNode(node) {
    const result = {
      id: node.id,
      name: node.name,
      type: node.type,
      boundVariables: adaptBoundVariables(node)
    };
    if ("fills" in node && Array.isArray(node.fills)) {
      result.fills = node.fills.map(adaptPaint);
    }
    if ("strokes" in node && Array.isArray(node.strokes)) {
      result.strokes = node.strokes.map(adaptPaint);
    }
    if ("effects" in node && Array.isArray(node.effects)) {
      result.effects = node.effects.map(adaptEffect);
    }
    if ("cornerRadius" in node) {
      const cr = node.cornerRadius;
      result.cornerRadius = typeof cr === "number" ? cr : "MIXED";
    }
    if ("layoutMode" in node) {
      result.layoutMode = node.layoutMode || "NONE";
    }
    if ("paddingTop" in node) result.paddingTop = node.paddingTop;
    if ("paddingRight" in node) result.paddingRight = node.paddingRight;
    if ("paddingBottom" in node) result.paddingBottom = node.paddingBottom;
    if ("paddingLeft" in node) result.paddingLeft = node.paddingLeft;
    if ("itemSpacing" in node) result.itemSpacing = node.itemSpacing;
    if (node.type === "TEXT") {
      const textNode = node;
      result.fontSize = typeof textNode.fontSize === "number" ? textNode.fontSize : "MIXED";
      const lh = textNode.lineHeight;
      if (lh && typeof lh === "object" && "unit" in lh) {
        result.lineHeight = adaptLineHeight(lh);
      }
      const ls = textNode.letterSpacing;
      if (ls && typeof ls === "object" && "unit" in ls) {
        result.letterSpacing = adaptLetterSpacing(ls);
      }
    }
    if ("children" in node) {
      result.children = node.children.map((child) => adaptNode(child));
    }
    return result;
  }
  async function fetchVariableData() {
    const rawCollections = await figma.variables.getLocalVariableCollectionsAsync();
    const rawVariables = await figma.variables.getLocalVariablesAsync();
    const rawTextStyles = await figma.getLocalTextStylesAsync();
    return {
      collections: rawCollections.map(adaptCollection),
      variables: rawVariables.map(adaptVariable),
      textStyles: rawTextStyles.map(adaptTextStyle)
    };
  }
  async function fetchComponents(onProgress) {
    const components = [];
    let nodesProcessed = 0;
    async function walk(node, pageName) {
      if (node.type === "COMPONENT" || node.type === "COMPONENT_SET") {
        components.push({ node: adaptNode(node), pageName });
        return;
      }
      if ("children" in node) {
        for (const child of node.children) {
          nodesProcessed++;
          if (nodesProcessed % 50 === 0) {
            await new Promise((resolve) => setTimeout(resolve, 0));
          }
          await walk(child, pageName);
        }
      }
    }
    onProgress == null ? void 0 : onProgress("Loading all pages...");
    await figma.loadAllPagesAsync();
    const totalPages = figma.root.children.length;
    for (let i = 0; i < totalPages; i++) {
      const page = figma.root.children[i];
      onProgress == null ? void 0 : onProgress(`Scanning page ${i + 1}/${totalPages}: "${page.name}"`);
      nodesProcessed = 0;
      for (const child of page.children) {
        await walk(child, page.name);
      }
    }
    return components;
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
  function validateCollectionStructure(collections, allVariables, requirements = DEFAULT_COLLECTION_REQUIREMENTS) {
    console.log("\u{1F50D} [COLLECTION] Starting collection structure validation...");
    const validatedCollections = [];
    const missingCollections = [];
    const auditChecks = [];
    try {
      console.log(`\u{1F50D} [COLLECTION] Found ${collections.length} local collections:`, collections.map((c) => c.name));
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
            status: "fail",
            suggestion: `No "${requirement.displayName}" collection found. Create one with these categories:

${examples}

This collection is required for a complete design system structure.`
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
                status: "fail",
                suggestion: `"${matchingCollection.name}" ${subResult.category} category is missing sub-categories: ${missingList}.

Add these variables to complete your ${subResult.category} scale:
${exampleVars}

Consistent sub-categories across all categories are required for a complete design system.`
              });
            }
            if (subResult.patternValidation) {
              const { patternDescription, examples } = subResult.patternValidation;
              if (subResult.found.length === 0) {
                const exampleVars = examples.slice(0, 3).map((ex) => `  - ${ex}`).join("\n");
                auditChecks.push({
                  check: `${requirement.displayName} ${subResult.category} naming`,
                  status: "fail",
                  suggestion: `"${matchingCollection.name}" ${subResult.category} category has no sub-categories following the expected naming pattern.

Expected pattern: ${patternDescription}

Add variables like:
${exampleVars}

Consistent naming is required for a predictable design system.`
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
                  status: "fail",
                  suggestion: `"${matchingCollection.name}" ${subResult.category} is missing sizes that exist in ${sourceCategory}: ${missingList}.

Add these variables to mirror your ${sourceCategory} scale:
${exampleVars}

Keeping ${subResult.category} and ${sourceCategory} synchronized is required for consistent typography.`
                });
              }
              if (extraSizes.length > 0) {
                const extraList = extraSizes.slice(0, 5).join(", ") + (extraSizes.length > 5 ? `, and ${extraSizes.length - 5} more` : "");
                auditChecks.push({
                  check: `${requirement.displayName} ${subResult.category} extra sizes`,
                  status: "fail",
                  suggestion: `"${matchingCollection.name}" ${subResult.category} has sizes that don't exist in ${sourceCategory}: ${extraList}.

Fix by either:
  - Adding these sizes to ${sourceCategory} (if they're needed)
  - Removing them from ${subResult.category} (if they're unused)

Matched scales are required for consistent typography.`
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
          status: "fail",
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
  function validateTextStylesAgainstVariables(collections, allVariables, textStyles) {
    const auditChecks = [];
    try {
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
            status: "fail",
            suggestion: `These font-family variables don't have matching text styles: ${varList}.

Create text styles using these patterns:
${exampleStyles}

All font-family variables must have matching text styles.`
          });
        }
        if (stylesMissingVariables.length > 0) {
          const styleList = stylesMissingVariables.slice(0, 3).join(", ") + (stylesMissingVariables.length > 3 ? `, and ${stylesMissingVariables.length - 3} more` : "");
          const exampleVars = stylesMissingVariables.slice(0, 3).map((s) => `  - font-family/${s}`).join("\n");
          auditChecks.push({
            check: "Font-family variables for text styles",
            status: "fail",
            suggestion: `These text style categories don't have matching font-family variables: ${styleList}.

Add these variables to your Theme collection:
${exampleVars}

Text styles must reference font-family variables dynamically.`
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
          status: "fail",
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
  function validateTextStyleBindings(textStyles, allVariables) {
    const auditChecks = [];
    const results = [];
    try {
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
          const cat = style.category;
          const sz = style.size;
          const propsDetail = s.unboundProps.map((prop) => {
            switch (prop) {
              case "fontFamily":
                return `  - ${prop} has a hard-coded value. Connect it to "font-family/${cat}" variable`;
              case "fontSize":
                return `  - ${prop} has a hard-coded value. Connect it to "font-size/${cat}/${sz}" variable`;
              case "lineHeight":
                return `  - ${prop} has a hard-coded value. Connect it to "line-height/${cat}/${sz}" variable`;
              case "letterSpacing":
                return `  - ${prop} has a hard-coded value. Connect it to "letter-spacing/${cat}/${sz}" variable`;
              default:
                return `  - ${prop} has a hard-coded value`;
            }
          });
          return `\u2022 Text style "${s.styleName}" (category: ${cat}, size: ${sz}):
${propsDetail.join("\n")}`;
        });
        auditChecks.push({
          check: "Text style variable bindings",
          status: "fail",
          suggestion: `${unboundIssues.length} text style(s) have hard-coded values instead of using theme variables:

${issueDescriptions.join("\n\n")}

To fix: Select each text style in Figma, then connect the listed properties to their corresponding variables using the variable binding feature.`
        });
      }
      if (bindingIssues.length > 0) {
        const issueDescriptions = bindingIssues.map((s) => {
          const nameParts = s.styleName.split("/");
          const cat = nameParts[0];
          const sz = nameParts.length >= 3 ? nameParts[1] : nameParts[nameParts.length - 1];
          const examples = s.incorrectBindings.map((b) => {
            const propType = b.prop;
            return `  - ${propType} is bound to "${b.actual}" but should contain "/${sz}" to match this text style's size`;
          });
          return `\u2022 Text style "${s.styleName}" (category: ${cat}, size: ${sz}):
${examples.join("\n")}`;
        });
        auditChecks.push({
          check: "Text style variable naming",
          status: "fail",
          suggestion: `${bindingIssues.length} text style(s) are connected to variables with mismatched size values:

${issueDescriptions.join("\n\n")}

Each text style must be bound to variables that match its size. For example, "heading/sm/light" should use "letter-spacing/heading/sm", not "letter-spacing/heading/md".`
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
          status: "fail",
          suggestion: `Could not validate text style bindings: ${error instanceof Error ? error.message : "Unknown error"}`
        }]
      };
    }
  }
  function isTransparentColor(color) {
    if (color.a === 0) return true;
    return false;
  }
  function formatColor(color) {
    const r = Math.round(color.r * 255);
    const g = Math.round(color.g * 255);
    const b = Math.round(color.b * 255);
    if (color.a < 1) {
      return `rgba(${r}, ${g}, ${b}, ${color.a.toFixed(2)})`;
    }
    return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
  }
  function checkNodeForRawValues(node) {
    const rawValues = [];
    const boundVars = node.boundVariables || {};
    if (node.fills && Array.isArray(node.fills)) {
      const fillBindings = boundVars.fills || [];
      node.fills.forEach((fill, index) => {
        if (fill.type === "SOLID" && fill.visible !== false) {
          const solidFill = fill;
          const hasBinding = fillBindings[index] && fillBindings[index].id;
          if (!hasBinding && !isTransparentColor(solidFill.color)) {
            rawValues.push({
              category: "fill",
              property: "fill color",
              value: formatColor(solidFill.color)
            });
          }
        }
      });
    }
    if (node.strokes && Array.isArray(node.strokes)) {
      const strokeBindings = boundVars.strokes || [];
      node.strokes.forEach((stroke, index) => {
        if (stroke.type === "SOLID" && stroke.visible !== false) {
          const solidStroke = stroke;
          const hasBinding = strokeBindings[index] && strokeBindings[index].id;
          if (!hasBinding && !isTransparentColor(solidStroke.color)) {
            rawValues.push({
              category: "stroke",
              property: "stroke color",
              value: formatColor(solidStroke.color)
            });
          }
        }
      });
    }
    if (typeof node.cornerRadius === "number" && node.cornerRadius > 0) {
      const binding = boundVars.cornerRadius;
      const hasBinding = binding && binding.id;
      if (!hasBinding) {
        rawValues.push({
          category: "cornerRadius",
          property: "corner radius",
          value: `${node.cornerRadius}px`
        });
      }
    }
    if (node.layoutMode && node.layoutMode !== "NONE") {
      const paddingProps = ["paddingTop", "paddingRight", "paddingBottom", "paddingLeft"];
      for (const prop of paddingProps) {
        const value = node[prop];
        if (typeof value === "number" && value > 0) {
          const binding = boundVars[prop];
          const hasBinding = binding && binding.id;
          if (!hasBinding) {
            rawValues.push({
              category: "spacing",
              property: prop,
              value: `${value}px`
            });
          }
        }
      }
      if (typeof node.itemSpacing === "number" && node.itemSpacing > 0) {
        const binding = boundVars.itemSpacing;
        const hasBinding = binding && binding.id;
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
      const typographyProps = ["fontSize", "lineHeight", "letterSpacing"];
      for (const prop of typographyProps) {
        const binding = boundVars[prop];
        const hasBinding = binding && binding.id;
        if (!hasBinding) {
          let value;
          if (prop === "fontSize") {
            value = typeof node.fontSize === "number" ? `${node.fontSize}px` : "mixed";
          } else if (prop === "lineHeight") {
            const lh = node.lineHeight;
            if (lh && typeof lh === "object" && "value" in lh) {
              value = lh.unit === "PERCENT" ? `${lh.value}%` : `${lh.value}px`;
            } else {
              value = "auto";
            }
          } else {
            const ls = node.letterSpacing;
            if (ls && typeof ls === "object" && "value" in ls) {
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
    if (node.effects && Array.isArray(node.effects)) {
      const effectBindings = boundVars.effects || [];
      node.effects.forEach((effect, index) => {
        if (effect.visible !== false) {
          const hasBinding = effectBindings[index] && effectBindings[index].id;
          if (!hasBinding) {
            let effectDesc = effect.type.toLowerCase().replace("_", " ");
            if ((effect.type === "DROP_SHADOW" || effect.type === "INNER_SHADOW") && effect.color) {
              effectDesc = `${effectDesc} (${formatColor(effect.color)})`;
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
    if (node.children) {
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
  function validateAllComponentBindings(components, onProgress) {
    const auditChecks = [];
    const results = [];
    try {
      console.log("\u{1F9E9} [COMPONENT BINDING] Starting validation...");
      console.log("\u{1F9E9} [COMPONENT BINDING] Found", components.length, "components");
      if (components.length === 0) {
        return { results, auditChecks };
      }
      const componentsWithIssues = [];
      const totalComponents = components.length;
      onProgress == null ? void 0 : onProgress(`${totalComponents} component${totalComponents !== 1 ? "s are" : " is"} being scanned, please wait patiently...`);
      for (let i = 0; i < totalComponents; i++) {
        const component = components[i];
        if (i % 10 === 0 || i === totalComponents - 1) {
          onProgress == null ? void 0 : onProgress(`Scanning ${totalComponents} component${totalComponents !== 1 ? "s" : ""}: ${i + 1}/${totalComponents} validated...`);
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
      onProgress == null ? void 0 : onProgress(`Completed scanning ${totalComponents} component${totalComponents !== 1 ? "s" : ""}!`);
      const compliantComponents = results.filter((r) => r.isFullyBound).length;
      for (const component of components) {
        const result = results.find((r) => r.componentName === component.node.name);
        if (!result) continue;
        if (result.isFullyBound) {
          auditChecks.push({
            check: `${result.componentName}`,
            status: "pass",
            suggestion: `Component uses theme variables for all visual properties`,
            pageName: component.pageName
          });
        } else {
          const comp = componentsWithIssues.find((c) => c.name === result.componentName);
          if (comp) {
            const issues = [];
            if (comp.counts.fill > 0) {
              issues.push(`- ${comp.counts.fill} fill color${comp.counts.fill > 1 ? "s" : ""} (should use color/* variables)`);
            }
            if (comp.counts.stroke > 0) {
              issues.push(`- ${comp.counts.stroke} stroke color${comp.counts.stroke > 1 ? "s" : ""} (should use color/* variables)`);
            }
            if (comp.counts.spacing > 0) {
              issues.push(`- ${comp.counts.spacing} spacing value${comp.counts.spacing > 1 ? "s" : ""} (should use space/* variables for padding/gap)`);
            }
            if (comp.counts.cornerRadius > 0) {
              issues.push(`- ${comp.counts.cornerRadius} corner radi${comp.counts.cornerRadius > 1 ? "i" : "us"} (should use radius/* variables)`);
            }
            if (comp.counts.typography > 0) {
              issues.push(`- ${comp.counts.typography} typography value${comp.counts.typography > 1 ? "s" : ""} (should use font-* variables)`);
            }
            if (comp.counts.effect > 0) {
              issues.push(`- ${comp.counts.effect} effect${comp.counts.effect > 1 ? "s" : ""} (should use effect/* variables)`);
            }
            auditChecks.push({
              check: `${result.componentName}`,
              status: "fail",
              suggestion: `${comp.totalRawValues} hard-coded value${comp.totalRawValues > 1 ? "s" : ""}:
${issues.join("\n")}

To fix: Select this component in Figma, then bind the listed properties to their corresponding variables in your Theme collection.`,
              pageName: component.pageName
            });
          }
        }
      }
      console.log("\u{1F9E9} [COMPONENT BINDING] Validation complete:", {
        total: totalComponents,
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

  // src/ui/message-handler.ts
  async function handleUIMessage(msg) {
    const { type } = msg;
    console.log("Received message:", type);
    try {
      switch (type) {
        case "analyze-system":
          await handleSystemAudit();
          break;
        case "analyze-variables-styles":
          await handleVariablesStylesAudit();
          break;
        case "analyze-components":
          await handleComponentsAudit();
          break;
        default:
          console.warn("Unknown message type:", type);
      }
    } catch (error) {
      console.error("Error handling message:", error);
      const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
      sendMessageToUI("system-audit-result", { error: errorMessage });
    }
  }
  async function handleSystemAudit() {
    try {
      console.log("\u{1F50D} Running CT/DS audit...");
      const data = await fetchVariableData();
      const collectionValidation = validateCollectionStructure(
        data.collections,
        data.variables
      );
      const textStyleSync = validateTextStylesAgainstVariables(
        data.collections,
        data.variables,
        data.textStyles
      );
      const textStyleBindings = validateTextStyleBindings(
        data.textStyles,
        data.variables
      );
      const progressCallback = (message) => {
        figma.ui.postMessage({ type: "audit-progress", data: { message } });
      };
      const components = await fetchComponents(progressCallback);
      const componentBindings = validateAllComponentBindings(
        components,
        progressCallback
      );
      const combinedTextStyleSync = [
        ...textStyleSync.auditChecks,
        ...textStyleBindings.auditChecks
      ];
      const allChecks = [
        ...collectionValidation.auditChecks,
        ...combinedTextStyleSync,
        ...componentBindings.auditChecks
      ];
      const overallStats = calculateAuditStats(allChecks);
      const collectionStats = calculateAuditStats(collectionValidation.auditChecks);
      const textStyleStats = calculateAuditStats(combinedTextStyleSync);
      const componentStats = calculateComponentStats(componentBindings.auditChecks);
      sendMessageToUI("system-audit-result", {
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
      console.log("\u2705 CT/DS audit complete");
    } catch (error) {
      console.error("\u274C CT/DS audit error:", error);
      sendMessageToUI("system-audit-result", {
        error: error instanceof Error ? error.message : "Unknown error during system audit"
      });
    }
  }
  async function handleVariablesStylesAudit() {
    try {
      console.log("\u{1F50D} Running Variables & Styles audit...");
      const data = await fetchVariableData();
      const collectionValidation = validateCollectionStructure(
        data.collections,
        data.variables
      );
      const textStyleSync = validateTextStylesAgainstVariables(
        data.collections,
        data.variables,
        data.textStyles
      );
      const textStyleBindings = validateTextStyleBindings(
        data.textStyles,
        data.variables
      );
      const combinedTextStyleSync = [
        ...textStyleSync.auditChecks,
        ...textStyleBindings.auditChecks
      ];
      const allChecks = [
        ...collectionValidation.auditChecks,
        ...combinedTextStyleSync
      ];
      const overallStats = calculateAuditStats(allChecks);
      const collectionStats = calculateAuditStats(collectionValidation.auditChecks);
      const textStyleStats = calculateAuditStats(combinedTextStyleSync);
      sendMessageToUI("variables-styles-audit-result", {
        collectionStructure: collectionValidation.auditChecks,
        textStyleSync: combinedTextStyleSync,
        scores: {
          overall: overallStats,
          collection: collectionStats,
          textStyle: textStyleStats
        }
      });
      console.log("\u2705 Variables & Styles audit complete");
    } catch (error) {
      console.error("\u274C Variables & Styles audit error:", error);
      sendMessageToUI("variables-styles-audit-result", {
        error: error instanceof Error ? error.message : "Unknown error during Variables & Styles audit"
      });
    }
  }
  async function handleComponentsAudit() {
    try {
      console.log("\u{1F50D} Running Components audit...");
      const progressCallback = (message) => {
        figma.ui.postMessage({ type: "audit-progress", data: { message } });
      };
      const components = await fetchComponents(progressCallback);
      const componentBindings = validateAllComponentBindings(
        components,
        progressCallback
      );
      const componentStats = calculateComponentStats(componentBindings.auditChecks);
      sendMessageToUI("components-audit-result", {
        componentBindings: componentBindings.auditChecks,
        scores: {
          component: componentStats
        }
      });
      console.log("\u2705 Components audit complete");
    } catch (error) {
      console.error("\u274C Components audit error:", error);
      sendMessageToUI("components-audit-result", {
        error: error instanceof Error ? error.message : "Unknown error during Components audit"
      });
    }
  }
  function calculateAuditStats(checks) {
    if (checks.length === 0) {
      return { score: 100, passed: 0, warnings: 0, failed: 0, total: 0 };
    }
    const passed = checks.filter((c) => c.status === "pass").length;
    const failed = checks.filter((c) => c.status === "fail").length;
    const total = checks.length;
    const score = Math.round(passed / total * 100);
    return { score, passed, warnings: 0, failed, total };
  }
  function calculateComponentStats(checks) {
    if (checks.length === 0) {
      return { score: 100, passed: 0, failed: 0, total: 0 };
    }
    const passed = checks.filter((c) => c.status === "pass").length;
    const failed = checks.filter((c) => c.status === "fail").length;
    const total = checks.length;
    const score = Math.round(passed / total * 100);
    return { score, passed, failed, total };
  }
  function initializePlugin() {
    console.log("\u{1F680} ctdsLint initialized (CT/DS Audit only)");
  }

  // src/code.ts
  var PLUGIN_WINDOW_SIZE = { width: 400, height: 700 };
  try {
    figma.showUI(__html__, PLUGIN_WINDOW_SIZE);
    console.log("\u2705 ctdsLint v3.0 - UI shown successfully");
  } catch (error) {
    console.log("\u2139\uFE0F UI might already be shown in inspect panel:", error);
  }
  figma.ui.onmessage = handleUIMessage;
  initializePlugin();
  console.log("\u{1F680} ctdsLint v3.0 initialized - CT/DS validation ready");
})();
