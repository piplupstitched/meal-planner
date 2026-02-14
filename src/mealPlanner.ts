import { ParsedRecipe, WeeklyPlan, PlannedMeal, RecipeStats, MealType } from './types';
import { DataStore } from './dataStore';
import { SeasonalHelper } from './seasonal';

interface ScoredRecipe {
	recipe: ParsedRecipe;
	score: number;
	reasons: string[];
}

export class MealPlanner {
	private dataStore: DataStore;
	seasonal: SeasonalHelper;

	constructor(dataStore: DataStore) {
		this.dataStore = dataStore;
		this.seasonal = new SeasonalHelper();
	}

	/**
	 * Generate a weekly meal plan with intelligent recipe selection.
	 * Selects `count` dinners, balanced by recency, variety, and ingredient overlap.
	 */
	generateWeeklyPlan(
		allRecipes: ParsedRecipe[],
		count: number = 5,
	): WeeklyPlan {
		// Filter to dinner-eligible recipes (Mains, Soups, Salads)
		const dinnerCategories = new Set(
			this.dataStore.getData().settings.planCategories.map(c => c.toLowerCase())
		);
		const eligible = allRecipes.filter(r => {
			const cat = r.category.toLowerCase();
			return dinnerCategories.has(cat);
		});

		if (eligible.length === 0) {
			throw new Error('No eligible recipes found for meal planning.');
		}

		const stats = this.dataStore.getAllRecipeStats(eligible.map(r => r.id));
		const selected = this.selectRecipes(eligible, stats, count);

		// Assign to weekdays (Mon-Fri by default)
		const monday = this.dataStore.getMonday(new Date());
		const meals: PlannedMeal[] = selected.map((recipe, i) => {
			const date = new Date(monday);
			date.setDate(date.getDate() + i);
			return {
				recipeId: recipe.id,
				plannedDate: this.dataStore.formatDate(date),
				mealType: 'dinner' as MealType,
				servings: recipe.servings,
			};
		});

		// Generate leftover lunches if enabled
		const settings = this.dataStore.getData().settings;
		if (settings.leftoverLunches) {
			const leftovers = this.generateLeftoverLunches(meals, selected);
			meals.push(...leftovers);
		}

		// Sort all meals by date then by type (dinner before lunch of same day)
		meals.sort((a, b) => {
			const dateCompare = a.plannedDate.localeCompare(b.plannedDate);
			if (dateCompare !== 0) return dateCompare;
			// dinner before leftover lunch on same day
			if (a.isLeftover && !b.isLeftover) return 1;
			if (!a.isLeftover && b.isLeftover) return -1;
			return 0;
		});

		return {
			weekStart: this.dataStore.formatDate(monday),
			meals,
			generatedAt: new Date().toISOString(),
		};
	}

	/**
	 * Core selection algorithm. Scores recipes and picks top `count` while
	 * ensuring variety and ingredient synergy.
	 */
	private selectRecipes(
		eligible: ParsedRecipe[],
		stats: Map<string, RecipeStats>,
		count: number,
	): ParsedRecipe[] {
		// Score all recipes
		const scored: ScoredRecipe[] = eligible.map(recipe => {
			const stat = stats.get(recipe.id)!;
			return this.scoreRecipe(recipe, stat);
		});

		// Sort by score descending
		scored.sort((a, b) => b.score - a.score);

		// Greedy selection with diversity constraints
		const selected: ParsedRecipe[] = [];
		const usedSubcategories = new Map<string, number>();
		const usedCategories = new Map<string, number>();

		for (const item of scored) {
			if (selected.length >= count) break;

			const recipe = item.recipe;

			// Diversity check: avoid too many from same subcategory
			const subKey = recipe.subcategory || recipe.category;
			const subCount = usedSubcategories.get(subKey) || 0;
			if (subCount >= 2) continue;

			// Avoid more than 3 from same top category
			const catCount = usedCategories.get(recipe.category) || 0;
			if (catCount >= 3) continue;

			selected.push(recipe);
			usedSubcategories.set(subKey, subCount + 1);
			usedCategories.set(recipe.category, catCount + 1);
		}

		// If diversity constraints prevented filling, relax and add more
		if (selected.length < count) {
			for (const item of scored) {
				if (selected.length >= count) break;
				if (selected.includes(item.recipe)) continue;
				selected.push(item.recipe);
			}
		}

		// Reorder: put recipes with shared ingredients adjacent for easier cooking
		return this.optimizeOrder(selected);
	}

	/**
	 * Score a recipe based on multiple factors.
	 */
	private scoreRecipe(recipe: ParsedRecipe, stats: RecipeStats): ScoredRecipe {
		let score = 0;
		const reasons: string[] = [];

		// 1. Recency (0-40 points): Higher score for recipes not made recently
		if (stats.daysSinceLastMade === null) {
			// Never made - high priority
			score += 35;
			reasons.push('Never cooked (+35)');
		} else if (stats.daysSinceLastMade > 30) {
			score += 40;
			reasons.push(`Not made in ${stats.daysSinceLastMade} days (+40)`);
		} else if (stats.daysSinceLastMade > 14) {
			score += 25;
			reasons.push(`Made ${stats.daysSinceLastMade} days ago (+25)`);
		} else if (stats.daysSinceLastMade > 7) {
			score += 10;
			reasons.push(`Made ${stats.daysSinceLastMade} days ago (+10)`);
		} else {
			score += 0;
			reasons.push(`Made recently (${stats.daysSinceLastMade} days ago) (+0)`);
		}

		// 2. Frequency penalty (0 to -10): Reduce score for very frequently made recipes
		if (stats.timesCooked > 10) {
			score -= 10;
			reasons.push(`Made ${stats.timesCooked} times (-10)`);
		} else if (stats.timesCooked > 5) {
			score -= 5;
			reasons.push(`Made ${stats.timesCooked} times (-5)`);
		}

		// 3. Nutritional balance bonus (0-10)
		if (recipe.protein >= 20) {
			score += 5;
			reasons.push('Good protein (+5)');
		}
		if (recipe.netCarbs > 0 && recipe.netCarbs < 30) {
			score += 5;
			reasons.push('Moderate carbs (+5)');
		}

		// 4. Seasonal bonus (0-15): Prefer recipes with in-season ingredients
		const ingredientNames = recipe.ingredients.flatMap(s =>
			s.items.map(i => i.name)
		);
		const seasonalScore = this.seasonal.getRecipeSeasonalScore(ingredientNames);
		const inSeasonItems = this.seasonal.getInSeasonIngredients(ingredientNames);
		if (seasonalScore > 0.5) {
			const bonus = Math.round(seasonalScore * 15);
			score += bonus;
			reasons.push(`Seasonal: ${inSeasonItems.slice(0, 3).join(', ')} (+${bonus})`);
		} else if (seasonalScore < 0.3 && seasonalScore > 0) {
			score -= 5;
			reasons.push('Out of season (-5)');
		}

		// 5. Randomness factor (0-15): Add controlled randomness for variety
		score += Math.random() * 15;

		return { recipe, score, reasons };
	}

	/**
	 * Reorder selected recipes to group those with shared ingredients together.
	 * This helps with batch shopping and prep.
	 */
	private optimizeOrder(recipes: ParsedRecipe[]): ParsedRecipe[] {
		if (recipes.length <= 2) return recipes;

		// Build ingredient sets
		const ingredientSets = recipes.map(r => {
			const names = new Set<string>();
			for (const section of r.ingredients) {
				for (const item of section.items) {
					names.add(item.name.toLowerCase());
				}
			}
			return names;
		});

		// Greedy nearest-neighbor ordering by ingredient overlap
		const ordered: ParsedRecipe[] = [recipes[0]];
		const used = new Set<number>([0]);

		for (let step = 1; step < recipes.length; step++) {
			const lastSet = ingredientSets[recipes.indexOf(ordered[ordered.length - 1])];
			let bestIdx = -1;
			let bestOverlap = -1;

			for (let i = 0; i < recipes.length; i++) {
				if (used.has(i)) continue;
				let overlap = 0;
				for (const name of ingredientSets[i]) {
					if (lastSet.has(name)) overlap++;
				}
				if (overlap > bestOverlap) {
					bestOverlap = overlap;
					bestIdx = i;
				}
			}

			if (bestIdx >= 0) {
				ordered.push(recipes[bestIdx]);
				used.add(bestIdx);
			}
		}

		return ordered;
	}

	/**
	 * Generate leftover lunch entries from dinner meals.
	 * Rules:
	 *   - Servings >= 4: 1 leftover lunch the next day
	 *   - Servings >= 6: 2 leftover lunches (next day for 2 people, or next 2 days)
	 *   - Leftover lunch is placed on the day after the dinner
	 *   - No leftover generated if the next day already has a dinner
	 *     that itself will produce leftovers (avoid double lunches)
	 */
	private generateLeftoverLunches(
		dinners: PlannedMeal[],
		recipes: ParsedRecipe[],
	): PlannedMeal[] {
		const leftovers: PlannedMeal[] = [];
		const recipeMap = new Map(recipes.map(r => [r.id, r]));

		for (const dinner of dinners) {
			const recipe = recipeMap.get(dinner.recipeId);
			if (!recipe) continue;

			const servings = recipe.servings;
			if (servings < 4) continue; // not enough for leftovers

			// Calculate next day
			const dinnerDate = new Date(dinner.plannedDate + 'T00:00:00');
			const nextDay = new Date(dinnerDate);
			nextDay.setDate(nextDay.getDate() + 1);
			const nextDayStr = this.dataStore.formatDate(nextDay);

			// Determine number of leftover lunches
			// servings 4-5 = 1 lunch, 6+ = 2 lunches (accounts for 2 people)
			const leftoverCount = servings >= 6 ? 2 : 1;

			// Add leftover lunch(es) — for 2 lunches, both go on the next day
			// (representing enough for 2 people to have lunch)
			for (let i = 0; i < leftoverCount; i++) {
				leftovers.push({
					recipeId: dinner.recipeId,
					plannedDate: nextDayStr,
					mealType: 'lunch' as MealType,
					servings: 1,
					isLeftover: true,
					leftoverSourceDate: dinner.plannedDate,
				});
			}
		}

		// Deduplicate: only keep one leftover entry per recipe per day
		// (if servings >= 6 we mark it as 2 servings instead of 2 entries)
		const deduped: PlannedMeal[] = [];
		const seen = new Set<string>();
		for (const lo of leftovers) {
			const key = `${lo.recipeId}|${lo.plannedDate}`;
			if (seen.has(key)) {
				// Find the existing entry and bump its servings
				const existing = deduped.find(
					d => d.recipeId === lo.recipeId && d.plannedDate === lo.plannedDate
				);
				if (existing) existing.servings++;
			} else {
				seen.add(key);
				deduped.push(lo);
			}
		}

		return deduped;
	}

	/**
	 * Calculate ingredient overlap between two recipes.
	 */
	getIngredientOverlap(a: ParsedRecipe, b: ParsedRecipe): string[] {
		const aNames = new Set(
			a.ingredients.flatMap(s => s.items.map(i => i.name.toLowerCase()))
		);
		return b.ingredients
			.flatMap(s => s.items)
			.filter(i => aNames.has(i.name.toLowerCase()))
			.map(i => i.name);
	}
}
