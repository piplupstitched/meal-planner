export interface ImportedRecipeDraft {
	title: string;
	sourceUrl: string;
	servings: string;
	prepTime: string;
	cookTime: string;
	totalTime: string;
	mealType: string[];
	caloriesPerServing: string;
	netCarbs: string;
	protein: string;
	diet: string[];
	tags: string[];
	ingredients: string[];
	instructions: string[];
}

type JsonObj = Record<string, any>;

export class WebRecipeParser {
	static parseRecipeFromHtml(html: string, fallbackUrl: string): ImportedRecipeDraft | null {
		const recipes = this.extractRecipeObjects(html);
		if (recipes.length === 0) return null;

		// Prefer the most complete recipe payload.
		recipes.sort((a, b) => this.recipeScore(b) - this.recipeScore(a));
		const recipe = recipes[0];

		const title = this.cleanText(recipe.name || recipe.headline || 'Imported Recipe');
		const sourceUrl = this.cleanText(recipe.url || fallbackUrl);
		const servings = this.normalizeYield(recipe.recipeYield);
		const prepTime = this.formatDuration(recipe.prepTime);
		const cookTime = this.formatDuration(recipe.cookTime);
		const totalTime = this.formatDuration(recipe.totalTime);

		const ingredients = this.normalizeStringList(recipe.recipeIngredient || recipe.ingredients);
		const instructions = this.extractInstructions(recipe.recipeInstructions);

		const nutrition = (recipe.nutrition || {}) as JsonObj;
		const caloriesPerServing = this.extractNumberString(nutrition.calories);
		const protein = this.extractNumberString(nutrition.proteinContent);
		const netCarbs = this.extractNumberString(
			nutrition.carbohydrateContent || nutrition.carbs || nutrition.netCarbs
		);

		const keywords = this.normalizeStringList(recipe.keywords);
		const categories = this.normalizeStringList(recipe.recipeCategory);
		const cuisines = this.normalizeStringList(recipe.recipeCuisine);
		const combined = [...keywords, ...categories, ...cuisines].map(s => s.toLowerCase());

		const mealType = this.detectMealType(combined);
		const diet = this.detectDietTags(combined);
		const tags = this.unique([
			...keywords,
			...categories,
			...cuisines,
			'imported',
		]).slice(0, 12);

		return {
			title,
			sourceUrl,
			servings,
			prepTime,
			cookTime,
			totalTime,
			mealType,
			caloriesPerServing,
			netCarbs,
			protein,
			diet,
			tags,
			ingredients,
			instructions,
		};
	}

	static extractPinterestOutboundUrl(html: string): string | null {
		const metaMatch = html.match(/property=["']og:see_also["'][^>]*content=["']([^"']+)["']/i);
		if (metaMatch?.[1]) {
			const u = this.tryDecodeUrl(metaMatch[1]);
			if (this.isLikelyExternalRecipeUrl(u)) return u;
		}

		const offsiteLinks = html.match(/https:\/\/www\.pinterest\.com\/offsite\/\?[^"'<\s]+/gi) || [];
		for (const link of offsiteLinks) {
			try {
				const urlObj = new URL(link);
				const target = urlObj.searchParams.get('url');
				const u = this.tryDecodeUrl(target || '');
				if (this.isLikelyExternalRecipeUrl(u)) return u;
			} catch {
				// ignore malformed URL
			}
		}

		const escapedLinkMatches = html.match(/"link":"(https?:\\\/\\\/[^"]+)"/gi) || [];
		for (const raw of escapedLinkMatches) {
			const m = raw.match(/"link":"([^"]+)"/i);
			if (!m?.[1]) continue;
			const u = this.tryDecodeUrl(m[1]);
			if (this.isLikelyExternalRecipeUrl(u)) return u;
		}

		return null;
	}

	private static extractRecipeObjects(html: string): JsonObj[] {
		const scripts = html.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi) || [];
		const recipes: JsonObj[] = [];

		for (const scriptTag of scripts) {
			const body = scriptTag
				.replace(/^<script[^>]*>/i, '')
				.replace(/<\/script>$/i, '')
				.trim();

			const parsed = this.tryParseJsonLd(body);
			if (!parsed) continue;
			this.walkForRecipeObjects(parsed, recipes);
		}

		return recipes;
	}

	private static walkForRecipeObjects(node: any, out: JsonObj[]): void {
		if (!node) return;

		if (Array.isArray(node)) {
			for (const item of node) this.walkForRecipeObjects(item, out);
			return;
		}

		if (typeof node !== 'object') return;

		if (this.isRecipeType(node['@type'])) {
			out.push(node);
		}

		for (const value of Object.values(node)) {
			this.walkForRecipeObjects(value, out);
		}
	}

	private static isRecipeType(typeVal: any): boolean {
		if (!typeVal) return false;
		if (Array.isArray(typeVal)) return typeVal.some(t => this.isRecipeType(t));
		return String(typeVal).toLowerCase().includes('recipe');
	}

	private static recipeScore(recipe: JsonObj): number {
		const ingredients = this.normalizeStringList(recipe.recipeIngredient || recipe.ingredients);
		const instructions = this.extractInstructions(recipe.recipeInstructions);
		let score = 0;
		score += ingredients.length * 3;
		score += instructions.length * 4;
		if (recipe.name) score += 5;
		if (recipe.nutrition) score += 2;
		return score;
	}

	private static tryParseJsonLd(raw: string): any | null {
		try {
			return JSON.parse(raw);
		} catch {
			// Some pages embed non-JSON-safe chars; strip control chars and retry.
			try {
				const cleaned = raw.replace(/[\u0000-\u001F]+/g, '');
				return JSON.parse(cleaned);
			} catch {
				return null;
			}
		}
	}

	private static extractInstructions(input: any): string[] {
		const steps: string[] = [];

		const walk = (node: any) => {
			if (!node) return;
			if (Array.isArray(node)) {
				for (const item of node) walk(item);
				return;
			}
			if (typeof node === 'string') {
				const s = this.cleanText(node);
				if (s) steps.push(s);
				return;
			}
			if (typeof node !== 'object') return;

			if (typeof node.text === 'string') {
				const s = this.cleanText(node.text);
				if (s) steps.push(s);
			}

			if (Array.isArray(node.itemListElement)) walk(node.itemListElement);
			if (Array.isArray(node.steps)) walk(node.steps);
		};

		walk(input);
		return this.unique(steps);
	}

	private static normalizeStringList(value: any): string[] {
		if (!value) return [];

		if (Array.isArray(value)) {
			return this.unique(
				value
					.map(v => this.cleanText(String(v)))
					.filter(Boolean)
			);
		}

		if (typeof value === 'string') {
			// Keywords are often comma-separated.
			return this.unique(
				value
					.split(',')
					.map(v => this.cleanText(v))
					.filter(Boolean)
			);
		}

		return [];
	}

	private static normalizeYield(yieldVal: any): string {
		if (!yieldVal) return '';
		if (Array.isArray(yieldVal) && yieldVal.length > 0) return this.cleanText(String(yieldVal[0]));
		return this.cleanText(String(yieldVal));
	}

	private static formatDuration(isoDuration: any): string {
		if (!isoDuration || typeof isoDuration !== 'string') return '';
		const s = isoDuration.trim();
		if (!s.startsWith('P')) return s;

		const m = s.match(/P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?/i);
		if (!m) return s;

		const days = parseInt(m[1] || '0', 10);
		const hours = parseInt(m[2] || '0', 10);
		const mins = parseInt(m[3] || '0', 10);

		const parts: string[] = [];
		if (days > 0) parts.push(`${days}d`);
		if (hours > 0) parts.push(`${hours}h`);
		if (mins > 0) parts.push(`${mins}m`);
		return parts.join(' ');
	}

	private static extractNumberString(value: any): string {
		if (!value) return '';
		const s = String(value);
		const m = s.match(/([\d.]+)/);
		return m ? m[1] : '';
	}

	private static detectMealType(tokens: string[]): string[] {
		const mealTypes: string[] = [];
		const addIfMatch = (key: string, type: string) => {
			if (tokens.some(t => t.includes(key))) mealTypes.push(type);
		};
		addIfMatch('breakfast', 'breakfast');
		addIfMatch('brunch', 'breakfast');
		addIfMatch('lunch', 'lunch');
		addIfMatch('dinner', 'dinner');
		addIfMatch('main', 'dinner');
		addIfMatch('snack', 'snack');
		addIfMatch('dessert', 'dessert');
		return this.unique(mealTypes.length > 0 ? mealTypes : ['dinner']);
	}

	private static detectDietTags(tokens: string[]): string[] {
		const labels = [
			'vegetarian',
			'vegan',
			'keto',
			'low-carb',
			'gluten-free',
			'dairy-free',
			'high-protein',
		];

		return labels.filter(label => {
			const normalized = label.replace('-', ' ');
			return tokens.some(t => t.includes(label) || t.includes(normalized));
		});
	}

	private static tryDecodeUrl(value: string): string {
		if (!value) return '';
		let s = value.trim();
		s = s.replace(/\\u002F/gi, '/').replace(/\\\//g, '/');
		try {
			s = decodeURIComponent(s);
		} catch {
			// keep original
		}
		return s;
	}

	private static isLikelyExternalRecipeUrl(url: string): boolean {
		if (!url || !/^https?:\/\//i.test(url)) return false;
		try {
			const host = new URL(url).hostname.toLowerCase();
			return !host.includes('pinterest.com');
		} catch {
			return false;
		}
	}

	private static cleanText(s: string): string {
		return s.replace(/\s+/g, ' ').trim();
	}

	private static unique(values: string[]): string[] {
		return [...new Set(values.filter(Boolean))];
	}
}
