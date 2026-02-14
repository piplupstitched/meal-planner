/**
 * Seasonal ingredient awareness for meal planning.
 * Maps common produce/ingredients to their peak months.
 * Based on US seasonal availability (temperate climate).
 * Months: 1=Jan, 2=Feb, ..., 12=Dec
 */

export interface SeasonalEntry {
	months: number[];     // peak months
	category: string;     // produce type
}

// Comprehensive seasonal produce map
const SEASONAL_DATA: Record<string, SeasonalEntry> = {
	// ── Spring (Mar-May) ──
	'asparagus':         { months: [3, 4, 5], category: 'vegetable' },
	'artichoke':         { months: [3, 4, 5], category: 'vegetable' },
	'pea':               { months: [3, 4, 5, 6], category: 'vegetable' },
	'peas':              { months: [3, 4, 5, 6], category: 'vegetable' },
	'radish':            { months: [3, 4, 5], category: 'vegetable' },
	'rhubarb':           { months: [4, 5, 6], category: 'fruit' },
	'strawberry':        { months: [4, 5, 6], category: 'fruit' },
	'strawberries':      { months: [4, 5, 6], category: 'fruit' },

	// ── Summer (Jun-Aug) ──
	'tomato':            { months: [6, 7, 8, 9], category: 'vegetable' },
	'tomatoes':          { months: [6, 7, 8, 9], category: 'vegetable' },
	'cherry tomato':     { months: [6, 7, 8, 9], category: 'vegetable' },
	'cherry tomatoes':   { months: [6, 7, 8, 9], category: 'vegetable' },
	'zucchini':          { months: [6, 7, 8], category: 'vegetable' },
	'corn':              { months: [6, 7, 8, 9], category: 'vegetable' },
	'bell pepper':       { months: [6, 7, 8, 9], category: 'vegetable' },
	'bell peppers':      { months: [6, 7, 8, 9], category: 'vegetable' },
	'cucumber':          { months: [5, 6, 7, 8], category: 'vegetable' },
	'eggplant':          { months: [7, 8, 9], category: 'vegetable' },
	'green bean':        { months: [6, 7, 8], category: 'vegetable' },
	'green beans':       { months: [6, 7, 8], category: 'vegetable' },
	'peach':             { months: [6, 7, 8], category: 'fruit' },
	'peaches':           { months: [6, 7, 8], category: 'fruit' },
	'blueberry':         { months: [6, 7, 8], category: 'fruit' },
	'blueberries':       { months: [6, 7, 8], category: 'fruit' },
	'raspberry':         { months: [6, 7, 8], category: 'fruit' },
	'raspberries':       { months: [6, 7, 8], category: 'fruit' },
	'watermelon':        { months: [6, 7, 8], category: 'fruit' },
	'cantaloupe':        { months: [6, 7, 8], category: 'fruit' },
	'basil':             { months: [6, 7, 8, 9], category: 'herb' },
	'cilantro':          { months: [5, 6, 9, 10], category: 'herb' },
	'jalapeño':          { months: [6, 7, 8, 9], category: 'vegetable' },
	'okra':              { months: [6, 7, 8, 9], category: 'vegetable' },
	'avocado':           { months: [3, 4, 5, 6, 7, 8], category: 'fruit' },

	// ── Fall (Sep-Nov) ──
	'apple':             { months: [9, 10, 11], category: 'fruit' },
	'apples':            { months: [9, 10, 11], category: 'fruit' },
	'pumpkin':           { months: [9, 10, 11], category: 'vegetable' },
	'sweet potato':      { months: [9, 10, 11, 12], category: 'vegetable' },
	'sweet potatoes':    { months: [9, 10, 11, 12], category: 'vegetable' },
	'butternut squash':  { months: [9, 10, 11], category: 'vegetable' },
	'squash':            { months: [9, 10, 11], category: 'vegetable' },
	'spaghetti squash':  { months: [9, 10, 11], category: 'vegetable' },
	'brussels sprout':   { months: [9, 10, 11, 12], category: 'vegetable' },
	'brussels sprouts':  { months: [9, 10, 11, 12], category: 'vegetable' },
	'cranberry':         { months: [10, 11, 12], category: 'fruit' },
	'cranberries':       { months: [10, 11, 12], category: 'fruit' },
	'pear':              { months: [9, 10, 11], category: 'fruit' },
	'pears':             { months: [9, 10, 11], category: 'fruit' },
	'fig':               { months: [8, 9, 10], category: 'fruit' },
	'figs':              { months: [8, 9, 10], category: 'fruit' },
	'grape':             { months: [8, 9, 10], category: 'fruit' },
	'grapes':            { months: [8, 9, 10], category: 'fruit' },
	'cauliflower':       { months: [9, 10, 11], category: 'vegetable' },
	'turnip':            { months: [10, 11, 12], category: 'vegetable' },
	'parsnip':           { months: [10, 11, 12, 1, 2], category: 'vegetable' },

	// ── Winter (Dec-Feb) ──
	'citrus':            { months: [12, 1, 2, 3], category: 'fruit' },
	'orange':            { months: [12, 1, 2, 3], category: 'fruit' },
	'oranges':           { months: [12, 1, 2, 3], category: 'fruit' },
	'grapefruit':        { months: [12, 1, 2, 3], category: 'fruit' },
	'lemon':             { months: [12, 1, 2, 3], category: 'fruit' },
	'lemons':            { months: [12, 1, 2, 3], category: 'fruit' },
	'lime':              { months: [5, 6, 7, 8, 9, 10], category: 'fruit' },
	'kale':              { months: [10, 11, 12, 1, 2, 3], category: 'vegetable' },
	'collard greens':    { months: [11, 12, 1, 2], category: 'vegetable' },
	'cabbage':           { months: [10, 11, 12, 1, 2, 3], category: 'vegetable' },
	'beet':              { months: [6, 7, 8, 9, 10], category: 'vegetable' },
	'beets':             { months: [6, 7, 8, 9, 10], category: 'vegetable' },
	'celery':            { months: [9, 10, 11], category: 'vegetable' },
	'pomegranate':       { months: [10, 11, 12, 1], category: 'fruit' },

	// ── Year-round staples (no bonus, but listed for reference) ──
	'onion':             { months: [1,2,3,4,5,6,7,8,9,10,11,12], category: 'vegetable' },
	'red onion':         { months: [1,2,3,4,5,6,7,8,9,10,11,12], category: 'vegetable' },
	'garlic':            { months: [1,2,3,4,5,6,7,8,9,10,11,12], category: 'vegetable' },
	'potato':            { months: [1,2,3,4,5,6,7,8,9,10,11,12], category: 'vegetable' },
	'potatoes':          { months: [1,2,3,4,5,6,7,8,9,10,11,12], category: 'vegetable' },
	'carrot':            { months: [1,2,3,4,5,6,7,8,9,10,11,12], category: 'vegetable' },
	'carrots':           { months: [1,2,3,4,5,6,7,8,9,10,11,12], category: 'vegetable' },
	'spinach':           { months: [3, 4, 5, 9, 10, 11], category: 'vegetable' },
	'lettuce':           { months: [3, 4, 5, 9, 10, 11], category: 'vegetable' },
	'broccoli':          { months: [10, 11, 12, 1, 2, 3], category: 'vegetable' },
	'mushroom':          { months: [9, 10, 11, 12, 1, 2, 3], category: 'vegetable' },
	'mushrooms':         { months: [9, 10, 11, 12, 1, 2, 3], category: 'vegetable' },
	'ginger':            { months: [1,2,3,4,5,6,7,8,9,10,11,12], category: 'spice' },

	// ── Proteins (seasonal availability) ──
	'shrimp':            { months: [4, 5, 6, 7, 8, 9, 10], category: 'seafood' },
	'salmon':            { months: [5, 6, 7, 8, 9], category: 'seafood' },
	'crab':              { months: [10, 11, 12, 1], category: 'seafood' },
};

export class SeasonalHelper {
	/**
	 * Get the current month (1-12).
	 */
	getCurrentMonth(): number {
		return new Date().getMonth() + 1;
	}

	/**
	 * Check if an ingredient is in season for a given month.
	 */
	isInSeason(ingredientName: string, month?: number): boolean {
		const m = month ?? this.getCurrentMonth();
		const entry = this.findEntry(ingredientName);
		if (!entry) return false;
		// Year-round items (12 months) don't count as "seasonal"
		if (entry.months.length >= 12) return false;
		return entry.months.includes(m);
	}

	/**
	 * Get the seasonal score for a recipe (0-1).
	 * Higher = more ingredients currently in season.
	 */
	getRecipeSeasonalScore(ingredientNames: string[], month?: number): number {
		const m = month ?? this.getCurrentMonth();
		let seasonalCount = 0;
		let seasonalTotal = 0;

		for (const name of ingredientNames) {
			const entry = this.findEntry(name);
			if (!entry || entry.months.length >= 12) continue;
			// This is a seasonal ingredient
			seasonalTotal++;
			if (entry.months.includes(m)) {
				seasonalCount++;
			}
		}

		if (seasonalTotal === 0) return 0.5; // neutral if no seasonal ingredients
		return seasonalCount / seasonalTotal;
	}

	/**
	 * Get which ingredients in a recipe are currently in season.
	 */
	getInSeasonIngredients(ingredientNames: string[], month?: number): string[] {
		const m = month ?? this.getCurrentMonth();
		return ingredientNames.filter(name => this.isInSeason(name, m));
	}

	/**
	 * Get which ingredients in a recipe are out of season.
	 */
	getOutOfSeasonIngredients(ingredientNames: string[], month?: number): string[] {
		const m = month ?? this.getCurrentMonth();
		return ingredientNames.filter(name => {
			const entry = this.findEntry(name);
			if (!entry || entry.months.length >= 12) return false;
			return !entry.months.includes(m);
		});
	}

	/**
	 * Get a seasonal label for the current month.
	 */
	getSeasonLabel(month?: number): string {
		const m = month ?? this.getCurrentMonth();
		if (m >= 3 && m <= 5) return 'Spring';
		if (m >= 6 && m <= 8) return 'Summer';
		if (m >= 9 && m <= 11) return 'Fall';
		return 'Winter';
	}

	/**
	 * Fuzzy lookup: try exact match, then partial match on the seasonal data keys.
	 */
	private findEntry(ingredientName: string): SeasonalEntry | null {
		const lower = ingredientName.toLowerCase().trim();

		// Direct match
		if (SEASONAL_DATA[lower]) return SEASONAL_DATA[lower];

		// Partial match: check if ingredient contains a seasonal keyword
		for (const [key, entry] of Object.entries(SEASONAL_DATA)) {
			if (lower.includes(key) || key.includes(lower)) {
				return entry;
			}
		}

		return null;
	}
}
