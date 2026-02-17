import { App, Modal, Setting, Notice, FuzzySuggestModal, requestUrl, TFile } from 'obsidian';
import type MealPlannerPlugin from './main';
import {
	ParsedRecipe,
	GroceryItem,
	GroceryCategory,
	StoreName,
} from './types';

// ── Recipe Browser Modal ──

export class RecipeBrowserModal extends Modal {
	plugin: MealPlannerPlugin;
	recipes: ParsedRecipe[];
	filterText: string = '';
	filterCategory: string = '';
	addedCount: number = 0;

	constructor(app: App, plugin: MealPlannerPlugin) {
		super(app);
		this.plugin = plugin;
		this.recipes = [...plugin.cachedRecipes];
	}

	onOpen(): void {
		this.modalEl.addClass('meal-planner-modal', 'recipe-browser');
		this.titleEl.setText('Select meals');
		this.render();
	}

	private render(): void {
		const { contentEl } = this;
		contentEl.empty();

		// Search & filter bar
		const filterBar = contentEl.createDiv('recipe-filter-bar');
		const settings = this.plugin.dataStore.getData().settings;
		const currentPlan = this.plugin.dataStore.getCurrentWeekPlan();
		const currentDinnerCount = currentPlan
			? currentPlan.meals.filter(m => !m.isLeftover).length
			: 0;
		const goalText = `${Math.min(currentDinnerCount, settings.dinnersPerWeek)}/${settings.dinnersPerWeek} dinners planned`;
		const helperParts = [goalText];
		if (this.addedCount > 0) {
			helperParts.push(`${this.addedCount} added this session`);
		}
		contentEl.createEl('p', {
			text: helperParts.join(' | '),
			cls: 'recipe-count',
		});

		const searchInput = filterBar.createEl('input', {
			type: 'text',
			placeholder: 'Search recipes...',
			cls: 'recipe-search',
		});
		searchInput.setAttribute('type', 'search');
		searchInput.setAttribute('placeholder', 'Search recipes...');
		searchInput.value = this.filterText;
		const stopHotkeyPropagation = (e: Event) => e.stopPropagation();
		searchInput.addEventListener('keydown', stopHotkeyPropagation);
		searchInput.addEventListener('keyup', stopHotkeyPropagation);
		searchInput.addEventListener('keypress', stopHotkeyPropagation);
		searchInput.addEventListener('beforeinput', stopHotkeyPropagation);
		searchInput.addEventListener('input', () => {
			this.filterText = searchInput.value;
			this.renderList(listContainer);
		});
		searchInput.focus();

		// Category filter
		const categories = [...new Set(this.recipes.map(r => r.category))].sort();
		const catSelect = filterBar.createEl('select', { cls: 'recipe-cat-filter' });
		catSelect.createEl('option', { value: '', text: 'All categories' });
		for (const cat of categories) {
			catSelect.createEl('option', { value: cat, text: cat });
		}
		catSelect.value = this.filterCategory;
		catSelect.addEventListener('keydown', stopHotkeyPropagation);
		catSelect.addEventListener('keyup', stopHotkeyPropagation);
		catSelect.addEventListener('keypress', stopHotkeyPropagation);
		catSelect.addEventListener('change', () => {
			this.filterCategory = catSelect.value;
			this.renderList(listContainer);
		});

		// Recipe list
		const listContainer = contentEl.createDiv('recipe-list');
		this.renderList(listContainer);
	}

	private renderList(container: HTMLElement): void {
		container.empty();

		let filtered = this.recipes;

		if (this.filterText) {
			const query = this.filterText.toLowerCase();
			filtered = filtered.filter(r =>
				r.title.toLowerCase().includes(query) ||
				r.frontmatter.tags.some(t => t.toLowerCase().includes(query)) ||
				r.category.toLowerCase().includes(query) ||
				r.subcategory.toLowerCase().includes(query)
			);
		}

		if (this.filterCategory) {
			filtered = filtered.filter(r => r.category === this.filterCategory);
		}

		// Sort by days since last made (never-made first, then longest ago)
		const statsMap = this.plugin.dataStore.getAllRecipeStats(filtered.map(r => r.id));
		filtered.sort((a, b) => {
			const sa = statsMap.get(a.id)!;
			const sb = statsMap.get(b.id)!;
			const da = sa.daysSinceLastMade ?? 9999;
			const db = sb.daysSinceLastMade ?? 9999;
			return db - da;
		});

		if (filtered.length === 0) {
			container.createEl('p', { text: 'No recipes match your search.', cls: 'recipe-empty' });
			return;
		}

		container.createEl('div', {
			text: `${filtered.length} recipes`,
			cls: 'recipe-count',
		});

		for (const recipe of filtered) {
			const stats = statsMap.get(recipe.id)!;
			const row = container.createDiv('recipe-row');

			const info = row.createDiv('recipe-info');
			const titleEl = info.createEl('div', { cls: 'recipe-title' });
			titleEl.setText(recipe.title);
			titleEl.addEventListener('click', () => {
				this.close();
				this.plugin.openRecipeFile(recipe.filePath);
			});

			const meta = info.createDiv('recipe-meta');
			const parts: string[] = [
				`${recipe.category}${recipe.subcategory ? '/' + recipe.subcategory : ''}`,
			];
			if (recipe.caloriesPerServing) parts.push(`${recipe.caloriesPerServing} cal`);
			if (recipe.protein) parts.push(`${recipe.protein}g protein`);
			if (stats.daysSinceLastMade !== null) {
				parts.push(`${stats.daysSinceLastMade}d ago`);
			} else {
				parts.push('never made');
			}
			if (stats.timesCooked > 0) {
				parts.push(`cooked ${stats.timesCooked}x`);
			}
			meta.setText(parts.join(' | '));

			// Add to plan button
			const addBtn = row.createEl('button', { text: '+ plan', cls: 'recipe-add-btn' });
			addBtn.addEventListener('click', () => {
				void (async () => {
					await this.plugin.addRecipeToPlan(recipe);
					this.addedCount++;
					new Notice(`Added "${recipe.title}" to this week's plan.`);
					this.render();
				})().catch(() => {});
			});
		}
	}

	onClose(): void {
		this.contentEl.empty();
	}
}

// ── Grocery List Modal ──

export class GroceryListModal extends Modal {
	plugin: MealPlannerPlugin;
	items: GroceryItem[];
	groupMode: 'category' | 'store' = 'category';

	constructor(app: App, plugin: MealPlannerPlugin, items: GroceryItem[]) {
		super(app);
		this.plugin = plugin;
		this.items = items;
	}

	onOpen(): void {
		this.modalEl.addClass('meal-planner-modal', 'grocery-list');
		this.titleEl.setText('Grocery list');
		this.render();
	}

	private render(): void {
		const { contentEl } = this;
		contentEl.empty();

		if (this.items.length === 0) {
			contentEl.createEl('p', { text: 'No items. Generate a meal plan first.' });
			return;
		}

		// Toolbar
		const toolbar = contentEl.createDiv('grocery-toolbar');
		const groupToggle = toolbar.createEl('button', {
			text: this.groupMode === 'category' ? 'Group by store' : 'Group by category',
		});
		groupToggle.addEventListener('click', () => {
			this.groupMode = this.groupMode === 'category' ? 'store' : 'category';
			this.render();
		});

		const copyBtn = toolbar.createEl('button', { text: 'Copy' });
		copyBtn.addEventListener('click', () => {
			this.copyToClipboard();
		});

		const saveBtn = toolbar.createEl('button', { text: 'Save to vault' });
		saveBtn.addEventListener('click', () => {
			void this.saveToVault();
		});

		// Todoist button (only if API token configured)
		const token = this.plugin.dataStore.getData().settings.todoistApiToken;
		if (token) {
			const todoistBtn = toolbar.createEl('button', { text: 'Send to Todoist', cls: 'grocery-todoist-btn' });
			todoistBtn.addEventListener('click', () => {
				void this.sendToTodoist();
			});
		}

		const checkedCount = this.items.filter(i => i.checked).length;
		toolbar.createEl('span', {
			text: `${checkedCount}/${this.items.length} checked`,
			cls: 'grocery-progress',
		});

		// Items grouped
		const listEl = contentEl.createDiv('grocery-groups');

		if (this.groupMode === 'category') {
			const groups = this.plugin.groceryGenerator.groupByCategory(this.items);
			for (const [category, items] of groups) {
				this.renderGroup(listEl, this.categoryLabel(category), items);
			}
		} else {
			const groups = this.plugin.groceryGenerator.groupByStore(this.items);
			for (const [store, items] of groups) {
				this.renderGroup(listEl, store, items);
			}
		}
	}

	private renderGroup(parent: HTMLElement, label: string, items: GroceryItem[]): void {
		const group = parent.createDiv('grocery-group');
		group.createEl('h4', { text: `${label} (${items.length})` });

		for (const item of items) {
			const row = group.createDiv('grocery-row');
			if (item.checked) row.addClass('grocery-checked');

			const checkbox = row.createEl('input', { type: 'checkbox' });
			checkbox.checked = item.checked;
			checkbox.addEventListener('change', () => {
				item.checked = checkbox.checked;
				row.toggleClass('grocery-checked', item.checked);
				this.render();
			});

			const qty = item.quantity ? `${item.quantity}${item.unit ? ' ' + item.unit : ''}` : '';
			const text = qty ? `${qty} ${item.name}` : item.name;
			row.createEl('span', { text, cls: 'grocery-name' });

			if (item.fromRecipes.length > 0) {
				row.createEl('span', {
					text: `(${item.fromRecipes.join(', ')})`,
					cls: 'grocery-source',
				});
			}

			// Store selector
			const storeSelect = row.createEl('select', { cls: 'grocery-store' });
			const stores: StoreName[] = ['Any', 'Costco', "Sam's", 'Kroger'];
			for (const s of stores) {
				storeSelect.createEl('option', { value: s, text: s });
			}
			storeSelect.value = item.store;
			storeSelect.addEventListener('change', () => {
				item.store = storeSelect.value as StoreName;
				void this.plugin.dataStore.setStoreAssignment(item.name, item.store);
			});
		}
	}

	private categoryLabel(cat: GroceryCategory): string {
		const labels: Record<GroceryCategory, string> = {
			produce: 'Produce',
			protein: 'Protein and meat',
			dairy: 'Dairy and eggs',
			bakery: 'Bakery and bread',
			frozen: 'Frozen',
			spices: 'Spices and seasoning',
			pantry: 'Pantry',
			other: 'Other',
		};
		return labels[cat] || cat;
	}

	// ── Export: Clipboard ──

	private copyToClipboard(): void {
		const markdown = this.buildMarkdown();
		void navigator.clipboard.writeText(markdown).then(() => {
			new Notice('Grocery list copied to clipboard.');
		}).catch(() => {});
	}

	// ── Export: Save to Vault ──

	private async saveToVault(): Promise<void> {
		const markdown = this.buildMarkdown();
		const path = this.plugin.dataStore.getData().settings.groceryExportPath;

		const existing = this.app.vault.getAbstractFileByPath(path);
		if (existing instanceof TFile) {
			await this.app.vault.modify(existing, markdown);
		} else {
			await this.app.vault.create(path, markdown);
		}

		new Notice(`Grocery list saved to ${path}`);
	}

	// ── Export: Todoist ──

	private async sendToTodoist(): Promise<void> {
		const settings = this.plugin.dataStore.getData().settings;
		const token = settings.todoistApiToken;
		if (!token) {
			new Notice('Todoist api token not configured. Set it in meal planner settings.');
			return;
		}

		try {
			// Get or create the project
			const projectId = await this.getOrCreateTodoistProject(token, settings.todoistProjectName);

			// Clear existing tasks in the project
			await this.clearTodoistProject(token, projectId);

			// Add items grouped by category
			const groups = this.plugin.groceryGenerator.groupByCategory(this.items);
			let addedCount = 0;

			for (const [category, items] of groups) {
				const sectionName = this.categoryLabel(category);

				// Create a section for each category
				const sectionId = await this.createTodoistSection(token, projectId, sectionName);

				// Add each item as a task
				for (const item of items) {
					const qty = item.quantity ? `${item.quantity}${item.unit ? ' ' + item.unit : ''} ` : '';
					const taskContent = `${qty}${item.name}`;
					const description = item.fromRecipes.length > 0
						? `For: ${item.fromRecipes.join(', ')}`
						: '';

					await requestUrl({
						url: 'https://api.todoist.com/rest/v2/tasks',
						method: 'POST',
						headers: {
							'Authorization': `Bearer ${token}`,
							'Content-Type': 'application/json',
						},
						body: JSON.stringify({
							content: taskContent,
							description: description,
							project_id: projectId,
							section_id: sectionId,
						}),
					});
					addedCount++;
				}
			}

			new Notice(`Sent ${addedCount} items to Todoist project "${settings.todoistProjectName}".`);
		} catch (e) {
			console.error('Todoist export failed:', e);
			new Notice(`Todoist export failed: ${(e as Error).message}`);
		}
	}

	private async getOrCreateTodoistProject(token: string, name: string): Promise<string> {
		// List existing projects
		const resp = await requestUrl({
			url: 'https://api.todoist.com/rest/v2/projects',
			method: 'GET',
			headers: { 'Authorization': `Bearer ${token}` },
		});

		const projects = resp.json as Array<{ id: string; name: string }>;
		const existing = projects.find(p => p.name === name);
		if (existing) return existing.id;

		// Create new project
		const createResp = await requestUrl({
			url: 'https://api.todoist.com/rest/v2/projects',
			method: 'POST',
			headers: {
				'Authorization': `Bearer ${token}`,
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({ name }),
		});

		return (createResp.json as { id: string }).id;
	}

	private async clearTodoistProject(token: string, projectId: string): Promise<void> {
		// Get all tasks in the project
		const resp = await requestUrl({
			url: `https://api.todoist.com/rest/v2/tasks?project_id=${projectId}`,
			method: 'GET',
			headers: { 'Authorization': `Bearer ${token}` },
		});

		const tasks = resp.json as Array<{ id: string }>;
		for (const task of tasks) {
			await requestUrl({
				url: `https://api.todoist.com/rest/v2/tasks/${task.id}`,
				method: 'DELETE',
				headers: { 'Authorization': `Bearer ${token}` },
			});
		}

		// Also clear sections
		const sectionsResp = await requestUrl({
			url: `https://api.todoist.com/rest/v2/sections?project_id=${projectId}`,
			method: 'GET',
			headers: { 'Authorization': `Bearer ${token}` },
		});

		const sections = sectionsResp.json as Array<{ id: string }>;
		for (const section of sections) {
			await requestUrl({
				url: `https://api.todoist.com/rest/v2/sections/${section.id}`,
				method: 'DELETE',
				headers: { 'Authorization': `Bearer ${token}` },
			});
		}
	}

	private async createTodoistSection(token: string, projectId: string, name: string): Promise<string> {
		const resp = await requestUrl({
			url: 'https://api.todoist.com/rest/v2/sections',
			method: 'POST',
			headers: {
				'Authorization': `Bearer ${token}`,
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				project_id: projectId,
				name: name,
			}),
		});

		return (resp.json as { id: string }).id;
	}

	// ── Shared markdown builder ──

	private buildMarkdown(): string {
		const lines: string[] = ['# Grocery list', ''];

		const plan = this.plugin.dataStore.getCurrentWeekPlan();
		if (plan) {
			const recipeMap = new Map(this.plugin.cachedRecipes.map(r => [r.id, r]));
			const titles = plan.meals
				.map(m => recipeMap.get(m.recipeId)?.title)
				.filter(Boolean);
			if (titles.length > 0) {
				lines.push(`**Recipes:** ${titles.join(', ')}`, '');
			}
		}

		const groups = this.plugin.groceryGenerator.groupByCategory(this.items);
		for (const [category, items] of groups) {
			lines.push(`## ${this.categoryLabel(category)}`);
			for (const item of items) {
				const check = item.checked ? 'x' : ' ';
				const qty = item.quantity ? `${item.quantity}${item.unit ? ' ' + item.unit : ''} ` : '';
				const store = item.store !== 'Any' ? ` @${item.store}` : '';
				lines.push(`- [${check}] ${qty}${item.name}${store}`);
			}
			lines.push('');
		}

		return lines.join('\n');
	}

	onClose(): void {
		this.contentEl.empty();
	}
}

// ── Recipe Suggest Modal (for swapping recipes) ──

export class ImportRecipeModal extends Modal {
	plugin: MealPlannerPlugin;
	url: string = '';
	private statusEl: HTMLElement | null = null;
	private importBtn: HTMLButtonElement | null = null;

	constructor(app: App, plugin: MealPlannerPlugin) {
		super(app);
		this.plugin = plugin;
	}

	onOpen(): void {
		this.modalEl.addClass('meal-planner-modal', 'recipe-import');
		this.titleEl.setText('Import recipe from url');

		const { contentEl } = this;
		contentEl.empty();

		contentEl.createEl('p', {
			text: 'Paste a recipe url or Pinterest pin url. The importer will try structured recipe data first.',
			cls: 'recipe-count',
		});

		new Setting(contentEl)
			.setName('Recipe url')
			.setDesc('Example: https://example.com/recipe or https://www.pinterest.com/pin/...')
			.addText(text => {
				text
					.setPlaceholder('https://...')
					.setValue(this.url)
					.onChange(value => {
						this.url = value.trim();
					});
				text.inputEl.addEventListener('keydown', (e) => {
					e.stopPropagation();
					if (e.key === 'Enter') {
						e.preventDefault();
						void this.importNow();
					}
				});
				window.setTimeout(() => text.inputEl.focus(), 0);
			});

		const actions = contentEl.createDiv('recipe-import-actions');
		this.importBtn = actions.createEl('button', { text: 'Import recipe' });
		this.importBtn.addEventListener('click', () => {
			void this.importNow();
		});

		const cancelBtn = actions.createEl('button', { text: 'Cancel' });
		cancelBtn.addEventListener('click', () => this.close());

		this.statusEl = contentEl.createEl('p', { cls: 'recipe-count' });
	}

	private async importNow(): Promise<void> {
		if (!this.url) {
			new Notice('Please paste a url first.');
			return;
		}
		if (!this.importBtn) return;

		this.importBtn.disabled = true;
		if (this.statusEl) this.statusEl.setText('Importing recipe...');

		try {
			const file = await this.plugin.importRecipeFromUrl(this.url);
			new Notice(`Imported "${file.basename}"`);
			this.plugin.openRecipeFile(file.path);
			this.close();
		} catch (e) {
			const msg = (e as Error).message || 'Import failed.';
			new Notice(`Import failed: ${msg}`);
			if (this.statusEl) this.statusEl.setText(`Import failed: ${msg}`);
		} finally {
			this.importBtn.disabled = false;
		}
	}

	onClose(): void {
		this.contentEl.empty();
	}
}

export class RecipeSuggestModal extends FuzzySuggestModal<ParsedRecipe> {
	plugin: MealPlannerPlugin;
	onChoose: (recipe: ParsedRecipe) => void;

	constructor(app: App, plugin: MealPlannerPlugin, onChoose: (recipe: ParsedRecipe) => void) {
		super(app);
		this.plugin = plugin;
		this.onChoose = onChoose;
		this.setPlaceholder('Search for a recipe...');
	}

	getItems(): ParsedRecipe[] {
		return this.plugin.cachedRecipes;
	}

	getItemText(recipe: ParsedRecipe): string {
		return recipe.title;
	}

	onChooseItem(recipe: ParsedRecipe): void {
		this.onChoose(recipe);
	}
}

