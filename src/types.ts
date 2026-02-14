// ── Recipe Types ──

export interface RecipeFrontmatter {
	title: string;
	servings: string;
	prep_time: string;
	cook_time: string;
	total_time?: string;
	difficulty?: string;
	meal_type: string[];
	calories_per_serving: string | number;
	net_carbs: string;
	protein: string;
	fiber?: string;
	sugar?: string;
	diet: string[];
	source: string;
	tags: string[];
	equipment?: string[];
	freezer_friendly?: string;
	reheat?: string;
}

export interface IngredientItem {
	raw: string;
	quantity?: string;
	unit?: string;
	name: string;
}

export interface IngredientSection {
	heading: string;
	items: IngredientItem[];
}

export interface ParsedRecipe {
	id: string;               // relative path from vault root
	filePath: string;          // full vault-relative path
	title: string;
	category: string;          // top-level folder (Mains, Salads, etc.)
	subcategory: string;       // subfolder if exists (Chicken, Beef, etc.)
	frontmatter: RecipeFrontmatter;
	ingredients: IngredientSection[];
	servings: number;
	caloriesPerServing: number;
	netCarbs: number;
	protein: number;
}

// ── Meal Planning Types ──

export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';

export interface PlannedMeal {
	recipeId: string;
	plannedDate: string;       // ISO date string YYYY-MM-DD
	mealType: MealType;
	servings: number;
	isLeftover?: boolean;       // true if this is a leftover from a previous dinner
	leftoverSourceDate?: string; // the dinner date this leftover comes from
}

export interface CookedMeal {
	recipeId: string;
	cookedDate: string;        // ISO date string YYYY-MM-DD
	mealType: MealType;
	notes?: string;
}

export interface RecipeStats {
	recipeId: string;
	lastCooked: string | null;
	timesCooked: number;
	daysSinceLastMade: number | null;
}

export interface WeeklyPlan {
	weekStart: string;         // ISO date of Monday
	meals: PlannedMeal[];
	generatedAt: string;
}

// ── Grocery Types ──

export type GroceryCategory =
	| 'produce'
	| 'protein'
	| 'dairy'
	| 'pantry'
	| 'frozen'
	| 'bakery'
	| 'spices'
	| 'other';

export type StoreName = 'Costco' | "Sam's" | 'Kroger' | 'Any';

export interface GroceryItem {
	name: string;
	quantity: string;
	unit: string;
	category: GroceryCategory;
	store: StoreName;
	fromRecipes: string[];     // recipe titles
	checked: boolean;
}

// ── Plugin Data ──

export interface MealPlannerData {
	recipeFolderPath: string;
	cookedMeals: CookedMeal[];
	weeklyPlans: WeeklyPlan[];
	groceryStoreAssignments: Record<string, StoreName>;
	ingredientCategories: Record<string, GroceryCategory>;
	settings: MealPlannerSettings;
}

export interface MealPlannerSettings {
	recipeFolderPath: string;
	dinnersPerWeek: number;
	leftoverLunches: boolean;
	planCategories: string[];   // which recipe categories to include
	todoistApiToken: string;
	todoistProjectName: string;
	groceryExportPath: string;  // vault-relative path for markdown export
}

export const DEFAULT_DATA: MealPlannerData = {
	recipeFolderPath: 'Recipes',
	cookedMeals: [],
	weeklyPlans: [],
	groceryStoreAssignments: {},
	ingredientCategories: {},
	settings: {
		recipeFolderPath: 'Recipes',
		dinnersPerWeek: 5,
		leftoverLunches: true,
		planCategories: ['Mains', 'Soups', 'Salads'],
		todoistApiToken: '',
		todoistProjectName: 'Grocery List',
		groceryExportPath: 'Grocery List.md',
	},
};
