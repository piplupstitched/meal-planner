import { Plugin } from 'obsidian';
import {
	MealPlannerData,
	DEFAULT_DATA,
	CookedMeal,
	WeeklyPlan,
	RecipeStats,
	StoreName,
	GroceryCategory,
	MealType,
} from './types';

export class DataStore {
	private plugin: Plugin;
	private data: MealPlannerData;

	constructor(plugin: Plugin) {
		this.plugin = plugin;
		this.data = { ...DEFAULT_DATA };
	}

	async load(): Promise<void> {
		const saved = await this.plugin.loadData();
		if (saved) {
			this.data = { ...DEFAULT_DATA, ...saved };
		}
	}

	async save(): Promise<void> {
		await this.plugin.saveData(this.data);
	}

	getData(): MealPlannerData {
		return this.data;
	}

	// ── Settings ──

	getRecipeFolderPath(): string {
		return this.data.settings.recipeFolderPath;
	}

	async updateSettings(partial: Partial<MealPlannerData['settings']>): Promise<void> {
		this.data.settings = { ...this.data.settings, ...partial };
		await this.save();
	}

	// ── Cooked Meals ──

	getCookedMeals(): CookedMeal[] {
		return this.data.cookedMeals;
	}

	async addCookedMeal(meal: CookedMeal): Promise<void> {
		this.data.cookedMeals.push(meal);
		await this.save();
	}

	async removeCookedMeal(recipeId: string, date: string): Promise<void> {
		this.data.cookedMeals = this.data.cookedMeals.filter(
			m => !(m.recipeId === recipeId && m.cookedDate === date)
		);
		await this.save();
	}

	// ── Weekly Plans ──

	getWeeklyPlans(): WeeklyPlan[] {
		return this.data.weeklyPlans;
	}

	getCurrentWeekPlan(): WeeklyPlan | null {
		const monday = this.getMonday(new Date());
		const mondayStr = this.formatDate(monday);
		return this.data.weeklyPlans.find(p => p.weekStart === mondayStr) || null;
	}

	async saveWeeklyPlan(plan: WeeklyPlan): Promise<void> {
		// Replace existing plan for the same week, or add new
		const idx = this.data.weeklyPlans.findIndex(p => p.weekStart === plan.weekStart);
		if (idx >= 0) {
			this.data.weeklyPlans[idx] = plan;
		} else {
			this.data.weeklyPlans.push(plan);
		}
		// Keep only last 12 weeks of plans
		this.data.weeklyPlans.sort((a, b) => b.weekStart.localeCompare(a.weekStart));
		if (this.data.weeklyPlans.length > 12) {
			this.data.weeklyPlans = this.data.weeklyPlans.slice(0, 12);
		}
		await this.save();
	}

	async markMealCooked(recipeId: string, plannedDate: string, mealType: MealType): Promise<void> {
		await this.addCookedMeal({
			recipeId,
			cookedDate: plannedDate,
			mealType,
		});
	}

	// ── Recipe Stats ──

	getRecipeStats(recipeId: string): RecipeStats {
		const cooked = this.data.cookedMeals.filter(m => m.recipeId === recipeId);
		const timesCooked = cooked.length;

		let lastCooked: string | null = null;
		let daysSinceLastMade: number | null = null;

		if (timesCooked > 0) {
			const dates = cooked.map(m => m.cookedDate).sort();
			lastCooked = dates[dates.length - 1];
			const lastDate = new Date(lastCooked);
			const now = new Date();
			daysSinceLastMade = Math.floor(
				(now.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24)
			);
		}

		return { recipeId, lastCooked, timesCooked, daysSinceLastMade };
	}

	getAllRecipeStats(recipeIds: string[]): Map<string, RecipeStats> {
		const statsMap = new Map<string, RecipeStats>();
		for (const id of recipeIds) {
			statsMap.set(id, this.getRecipeStats(id));
		}
		return statsMap;
	}

	// ── Grocery Store Assignments ──

	getStoreAssignment(ingredientName: string): StoreName {
		return this.data.groceryStoreAssignments[ingredientName.toLowerCase()] || 'Any';
	}

	async setStoreAssignment(ingredientName: string, store: StoreName): Promise<void> {
		this.data.groceryStoreAssignments[ingredientName.toLowerCase()] = store;
		await this.save();
	}

	// ── Ingredient Categories ──

	getIngredientCategory(ingredientName: string): GroceryCategory {
		return this.data.ingredientCategories[ingredientName.toLowerCase()] || this.guessCategory(ingredientName);
	}

	async setIngredientCategory(ingredientName: string, category: GroceryCategory): Promise<void> {
		this.data.ingredientCategories[ingredientName.toLowerCase()] = category;
		await this.save();
	}

	// ── Utilities ──

	private guessCategory(name: string): GroceryCategory {
		const lower = name.toLowerCase();
		const produce = ['avocado', 'tomato', 'onion', 'garlic', 'cilantro', 'lime', 'lemon',
			'pepper', 'lettuce', 'spinach', 'broccoli', 'carrot', 'celery', 'cucumber',
			'jalapeño', 'ginger', 'basil', 'rosemary', 'thyme', 'parsley', 'scallion',
			'cherry tomato', 'red onion', 'green onion', 'bell pepper', 'zucchini',
			'squash', 'potato', 'sweet potato', 'mushroom', 'corn', 'cabbage', 'kale'];
		const protein = ['chicken', 'beef', 'pork', 'shrimp', 'salmon', 'fish', 'turkey',
			'sausage', 'bacon', 'tenderloin', 'ground', 'steak', 'roast'];
		const dairy = ['cheese', 'cream cheese', 'milk', 'butter', 'yogurt', 'sour cream',
			'cream', 'cheddar', 'mozzarella', 'parmesan', 'feta', 'cottage cheese', 'egg'];
		const spices = ['salt', 'pepper', 'cumin', 'paprika', 'chili powder', 'oregano',
			'cinnamon', 'nutmeg', 'cayenne', 'turmeric', 'garlic powder', 'onion powder'];
		const bakery = ['tortilla', 'bread', 'bun', 'roll', 'pita', 'naan', 'wrap'];
		const frozen = ['frozen'];

		if (produce.some(p => lower.includes(p))) return 'produce';
		if (protein.some(p => lower.includes(p))) return 'protein';
		if (dairy.some(p => lower.includes(p))) return 'dairy';
		if (spices.some(p => lower.includes(p))) return 'spices';
		if (bakery.some(p => lower.includes(p))) return 'bakery';
		if (frozen.some(p => lower.includes(p))) return 'frozen';
		return 'pantry';
	}

	getMonday(date: Date): Date {
		const d = new Date(date);
		const day = d.getDay();
		const diff = d.getDate() - day + (day === 0 ? -6 : 1);
		d.setDate(diff);
		d.setHours(0, 0, 0, 0);
		return d;
	}

	formatDate(date: Date): string {
		return date.toISOString().split('T')[0];
	}

	getDayName(dateStr: string): string {
		const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
		return days[new Date(dateStr + 'T00:00:00').getDay()];
	}
}
