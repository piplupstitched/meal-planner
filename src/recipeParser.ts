import { App, TFile, TFolder, parseYaml } from 'obsidian';
import { ParsedRecipe, RecipeFrontmatter, IngredientSection, IngredientItem } from './types';

export class RecipeParser {
	private app: App;
	private recipeFolderPath: string;

	constructor(app: App, recipeFolderPath: string) {
		this.app = app;
		this.recipeFolderPath = recipeFolderPath;
	}

	/**
	 * Recursively find all markdown files in the recipe folder.
	 */
	getRecipeFiles(): TFile[] {
		const folder = this.app.vault.getAbstractFileByPath(this.recipeFolderPath);
		if (!folder || !(folder instanceof TFolder)) {
			console.error(`Recipe folder not found: ${this.recipeFolderPath}`);
			return [];
		}
		return this.collectMarkdownFiles(folder);
	}

	private collectMarkdownFiles(folder: TFolder): TFile[] {
		const files: TFile[] = [];
		for (const child of folder.children) {
			if (child instanceof TFile && child.extension === 'md') {
				files.push(child);
			} else if (child instanceof TFolder) {
				files.push(...this.collectMarkdownFiles(child));
			}
		}
		return files;
	}

	/**
	 * Parse a single recipe file into a structured object.
	 */
	async parseRecipe(file: TFile): Promise<ParsedRecipe | null> {
		try {
			const content = await this.app.vault.cachedRead(file);
			const frontmatter = this.parseFrontmatter(content);
			if (!frontmatter || !frontmatter.title) return null;

			const ingredients = this.parseIngredients(content);
			const { category, subcategory } = this.extractCategories(file.path);

			return {
				id: file.path,
				filePath: file.path,
				title: frontmatter.title,
				category,
				subcategory,
				frontmatter,
				ingredients,
				servings: this.parseNumber(frontmatter.servings),
				caloriesPerServing: this.parseNumber(String(frontmatter.calories_per_serving)),
				netCarbs: this.parseNumber(frontmatter.net_carbs),
				protein: this.parseNumber(frontmatter.protein),
			};
		} catch (e) {
			console.error(`Failed to parse recipe: ${file.path}`, e);
			return null;
		}
	}

	/**
	 * Parse all recipes in the vault.
	 */
	async parseAllRecipes(): Promise<ParsedRecipe[]> {
		const files = this.getRecipeFiles();
		const recipes: ParsedRecipe[] = [];

		for (const file of files) {
			const recipe = await this.parseRecipe(file);
			if (recipe) recipes.push(recipe);
		}

		return recipes;
	}

	/**
	 * Extract YAML frontmatter from markdown content.
	 */
	private parseFrontmatter(content: string): RecipeFrontmatter | null {
		const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
		if (!match) return null;

		try {
			const yaml = parseYaml(match[1]);
			if (!yaml) return null;

			// Normalize array fields that might be strings
			return {
				title: yaml.title || '',
				servings: String(yaml.servings || ''),
				prep_time: yaml.prep_time || '',
				cook_time: yaml.cook_time || '',
				total_time: yaml.total_time || '',
				difficulty: yaml.difficulty || '',
				meal_type: this.normalizeArray(yaml.meal_type),
				calories_per_serving: yaml.calories_per_serving || 0,
				net_carbs: String(yaml.net_carbs || '0'),
				protein: String(yaml.protein || '0'),
				fiber: String(yaml.fiber || ''),
				sugar: String(yaml.sugar || ''),
				diet: this.normalizeArray(yaml.diet),
				source: yaml.source || '',
				tags: this.normalizeArray(yaml.tags),
				equipment: this.normalizeArray(yaml.equipment),
				freezer_friendly: String(yaml.freezer_friendly || ''),
				reheat: yaml.reheat || '',
			};
		} catch (e) {
			console.error('Failed to parse YAML frontmatter', e);
			return null;
		}
	}

	/**
	 * Parse the Ingredients section, handling subsections (Main, Sauce/Dressing, Sides).
	 */
	private parseIngredients(content: string): IngredientSection[] {
		const sections: IngredientSection[] = [];

		// Find the ## Ingredients section
		const ingredientsMatch = content.match(/## Ingredients\r?\n([\s\S]*?)(?=\r?\n---|\r?\n## Instructions)/);
		if (!ingredientsMatch) return sections;

		const ingredientsBlock = ingredientsMatch[1];

		// Split by ### subsection headings
		const subsectionRegex = /### (.+)\r?\n([\s\S]*?)(?=\r?\n###|\s*$)/g;
		let match;

		while ((match = subsectionRegex.exec(ingredientsBlock)) !== null) {
			const heading = match[1].trim();
			const body = match[2];
			const items = this.parseIngredientItems(body);

			if (items.length > 0) {
				sections.push({ heading, items });
			}
		}

		// If no subsections found, parse the whole block as one section
		if (sections.length === 0) {
			const items = this.parseIngredientItems(ingredientsBlock);
			if (items.length > 0) {
				sections.push({ heading: 'Main', items });
			}
		}

		return sections;
	}

	/**
	 * Parse individual ingredient lines from a text block.
	 */
	private parseIngredientItems(text: string): IngredientItem[] {
		const items: IngredientItem[] = [];
		const lines = text.split('\n');

		for (const line of lines) {
			const trimmed = line.trim();
			// Match lines starting with - (list items), skip bold headings
			if (!trimmed.startsWith('-')) continue;
			const content = trimmed.replace(/^-\s*/, '').replace(/\s*$/, '');
			if (!content || content.startsWith('**')) continue;

			const parsed = this.parseIngredientLine(content);
			items.push(parsed);
		}

		return items;
	}

	/**
	 * Parse a single ingredient line into quantity, unit, and name.
	 * Examples:
	 *   "4 oz cream cheese, softened" -> { quantity: "4", unit: "oz", name: "cream cheese" }
	 *   "3 cups cooked shredded chicken" -> { quantity: "3", unit: "cups", name: "cooked shredded chicken" }
	 *   "Kosher salt" -> { name: "Kosher salt" }
	 */
	private parseIngredientLine(raw: string): IngredientItem {
		// Remove trailing modifiers in parentheses and after commas for name extraction
		const cleanRaw = raw.replace(/\s{2,}/g, ' ').trim();

		// Pattern: optional quantity (number/fraction), optional unit, then name
		const quantityPattern = /^([\d½¼¾⅓⅔⅛\/\-–]+(?:\s*[\d½¼¾⅓⅔⅛\/\-–]*)?)\s+/;
		const quantityMatch = cleanRaw.match(quantityPattern);

		if (!quantityMatch) {
			return { raw: cleanRaw, name: this.extractIngredientName(cleanRaw) };
		}

		const quantity = quantityMatch[1].trim();
		const rest = cleanRaw.slice(quantityMatch[0].length);

		// Common units
		const unitPattern = /^(cups?|tbsp|tsp|oz|lb|lbs?|pint|quart|gallon|cloves?|cans?|packages?|packets?|slices?|pieces?|stalks?|heads?|bunche?s?|large|medium|small|whole|center-cut)\b\.?\s*/i;
		const unitMatch = rest.match(unitPattern);

		if (unitMatch) {
			const unit = unitMatch[1];
			const name = rest.slice(unitMatch[0].length);
			return {
				raw: cleanRaw,
				quantity,
				unit,
				name: this.extractIngredientName(name),
			};
		}

		return {
			raw: cleanRaw,
			quantity,
			name: this.extractIngredientName(rest),
		};
	}

	/**
	 * Extract the core ingredient name, stripping preparation notes.
	 */
	private extractIngredientName(raw: string): string {
		return raw
			.replace(/,\s.*$/, '')        // strip after comma (e.g. ", softened")
			.replace(/\(.*?\)/g, '')       // strip parenthetical notes
			.replace(/\s{2,}/g, ' ')
			.trim();
	}

	/**
	 * Extract category and subcategory from file path.
	 * "Recipes/4. Mains/Chicken/file.md" -> { category: "Mains", subcategory: "Chicken" }
	 */
	private extractCategories(filePath: string): { category: string; subcategory: string } {
		const parts = filePath.split('/');
		// Remove "Recipes" prefix and filename
		const folders = parts.slice(1, -1);

		let category = '';
		let subcategory = '';

		if (folders.length >= 1) {
			// Strip numeric prefix: "4. Mains" -> "Mains"
			category = folders[0].replace(/^\d+\.\s*/, '');
		}
		if (folders.length >= 2) {
			subcategory = folders[1].replace(/^\d+\.\s*/, '');
		}

		return { category, subcategory };
	}

	/**
	 * Parse a numeric value from strings like "~380–420", "4–6 (12 taquitos)", "11g".
	 */
	private parseNumber(value: string): number {
		if (!value) return 0;
		const cleaned = String(value).replace(/[~g]/g, '');
		// If range like "380–420" or "380-420", take the average
		const rangeMatch = cleaned.match(/([\d.]+)\s*[–\-]\s*([\d.]+)/);
		if (rangeMatch) {
			return Math.round((parseFloat(rangeMatch[1]) + parseFloat(rangeMatch[2])) / 2);
		}
		// Take first number found
		const numMatch = cleaned.match(/([\d.]+)/);
		return numMatch ? parseFloat(numMatch[1]) : 0;
	}

	/**
	 * Normalize a value to an array of strings.
	 */
	private normalizeArray(value: unknown): string[] {
		if (Array.isArray(value)) return value.map(String);
		if (typeof value === 'string') return value ? [value] : [];
		return [];
	}
}
