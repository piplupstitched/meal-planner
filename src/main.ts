import { Plugin, Notice, WorkspaceLeaf, TFile, requestUrl } from 'obsidian';
import { ParsedRecipe, PlannedMeal, WeeklyPlan, MealType } from './types';
import { RecipeParser } from './recipeParser';
import { DataStore } from './dataStore';
import { MealPlanner } from './mealPlanner';
import { GroceryListGenerator } from './groceryList';
import { MealPlanView, MEAL_PLAN_VIEW_TYPE } from './views';
import { RecipeBrowserModal, GroceryListModal, RecipeSuggestModal, ImportRecipeModal } from './modals';
import { MealPlannerSettingTab } from './settings';
import { ImportedRecipeDraft, WebRecipeParser } from './webRecipeParser';

export default class MealPlannerPlugin extends Plugin {
	dataStore: DataStore;
	parser: RecipeParser;
	planner: MealPlanner;
	groceryGenerator: GroceryListGenerator;
	cachedRecipes: ParsedRecipe[] = [];

	async onload(): Promise<void> {
		// Initialize stores
		this.dataStore = new DataStore(this);
		await this.dataStore.load();

		this.parser = new RecipeParser(this.app, this.dataStore.getRecipeFolderPath());
		this.planner = new MealPlanner(this.dataStore);
		this.groceryGenerator = new GroceryListGenerator(this.dataStore);

		// Register view
		this.registerView(MEAL_PLAN_VIEW_TYPE, (leaf) => new MealPlanView(leaf, this));

		// Register commands
		this.addCommand({
			id: 'open-meal-plan',
			name: 'Open meal plan',
			callback: () => this.activateView(),
		});

		this.addCommand({
			id: 'generate-meal-plan',
			name: 'Generate weekly meal plan',
			callback: () => this.generateMealPlan(),
		});

		this.addCommand({
			id: 'view-grocery-list',
			name: 'View grocery list',
			callback: () => this.showGroceryList(),
		});

		this.addCommand({
			id: 'browse-recipes',
			name: 'Browse recipes',
			callback: () => this.browseRecipes(),
		});

		this.addCommand({
			id: 'import-recipe-from-url',
			name: 'Import recipe from URL',
			callback: () => this.openImportRecipeModal(),
		});

		this.addCommand({
			id: 'list-parsed-recipes',
			name: 'List all parsed recipes',
			callback: () => this.listParsedRecipes(),
		});

		this.addCommand({
			id: 'refresh-recipes',
			name: 'Refresh recipe index',
			callback: () => this.refreshRecipes(),
		});

		// Settings tab
		this.addSettingTab(new MealPlannerSettingTab(this.app, this));

		// Add ribbon icon
		this.addRibbonIcon('utensils', 'Meal Planner', () => {
			this.activateView();
		});

		// Load recipes on startup (after vault is ready)
		this.app.workspace.onLayoutReady(async () => {
			await this.refreshRecipes();
		});
	}

	onunload(): void {
		this.app.workspace.detachLeavesOfType(MEAL_PLAN_VIEW_TYPE);
	}

	// ── Core Operations ──

	async refreshRecipes(): Promise<void> {
		this.parser = new RecipeParser(this.app, this.dataStore.getRecipeFolderPath());
		this.cachedRecipes = await this.parser.parseAllRecipes();
		new Notice(`Indexed ${this.cachedRecipes.length} recipes`);

		// Refresh sidebar if open
		this.refreshView();
	}

	async generateMealPlan(): Promise<void> {
		if (this.cachedRecipes.length === 0) {
			await this.refreshRecipes();
		}

		try {
			const count = this.dataStore.getData().settings.dinnersPerWeek;
			const plan = this.planner.generateWeeklyPlan(this.cachedRecipes, count);
			await this.dataStore.saveWeeklyPlan(plan);

			const recipeMap = new Map(this.cachedRecipes.map(r => [r.id, r]));
			const titles = plan.meals
				.map(m => recipeMap.get(m.recipeId)?.title || 'Unknown')
				.join('\n  · ');

			new Notice(`Meal plan generated!\n  · ${titles}`, 8000);
			await this.activateView();
			this.refreshView();
		} catch (e) {
			new Notice(`Error generating plan: ${(e as Error).message}`);
		}
	}

	async showGroceryList(): Promise<void> {
		const plan = this.dataStore.getCurrentWeekPlan();
		if (!plan || plan.meals.length === 0) {
			new Notice('No meal plan for this week. Generate one first.');
			return;
		}

		// Only include dinner meals for grocery generation (leftovers use the same ingredients)
		const dinnerMeals = plan.meals.filter(m => !m.isLeftover);
		const recipeMap = new Map(this.cachedRecipes.map(r => [r.id, r]));
		const recipes = dinnerMeals
			.map(m => recipeMap.get(m.recipeId))
			.filter((r): r is ParsedRecipe => r !== undefined);

		const items = this.groceryGenerator.generate(recipes);
		new GroceryListModal(this.app, this, items).open();
	}

	browseRecipes(): void {
		if (this.cachedRecipes.length === 0) {
			new Notice('No recipes loaded. Refreshing...');
			this.refreshRecipes().then(() => {
				new RecipeBrowserModal(this.app, this).open();
			});
			return;
		}
		new RecipeBrowserModal(this.app, this).open();
	}

	openImportRecipeModal(): void {
		new ImportRecipeModal(this.app, this).open();
	}

	async importRecipeFromUrl(rawUrl: string): Promise<TFile> {
		const url = rawUrl.trim();
		if (!/^https?:\/\//i.test(url)) {
			throw new Error('Please enter a valid http(s) URL.');
		}

		const primaryHtml = await this.fetchHtml(url);
		let draft = WebRecipeParser.parseRecipeFromHtml(primaryHtml, url);

		// Pinterest pins usually need one extra hop to the source site.
		if (!draft && /pinterest\.com/i.test(url)) {
			const outboundUrl = WebRecipeParser.extractPinterestOutboundUrl(primaryHtml);
			if (outboundUrl) {
				const outboundHtml = await this.fetchHtml(outboundUrl);
				draft = WebRecipeParser.parseRecipeFromHtml(outboundHtml, outboundUrl);
			}
		}

		if (!draft) {
			throw new Error('Could not find structured recipe data on that page.');
		}

		const file = await this.createImportedRecipeFile(draft);
		await this.refreshRecipes();
		return file;
	}

	async listParsedRecipes(): Promise<void> {
		if (this.cachedRecipes.length === 0) {
			await this.refreshRecipes();
		}

		const lines = this.cachedRecipes.map(r => {
			const stats = this.dataStore.getRecipeStats(r.id);
			const parts = [
				r.title,
				`[${r.category}${r.subcategory ? '/' + r.subcategory : ''}]`,
				`${r.caloriesPerServing} cal`,
				`${r.protein}g protein`,
				`${r.ingredients.reduce((n, s) => n + s.items.length, 0)} ingredients`,
			];
			if (stats.daysSinceLastMade !== null) {
				parts.push(`last made ${stats.daysSinceLastMade}d ago`);
			}
			return parts.join(' · ');
		});

		new Notice(`Found ${this.cachedRecipes.length} recipes. Check console for details.`);
		console.log('=== Parsed Recipes ===');
		lines.forEach(l => console.log(l));
		console.log('=== End ===');
	}

	// ── Plan Manipulation ──

	async addRecipeToPlan(recipe: ParsedRecipe): Promise<void> {
		let plan = this.dataStore.getCurrentWeekPlan();
		const monday = this.dataStore.getMonday(new Date());

		if (!plan) {
			plan = {
				weekStart: this.dataStore.formatDate(monday),
				meals: [],
				generatedAt: new Date().toISOString(),
			};
		}

		// Find next available day
		const usedDays = new Set(plan.meals.map(m => m.plannedDate));
		let date: Date | null = null;
		for (let i = 0; i < 7; i++) {
			const d = new Date(monday);
			d.setDate(d.getDate() + i);
			const ds = this.dataStore.formatDate(d);
			if (!usedDays.has(ds)) {
				date = d;
				break;
			}
		}

		if (!date) {
			// Add to Saturday if all slots full
			date = new Date(monday);
			date.setDate(date.getDate() + 5);
		}

		plan.meals.push({
			recipeId: recipe.id,
			plannedDate: this.dataStore.formatDate(date),
			mealType: 'dinner',
			servings: recipe.servings,
		});

		await this.dataStore.saveWeeklyPlan(plan);
		this.refreshView();
	}

	async swapRecipe(meal: PlannedMeal): Promise<void> {
		new RecipeSuggestModal(this.app, this, async (recipe) => {
			const plan = this.dataStore.getCurrentWeekPlan();
			if (!plan) return;

			const idx = plan.meals.findIndex(
				m => m.recipeId === meal.recipeId && m.plannedDate === meal.plannedDate && m.mealType === meal.mealType
			);
			if (idx >= 0) {
				const oldRecipeId = plan.meals[idx].recipeId;
				const oldDate = plan.meals[idx].plannedDate;

				plan.meals[idx] = {
					...plan.meals[idx],
					recipeId: recipe.id,
					servings: recipe.servings,
				};

				// Update associated leftovers if this was a dinner
				if (!meal.isLeftover) {
					// Remove old leftovers
					plan.meals = plan.meals.filter(
						m => !(m.isLeftover && m.leftoverSourceDate === oldDate && m.recipeId === oldRecipeId)
					);

					// Generate new leftovers if the new recipe has enough servings
					const settings = this.dataStore.getData().settings;
					if (settings.leftoverLunches && recipe.servings >= 4) {
						const nextDay = new Date(oldDate + 'T00:00:00');
						nextDay.setDate(nextDay.getDate() + 1);
						const nextDayStr = this.dataStore.formatDate(nextDay);
						const leftoverServings = recipe.servings >= 6 ? 2 : 1;

						plan.meals.push({
							recipeId: recipe.id,
							plannedDate: nextDayStr,
							mealType: 'lunch',
							servings: leftoverServings,
							isLeftover: true,
							leftoverSourceDate: oldDate,
						});
					}

					// Re-sort
					plan.meals.sort((a, b) => {
						const dc = a.plannedDate.localeCompare(b.plannedDate);
						if (dc !== 0) return dc;
						if (a.isLeftover && !b.isLeftover) return 1;
						if (!a.isLeftover && b.isLeftover) return -1;
						return 0;
					});
				}

				await this.dataStore.saveWeeklyPlan(plan);
				new Notice(`Swapped to "${recipe.title}"`);
				this.refreshView();
			}
		}).open();
	}

	async removeMealFromPlan(meal: PlannedMeal): Promise<void> {
		const plan = this.dataStore.getCurrentWeekPlan();
		if (!plan) return;

		// Remove the meal itself
		plan.meals = plan.meals.filter(
			m => !(m.recipeId === meal.recipeId && m.plannedDate === meal.plannedDate && m.mealType === meal.mealType)
		);

		// If removing a dinner, also remove its associated leftover lunches
		if (!meal.isLeftover) {
			plan.meals = plan.meals.filter(
				m => !(m.isLeftover && m.leftoverSourceDate === meal.plannedDate && m.recipeId === meal.recipeId)
			);
		}

		await this.dataStore.saveWeeklyPlan(plan);
		new Notice('Removed from plan');
		this.refreshView();
	}

	async clearCurrentWeekPlan(): Promise<void> {
		const plan = this.dataStore.getCurrentWeekPlan();
		if (!plan || plan.meals.length === 0) {
			new Notice('No meals to clear for this week.');
			return;
		}

		plan.meals = [];
		await this.dataStore.saveWeeklyPlan(plan);
		new Notice('Cleared this week\'s meal plan.');
		this.refreshView();
	}

	// ── View Management ──

	async activateView(): Promise<void> {
		const { workspace } = this.app;

		let leaf: WorkspaceLeaf | null = null;
		const leaves = workspace.getLeavesOfType(MEAL_PLAN_VIEW_TYPE);

		if (leaves.length > 0) {
			leaf = leaves[0];
		} else {
			leaf = workspace.getRightLeaf(false);
			if (leaf) {
				await leaf.setViewState({
					type: MEAL_PLAN_VIEW_TYPE,
					active: true,
				});
			}
		}

		if (leaf) {
			workspace.revealLeaf(leaf);
			// Always re-render after revealing to pick up latest data
			const view = leaf.view as MealPlanView;
			if (view && typeof view.render === 'function') {
				await view.render();
			}
		}
	}

	refreshView(): void {
		const leaves = this.app.workspace.getLeavesOfType(MEAL_PLAN_VIEW_TYPE);
		for (const leaf of leaves) {
			const view = leaf.view as MealPlanView;
			if (view && view.render) {
				view.render();
			}
		}
	}

	openRecipeFile(filePath: string): void {
		const file = this.app.vault.getAbstractFileByPath(filePath);
		if (file instanceof TFile) {
			this.app.workspace.getLeaf(false).openFile(file);
		}
	}

	private async fetchHtml(url: string): Promise<string> {
		const resp = await requestUrl({
			url,
			method: 'GET',
			headers: {
				'User-Agent': 'Mozilla/5.0 (Meal Planner Obsidian Plugin)',
				'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
			},
		});

		if (resp.status < 200 || resp.status >= 300) {
			throw new Error(`Failed to fetch URL (${resp.status})`);
		}
		return resp.text;
	}

	private async createImportedRecipeFile(draft: ImportedRecipeDraft): Promise<TFile> {
		const folder = this.getImportFolderForMealType(draft.mealType);
		await this.ensureFolderPath(folder);

		const baseName = this.toSafeFileName(draft.title || 'Imported Recipe');
		const availablePath = this.app.vault.getAvailablePath(`${folder}/${baseName}`, 'md');
		const markdown = this.buildImportedRecipeMarkdown(draft);
		return await this.app.vault.create(availablePath, markdown);
	}

	private getImportFolderForMealType(mealTypes: string[]): string {
		const root = this.dataStore.getRecipeFolderPath();
		const normalized = mealTypes.map(m => m.toLowerCase());

		if (normalized.includes('breakfast')) return `${root}/0. Breakfast/Imported`;
		if (normalized.includes('lunch')) return `${root}/3. Salads/Imported`;
		if (normalized.includes('snack')) return `${root}/11. Snacks/Imported`;
		if (normalized.includes('dessert')) return `${root}/7. Desserts/Imported`;
		return `${root}/4. Mains/Imported`;
	}

	private async ensureFolderPath(path: string): Promise<void> {
		const parts = path.split('/').filter(Boolean);
		let current = '';

		for (const part of parts) {
			current = current ? `${current}/${part}` : part;
			if (!this.app.vault.getAbstractFileByPath(current)) {
				await this.app.vault.createFolder(current);
			}
		}
	}

	private toSafeFileName(name: string): string {
		return name
			.replace(/[\\/:*?"<>|]/g, '')
			.replace(/\s+/g, ' ')
			.trim()
			.slice(0, 120) || 'Imported Recipe';
	}

	private buildImportedRecipeMarkdown(draft: ImportedRecipeDraft): string {
		const mealType = draft.mealType.length > 0 ? draft.mealType : ['dinner'];
		const tags = draft.tags.length > 0 ? draft.tags : ['imported'];
		const ingredients = draft.ingredients.length > 0 ? draft.ingredients : ['(add ingredients)'];
		const instructions = draft.instructions.length > 0 ? draft.instructions : ['(add instructions)'];

		const lines: string[] = [
			'---',
			`title: "${this.escapeYaml(draft.title)}"`,
			`servings: "${this.escapeYaml(draft.servings)}"`,
			`prep_time: "${this.escapeYaml(draft.prepTime)}"`,
			`cook_time: "${this.escapeYaml(draft.cookTime)}"`,
			`total_time: "${this.escapeYaml(draft.totalTime)}"`,
			'difficulty: ""',
			`meal_type: ${this.yamlArray(mealType)}`,
			`calories_per_serving: "${this.escapeYaml(draft.caloriesPerServing)}"`,
			`net_carbs: "${this.escapeYaml(draft.netCarbs)}"`,
			`protein: "${this.escapeYaml(draft.protein)}"`,
			`diet: ${this.yamlArray(draft.diet)}`,
			`source: "${this.escapeYaml(draft.sourceUrl)}"`,
			`tags: ${this.yamlArray(tags)}`,
			'---',
			'',
			`# ${draft.title}`,
			'',
			'## Ingredients',
			...ingredients.map(i => `- ${i}`),
			'',
			'## Instructions',
			...instructions.map((step, i) => `${i + 1}. ${step}`),
			'',
			'## Notes',
			'- Imported from URL. Review and adjust as needed.',
			'',
		];

		return lines.join('\n');
	}

	private yamlArray(values: string[]): string {
		const cleaned = values.map(v => `"${this.escapeYaml(v)}"`).join(', ');
		return `[${cleaned}]`;
	}

	private escapeYaml(value: string): string {
		return String(value || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
	}
}
