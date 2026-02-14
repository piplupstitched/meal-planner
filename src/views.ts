import {
	ItemView,
	WorkspaceLeaf,
	setIcon,
	Notice,
	Menu,
} from 'obsidian';
import type MealPlannerPlugin from './main';
import { ParsedRecipe, PlannedMeal, GroceryItem, MealType, WeeklyPlan } from './types';

// ── Constants ──

export const MEAL_PLAN_VIEW_TYPE = 'meal-planner-view';

// ── Sidebar View: Weekly Meal Plan ──

export class MealPlanView extends ItemView {
	plugin: MealPlannerPlugin;
	private dragSourceIndex: number | null = null;

	constructor(leaf: WorkspaceLeaf, plugin: MealPlannerPlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType(): string {
		return MEAL_PLAN_VIEW_TYPE;
	}

	getDisplayText(): string {
		return 'Meal Plan';
	}

	getIcon(): string {
		return 'utensils';
	}

	async onOpen(): Promise<void> {
		await this.render();
	}

	async render(): Promise<void> {
		const container = this.containerEl.children[1] as HTMLElement;
		container.empty();
		container.addClass('meal-planner-sidebar');

		// Header
		const header = container.createDiv('meal-planner-header');
		header.createEl('h3', { text: 'Meal Plan' });

		const actions = header.createDiv('meal-planner-actions');
		const genBtn = actions.createEl('button', { text: 'Generate Plan' });
		genBtn.addEventListener('click', () => {
			this.plugin.generateMealPlan();
		});

		const manualBtn = actions.createEl('button', { text: 'Select Meals' });
		manualBtn.addEventListener('click', () => {
			this.plugin.browseRecipes();
		});

		const importBtn = actions.createEl('button', { text: 'Import URL' });
		importBtn.addEventListener('click', () => {
			this.plugin.openImportRecipeModal();
		});

		const clearBtn = actions.createEl('button', { text: 'Clear Plan' });
		clearBtn.addEventListener('click', async () => {
			const ok = window.confirm('Clear all meals for the current week?');
			if (!ok) return;
			await this.plugin.clearCurrentWeekPlan();
		});

		const groceryBtn = actions.createEl('button', { text: 'Grocery List' });
		groceryBtn.addEventListener('click', () => {
			this.plugin.showGroceryList();
		});

		// Season label
		const season = this.plugin.planner.seasonal.getSeasonLabel();
		const seasonEl = header.createEl('span', {
			text: season,
			cls: `meal-season meal-season-${season.toLowerCase()}`,
		});

		// Current week plan
		const plan = this.plugin.dataStore.getCurrentWeekPlan();
		if (!plan || plan.meals.length === 0) {
			container.createEl('p', {
				text: 'No meal plan for this week. Click "Generate Plan" or "Select Meals" to create one.',
				cls: 'meal-planner-empty',
			});
			return;
		}

		// Recipe lookup
		const recipesLoaded = this.plugin.cachedRecipes.length > 0;
		if (!recipesLoaded) {
			container.createEl('p', { text: 'Loading recipes...' });
			return;
		}

		const recipeMap = new Map(this.plugin.cachedRecipes.map(r => [r.id, r]));

		// Render each day
		const mealsList = container.createDiv('meal-planner-meals');

		// Group meals by date for rendering
		let lastDate = '';

		for (let mealIndex = 0; mealIndex < plan.meals.length; mealIndex++) {
			const meal = plan.meals[mealIndex];
			const recipe = recipeMap.get(meal.recipeId);
			if (!recipe) continue;

			const isLeftover = meal.isLeftover === true;
			const dayName = this.plugin.dataStore.getDayName(meal.plannedDate);
			const isCooked = this.isMealCooked(meal);
			const stats = this.plugin.dataStore.getRecipeStats(meal.recipeId);

			// ── Leftover row (compact, no drag) ──
			if (isLeftover) {
				const row = mealsList.createDiv('meal-row meal-leftover');
				if (isCooked) row.addClass('meal-cooked');

				// No drag handle for leftovers — spacer instead
				row.createDiv('meal-drag-handle-spacer');

				// Checkbox
				const checkbox = row.createEl('input', { type: 'checkbox' });
				checkbox.checked = isCooked;
				checkbox.addEventListener('change', async () => {
					if (checkbox.checked) {
						await this.plugin.dataStore.markMealCooked(
							meal.recipeId,
							meal.plannedDate,
							meal.mealType
						);
						new Notice(`Leftover "${recipe.title}" eaten!`);
					} else {
						await this.plugin.dataStore.removeCookedMeal(
							meal.recipeId,
							meal.plannedDate
						);
					}
					await this.render();
				});

				const info = row.createDiv('meal-info');
				const dayRow = info.createDiv('meal-day-row');

				// Show day label only if different from previous meal's date
				if (meal.plannedDate !== lastDate) {
					dayRow.createEl('span', { text: dayName, cls: 'meal-day' });
				}

				dayRow.createEl('span', { text: 'leftover', cls: 'meal-leftover-badge' });

				const servingsLabel = meal.servings > 1 ? ` (x${meal.servings})` : '';
				const titleEl = info.createEl('div', {
					text: `${recipe.title}${servingsLabel}`,
					cls: 'meal-title meal-title-leftover',
				});
				titleEl.addEventListener('click', () => {
					this.plugin.openRecipeFile(recipe.filePath);
				});

				const meta = info.createDiv('meal-meta');
				meta.setText(`lunch · ${recipe.caloriesPerServing || '?'} cal/serving`);

				lastDate = meal.plannedDate;
				continue;
			}

			// ── Regular dinner row ──
			const row = mealsList.createDiv('meal-row');
			if (isCooked) row.addClass('meal-cooked');
			row.setAttribute('data-meal-index', String(mealIndex));

			// ── Drag handle ──
			const dragHandle = row.createDiv('meal-drag-handle');
			dragHandle.innerHTML = '&#x2630;'; // hamburger icon ☰
			dragHandle.setAttribute('aria-label', 'Drag to reorder');

			// Make row draggable
			row.setAttribute('draggable', 'true');

			row.addEventListener('dragstart', (e: DragEvent) => {
				this.dragSourceIndex = mealIndex;
				row.addClass('meal-dragging');
				if (e.dataTransfer) {
					e.dataTransfer.effectAllowed = 'move';
					e.dataTransfer.setData('text/plain', String(mealIndex));
				}
			});

			row.addEventListener('dragend', () => {
				row.removeClass('meal-dragging');
				this.dragSourceIndex = null;
				// Clean up all drop indicators
				mealsList.querySelectorAll('.meal-row').forEach(el => {
					el.removeClass('meal-drag-over-above', 'meal-drag-over-below');
				});
			});

			row.addEventListener('dragover', (e: DragEvent) => {
				e.preventDefault();
				if (this.dragSourceIndex === null || this.dragSourceIndex === mealIndex) return;
				if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';

				// Show drop position indicator
				const rect = row.getBoundingClientRect();
				const midY = rect.top + rect.height / 2;
				const isAbove = e.clientY < midY;

				row.removeClass('meal-drag-over-above', 'meal-drag-over-below');
				row.addClass(isAbove ? 'meal-drag-over-above' : 'meal-drag-over-below');
			});

			row.addEventListener('dragleave', () => {
				row.removeClass('meal-drag-over-above', 'meal-drag-over-below');
			});

			row.addEventListener('drop', async (e: DragEvent) => {
				e.preventDefault();
				row.removeClass('meal-drag-over-above', 'meal-drag-over-below');
				if (this.dragSourceIndex === null || this.dragSourceIndex === mealIndex) return;

				await this.swapMealDays(this.dragSourceIndex, mealIndex);
				this.dragSourceIndex = null;
			});

			// Checkbox
			const checkbox = row.createEl('input', { type: 'checkbox' });
			checkbox.checked = isCooked;
			checkbox.addEventListener('change', async () => {
				if (checkbox.checked) {
					await this.plugin.dataStore.markMealCooked(
						meal.recipeId,
						meal.plannedDate,
						meal.mealType
					);
					new Notice(`Marked "${recipe.title}" as cooked!`);
				} else {
					await this.plugin.dataStore.removeCookedMeal(
						meal.recipeId,
						meal.plannedDate
					);
				}
				await this.render();
			});

			const info = row.createDiv('meal-info');
			const dayRow = info.createDiv('meal-day-row');
			dayRow.createEl('span', { text: dayName, cls: 'meal-day' });

			// Seasonal indicator
			const ingredientNames = recipe.ingredients.flatMap(s =>
				s.items.map(i => i.name)
			);
			const inSeason = this.plugin.planner.seasonal.getInSeasonIngredients(ingredientNames);
			if (inSeason.length > 0) {
				const badge = dayRow.createEl('span', {
					cls: 'meal-seasonal-badge',
					attr: { 'aria-label': `In season: ${inSeason.join(', ')}` },
				});
				badge.setText('seasonal');
				badge.setAttribute('title', `In season: ${inSeason.join(', ')}`);
			}

			// Leftover indicator on the dinner itself
			const hasLeftovers = plan.meals.some(
				m => m.isLeftover && m.leftoverSourceDate === meal.plannedDate && m.recipeId === meal.recipeId
			);
			if (hasLeftovers) {
				dayRow.createEl('span', {
					text: `+leftovers`,
					cls: 'meal-has-leftovers-badge',
				});
			}

			const titleEl = info.createEl('div', { text: recipe.title, cls: 'meal-title' });
			titleEl.addEventListener('click', () => {
				this.plugin.openRecipeFile(recipe.filePath);
			});

			const meta = info.createDiv('meal-meta');
			const metaParts: string[] = [];
			if (recipe.caloriesPerServing) metaParts.push(`${recipe.caloriesPerServing} cal`);
			if (recipe.protein) metaParts.push(`${recipe.protein}g protein`);
			if (recipe.frontmatter.cook_time) metaParts.push(recipe.frontmatter.cook_time);
			if (stats.daysSinceLastMade !== null) {
				metaParts.push(`last made ${stats.daysSinceLastMade}d ago`);
			} else {
				metaParts.push('never made');
			}
			meta.setText(metaParts.join(' · '));

			// Context menu for swap/remove
			row.addEventListener('contextmenu', (e: MouseEvent) => {
				const menu = new Menu();
				menu.addItem(item => {
					item.setTitle('Open recipe');
					item.setIcon('file-text');
					item.onClick(() => this.plugin.openRecipeFile(recipe.filePath));
				});
				menu.addItem(item => {
					item.setTitle('Swap recipe');
					item.setIcon('refresh-cw');
					item.onClick(() => this.plugin.swapRecipe(meal));
				});
				menu.addItem(item => {
					item.setTitle('Remove from plan');
					item.setIcon('trash');
					item.onClick(() => this.plugin.removeMealFromPlan(meal));
				});
				menu.showAtMouseEvent(e);
			});

			lastDate = meal.plannedDate;
		}

		// Week summary
		const summary = container.createDiv('meal-planner-summary');
		const dinnerMeals = plan.meals.filter(m => !m.isLeftover);
		const leftoverMeals = plan.meals.filter(m => m.isLeftover);

		const totalCals = dinnerMeals.reduce((sum, m) => {
			const r = recipeMap.get(m.recipeId);
			return sum + (r?.caloriesPerServing || 0);
		}, 0);
		const cookedCount = dinnerMeals.filter(m => this.isMealCooked(m)).length;
		const leftoverEaten = leftoverMeals.filter(m => this.isMealCooked(m)).length;

		// Count seasonal recipes (dinners only)
		const seasonalCount = dinnerMeals.filter(m => {
			const r = recipeMap.get(m.recipeId);
			if (!r) return false;
			const names = r.ingredients.flatMap(s => s.items.map(i => i.name));
			return this.plugin.planner.seasonal.getInSeasonIngredients(names).length > 0;
		}).length;

		const summaryParts = [
			`${cookedCount}/${dinnerMeals.length} dinners`,
		];
		if (leftoverMeals.length > 0) {
			summaryParts.push(`${leftoverEaten}/${leftoverMeals.length} leftovers`);
		}
		summaryParts.push(`~${totalCals} total cal`);
		if (seasonalCount > 0) {
			summaryParts.push(`${seasonalCount} seasonal`);
		}
		summary.createEl('div', {
			text: summaryParts.join(' · '),
			cls: 'summary-text',
		});

		// Drag hint
		summary.createEl('div', {
			text: 'Drag meals to reorder days',
			cls: 'drag-hint',
		});
	}

	/**
	 * Swap the planned dates of two meals in the current plan.
	 * Also moves associated leftovers to follow their dinner.
	 */
	private async swapMealDays(fromIndex: number, toIndex: number): Promise<void> {
		const plan = this.plugin.dataStore.getCurrentWeekPlan();
		if (!plan) return;

		const fromMeal = plan.meals[fromIndex];
		const toMeal = plan.meals[toIndex];
		if (!fromMeal || !toMeal) return;

		// Only swap dinners (not leftovers directly)
		if (fromMeal.isLeftover || toMeal.isLeftover) return;

		const fromDate = fromMeal.plannedDate;
		const toDate = toMeal.plannedDate;

		// Swap the dinner dates
		fromMeal.plannedDate = toDate;
		toMeal.plannedDate = fromDate;

		// Move associated leftovers: update their dates to be day-after their new dinner date
		for (const m of plan.meals) {
			if (!m.isLeftover) continue;
			if (m.leftoverSourceDate === fromDate && m.recipeId === fromMeal.recipeId) {
				// This leftover belonged to fromMeal, which moved to toDate
				const newNextDay = new Date(toDate + 'T00:00:00');
				newNextDay.setDate(newNextDay.getDate() + 1);
				m.plannedDate = this.plugin.dataStore.formatDate(newNextDay);
				m.leftoverSourceDate = toDate;
			} else if (m.leftoverSourceDate === toDate && m.recipeId === toMeal.recipeId) {
				// This leftover belonged to toMeal, which moved to fromDate
				const newNextDay = new Date(fromDate + 'T00:00:00');
				newNextDay.setDate(newNextDay.getDate() + 1);
				m.plannedDate = this.plugin.dataStore.formatDate(newNextDay);
				m.leftoverSourceDate = fromDate;
			}
		}

		// Re-sort meals by date, dinners before leftovers
		plan.meals.sort((a, b) => {
			const dc = a.plannedDate.localeCompare(b.plannedDate);
			if (dc !== 0) return dc;
			if (a.isLeftover && !b.isLeftover) return 1;
			if (!a.isLeftover && b.isLeftover) return -1;
			return 0;
		});

		await this.plugin.dataStore.saveWeeklyPlan(plan);
		await this.render();
	}

	private isMealCooked(meal: PlannedMeal): boolean {
		return this.plugin.dataStore.getCookedMeals().some(
			m => m.recipeId === meal.recipeId && m.cookedDate === meal.plannedDate
		);
	}

	async onClose(): Promise<void> {}
}
