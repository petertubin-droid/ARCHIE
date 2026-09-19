import { SITE_URL } from "./seo";
/**
 * Material Shopping List Generator
 * Compiles all materials from a calculation into a checklist format.
 */

import type {
  CalculatorResult,
  CostEstimateResult,
  CalculatorInput,
  CostEstimateInput,
} from "@/types";
import { formatNumber, formatCurrency } from "@/lib/utils";

export interface ShoppingListItem {
  name: string;
  quantity: string;
  detail?: string;
  checked: boolean;
}

export function generatePaintShoppingList(
  result: CalculatorResult,
  input: CalculatorInput,
  paintTypeName: string,
): ShoppingListItem[] {
  const items: ShoppingListItem[] = [];

  // Paint containers
  for (const c of result.recommendedContainers) {
    items.push({
      name: `${paintTypeName} paint (${c.size} L)`,
      quantity: `${c.count} ${c.count > 1 ? "containers" : "container"}`,
      detail: `Total: ${formatNumber(c.count * c.size, 1)} L`,
      checked: false,
    });
  }

  // If no container recommendations, show total liters
  if (result.recommendedContainers.length === 0) {
    items.push({
      name: `${paintTypeName} paint`,
      quantity: `${formatNumber(result.totalRecommendedLiters, 1)} L`,
      detail: `Includes ${input.wasteMargin}% waste margin`,
      checked: false,
    });
  }

  // Primer (if multiple coats)
  if (input.coats > 1) {
    items.push({
      name: "Primer",
      quantity: "1 container",
      detail: "Recommended for multi-coat projects",
      checked: false,
    });
  }

  // Sandpaper
  items.push({
    name: "Sandpaper (fine grit)",
    quantity: "2-3 sheets",
    detail: "For surface preparation",
    checked: false,
  });

  // Brushes
  items.push({
    name: "Paint brushes",
    quantity: "2-3 brushes",
    detail: "Various sizes for edges and corners",
    checked: false,
  });

  // Rollers
  items.push({
    name: "Paint rollers + tray",
    quantity: "1-2 sets",
    detail: `For ${formatNumber(result.paintableArea)} m² of surface`,
    checked: false,
  });

  // Drop cloth / masking tape
  items.push({
    name: "Masking tape",
    quantity: "2-3 rolls",
    detail: "For protecting edges and fixtures",
    checked: false,
  });

  items.push({
    name: "Drop cloth / plastic sheet",
    quantity: "1-2 sheets",
    detail: "For floor protection",
    checked: false,
  });

  return items;
}

export function generateCostEstimateShoppingList(
  result: CostEstimateResult,
  input: CostEstimateInput,
  paintTypeName: string,
): ShoppingListItem[] {
  const items: ShoppingListItem[] = [];

  // Paint
  if (result.paintCost > 0) {
    if (result.paintContainerCount > 0) {
      items.push({
        name: `${paintTypeName} paint`,
        quantity: `${result.paintContainerCount} container(s)`,
        detail: `${formatCurrency(result.paintCost, result.currencySymbol)}`,
        checked: false,
      });
    } else {
      items.push({
        name: `${paintTypeName} paint`,
        quantity: `${formatNumber(input.paintLiters, 1)} L`,
        detail: `${formatCurrency(result.paintCost, result.currencySymbol)}`,
        checked: false,
      });
    }
  }

  if (result.primerCost > 0)
    items.push({
      name: "Primer",
      quantity: "1 unit",
      detail: formatCurrency(result.primerCost, result.currencySymbol),
      checked: false,
    });
  if (result.fillerCost > 0)
    items.push({
      name: "Filler",
      quantity: "1 unit",
      detail: formatCurrency(result.fillerCost, result.currencySymbol),
      checked: false,
    });
  if (result.puttyCost > 0)
    items.push({
      name: "Putty",
      quantity: "1 unit",
      detail: formatCurrency(result.puttyCost, result.currencySymbol),
      checked: false,
    });
  if (result.sandpaperCost > 0)
    items.push({
      name: "Sandpaper",
      quantity: "1 unit",
      detail: formatCurrency(result.sandpaperCost, result.currencySymbol),
      checked: false,
    });
  if (result.brushesCost > 0)
    items.push({
      name: "Brushes",
      quantity: "1 set",
      detail: formatCurrency(result.brushesCost, result.currencySymbol),
      checked: false,
    });
  if (result.rollersCost > 0)
    items.push({
      name: "Rollers",
      quantity: "1 set",
      detail: formatCurrency(result.rollersCost, result.currencySymbol),
      checked: false,
    });
  if (result.otherMaterialsCost > 0)
    items.push({
      name: "Other materials",
      quantity: "1 unit",
      detail: formatCurrency(result.otherMaterialsCost, result.currencySymbol),
      checked: false,
    });

  return items;
}

export function shoppingListToText(items: ShoppingListItem[]): string {
  const lines: string[] = ["📋 *FRELUX Shopping List*", ""];
  for (const item of items) {
    const check = item.checked ? "✅" : "☐";
    lines.push(`${check} ${item.quantity}, ${item.name}`);
    if (item.detail) lines.push(`    ${item.detail}`);
  }
  lines.push("");
  lines.push(`🔗 ${SITE_URL}`);
  return lines.join("\n");
}
