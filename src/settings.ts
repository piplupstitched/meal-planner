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

		new Setting(containerEl).setName('Meal planner options').setHeading();

		new Setting(containerEl)
			.setName('Recipe folder path')
			.setDesc('Path to your recipe folder relative to vault root')
			.addText(text =>
				text
					.setPlaceholder('Recipes')
					.setValue(this.plugin.dataStore.getData().settings.recipeFolderPath)
					.onChange((value) => {
						void this.plugin.dataStore.updateSettings({ recipeFolderPath: value });
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
					.onChange((value) => {
						void this.plugin.dataStore.updateSettings({ dinnersPerWeek: value });
					})
			);

		new Setting(containerEl)
			.setName('Leftover lunches')
			.setDesc('Assume dinners provide leftovers for 1-2 lunches the next day')
			.addToggle(toggle =>
				toggle
					.setValue(this.plugin.dataStore.getData().settings.leftoverLunches)
					.onChange((value) => {
						void this.plugin.dataStore.updateSettings({ leftoverLunches: value });
					})
			);

		new Setting(containerEl)
			.setName('Plan categories')
			.setDesc('Recipe categories to include when generating plans (comma-separated)')
			.addText(text =>
				text
					.setPlaceholder('mains, soups, salads')
					.setValue(this.plugin.dataStore.getData().settings.planCategories.join(', '))
					.onChange((value) => {
						const cats = value.split(',').map(s => s.trim()).filter(Boolean);
						void this.plugin.dataStore.updateSettings({ planCategories: cats });
					})
			);

		// ── Export Settings ──

		new Setting(containerEl).setName('Grocery export').setHeading();

		new Setting(containerEl)
			.setName('Grocery list file path')
			.setDesc('Vault-relative path for the exported grocery list markdown file')
			.addText(text =>
				text
					.setPlaceholder('grocery-list.md')
					.setValue(this.plugin.dataStore.getData().settings.groceryExportPath)
					.onChange((value) => {
						void this.plugin.dataStore.updateSettings({ groceryExportPath: value });
					})
			);

		new Setting(containerEl).setName('Todoist integration').setHeading();

		new Setting(containerEl)
			.setName('Todoist API token')
			.setDesc('Your Todoist API token (Settings > Integrations > Developer in Todoist)')
			.addText(text =>
				text
					.setPlaceholder('Enter API token...')
					.setValue(this.plugin.dataStore.getData().settings.todoistApiToken)
					.onChange((value) => {
						void this.plugin.dataStore.updateSettings({ todoistApiToken: value });
					})
			);

		new Setting(containerEl)
			.setName('Todoist project name')
			.setDesc('Name of the Todoist project for grocery lists (created if it doesn\'t exist)')
			.addText(text =>
				text
					.setPlaceholder('grocery list')
					.setValue(this.plugin.dataStore.getData().settings.todoistProjectName)
					.onChange((value) => {
						void this.plugin.dataStore.updateSettings({ todoistProjectName: value });
					})
			);

		// ── Stats ──

		new Setting(containerEl).setName('Statistics').setHeading();

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
					.onClick(() => {
						void (async () => {
							await this.plugin.refreshRecipes();
							this.display();
						})().catch(() => {});
					})
			);
	}
}
