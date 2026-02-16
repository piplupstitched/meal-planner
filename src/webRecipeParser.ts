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

type JsonScalar = string | number | boolean | null;
type JsonObject = { [key: string]: JsonValue };
type JsonArray = JsonValue[];
type JsonValue = JsonScalar | JsonObject | JsonArray;

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

		const nutrition = this.isJsonObject(recipe.nutrition) ? recipe.nutrition : {};
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

		const escapedLinkMatches = html.match(/"link":"(https?:[^"]+)"/gi) || [];
		for (const raw of escapedLinkMatches) {
			const m = raw.match(/"link":"([^"]+)"/i);
			if (!m?.[1]) continue;
			const u = this.tryDecodeUrl(m[1]);
			if (this.isLikelyExternalRecipeUrl(u)) return u;
		}

		return null;
	}

	private static extractRecipeObjects(html: string): JsonObject[] {
		const scripts = html.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi) || [];
		const recipes: JsonObject[] = [];

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

	private static walkForRecipeObjects(node: JsonValue | undefined, out: JsonObject[]): void {
		if (!node) return;

		if (Array.isArray(node)) {
			for (const item of node) this.walkForRecipeObjects(item, out);
			return;
		}

		if (!this.isJsonObject(node)) return;
		const obj = node;

		if (this.isRecipeType(obj['@type'])) {
			out.push(obj);
		}

		for (const value of Object.values(obj)) {
			this.walkForRecipeObjects(value, out);
		}
	}

	private static isRecipeType(typeVal: JsonValue | undefined): boolean {
		if (!typeVal) return false;
		if (Array.isArray(typeVal)) return typeVal.some(t => this.isRecipeType(t));
		if (typeof typeVal === 'string') return typeVal.toLowerCase().includes('recipe');
		if (this.isJsonObject(typeVal)) {
			const nestedType = typeVal['@type'];
			return this.isRecipeType(nestedType);
		}
		return false;
	}

	private static recipeScore(recipe: JsonObject): number {
		const ingredients = this.normalizeStringList(recipe.recipeIngredient || recipe.ingredients);
		const instructions = this.extractInstructions(recipe.recipeInstructions);
		let score = 0;
		score += ingredients.length * 3;
		score += instructions.length * 4;
		if (recipe.name) score += 5;
		if (recipe.nutrition) score += 2;
		return score;
	}

	private static tryParseJsonLd(raw: string): JsonObject | JsonArray | null {
		try {
			const parsed = JSON.parse(raw) as JsonValue;
			if (Array.isArray(parsed) || this.isJsonObject(parsed)) return parsed;
			return null;
		} catch {
			// Some pages embed non-JSON-safe chars; strip control chars and retry.
			try {
				const cleaned = this.stripControlChars(raw);
				const parsed = JSON.parse(cleaned) as JsonValue;
				if (Array.isArray(parsed) || this.isJsonObject(parsed)) return parsed;
				return null;
			} catch {
				return null;
			}
		}
	}

	private static extractInstructions(input: JsonValue | undefined): string[] {
		const steps: string[] = [];

		const walk = (node: JsonValue | undefined) => {
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
			if (!this.isJsonObject(node)) return;
			const obj = node;

			if (typeof obj.text === 'string') {
				const s = this.cleanText(obj.text);
				if (s) steps.push(s);
			}

			if (Array.isArray(obj.itemListElement)) walk(obj.itemListElement);
			if (Array.isArray(obj.steps)) walk(obj.steps);
		};

		walk(input);
		return this.unique(steps);
	}

	private static normalizeStringList(value: JsonValue | undefined): string[] {
		if (!value) return [];

		if (Array.isArray(value)) {
			return this.unique(
				value
					.map(v => (typeof v === 'string' ? this.cleanText(v) : typeof v === 'number' ? String(v) : ''))
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

	private static normalizeYield(yieldVal: JsonValue | undefined): string {
		if (!yieldVal) return '';
		if (typeof yieldVal === 'string') return this.cleanText(yieldVal);
		if (typeof yieldVal === 'number') return String(yieldVal);
		if (Array.isArray(yieldVal) && yieldVal.length > 0) {
			const first = yieldVal[0];
			if (typeof first === 'string') return this.cleanText(first);
			if (typeof first === 'number') return String(first);
		}
		if (this.isJsonObject(yieldVal)) {
			const text = yieldVal.text;
			if (typeof text === 'string') return this.cleanText(text);
			if (typeof text === 'number') return String(text);
		}
		return '';
	}

	private static formatDuration(isoDuration: JsonValue | undefined): string {
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

	private static extractNumberString(value: JsonValue | undefined): string {
		if (!value) return '';
		if (typeof value === 'number') return String(value);
		if (typeof value === 'boolean') return '';
		if (Array.isArray(value)) {
			for (const item of value) {
				const parsed = this.extractNumberString(item);
				if (parsed) return parsed;
			}
			return '';
		}
		if (this.isJsonObject(value)) {
			const candidates = ['value', 'text', '@value', 'name'];
			for (const key of candidates) {
				const parsed = this.extractNumberString(value[key]);
				if (parsed) return parsed;
			}
			return '';
		}
		const s = value;
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
		if (!url) return false;
		try {
			const parsed = new URL(url);
			if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
			const host = parsed.hostname.toLowerCase();
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

	private static isJsonObject(value: JsonValue | undefined): value is JsonObject {
		return typeof value === 'object' && value !== null && !Array.isArray(value);
	}

	private static stripControlChars(raw: string): string {
		let out = '';
		for (const ch of raw) {
			const code = ch.charCodeAt(0);
			if (code >= 32 || code === 9 || code === 10 || code === 13) {
				out += ch;
			}
		}
		return out;
	}
}
