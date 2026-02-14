import { ParsedRecipe, GroceryItem, GroceryCategory, StoreName } from './types';
import { DataStore } from './dataStore';

export class GroceryListGenerator {
	private dataStore: DataStore;

	constructor(dataStore: DataStore) {
		this.dataStore = dataStore;
	}

	/**
	 * Generate a consolidated grocery list from selected recipes.
	 */
	generate(recipes: ParsedRecipe[]): GroceryItem[] {
		const consolidated = new Map<string, GroceryItem>();

		for (const recipe of recipes) {
			for (const section of recipe.ingredients) {
				// Skip "Sides (if applicable)" — these are optional suggestions
				if (section.heading.toLowerCase().includes('sides')) continue;

				for (const item of section.items) {
					const key = item.name.toLowerCase();

					if (consolidated.has(key)) {
						const existing = consolidated.get(key)!;
						existing.quantity = this.combineQuantities(
							existing.quantity,
							item.quantity || '',
							existing.unit,
							item.unit || ''
						);
						if (!existing.fromRecipes.includes(recipe.title)) {
							existing.fromRecipes.push(recipe.title);
						}
					} else {
						consolidated.set(key, {
							name: item.name,
							quantity: item.quantity || '',
							unit: item.unit || '',
							category: this.dataStore.getIngredientCategory(item.name),
							store: this.dataStore.getStoreAssignment(item.name),
							fromRecipes: [recipe.title],
							checked: false,
						});
					}
				}
			}
		}

		// Sort by category, then name
		const items = Array.from(consolidated.values());
		items.sort((a, b) => {
			const catOrder = this.categoryOrder(a.category) - this.categoryOrder(b.category);
			if (catOrder !== 0) return catOrder;
			return a.name.localeCompare(b.name);
		});

		return items;
	}

	/**
	 * Group grocery items by category for display.
	 */
	groupByCategory(items: GroceryItem[]): Map<GroceryCategory, GroceryItem[]> {
		const groups = new Map<GroceryCategory, GroceryItem[]>();
		for (const item of items) {
			if (!groups.has(item.category)) {
				groups.set(item.category, []);
			}
			groups.get(item.category)!.push(item);
		}
		return groups;
	}

	/**
	 * Group grocery items by store assignment.
	 */
	groupByStore(items: GroceryItem[]): Map<StoreName, GroceryItem[]> {
		const groups = new Map<StoreName, GroceryItem[]>();
		for (const item of items) {
			if (!groups.has(item.store)) {
				groups.set(item.store, []);
			}
			groups.get(item.store)!.push(item);
		}
		return groups;
	}

	/**
	 * Combine quantities when consolidating the same ingredient.
	 */
	private combineQuantities(
		q1: string, q2: string,
		u1: string, u2: string
	): string {
		if (!q1 && !q2) return '';
		if (!q1) return q2;
		if (!q2) return q1;

		// If same unit, try to add numerically
		if (u1.toLowerCase() === u2.toLowerCase() || (!u1 && !u2)) {
			const n1 = this.parseQuantity(q1);
			const n2 = this.parseQuantity(q2);
			if (n1 > 0 && n2 > 0) {
				const sum = n1 + n2;
				return sum % 1 === 0 ? String(sum) : sum.toFixed(1);
			}
		}

		// Different units or unparseable — just concatenate
		const part1 = u1 ? `${q1} ${u1}` : q1;
		const part2 = u2 ? `${q2} ${u2}` : q2;
		return `${part1} + ${part2}`;
	}

	/**
	 * Parse fraction/unicode quantities to numeric values.
	 */
	private parseQuantity(q: string): number {
		const cleaned = q.trim();
		// Handle unicode fractions
		const unicodeFractions: Record<string, number> = {
			'½': 0.5, '¼': 0.25, '¾': 0.75,
			'⅓': 0.333, '⅔': 0.667, '⅛': 0.125,
		};

		for (const [char, val] of Object.entries(unicodeFractions)) {
			if (cleaned.includes(char)) {
				const prefix = cleaned.replace(char, '').trim();
				const whole = prefix ? parseFloat(prefix) : 0;
				return (isNaN(whole) ? 0 : whole) + val;
			}
		}

		// Handle "1/2", "1/4" style fractions
		const fracMatch = cleaned.match(/^(\d+)\s*\/\s*(\d+)$/);
		if (fracMatch) {
			return parseInt(fracMatch[1]) / parseInt(fracMatch[2]);
		}

		// Handle "1 1/2" mixed fractions
		const mixedMatch = cleaned.match(/^(\d+)\s+(\d+)\s*\/\s*(\d+)$/);
		if (mixedMatch) {
			return parseInt(mixedMatch[1]) + parseInt(mixedMatch[2]) / parseInt(mixedMatch[3]);
		}

		// Handle ranges "1-2" — take the higher value
		const rangeMatch = cleaned.match(/^([\d.]+)\s*[–\-]\s*([\d.]+)$/);
		if (rangeMatch) {
			return parseFloat(rangeMatch[2]);
		}

		const num = parseFloat(cleaned);
		return isNaN(num) ? 0 : num;
	}

	private categoryOrder(cat: GroceryCategory): number {
		const order: Record<GroceryCategory, number> = {
			produce: 0,
			protein: 1,
			dairy: 2,
			bakery: 3,
			frozen: 4,
			spices: 5,
			pantry: 6,
			other: 7,
		};
		return order[cat] ?? 99;
	}
}
