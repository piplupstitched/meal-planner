import { App, PluginSettingTab, Setting } from 'obsidian';
import type MealPlannerPlugin from './main';

export class MealPlannerSettingTab extends PluginSettingTab {
	plugin: MealPlannerPlugin;

	constructor(app: App, plugin: MealPlannerPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl('h2', { text: 'Meal Planner Settings' });

		new Setting(containerEl)
			.setName('Recipe folder path')
			.setDesc('Path to your recipe folder relative to vault root')
			.addText(text =>
				text
					.setPlaceholder('Recipes')
					.setValue(this.plugin.dataStore.getData().settings.recipeFolderPath)
					.onChange(async (value) => {
						await this.plugin.dataStore.updateSettings({ recipeFolderPath: value });
					})
			);

		new Setting(containerEl)
			.setName('Dinners per week')
			.setDesc('Number of dinner recipes to plan per week')
			.addSlider(slider =>
				slider
					.setLimits(3, 7, 1)
					.setValue(this.plugin.dataStore.getData().settings.dinnersPerWeek)
					.setDynamicTooltip()
					.onChange(async (value) => {
						await this.plugin.dataStore.updateSettings({ dinnersPerWeek: value });
					})
			);

		new Setting(containerEl)
			.setName('Leftover lunches')
			.setDesc('Assume dinners provide leftovers for 1-2 lunches the next day')
			.addToggle(toggle =>
				toggle
					.setValue(this.plugin.dataStore.getData().settings.leftoverLunches)
					.onChange(async (value) => {
						await this.plugin.dataStore.updateSettings({ leftoverLunches: value });
					})
			);

		new Setting(containerEl)
			.setName('Plan categories')
			.setDesc('Recipe categories to include when generating plans (comma-separated)')
			.addText(text =>
				text
					.setPlaceholder('Mains, Soups, Salads')
					.setValue(this.plugin.dataStore.getData().settings.planCategories.join(', '))
					.onChange(async (value) => {
						const cats = value.split(',').map(s => s.trim()).filter(Boolean);
						await this.plugin.dataStore.updateSettings({ planCategories: cats });
					})
			);

		// ── Export Settings ──

		containerEl.createEl('h3', { text: 'Grocery Export' });

		new Setting(containerEl)
			.setName('Grocery list file path')
			.setDesc('Vault-relative path for the exported grocery list markdown file')
			.addText(text =>
				text
					.setPlaceholder('Grocery List.md')
					.setValue(this.plugin.dataStore.getData().settings.groceryExportPath)
					.onChange(async (value) => {
						await this.plugin.dataStore.updateSettings({ groceryExportPath: value });
					})
			);

		containerEl.createEl('h3', { text: 'Todoist Integration' });

		new Setting(containerEl)
			.setName('Todoist API token')
			.setDesc('Your Todoist API token (Settings > Integrations > Developer in Todoist)')
			.addText(text =>
				text
					.setPlaceholder('Enter API token...')
					.setValue(this.plugin.dataStore.getData().settings.todoistApiToken)
					.onChange(async (value) => {
						await this.plugin.dataStore.updateSettings({ todoistApiToken: value });
					})
			);

		new Setting(containerEl)
			.setName('Todoist project name')
			.setDesc('Name of the Todoist project for grocery lists (created if it doesn\'t exist)')
			.addText(text =>
				text
					.setPlaceholder('Grocery List')
					.setValue(this.plugin.dataStore.getData().settings.todoistProjectName)
					.onChange(async (value) => {
						await this.plugin.dataStore.updateSettings({ todoistProjectName: value });
					})
			);

		// ── Stats ──

		containerEl.createEl('h3', { text: 'Statistics' });

		const cookedCount = this.plugin.dataStore.getCookedMeals().length;
		const planCount = this.plugin.dataStore.getWeeklyPlans().length;
		const recipeCount = this.plugin.cachedRecipes.length;
		const season = this.plugin.planner.seasonal.getSeasonLabel();

		containerEl.createEl('p', { text: `Recipes indexed: ${recipeCount}` });
		containerEl.createEl('p', { text: `Meals cooked (tracked): ${cookedCount}` });
		containerEl.createEl('p', { text: `Weekly plans generated: ${planCount}` });
		containerEl.createEl('p', { text: `Current season: ${season}` });

		// Refresh button
		new Setting(containerEl)
			.setName('Refresh recipe index')
			.setDesc('Re-scan all recipe files')
			.addButton(btn =>
				btn
					.setButtonText('Refresh')
					.onClick(async () => {
						await this.plugin.refreshRecipes();
						this.display();
					})
			);
	}
}
