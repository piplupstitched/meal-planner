var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/main.ts
var main_exports = {};
__export(main_exports, {
  default: () => MealPlannerPlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian5 = require("obsidian");

// src/recipeParser.ts
var import_obsidian = require("obsidian");
var RecipeParser = class {
  constructor(app, recipeFolderPath) {
    this.app = app;
    this.recipeFolderPath = recipeFolderPath;
  }
  /**
   * Recursively find all markdown files in the recipe folder.
   */
  getRecipeFiles() {
    const folder = this.app.vault.getAbstractFileByPath(this.recipeFolderPath);
    if (!folder || !(folder instanceof import_obsidian.TFolder)) {
      console.error(`Recipe folder not found: ${this.recipeFolderPath}`);
      return [];
    }
    return this.collectMarkdownFiles(folder);
  }
  collectMarkdownFiles(folder) {
    const files = [];
    for (const child of folder.children) {
      if (child instanceof import_obsidian.TFile && child.extension === "md") {
        files.push(child);
      } else if (child instanceof import_obsidian.TFolder) {
        files.push(...this.collectMarkdownFiles(child));
      }
    }
    return files;
  }
  /**
   * Parse a single recipe file into a structured object.
   */
  async parseRecipe(file) {
    try {
      const content = await this.app.vault.cachedRead(file);
      const frontmatter = this.parseFrontmatter(content);
      if (!frontmatter || !frontmatter.title)
        return null;
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
        protein: this.parseNumber(frontmatter.protein)
      };
    } catch (e) {
      console.error(`Failed to parse recipe: ${file.path}`, e);
      return null;
    }
  }
  /**
   * Parse all recipes in the vault.
   */
  async parseAllRecipes() {
    const files = this.getRecipeFiles();
    const recipes = [];
    for (const file of files) {
      const recipe = await this.parseRecipe(file);
      if (recipe)
        recipes.push(recipe);
    }
    return recipes;
  }
  /**
   * Extract YAML frontmatter from markdown content.
   */
  parseFrontmatter(content) {
    const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!match)
      return null;
    try {
      const yaml = (0, import_obsidian.parseYaml)(match[1]);
      if (!yaml)
        return null;
      return {
        title: yaml.title || "",
        servings: String(yaml.servings || ""),
        prep_time: yaml.prep_time || "",
        cook_time: yaml.cook_time || "",
        total_time: yaml.total_time || "",
        difficulty: yaml.difficulty || "",
        meal_type: this.normalizeArray(yaml.meal_type),
        calories_per_serving: yaml.calories_per_serving || 0,
        net_carbs: String(yaml.net_carbs || "0"),
        protein: String(yaml.protein || "0"),
        fiber: String(yaml.fiber || ""),
        sugar: String(yaml.sugar || ""),
        diet: this.normalizeArray(yaml.diet),
        source: yaml.source || "",
        tags: this.normalizeArray(yaml.tags),
        equipment: this.normalizeArray(yaml.equipment),
        freezer_friendly: String(yaml.freezer_friendly || ""),
        reheat: yaml.reheat || ""
      };
    } catch (e) {
      console.error("Failed to parse YAML frontmatter", e);
      return null;
    }
  }
  /**
   * Parse the Ingredients section, handling subsections (Main, Sauce/Dressing, Sides).
   */
  parseIngredients(content) {
    const sections = [];
    const ingredientsMatch = content.match(/## Ingredients\r?\n([\s\S]*?)(?=\r?\n---|\r?\n## Instructions)/);
    if (!ingredientsMatch)
      return sections;
    const ingredientsBlock = ingredientsMatch[1];
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
    if (sections.length === 0) {
      const items = this.parseIngredientItems(ingredientsBlock);
      if (items.length > 0) {
        sections.push({ heading: "Main", items });
      }
    }
    return sections;
  }
  /**
   * Parse individual ingredient lines from a text block.
   */
  parseIngredientItems(text) {
    const items = [];
    const lines = text.split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("-"))
        continue;
      const content = trimmed.replace(/^-\s*/, "").replace(/\s*$/, "");
      if (!content || content.startsWith("**"))
        continue;
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
  parseIngredientLine(raw) {
    const cleanRaw = raw.replace(/\s{2,}/g, " ").trim();
    const quantityPattern = /^([\d½¼¾⅓⅔⅛\/\-–]+(?:\s*[\d½¼¾⅓⅔⅛\/\-–]*)?)\s+/;
    const quantityMatch = cleanRaw.match(quantityPattern);
    if (!quantityMatch) {
      return { raw: cleanRaw, name: this.extractIngredientName(cleanRaw) };
    }
    const quantity = quantityMatch[1].trim();
    const rest = cleanRaw.slice(quantityMatch[0].length);
    const unitPattern = /^(cups?|tbsp|tsp|oz|lb|lbs?|pint|quart|gallon|cloves?|cans?|packages?|packets?|slices?|pieces?|stalks?|heads?|bunche?s?|large|medium|small|whole|center-cut)\b\.?\s*/i;
    const unitMatch = rest.match(unitPattern);
    if (unitMatch) {
      const unit = unitMatch[1];
      const name = rest.slice(unitMatch[0].length);
      return {
        raw: cleanRaw,
        quantity,
        unit,
        name: this.extractIngredientName(name)
      };
    }
    return {
      raw: cleanRaw,
      quantity,
      name: this.extractIngredientName(rest)
    };
  }
  /**
   * Extract the core ingredient name, stripping preparation notes.
   */
  extractIngredientName(raw) {
    return raw.replace(/,\s.*$/, "").replace(/\(.*?\)/g, "").replace(/\s{2,}/g, " ").trim();
  }
  /**
   * Extract category and subcategory from file path.
   * "Recipes/4. Mains/Chicken/file.md" -> { category: "Mains", subcategory: "Chicken" }
   */
  extractCategories(filePath) {
    const parts = filePath.split("/");
    const folders = parts.slice(1, -1);
    let category = "";
    let subcategory = "";
    if (folders.length >= 1) {
      category = folders[0].replace(/^\d+\.\s*/, "");
    }
    if (folders.length >= 2) {
      subcategory = folders[1].replace(/^\d+\.\s*/, "");
    }
    return { category, subcategory };
  }
  /**
   * Parse a numeric value from strings like "~380–420", "4–6 (12 taquitos)", "11g".
   */
  parseNumber(value) {
    if (!value)
      return 0;
    const cleaned = String(value).replace(/[~g]/g, "");
    const rangeMatch = cleaned.match(/([\d.]+)\s*[–\-]\s*([\d.]+)/);
    if (rangeMatch) {
      return Math.round((parseFloat(rangeMatch[1]) + parseFloat(rangeMatch[2])) / 2);
    }
    const numMatch = cleaned.match(/([\d.]+)/);
    return numMatch ? parseFloat(numMatch[1]) : 0;
  }
  /**
   * Normalize a value to an array of strings.
   */
  normalizeArray(value) {
    if (Array.isArray(value))
      return value.map(String);
    if (typeof value === "string")
      return value ? [value] : [];
    return [];
  }
};

// src/types.ts
var DEFAULT_DATA = {
  recipeFolderPath: "Recipes",
  cookedMeals: [],
  weeklyPlans: [],
  groceryStoreAssignments: {},
  ingredientCategories: {},
  settings: {
    recipeFolderPath: "Recipes",
    dinnersPerWeek: 5,
    leftoverLunches: true,
    planCategories: ["Mains", "Soups", "Salads"],
    todoistApiToken: "",
    todoistProjectName: "Grocery List",
    groceryExportPath: "Grocery List.md"
  }
};

// src/dataStore.ts
var DataStore = class {
  constructor(plugin) {
    this.plugin = plugin;
    this.data = { ...DEFAULT_DATA };
  }
  async load() {
    const saved = await this.plugin.loadData();
    if (saved) {
      this.data = { ...DEFAULT_DATA, ...saved };
    }
  }
  async save() {
    await this.plugin.saveData(this.data);
  }
  getData() {
    return this.data;
  }
  // ── Settings ──
  getRecipeFolderPath() {
    return this.data.settings.recipeFolderPath;
  }
  async updateSettings(partial) {
    this.data.settings = { ...this.data.settings, ...partial };
    await this.save();
  }
  // ── Cooked Meals ──
  getCookedMeals() {
    return this.data.cookedMeals;
  }
  async addCookedMeal(meal) {
    this.data.cookedMeals.push(meal);
    await this.save();
  }
  async removeCookedMeal(recipeId, date) {
    this.data.cookedMeals = this.data.cookedMeals.filter(
      (m) => !(m.recipeId === recipeId && m.cookedDate === date)
    );
    await this.save();
  }
  // ── Weekly Plans ──
  getWeeklyPlans() {
    return this.data.weeklyPlans;
  }
  getCurrentWeekPlan() {
    const monday = this.getMonday(/* @__PURE__ */ new Date());
    const mondayStr = this.formatDate(monday);
    return this.data.weeklyPlans.find((p) => p.weekStart === mondayStr) || null;
  }
  async saveWeeklyPlan(plan) {
    const idx = this.data.weeklyPlans.findIndex((p) => p.weekStart === plan.weekStart);
    if (idx >= 0) {
      this.data.weeklyPlans[idx] = plan;
    } else {
      this.data.weeklyPlans.push(plan);
    }
    this.data.weeklyPlans.sort((a, b) => b.weekStart.localeCompare(a.weekStart));
    if (this.data.weeklyPlans.length > 12) {
      this.data.weeklyPlans = this.data.weeklyPlans.slice(0, 12);
    }
    await this.save();
  }
  async markMealCooked(recipeId, plannedDate, mealType) {
    await this.addCookedMeal({
      recipeId,
      cookedDate: plannedDate,
      mealType
    });
  }
  // ── Recipe Stats ──
  getRecipeStats(recipeId) {
    const cooked = this.data.cookedMeals.filter((m) => m.recipeId === recipeId);
    const timesCooked = cooked.length;
    let lastCooked = null;
    let daysSinceLastMade = null;
    if (timesCooked > 0) {
      const dates = cooked.map((m) => m.cookedDate).sort();
      lastCooked = dates[dates.length - 1];
      const lastDate = new Date(lastCooked);
      const now = /* @__PURE__ */ new Date();
      daysSinceLastMade = Math.floor(
        (now.getTime() - lastDate.getTime()) / (1e3 * 60 * 60 * 24)
      );
    }
    return { recipeId, lastCooked, timesCooked, daysSinceLastMade };
  }
  getAllRecipeStats(recipeIds) {
    const statsMap = /* @__PURE__ */ new Map();
    for (const id of recipeIds) {
      statsMap.set(id, this.getRecipeStats(id));
    }
    return statsMap;
  }
  // ── Grocery Store Assignments ──
  getStoreAssignment(ingredientName) {
    return this.data.groceryStoreAssignments[ingredientName.toLowerCase()] || "Any";
  }
  async setStoreAssignment(ingredientName, store) {
    this.data.groceryStoreAssignments[ingredientName.toLowerCase()] = store;
    await this.save();
  }
  // ── Ingredient Categories ──
  getIngredientCategory(ingredientName) {
    return this.data.ingredientCategories[ingredientName.toLowerCase()] || this.guessCategory(ingredientName);
  }
  async setIngredientCategory(ingredientName, category) {
    this.data.ingredientCategories[ingredientName.toLowerCase()] = category;
    await this.save();
  }
  // ── Utilities ──
  guessCategory(name) {
    const lower = name.toLowerCase();
    const produce = [
      "avocado",
      "tomato",
      "onion",
      "garlic",
      "cilantro",
      "lime",
      "lemon",
      "pepper",
      "lettuce",
      "spinach",
      "broccoli",
      "carrot",
      "celery",
      "cucumber",
      "jalape\xF1o",
      "ginger",
      "basil",
      "rosemary",
      "thyme",
      "parsley",
      "scallion",
      "cherry tomato",
      "red onion",
      "green onion",
      "bell pepper",
      "zucchini",
      "squash",
      "potato",
      "sweet potato",
      "mushroom",
      "corn",
      "cabbage",
      "kale"
    ];
    const protein = [
      "chicken",
      "beef",
      "pork",
      "shrimp",
      "salmon",
      "fish",
      "turkey",
      "sausage",
      "bacon",
      "tenderloin",
      "ground",
      "steak",
      "roast"
    ];
    const dairy = [
      "cheese",
      "cream cheese",
      "milk",
      "butter",
      "yogurt",
      "sour cream",
      "cream",
      "cheddar",
      "mozzarella",
      "parmesan",
      "feta",
      "cottage cheese",
      "egg"
    ];
    const spices = [
      "salt",
      "pepper",
      "cumin",
      "paprika",
      "chili powder",
      "oregano",
      "cinnamon",
      "nutmeg",
      "cayenne",
      "turmeric",
      "garlic powder",
      "onion powder"
    ];
    const bakery = ["tortilla", "bread", "bun", "roll", "pita", "naan", "wrap"];
    const frozen = ["frozen"];
    if (produce.some((p) => lower.includes(p)))
      return "produce";
    if (protein.some((p) => lower.includes(p)))
      return "protein";
    if (dairy.some((p) => lower.includes(p)))
      return "dairy";
    if (spices.some((p) => lower.includes(p)))
      return "spices";
    if (bakery.some((p) => lower.includes(p)))
      return "bakery";
    if (frozen.some((p) => lower.includes(p)))
      return "frozen";
    return "pantry";
  }
  getMonday(date) {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    d.setDate(diff);
    d.setHours(0, 0, 0, 0);
    return d;
  }
  formatDate(date) {
    return date.toISOString().split("T")[0];
  }
  getDayName(dateStr) {
    const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    return days[(/* @__PURE__ */ new Date(dateStr + "T00:00:00")).getDay()];
  }
};

// src/seasonal.ts
var SEASONAL_DATA = {
  // ── Spring (Mar-May) ──
  "asparagus": { months: [3, 4, 5], category: "vegetable" },
  "artichoke": { months: [3, 4, 5], category: "vegetable" },
  "pea": { months: [3, 4, 5, 6], category: "vegetable" },
  "peas": { months: [3, 4, 5, 6], category: "vegetable" },
  "radish": { months: [3, 4, 5], category: "vegetable" },
  "rhubarb": { months: [4, 5, 6], category: "fruit" },
  "strawberry": { months: [4, 5, 6], category: "fruit" },
  "strawberries": { months: [4, 5, 6], category: "fruit" },
  // ── Summer (Jun-Aug) ──
  "tomato": { months: [6, 7, 8, 9], category: "vegetable" },
  "tomatoes": { months: [6, 7, 8, 9], category: "vegetable" },
  "cherry tomato": { months: [6, 7, 8, 9], category: "vegetable" },
  "cherry tomatoes": { months: [6, 7, 8, 9], category: "vegetable" },
  "zucchini": { months: [6, 7, 8], category: "vegetable" },
  "corn": { months: [6, 7, 8, 9], category: "vegetable" },
  "bell pepper": { months: [6, 7, 8, 9], category: "vegetable" },
  "bell peppers": { months: [6, 7, 8, 9], category: "vegetable" },
  "cucumber": { months: [5, 6, 7, 8], category: "vegetable" },
  "eggplant": { months: [7, 8, 9], category: "vegetable" },
  "green bean": { months: [6, 7, 8], category: "vegetable" },
  "green beans": { months: [6, 7, 8], category: "vegetable" },
  "peach": { months: [6, 7, 8], category: "fruit" },
  "peaches": { months: [6, 7, 8], category: "fruit" },
  "blueberry": { months: [6, 7, 8], category: "fruit" },
  "blueberries": { months: [6, 7, 8], category: "fruit" },
  "raspberry": { months: [6, 7, 8], category: "fruit" },
  "raspberries": { months: [6, 7, 8], category: "fruit" },
  "watermelon": { months: [6, 7, 8], category: "fruit" },
  "cantaloupe": { months: [6, 7, 8], category: "fruit" },
  "basil": { months: [6, 7, 8, 9], category: "herb" },
  "cilantro": { months: [5, 6, 9, 10], category: "herb" },
  "jalape\xF1o": { months: [6, 7, 8, 9], category: "vegetable" },
  "okra": { months: [6, 7, 8, 9], category: "vegetable" },
  "avocado": { months: [3, 4, 5, 6, 7, 8], category: "fruit" },
  // ── Fall (Sep-Nov) ──
  "apple": { months: [9, 10, 11], category: "fruit" },
  "apples": { months: [9, 10, 11], category: "fruit" },
  "pumpkin": { months: [9, 10, 11], category: "vegetable" },
  "sweet potato": { months: [9, 10, 11, 12], category: "vegetable" },
  "sweet potatoes": { months: [9, 10, 11, 12], category: "vegetable" },
  "butternut squash": { months: [9, 10, 11], category: "vegetable" },
  "squash": { months: [9, 10, 11], category: "vegetable" },
  "spaghetti squash": { months: [9, 10, 11], category: "vegetable" },
  "brussels sprout": { months: [9, 10, 11, 12], category: "vegetable" },
  "brussels sprouts": { months: [9, 10, 11, 12], category: "vegetable" },
  "cranberry": { months: [10, 11, 12], category: "fruit" },
  "cranberries": { months: [10, 11, 12], category: "fruit" },
  "pear": { months: [9, 10, 11], category: "fruit" },
  "pears": { months: [9, 10, 11], category: "fruit" },
  "fig": { months: [8, 9, 10], category: "fruit" },
  "figs": { months: [8, 9, 10], category: "fruit" },
  "grape": { months: [8, 9, 10], category: "fruit" },
  "grapes": { months: [8, 9, 10], category: "fruit" },
  "cauliflower": { months: [9, 10, 11], category: "vegetable" },
  "turnip": { months: [10, 11, 12], category: "vegetable" },
  "parsnip": { months: [10, 11, 12, 1, 2], category: "vegetable" },
  // ── Winter (Dec-Feb) ──
  "citrus": { months: [12, 1, 2, 3], category: "fruit" },
  "orange": { months: [12, 1, 2, 3], category: "fruit" },
  "oranges": { months: [12, 1, 2, 3], category: "fruit" },
  "grapefruit": { months: [12, 1, 2, 3], category: "fruit" },
  "lemon": { months: [12, 1, 2, 3], category: "fruit" },
  "lemons": { months: [12, 1, 2, 3], category: "fruit" },
  "lime": { months: [5, 6, 7, 8, 9, 10], category: "fruit" },
  "kale": { months: [10, 11, 12, 1, 2, 3], category: "vegetable" },
  "collard greens": { months: [11, 12, 1, 2], category: "vegetable" },
  "cabbage": { months: [10, 11, 12, 1, 2, 3], category: "vegetable" },
  "beet": { months: [6, 7, 8, 9, 10], category: "vegetable" },
  "beets": { months: [6, 7, 8, 9, 10], category: "vegetable" },
  "celery": { months: [9, 10, 11], category: "vegetable" },
  "pomegranate": { months: [10, 11, 12, 1], category: "fruit" },
  // ── Year-round staples (no bonus, but listed for reference) ──
  "onion": { months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], category: "vegetable" },
  "red onion": { months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], category: "vegetable" },
  "garlic": { months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], category: "vegetable" },
  "potato": { months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], category: "vegetable" },
  "potatoes": { months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], category: "vegetable" },
  "carrot": { months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], category: "vegetable" },
  "carrots": { months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], category: "vegetable" },
  "spinach": { months: [3, 4, 5, 9, 10, 11], category: "vegetable" },
  "lettuce": { months: [3, 4, 5, 9, 10, 11], category: "vegetable" },
  "broccoli": { months: [10, 11, 12, 1, 2, 3], category: "vegetable" },
  "mushroom": { months: [9, 10, 11, 12, 1, 2, 3], category: "vegetable" },
  "mushrooms": { months: [9, 10, 11, 12, 1, 2, 3], category: "vegetable" },
  "ginger": { months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], category: "spice" },
  // ── Proteins (seasonal availability) ──
  "shrimp": { months: [4, 5, 6, 7, 8, 9, 10], category: "seafood" },
  "salmon": { months: [5, 6, 7, 8, 9], category: "seafood" },
  "crab": { months: [10, 11, 12, 1], category: "seafood" }
};
var SeasonalHelper = class {
  /**
   * Get the current month (1-12).
   */
  getCurrentMonth() {
    return (/* @__PURE__ */ new Date()).getMonth() + 1;
  }
  /**
   * Check if an ingredient is in season for a given month.
   */
  isInSeason(ingredientName, month) {
    const m = month ?? this.getCurrentMonth();
    const entry = this.findEntry(ingredientName);
    if (!entry)
      return false;
    if (entry.months.length >= 12)
      return false;
    return entry.months.includes(m);
  }
  /**
   * Get the seasonal score for a recipe (0-1).
   * Higher = more ingredients currently in season.
   */
  getRecipeSeasonalScore(ingredientNames, month) {
    const m = month ?? this.getCurrentMonth();
    let seasonalCount = 0;
    let seasonalTotal = 0;
    for (const name of ingredientNames) {
      const entry = this.findEntry(name);
      if (!entry || entry.months.length >= 12)
        continue;
      seasonalTotal++;
      if (entry.months.includes(m)) {
        seasonalCount++;
      }
    }
    if (seasonalTotal === 0)
      return 0.5;
    return seasonalCount / seasonalTotal;
  }
  /**
   * Get which ingredients in a recipe are currently in season.
   */
  getInSeasonIngredients(ingredientNames, month) {
    const m = month ?? this.getCurrentMonth();
    return ingredientNames.filter((name) => this.isInSeason(name, m));
  }
  /**
   * Get which ingredients in a recipe are out of season.
   */
  getOutOfSeasonIngredients(ingredientNames, month) {
    const m = month ?? this.getCurrentMonth();
    return ingredientNames.filter((name) => {
      const entry = this.findEntry(name);
      if (!entry || entry.months.length >= 12)
        return false;
      return !entry.months.includes(m);
    });
  }
  /**
   * Get a seasonal label for the current month.
   */
  getSeasonLabel(month) {
    const m = month ?? this.getCurrentMonth();
    if (m >= 3 && m <= 5)
      return "Spring";
    if (m >= 6 && m <= 8)
      return "Summer";
    if (m >= 9 && m <= 11)
      return "Fall";
    return "Winter";
  }
  /**
   * Fuzzy lookup: try exact match, then partial match on the seasonal data keys.
   */
  findEntry(ingredientName) {
    const lower = ingredientName.toLowerCase().trim();
    if (SEASONAL_DATA[lower])
      return SEASONAL_DATA[lower];
    for (const [key, entry] of Object.entries(SEASONAL_DATA)) {
      if (lower.includes(key) || key.includes(lower)) {
        return entry;
      }
    }
    return null;
  }
};

// src/mealPlanner.ts
var MealPlanner = class {
  constructor(dataStore) {
    this.dataStore = dataStore;
    this.seasonal = new SeasonalHelper();
  }
  /**
   * Generate a weekly meal plan with intelligent recipe selection.
   * Selects `count` dinners, balanced by recency, variety, and ingredient overlap.
   */
  generateWeeklyPlan(allRecipes, count = 5) {
    const dinnerCategories = new Set(
      this.dataStore.getData().settings.planCategories.map((c) => c.toLowerCase())
    );
    const eligible = allRecipes.filter((r) => {
      const cat = r.category.toLowerCase();
      return dinnerCategories.has(cat);
    });
    if (eligible.length === 0) {
      throw new Error("No eligible recipes found for meal planning.");
    }
    const stats = this.dataStore.getAllRecipeStats(eligible.map((r) => r.id));
    const selected = this.selectRecipes(eligible, stats, count);
    const monday = this.dataStore.getMonday(/* @__PURE__ */ new Date());
    const meals = selected.map((recipe, i) => {
      const date = new Date(monday);
      date.setDate(date.getDate() + i);
      return {
        recipeId: recipe.id,
        plannedDate: this.dataStore.formatDate(date),
        mealType: "dinner",
        servings: recipe.servings
      };
    });
    const settings = this.dataStore.getData().settings;
    if (settings.leftoverLunches) {
      const leftovers = this.generateLeftoverLunches(meals, selected);
      meals.push(...leftovers);
    }
    meals.sort((a, b) => {
      const dateCompare = a.plannedDate.localeCompare(b.plannedDate);
      if (dateCompare !== 0)
        return dateCompare;
      if (a.isLeftover && !b.isLeftover)
        return 1;
      if (!a.isLeftover && b.isLeftover)
        return -1;
      return 0;
    });
    return {
      weekStart: this.dataStore.formatDate(monday),
      meals,
      generatedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
  }
  /**
   * Core selection algorithm. Scores recipes and picks top `count` while
   * ensuring variety and ingredient synergy.
   */
  selectRecipes(eligible, stats, count) {
    const scored = eligible.map((recipe) => {
      const stat = stats.get(recipe.id);
      return this.scoreRecipe(recipe, stat);
    });
    scored.sort((a, b) => b.score - a.score);
    const selected = [];
    const usedSubcategories = /* @__PURE__ */ new Map();
    const usedCategories = /* @__PURE__ */ new Map();
    for (const item of scored) {
      if (selected.length >= count)
        break;
      const recipe = item.recipe;
      const subKey = recipe.subcategory || recipe.category;
      const subCount = usedSubcategories.get(subKey) || 0;
      if (subCount >= 2)
        continue;
      const catCount = usedCategories.get(recipe.category) || 0;
      if (catCount >= 3)
        continue;
      selected.push(recipe);
      usedSubcategories.set(subKey, subCount + 1);
      usedCategories.set(recipe.category, catCount + 1);
    }
    if (selected.length < count) {
      for (const item of scored) {
        if (selected.length >= count)
          break;
        if (selected.includes(item.recipe))
          continue;
        selected.push(item.recipe);
      }
    }
    return this.optimizeOrder(selected);
  }
  /**
   * Score a recipe based on multiple factors.
   */
  scoreRecipe(recipe, stats) {
    let score = 0;
    const reasons = [];
    if (stats.daysSinceLastMade === null) {
      score += 35;
      reasons.push("Never cooked (+35)");
    } else if (stats.daysSinceLastMade > 30) {
      score += 40;
      reasons.push(`Not made in ${stats.daysSinceLastMade} days (+40)`);
    } else if (stats.daysSinceLastMade > 14) {
      score += 25;
      reasons.push(`Made ${stats.daysSinceLastMade} days ago (+25)`);
    } else if (stats.daysSinceLastMade > 7) {
      score += 10;
      reasons.push(`Made ${stats.daysSinceLastMade} days ago (+10)`);
    } else {
      score += 0;
      reasons.push(`Made recently (${stats.daysSinceLastMade} days ago) (+0)`);
    }
    if (stats.timesCooked > 10) {
      score -= 10;
      reasons.push(`Made ${stats.timesCooked} times (-10)`);
    } else if (stats.timesCooked > 5) {
      score -= 5;
      reasons.push(`Made ${stats.timesCooked} times (-5)`);
    }
    if (recipe.protein >= 20) {
      score += 5;
      reasons.push("Good protein (+5)");
    }
    if (recipe.netCarbs > 0 && recipe.netCarbs < 30) {
      score += 5;
      reasons.push("Moderate carbs (+5)");
    }
    const ingredientNames = recipe.ingredients.flatMap(
      (s) => s.items.map((i) => i.name)
    );
    const seasonalScore = this.seasonal.getRecipeSeasonalScore(ingredientNames);
    const inSeasonItems = this.seasonal.getInSeasonIngredients(ingredientNames);
    if (seasonalScore > 0.5) {
      const bonus = Math.round(seasonalScore * 15);
      score += bonus;
      reasons.push(`Seasonal: ${inSeasonItems.slice(0, 3).join(", ")} (+${bonus})`);
    } else if (seasonalScore < 0.3 && seasonalScore > 0) {
      score -= 5;
      reasons.push("Out of season (-5)");
    }
    score += Math.random() * 15;
    return { recipe, score, reasons };
  }
  /**
   * Reorder selected recipes to group those with shared ingredients together.
   * This helps with batch shopping and prep.
   */
  optimizeOrder(recipes) {
    if (recipes.length <= 2)
      return recipes;
    const ingredientSets = recipes.map((r) => {
      const names = /* @__PURE__ */ new Set();
      for (const section of r.ingredients) {
        for (const item of section.items) {
          names.add(item.name.toLowerCase());
        }
      }
      return names;
    });
    const ordered = [recipes[0]];
    const used = /* @__PURE__ */ new Set([0]);
    for (let step = 1; step < recipes.length; step++) {
      const lastSet = ingredientSets[recipes.indexOf(ordered[ordered.length - 1])];
      let bestIdx = -1;
      let bestOverlap = -1;
      for (let i = 0; i < recipes.length; i++) {
        if (used.has(i))
          continue;
        let overlap = 0;
        for (const name of ingredientSets[i]) {
          if (lastSet.has(name))
            overlap++;
        }
        if (overlap > bestOverlap) {
          bestOverlap = overlap;
          bestIdx = i;
        }
      }
      if (bestIdx >= 0) {
        ordered.push(recipes[bestIdx]);
        used.add(bestIdx);
      }
    }
    return ordered;
  }
  /**
   * Generate leftover lunch entries from dinner meals.
   * Rules:
   *   - Servings >= 4: 1 leftover lunch the next day
   *   - Servings >= 6: 2 leftover lunches (next day for 2 people, or next 2 days)
   *   - Leftover lunch is placed on the day after the dinner
   *   - No leftover generated if the next day already has a dinner
   *     that itself will produce leftovers (avoid double lunches)
   */
  generateLeftoverLunches(dinners, recipes) {
    const leftovers = [];
    const recipeMap = new Map(recipes.map((r) => [r.id, r]));
    for (const dinner of dinners) {
      const recipe = recipeMap.get(dinner.recipeId);
      if (!recipe)
        continue;
      const servings = recipe.servings;
      if (servings < 4)
        continue;
      const dinnerDate = /* @__PURE__ */ new Date(dinner.plannedDate + "T00:00:00");
      const nextDay = new Date(dinnerDate);
      nextDay.setDate(nextDay.getDate() + 1);
      const nextDayStr = this.dataStore.formatDate(nextDay);
      const leftoverCount = servings >= 6 ? 2 : 1;
      for (let i = 0; i < leftoverCount; i++) {
        leftovers.push({
          recipeId: dinner.recipeId,
          plannedDate: nextDayStr,
          mealType: "lunch",
          servings: 1,
          isLeftover: true,
          leftoverSourceDate: dinner.plannedDate
        });
      }
    }
    const deduped = [];
    const seen = /* @__PURE__ */ new Set();
    for (const lo of leftovers) {
      const key = `${lo.recipeId}|${lo.plannedDate}`;
      if (seen.has(key)) {
        const existing = deduped.find(
          (d) => d.recipeId === lo.recipeId && d.plannedDate === lo.plannedDate
        );
        if (existing)
          existing.servings++;
      } else {
        seen.add(key);
        deduped.push(lo);
      }
    }
    return deduped;
  }
  /**
   * Calculate ingredient overlap between two recipes.
   */
  getIngredientOverlap(a, b) {
    const aNames = new Set(
      a.ingredients.flatMap((s) => s.items.map((i) => i.name.toLowerCase()))
    );
    return b.ingredients.flatMap((s) => s.items).filter((i) => aNames.has(i.name.toLowerCase())).map((i) => i.name);
  }
};

// src/groceryList.ts
var GroceryListGenerator = class {
  constructor(dataStore) {
    this.dataStore = dataStore;
  }
  /**
   * Generate a consolidated grocery list from selected recipes.
   */
  generate(recipes) {
    const consolidated = /* @__PURE__ */ new Map();
    for (const recipe of recipes) {
      for (const section of recipe.ingredients) {
        if (section.heading.toLowerCase().includes("sides"))
          continue;
        for (const item of section.items) {
          const key = item.name.toLowerCase();
          if (consolidated.has(key)) {
            const existing = consolidated.get(key);
            existing.quantity = this.combineQuantities(
              existing.quantity,
              item.quantity || "",
              existing.unit,
              item.unit || ""
            );
            if (!existing.fromRecipes.includes(recipe.title)) {
              existing.fromRecipes.push(recipe.title);
            }
          } else {
            consolidated.set(key, {
              name: item.name,
              quantity: item.quantity || "",
              unit: item.unit || "",
              category: this.dataStore.getIngredientCategory(item.name),
              store: this.dataStore.getStoreAssignment(item.name),
              fromRecipes: [recipe.title],
              checked: false
            });
          }
        }
      }
    }
    const items = Array.from(consolidated.values());
    items.sort((a, b) => {
      const catOrder = this.categoryOrder(a.category) - this.categoryOrder(b.category);
      if (catOrder !== 0)
        return catOrder;
      return a.name.localeCompare(b.name);
    });
    return items;
  }
  /**
   * Group grocery items by category for display.
   */
  groupByCategory(items) {
    const groups = /* @__PURE__ */ new Map();
    for (const item of items) {
      if (!groups.has(item.category)) {
        groups.set(item.category, []);
      }
      groups.get(item.category).push(item);
    }
    return groups;
  }
  /**
   * Group grocery items by store assignment.
   */
  groupByStore(items) {
    const groups = /* @__PURE__ */ new Map();
    for (const item of items) {
      if (!groups.has(item.store)) {
        groups.set(item.store, []);
      }
      groups.get(item.store).push(item);
    }
    return groups;
  }
  /**
   * Combine quantities when consolidating the same ingredient.
   */
  combineQuantities(q1, q2, u1, u2) {
    if (!q1 && !q2)
      return "";
    if (!q1)
      return q2;
    if (!q2)
      return q1;
    if (u1.toLowerCase() === u2.toLowerCase() || !u1 && !u2) {
      const n1 = this.parseQuantity(q1);
      const n2 = this.parseQuantity(q2);
      if (n1 > 0 && n2 > 0) {
        const sum = n1 + n2;
        return sum % 1 === 0 ? String(sum) : sum.toFixed(1);
      }
    }
    const part1 = u1 ? `${q1} ${u1}` : q1;
    const part2 = u2 ? `${q2} ${u2}` : q2;
    return `${part1} + ${part2}`;
  }
  /**
   * Parse fraction/unicode quantities to numeric values.
   */
  parseQuantity(q) {
    const cleaned = q.trim();
    const unicodeFractions = {
      "\xBD": 0.5,
      "\xBC": 0.25,
      "\xBE": 0.75,
      "\u2153": 0.333,
      "\u2154": 0.667,
      "\u215B": 0.125
    };
    for (const [char, val] of Object.entries(unicodeFractions)) {
      if (cleaned.includes(char)) {
        const prefix = cleaned.replace(char, "").trim();
        const whole = prefix ? parseFloat(prefix) : 0;
        return (isNaN(whole) ? 0 : whole) + val;
      }
    }
    const fracMatch = cleaned.match(/^(\d+)\s*\/\s*(\d+)$/);
    if (fracMatch) {
      return parseInt(fracMatch[1]) / parseInt(fracMatch[2]);
    }
    const mixedMatch = cleaned.match(/^(\d+)\s+(\d+)\s*\/\s*(\d+)$/);
    if (mixedMatch) {
      return parseInt(mixedMatch[1]) + parseInt(mixedMatch[2]) / parseInt(mixedMatch[3]);
    }
    const rangeMatch = cleaned.match(/^([\d.]+)\s*[–\-]\s*([\d.]+)$/);
    if (rangeMatch) {
      return parseFloat(rangeMatch[2]);
    }
    const num = parseFloat(cleaned);
    return isNaN(num) ? 0 : num;
  }
  categoryOrder(cat) {
    const order = {
      produce: 0,
      protein: 1,
      dairy: 2,
      bakery: 3,
      frozen: 4,
      spices: 5,
      pantry: 6,
      other: 7
    };
    return order[cat] ?? 99;
  }
};

// src/views.ts
var import_obsidian2 = require("obsidian");
var MEAL_PLAN_VIEW_TYPE = "meal-planner-view";
var MealPlanView = class extends import_obsidian2.ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.dragSourceIndex = null;
    this.plugin = plugin;
  }
  getViewType() {
    return MEAL_PLAN_VIEW_TYPE;
  }
  getDisplayText() {
    return "Meal Plan";
  }
  getIcon() {
    return "utensils";
  }
  async onOpen() {
    await this.render();
  }
  async render() {
    const container = this.containerEl.children[1];
    container.empty();
    container.addClass("meal-planner-sidebar");
    const header = container.createDiv("meal-planner-header");
    header.createEl("h3", { text: "Meal Plan" });
    const actions = header.createDiv("meal-planner-actions");
    const genBtn = actions.createEl("button", { text: "Generate Plan" });
    genBtn.addEventListener("click", () => {
      this.plugin.generateMealPlan();
    });
    const manualBtn = actions.createEl("button", { text: "Select Meals" });
    manualBtn.addEventListener("click", () => {
      this.plugin.browseRecipes();
    });
    const importBtn = actions.createEl("button", { text: "Import URL" });
    importBtn.addEventListener("click", () => {
      this.plugin.openImportRecipeModal();
    });
    const clearBtn = actions.createEl("button", { text: "Clear Plan" });
    clearBtn.addEventListener("click", async () => {
      const ok = window.confirm("Clear all meals for the current week?");
      if (!ok)
        return;
      await this.plugin.clearCurrentWeekPlan();
    });
    const groceryBtn = actions.createEl("button", { text: "Grocery List" });
    groceryBtn.addEventListener("click", () => {
      this.plugin.showGroceryList();
    });
    const season = this.plugin.planner.seasonal.getSeasonLabel();
    const seasonEl = header.createEl("span", {
      text: season,
      cls: `meal-season meal-season-${season.toLowerCase()}`
    });
    const plan = this.plugin.dataStore.getCurrentWeekPlan();
    if (!plan || plan.meals.length === 0) {
      container.createEl("p", {
        text: 'No meal plan for this week. Click "Generate Plan" or "Select Meals" to create one.',
        cls: "meal-planner-empty"
      });
      return;
    }
    const recipesLoaded = this.plugin.cachedRecipes.length > 0;
    if (!recipesLoaded) {
      container.createEl("p", { text: "Loading recipes..." });
      return;
    }
    const recipeMap = new Map(this.plugin.cachedRecipes.map((r) => [r.id, r]));
    const mealsList = container.createDiv("meal-planner-meals");
    let lastDate = "";
    for (let mealIndex = 0; mealIndex < plan.meals.length; mealIndex++) {
      const meal = plan.meals[mealIndex];
      const recipe = recipeMap.get(meal.recipeId);
      if (!recipe)
        continue;
      const isLeftover = meal.isLeftover === true;
      const dayName = this.plugin.dataStore.getDayName(meal.plannedDate);
      const isCooked = this.isMealCooked(meal);
      const stats = this.plugin.dataStore.getRecipeStats(meal.recipeId);
      if (isLeftover) {
        const row2 = mealsList.createDiv("meal-row meal-leftover");
        if (isCooked)
          row2.addClass("meal-cooked");
        row2.createDiv("meal-drag-handle-spacer");
        const checkbox2 = row2.createEl("input", { type: "checkbox" });
        checkbox2.checked = isCooked;
        checkbox2.addEventListener("change", async () => {
          if (checkbox2.checked) {
            await this.plugin.dataStore.markMealCooked(
              meal.recipeId,
              meal.plannedDate,
              meal.mealType
            );
            new import_obsidian2.Notice(`Leftover "${recipe.title}" eaten!`);
          } else {
            await this.plugin.dataStore.removeCookedMeal(
              meal.recipeId,
              meal.plannedDate
            );
          }
          await this.render();
        });
        const info2 = row2.createDiv("meal-info");
        const dayRow2 = info2.createDiv("meal-day-row");
        if (meal.plannedDate !== lastDate) {
          dayRow2.createEl("span", { text: dayName, cls: "meal-day" });
        }
        dayRow2.createEl("span", { text: "leftover", cls: "meal-leftover-badge" });
        const servingsLabel = meal.servings > 1 ? ` (x${meal.servings})` : "";
        const titleEl2 = info2.createEl("div", {
          text: `${recipe.title}${servingsLabel}`,
          cls: "meal-title meal-title-leftover"
        });
        titleEl2.addEventListener("click", () => {
          this.plugin.openRecipeFile(recipe.filePath);
        });
        const meta2 = info2.createDiv("meal-meta");
        meta2.setText(`lunch \xB7 ${recipe.caloriesPerServing || "?"} cal/serving`);
        lastDate = meal.plannedDate;
        continue;
      }
      const row = mealsList.createDiv("meal-row");
      if (isCooked)
        row.addClass("meal-cooked");
      row.setAttribute("data-meal-index", String(mealIndex));
      const dragHandle = row.createDiv("meal-drag-handle");
      dragHandle.innerHTML = "&#x2630;";
      dragHandle.setAttribute("aria-label", "Drag to reorder");
      row.setAttribute("draggable", "true");
      row.addEventListener("dragstart", (e) => {
        this.dragSourceIndex = mealIndex;
        row.addClass("meal-dragging");
        if (e.dataTransfer) {
          e.dataTransfer.effectAllowed = "move";
          e.dataTransfer.setData("text/plain", String(mealIndex));
        }
      });
      row.addEventListener("dragend", () => {
        row.removeClass("meal-dragging");
        this.dragSourceIndex = null;
        mealsList.querySelectorAll(".meal-row").forEach((el) => {
          el.removeClass("meal-drag-over-above", "meal-drag-over-below");
        });
      });
      row.addEventListener("dragover", (e) => {
        e.preventDefault();
        if (this.dragSourceIndex === null || this.dragSourceIndex === mealIndex)
          return;
        if (e.dataTransfer)
          e.dataTransfer.dropEffect = "move";
        const rect = row.getBoundingClientRect();
        const midY = rect.top + rect.height / 2;
        const isAbove = e.clientY < midY;
        row.removeClass("meal-drag-over-above", "meal-drag-over-below");
        row.addClass(isAbove ? "meal-drag-over-above" : "meal-drag-over-below");
      });
      row.addEventListener("dragleave", () => {
        row.removeClass("meal-drag-over-above", "meal-drag-over-below");
      });
      row.addEventListener("drop", async (e) => {
        e.preventDefault();
        row.removeClass("meal-drag-over-above", "meal-drag-over-below");
        if (this.dragSourceIndex === null || this.dragSourceIndex === mealIndex)
          return;
        await this.swapMealDays(this.dragSourceIndex, mealIndex);
        this.dragSourceIndex = null;
      });
      const checkbox = row.createEl("input", { type: "checkbox" });
      checkbox.checked = isCooked;
      checkbox.addEventListener("change", async () => {
        if (checkbox.checked) {
          await this.plugin.dataStore.markMealCooked(
            meal.recipeId,
            meal.plannedDate,
            meal.mealType
          );
          new import_obsidian2.Notice(`Marked "${recipe.title}" as cooked!`);
        } else {
          await this.plugin.dataStore.removeCookedMeal(
            meal.recipeId,
            meal.plannedDate
          );
        }
        await this.render();
      });
      const info = row.createDiv("meal-info");
      const dayRow = info.createDiv("meal-day-row");
      dayRow.createEl("span", { text: dayName, cls: "meal-day" });
      const ingredientNames = recipe.ingredients.flatMap(
        (s) => s.items.map((i) => i.name)
      );
      const inSeason = this.plugin.planner.seasonal.getInSeasonIngredients(ingredientNames);
      if (inSeason.length > 0) {
        const badge = dayRow.createEl("span", {
          cls: "meal-seasonal-badge",
          attr: { "aria-label": `In season: ${inSeason.join(", ")}` }
        });
        badge.setText("seasonal");
        badge.setAttribute("title", `In season: ${inSeason.join(", ")}`);
      }
      const hasLeftovers = plan.meals.some(
        (m) => m.isLeftover && m.leftoverSourceDate === meal.plannedDate && m.recipeId === meal.recipeId
      );
      if (hasLeftovers) {
        dayRow.createEl("span", {
          text: `+leftovers`,
          cls: "meal-has-leftovers-badge"
        });
      }
      const titleEl = info.createEl("div", { text: recipe.title, cls: "meal-title" });
      titleEl.addEventListener("click", () => {
        this.plugin.openRecipeFile(recipe.filePath);
      });
      const meta = info.createDiv("meal-meta");
      const metaParts = [];
      if (recipe.caloriesPerServing)
        metaParts.push(`${recipe.caloriesPerServing} cal`);
      if (recipe.protein)
        metaParts.push(`${recipe.protein}g protein`);
      if (recipe.frontmatter.cook_time)
        metaParts.push(recipe.frontmatter.cook_time);
      if (stats.daysSinceLastMade !== null) {
        metaParts.push(`last made ${stats.daysSinceLastMade}d ago`);
      } else {
        metaParts.push("never made");
      }
      meta.setText(metaParts.join(" \xB7 "));
      row.addEventListener("contextmenu", (e) => {
        const menu = new import_obsidian2.Menu();
        menu.addItem((item) => {
          item.setTitle("Open recipe");
          item.setIcon("file-text");
          item.onClick(() => this.plugin.openRecipeFile(recipe.filePath));
        });
        menu.addItem((item) => {
          item.setTitle("Swap recipe");
          item.setIcon("refresh-cw");
          item.onClick(() => this.plugin.swapRecipe(meal));
        });
        menu.addItem((item) => {
          item.setTitle("Remove from plan");
          item.setIcon("trash");
          item.onClick(() => this.plugin.removeMealFromPlan(meal));
        });
        menu.showAtMouseEvent(e);
      });
      lastDate = meal.plannedDate;
    }
    const summary = container.createDiv("meal-planner-summary");
    const dinnerMeals = plan.meals.filter((m) => !m.isLeftover);
    const leftoverMeals = plan.meals.filter((m) => m.isLeftover);
    const totalCals = dinnerMeals.reduce((sum, m) => {
      const r = recipeMap.get(m.recipeId);
      return sum + (r?.caloriesPerServing || 0);
    }, 0);
    const cookedCount = dinnerMeals.filter((m) => this.isMealCooked(m)).length;
    const leftoverEaten = leftoverMeals.filter((m) => this.isMealCooked(m)).length;
    const seasonalCount = dinnerMeals.filter((m) => {
      const r = recipeMap.get(m.recipeId);
      if (!r)
        return false;
      const names = r.ingredients.flatMap((s) => s.items.map((i) => i.name));
      return this.plugin.planner.seasonal.getInSeasonIngredients(names).length > 0;
    }).length;
    const summaryParts = [
      `${cookedCount}/${dinnerMeals.length} dinners`
    ];
    if (leftoverMeals.length > 0) {
      summaryParts.push(`${leftoverEaten}/${leftoverMeals.length} leftovers`);
    }
    summaryParts.push(`~${totalCals} total cal`);
    if (seasonalCount > 0) {
      summaryParts.push(`${seasonalCount} seasonal`);
    }
    summary.createEl("div", {
      text: summaryParts.join(" \xB7 "),
      cls: "summary-text"
    });
    summary.createEl("div", {
      text: "Drag meals to reorder days",
      cls: "drag-hint"
    });
  }
  /**
   * Swap the planned dates of two meals in the current plan.
   * Also moves associated leftovers to follow their dinner.
   */
  async swapMealDays(fromIndex, toIndex) {
    const plan = this.plugin.dataStore.getCurrentWeekPlan();
    if (!plan)
      return;
    const fromMeal = plan.meals[fromIndex];
    const toMeal = plan.meals[toIndex];
    if (!fromMeal || !toMeal)
      return;
    if (fromMeal.isLeftover || toMeal.isLeftover)
      return;
    const fromDate = fromMeal.plannedDate;
    const toDate = toMeal.plannedDate;
    fromMeal.plannedDate = toDate;
    toMeal.plannedDate = fromDate;
    for (const m of plan.meals) {
      if (!m.isLeftover)
        continue;
      if (m.leftoverSourceDate === fromDate && m.recipeId === fromMeal.recipeId) {
        const newNextDay = /* @__PURE__ */ new Date(toDate + "T00:00:00");
        newNextDay.setDate(newNextDay.getDate() + 1);
        m.plannedDate = this.plugin.dataStore.formatDate(newNextDay);
        m.leftoverSourceDate = toDate;
      } else if (m.leftoverSourceDate === toDate && m.recipeId === toMeal.recipeId) {
        const newNextDay = /* @__PURE__ */ new Date(fromDate + "T00:00:00");
        newNextDay.setDate(newNextDay.getDate() + 1);
        m.plannedDate = this.plugin.dataStore.formatDate(newNextDay);
        m.leftoverSourceDate = fromDate;
      }
    }
    plan.meals.sort((a, b) => {
      const dc = a.plannedDate.localeCompare(b.plannedDate);
      if (dc !== 0)
        return dc;
      if (a.isLeftover && !b.isLeftover)
        return 1;
      if (!a.isLeftover && b.isLeftover)
        return -1;
      return 0;
    });
    await this.plugin.dataStore.saveWeeklyPlan(plan);
    await this.render();
  }
  isMealCooked(meal) {
    return this.plugin.dataStore.getCookedMeals().some(
      (m) => m.recipeId === meal.recipeId && m.cookedDate === meal.plannedDate
    );
  }
  async onClose() {
  }
};

// src/modals.ts
var import_obsidian3 = require("obsidian");
var RecipeBrowserModal = class extends import_obsidian3.Modal {
  constructor(app, plugin) {
    super(app);
    this.filterText = "";
    this.filterCategory = "";
    this.addedCount = 0;
    this.plugin = plugin;
    this.recipes = [...plugin.cachedRecipes];
  }
  onOpen() {
    this.modalEl.addClass("meal-planner-modal", "recipe-browser");
    this.titleEl.setText("Select Meals");
    this.render();
  }
  render() {
    const { contentEl } = this;
    contentEl.empty();
    const filterBar = contentEl.createDiv("recipe-filter-bar");
    const settings = this.plugin.dataStore.getData().settings;
    const currentPlan = this.plugin.dataStore.getCurrentWeekPlan();
    const currentDinnerCount = currentPlan ? currentPlan.meals.filter((m) => !m.isLeftover).length : 0;
    const goalText = `${Math.min(currentDinnerCount, settings.dinnersPerWeek)}/${settings.dinnersPerWeek} dinners planned`;
    const helperParts = [goalText];
    if (this.addedCount > 0) {
      helperParts.push(`${this.addedCount} added this session`);
    }
    contentEl.createEl("p", {
      text: helperParts.join(" \xB7 "),
      cls: "recipe-count"
    });
    const searchInput = filterBar.createEl("input", {
      type: "text",
      placeholder: "Search recipes...",
      cls: "recipe-search"
    });
    searchInput.setAttribute("type", "search");
    searchInput.setAttribute("placeholder", "Search recipes...");
    searchInput.value = this.filterText;
    searchInput.addEventListener("keydown", (e) => {
      e.stopPropagation();
    });
    searchInput.addEventListener("keyup", (e) => {
      e.stopPropagation();
    });
    searchInput.addEventListener("input", () => {
      this.filterText = searchInput.value;
      this.renderList(listContainer);
    });
    searchInput.focus();
    const categories = [...new Set(this.recipes.map((r) => r.category))].sort();
    const catSelect = filterBar.createEl("select", { cls: "recipe-cat-filter" });
    catSelect.createEl("option", { value: "", text: "All categories" });
    for (const cat of categories) {
      catSelect.createEl("option", { value: cat, text: cat });
    }
    catSelect.value = this.filterCategory;
    catSelect.addEventListener("keydown", (e) => {
      e.stopPropagation();
    });
    catSelect.addEventListener("change", () => {
      this.filterCategory = catSelect.value;
      this.renderList(listContainer);
    });
    const listContainer = contentEl.createDiv("recipe-list");
    this.renderList(listContainer);
  }
  renderList(container) {
    container.empty();
    let filtered = this.recipes;
    if (this.filterText) {
      const query = this.filterText.toLowerCase();
      filtered = filtered.filter(
        (r) => r.title.toLowerCase().includes(query) || r.frontmatter.tags.some((t) => t.toLowerCase().includes(query)) || r.category.toLowerCase().includes(query) || r.subcategory.toLowerCase().includes(query)
      );
    }
    if (this.filterCategory) {
      filtered = filtered.filter((r) => r.category === this.filterCategory);
    }
    const statsMap = this.plugin.dataStore.getAllRecipeStats(filtered.map((r) => r.id));
    filtered.sort((a, b) => {
      const sa = statsMap.get(a.id);
      const sb = statsMap.get(b.id);
      const da = sa.daysSinceLastMade ?? 9999;
      const db = sb.daysSinceLastMade ?? 9999;
      return db - da;
    });
    if (filtered.length === 0) {
      container.createEl("p", { text: "No recipes match your search.", cls: "recipe-empty" });
      return;
    }
    container.createEl("div", {
      text: `${filtered.length} recipes`,
      cls: "recipe-count"
    });
    for (const recipe of filtered) {
      const stats = statsMap.get(recipe.id);
      const row = container.createDiv("recipe-row");
      const info = row.createDiv("recipe-info");
      const titleEl = info.createEl("div", { cls: "recipe-title" });
      titleEl.setText(recipe.title);
      titleEl.addEventListener("click", () => {
        this.close();
        this.plugin.openRecipeFile(recipe.filePath);
      });
      const meta = info.createDiv("recipe-meta");
      const parts = [
        `${recipe.category}${recipe.subcategory ? "/" + recipe.subcategory : ""}`
      ];
      if (recipe.caloriesPerServing)
        parts.push(`${recipe.caloriesPerServing} cal`);
      if (recipe.protein)
        parts.push(`${recipe.protein}g protein`);
      if (stats.daysSinceLastMade !== null) {
        parts.push(`${stats.daysSinceLastMade}d ago`);
      } else {
        parts.push("never made");
      }
      if (stats.timesCooked > 0) {
        parts.push(`cooked ${stats.timesCooked}x`);
      }
      meta.setText(parts.join(" \xB7 "));
      const addBtn = row.createEl("button", { text: "+ Plan", cls: "recipe-add-btn" });
      addBtn.addEventListener("click", async () => {
        await this.plugin.addRecipeToPlan(recipe);
        this.addedCount++;
        new import_obsidian3.Notice(`Added "${recipe.title}" to this week's plan.`);
        this.render();
      });
    }
  }
  onClose() {
    this.contentEl.empty();
  }
};
var GroceryListModal = class extends import_obsidian3.Modal {
  constructor(app, plugin, items) {
    super(app);
    this.groupMode = "category";
    this.plugin = plugin;
    this.items = items;
  }
  onOpen() {
    this.modalEl.addClass("meal-planner-modal", "grocery-list");
    this.titleEl.setText("Grocery List");
    this.render();
  }
  render() {
    const { contentEl } = this;
    contentEl.empty();
    if (this.items.length === 0) {
      contentEl.createEl("p", { text: "No items. Generate a meal plan first." });
      return;
    }
    const toolbar = contentEl.createDiv("grocery-toolbar");
    const groupToggle = toolbar.createEl("button", {
      text: this.groupMode === "category" ? "Group by Store" : "Group by Category"
    });
    groupToggle.addEventListener("click", () => {
      this.groupMode = this.groupMode === "category" ? "store" : "category";
      this.render();
    });
    const copyBtn = toolbar.createEl("button", { text: "Copy" });
    copyBtn.addEventListener("click", () => {
      this.copyToClipboard();
    });
    const saveBtn = toolbar.createEl("button", { text: "Save to Vault" });
    saveBtn.addEventListener("click", () => {
      this.saveToVault();
    });
    const token = this.plugin.dataStore.getData().settings.todoistApiToken;
    if (token) {
      const todoistBtn = toolbar.createEl("button", { text: "Send to Todoist", cls: "grocery-todoist-btn" });
      todoistBtn.addEventListener("click", () => {
        this.sendToTodoist();
      });
    }
    const checkedCount = this.items.filter((i) => i.checked).length;
    toolbar.createEl("span", {
      text: `${checkedCount}/${this.items.length} checked`,
      cls: "grocery-progress"
    });
    const listEl = contentEl.createDiv("grocery-groups");
    if (this.groupMode === "category") {
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
  renderGroup(parent, label, items) {
    const group = parent.createDiv("grocery-group");
    group.createEl("h4", { text: `${label} (${items.length})` });
    for (const item of items) {
      const row = group.createDiv("grocery-row");
      if (item.checked)
        row.addClass("grocery-checked");
      const checkbox = row.createEl("input", { type: "checkbox" });
      checkbox.checked = item.checked;
      checkbox.addEventListener("change", () => {
        item.checked = checkbox.checked;
        row.toggleClass("grocery-checked", item.checked);
        this.render();
      });
      const qty = item.quantity ? `${item.quantity}${item.unit ? " " + item.unit : ""}` : "";
      const text = qty ? `${qty} ${item.name}` : item.name;
      const nameEl = row.createEl("span", { text, cls: "grocery-name" });
      if (item.fromRecipes.length > 0) {
        row.createEl("span", {
          text: `(${item.fromRecipes.join(", ")})`,
          cls: "grocery-source"
        });
      }
      const storeSelect = row.createEl("select", { cls: "grocery-store" });
      const stores = ["Any", "Costco", "Sam's", "Kroger"];
      for (const s of stores) {
        const opt = storeSelect.createEl("option", { value: s, text: s });
      }
      storeSelect.value = item.store;
      storeSelect.addEventListener("change", async () => {
        item.store = storeSelect.value;
        await this.plugin.dataStore.setStoreAssignment(item.name, item.store);
      });
    }
  }
  categoryLabel(cat) {
    const labels = {
      produce: "Produce",
      protein: "Protein & Meat",
      dairy: "Dairy & Eggs",
      bakery: "Bakery & Bread",
      frozen: "Frozen",
      spices: "Spices & Seasoning",
      pantry: "Pantry",
      other: "Other"
    };
    return labels[cat] || cat;
  }
  // ── Export: Clipboard ──
  copyToClipboard() {
    const markdown = this.buildMarkdown();
    navigator.clipboard.writeText(markdown);
    new import_obsidian3.Notice("Grocery list copied to clipboard!");
  }
  // ── Export: Save to Vault ──
  async saveToVault() {
    const markdown = this.buildMarkdown();
    const path = this.plugin.dataStore.getData().settings.groceryExportPath;
    const existing = this.app.vault.getAbstractFileByPath(path);
    if (existing) {
      await this.app.vault.modify(existing, markdown);
    } else {
      await this.app.vault.create(path, markdown);
    }
    new import_obsidian3.Notice(`Grocery list saved to ${path}`);
  }
  // ── Export: Todoist ──
  async sendToTodoist() {
    const settings = this.plugin.dataStore.getData().settings;
    const token = settings.todoistApiToken;
    if (!token) {
      new import_obsidian3.Notice("Todoist API token not configured. Set it in Meal Planner settings.");
      return;
    }
    try {
      const projectId = await this.getOrCreateTodoistProject(token, settings.todoistProjectName);
      await this.clearTodoistProject(token, projectId);
      const groups = this.plugin.groceryGenerator.groupByCategory(this.items);
      let addedCount = 0;
      for (const [category, items] of groups) {
        const sectionName = this.categoryLabel(category);
        const sectionId = await this.createTodoistSection(token, projectId, sectionName);
        for (const item of items) {
          const qty = item.quantity ? `${item.quantity}${item.unit ? " " + item.unit : ""} ` : "";
          const taskContent = `${qty}${item.name}`;
          const description = item.fromRecipes.length > 0 ? `For: ${item.fromRecipes.join(", ")}` : "";
          await (0, import_obsidian3.requestUrl)({
            url: "https://api.todoist.com/rest/v2/tasks",
            method: "POST",
            headers: {
              "Authorization": `Bearer ${token}`,
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              content: taskContent,
              description,
              project_id: projectId,
              section_id: sectionId
            })
          });
          addedCount++;
        }
      }
      new import_obsidian3.Notice(`Sent ${addedCount} items to Todoist project "${settings.todoistProjectName}"!`);
    } catch (e) {
      console.error("Todoist export failed:", e);
      new import_obsidian3.Notice(`Todoist export failed: ${e.message}`);
    }
  }
  async getOrCreateTodoistProject(token, name) {
    const resp = await (0, import_obsidian3.requestUrl)({
      url: "https://api.todoist.com/rest/v2/projects",
      method: "GET",
      headers: { "Authorization": `Bearer ${token}` }
    });
    const projects = resp.json;
    const existing = projects.find((p) => p.name === name);
    if (existing)
      return existing.id;
    const createResp = await (0, import_obsidian3.requestUrl)({
      url: "https://api.todoist.com/rest/v2/projects",
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ name })
    });
    return createResp.json.id;
  }
  async clearTodoistProject(token, projectId) {
    const resp = await (0, import_obsidian3.requestUrl)({
      url: `https://api.todoist.com/rest/v2/tasks?project_id=${projectId}`,
      method: "GET",
      headers: { "Authorization": `Bearer ${token}` }
    });
    const tasks = resp.json;
    for (const task of tasks) {
      await (0, import_obsidian3.requestUrl)({
        url: `https://api.todoist.com/rest/v2/tasks/${task.id}`,
        method: "DELETE",
        headers: { "Authorization": `Bearer ${token}` }
      });
    }
    const sectionsResp = await (0, import_obsidian3.requestUrl)({
      url: `https://api.todoist.com/rest/v2/sections?project_id=${projectId}`,
      method: "GET",
      headers: { "Authorization": `Bearer ${token}` }
    });
    const sections = sectionsResp.json;
    for (const section of sections) {
      await (0, import_obsidian3.requestUrl)({
        url: `https://api.todoist.com/rest/v2/sections/${section.id}`,
        method: "DELETE",
        headers: { "Authorization": `Bearer ${token}` }
      });
    }
  }
  async createTodoistSection(token, projectId, name) {
    const resp = await (0, import_obsidian3.requestUrl)({
      url: "https://api.todoist.com/rest/v2/sections",
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        project_id: projectId,
        name
      })
    });
    return resp.json.id;
  }
  // ── Shared markdown builder ──
  buildMarkdown() {
    const lines = ["# Grocery List", ""];
    const plan = this.plugin.dataStore.getCurrentWeekPlan();
    if (plan) {
      const recipeMap = new Map(this.plugin.cachedRecipes.map((r) => [r.id, r]));
      const titles = plan.meals.map((m) => recipeMap.get(m.recipeId)?.title).filter(Boolean);
      if (titles.length > 0) {
        lines.push(`**Recipes:** ${titles.join(", ")}`, "");
      }
    }
    const groups = this.plugin.groceryGenerator.groupByCategory(this.items);
    for (const [category, items] of groups) {
      lines.push(`## ${this.categoryLabel(category)}`);
      for (const item of items) {
        const check = item.checked ? "x" : " ";
        const qty = item.quantity ? `${item.quantity}${item.unit ? " " + item.unit : ""} ` : "";
        const store = item.store !== "Any" ? ` @${item.store}` : "";
        lines.push(`- [${check}] ${qty}${item.name}${store}`);
      }
      lines.push("");
    }
    return lines.join("\n");
  }
  onClose() {
    this.contentEl.empty();
  }
};
var ImportRecipeModal = class extends import_obsidian3.Modal {
  constructor(app, plugin) {
    super(app);
    this.url = "";
    this.statusEl = null;
    this.importBtn = null;
    this.plugin = plugin;
  }
  onOpen() {
    this.modalEl.addClass("meal-planner-modal", "recipe-import");
    this.titleEl.setText("Import Recipe from URL");
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("p", {
      text: "Paste a recipe URL or Pinterest pin URL. The importer will try structured recipe data first.",
      cls: "recipe-count"
    });
    new import_obsidian3.Setting(contentEl).setName("Recipe URL").setDesc("Example: https://example.com/recipe or https://www.pinterest.com/pin/...").addText((text) => {
      text.setPlaceholder("https://...").setValue(this.url).onChange((value) => {
        this.url = value.trim();
      });
      text.inputEl.addEventListener("keydown", (e) => {
        e.stopPropagation();
        if (e.key === "Enter") {
          e.preventDefault();
          void this.importNow();
        }
      });
      window.setTimeout(() => text.inputEl.focus(), 0);
    });
    const actions = contentEl.createDiv("recipe-import-actions");
    this.importBtn = actions.createEl("button", { text: "Import Recipe" });
    this.importBtn.addEventListener("click", () => {
      void this.importNow();
    });
    const cancelBtn = actions.createEl("button", { text: "Cancel" });
    cancelBtn.addEventListener("click", () => this.close());
    this.statusEl = contentEl.createEl("p", { cls: "recipe-count" });
  }
  async importNow() {
    if (!this.url) {
      new import_obsidian3.Notice("Please paste a URL first.");
      return;
    }
    if (!this.importBtn)
      return;
    this.importBtn.disabled = true;
    if (this.statusEl)
      this.statusEl.setText("Importing recipe...");
    try {
      const file = await this.plugin.importRecipeFromUrl(this.url);
      new import_obsidian3.Notice(`Imported "${file.basename}"`);
      this.plugin.openRecipeFile(file.path);
      this.close();
    } catch (e) {
      const msg = e.message || "Import failed.";
      new import_obsidian3.Notice(`Import failed: ${msg}`);
      if (this.statusEl)
        this.statusEl.setText(`Import failed: ${msg}`);
    } finally {
      this.importBtn.disabled = false;
    }
  }
  onClose() {
    this.contentEl.empty();
  }
};
var RecipeSuggestModal = class extends import_obsidian3.FuzzySuggestModal {
  constructor(app, plugin, onChoose) {
    super(app);
    this.plugin = plugin;
    this.onChoose = onChoose;
    this.setPlaceholder("Search for a recipe...");
  }
  getItems() {
    return this.plugin.cachedRecipes;
  }
  getItemText(recipe) {
    return recipe.title;
  }
  onChooseItem(recipe) {
    this.onChoose(recipe);
  }
};

// src/settings.ts
var import_obsidian4 = require("obsidian");
var MealPlannerSettingTab = class extends import_obsidian4.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "Meal Planner Settings" });
    new import_obsidian4.Setting(containerEl).setName("Recipe folder path").setDesc("Path to your recipe folder relative to vault root").addText(
      (text) => text.setPlaceholder("Recipes").setValue(this.plugin.dataStore.getData().settings.recipeFolderPath).onChange(async (value) => {
        await this.plugin.dataStore.updateSettings({ recipeFolderPath: value });
      })
    );
    new import_obsidian4.Setting(containerEl).setName("Dinners per week").setDesc("Number of dinner recipes to plan per week").addSlider(
      (slider) => slider.setLimits(3, 7, 1).setValue(this.plugin.dataStore.getData().settings.dinnersPerWeek).setDynamicTooltip().onChange(async (value) => {
        await this.plugin.dataStore.updateSettings({ dinnersPerWeek: value });
      })
    );
    new import_obsidian4.Setting(containerEl).setName("Leftover lunches").setDesc("Assume dinners provide leftovers for 1-2 lunches the next day").addToggle(
      (toggle) => toggle.setValue(this.plugin.dataStore.getData().settings.leftoverLunches).onChange(async (value) => {
        await this.plugin.dataStore.updateSettings({ leftoverLunches: value });
      })
    );
    new import_obsidian4.Setting(containerEl).setName("Plan categories").setDesc("Recipe categories to include when generating plans (comma-separated)").addText(
      (text) => text.setPlaceholder("Mains, Soups, Salads").setValue(this.plugin.dataStore.getData().settings.planCategories.join(", ")).onChange(async (value) => {
        const cats = value.split(",").map((s) => s.trim()).filter(Boolean);
        await this.plugin.dataStore.updateSettings({ planCategories: cats });
      })
    );
    containerEl.createEl("h3", { text: "Grocery Export" });
    new import_obsidian4.Setting(containerEl).setName("Grocery list file path").setDesc("Vault-relative path for the exported grocery list markdown file").addText(
      (text) => text.setPlaceholder("Grocery List.md").setValue(this.plugin.dataStore.getData().settings.groceryExportPath).onChange(async (value) => {
        await this.plugin.dataStore.updateSettings({ groceryExportPath: value });
      })
    );
    containerEl.createEl("h3", { text: "Todoist Integration" });
    new import_obsidian4.Setting(containerEl).setName("Todoist API token").setDesc("Your Todoist API token (Settings > Integrations > Developer in Todoist)").addText(
      (text) => text.setPlaceholder("Enter API token...").setValue(this.plugin.dataStore.getData().settings.todoistApiToken).onChange(async (value) => {
        await this.plugin.dataStore.updateSettings({ todoistApiToken: value });
      })
    );
    new import_obsidian4.Setting(containerEl).setName("Todoist project name").setDesc("Name of the Todoist project for grocery lists (created if it doesn't exist)").addText(
      (text) => text.setPlaceholder("Grocery List").setValue(this.plugin.dataStore.getData().settings.todoistProjectName).onChange(async (value) => {
        await this.plugin.dataStore.updateSettings({ todoistProjectName: value });
      })
    );
    containerEl.createEl("h3", { text: "Statistics" });
    const cookedCount = this.plugin.dataStore.getCookedMeals().length;
    const planCount = this.plugin.dataStore.getWeeklyPlans().length;
    const recipeCount = this.plugin.cachedRecipes.length;
    const season = this.plugin.planner.seasonal.getSeasonLabel();
    containerEl.createEl("p", { text: `Recipes indexed: ${recipeCount}` });
    containerEl.createEl("p", { text: `Meals cooked (tracked): ${cookedCount}` });
    containerEl.createEl("p", { text: `Weekly plans generated: ${planCount}` });
    containerEl.createEl("p", { text: `Current season: ${season}` });
    new import_obsidian4.Setting(containerEl).setName("Refresh recipe index").setDesc("Re-scan all recipe files").addButton(
      (btn) => btn.setButtonText("Refresh").onClick(async () => {
        await this.plugin.refreshRecipes();
        this.display();
      })
    );
  }
};

// src/webRecipeParser.ts
var WebRecipeParser = class {
  static parseRecipeFromHtml(html, fallbackUrl) {
    const recipes = this.extractRecipeObjects(html);
    if (recipes.length === 0)
      return null;
    recipes.sort((a, b) => this.recipeScore(b) - this.recipeScore(a));
    const recipe = recipes[0];
    const title = this.cleanText(recipe.name || recipe.headline || "Imported Recipe");
    const sourceUrl = this.cleanText(recipe.url || fallbackUrl);
    const servings = this.normalizeYield(recipe.recipeYield);
    const prepTime = this.formatDuration(recipe.prepTime);
    const cookTime = this.formatDuration(recipe.cookTime);
    const totalTime = this.formatDuration(recipe.totalTime);
    const ingredients = this.normalizeStringList(recipe.recipeIngredient || recipe.ingredients);
    const instructions = this.extractInstructions(recipe.recipeInstructions);
    const nutrition = recipe.nutrition || {};
    const caloriesPerServing = this.extractNumberString(nutrition.calories);
    const protein = this.extractNumberString(nutrition.proteinContent);
    const netCarbs = this.extractNumberString(
      nutrition.carbohydrateContent || nutrition.carbs || nutrition.netCarbs
    );
    const keywords = this.normalizeStringList(recipe.keywords);
    const categories = this.normalizeStringList(recipe.recipeCategory);
    const cuisines = this.normalizeStringList(recipe.recipeCuisine);
    const combined = [...keywords, ...categories, ...cuisines].map((s) => s.toLowerCase());
    const mealType = this.detectMealType(combined);
    const diet = this.detectDietTags(combined);
    const tags = this.unique([
      ...keywords,
      ...categories,
      ...cuisines,
      "imported"
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
      instructions
    };
  }
  static extractPinterestOutboundUrl(html) {
    const metaMatch = html.match(/property=["']og:see_also["'][^>]*content=["']([^"']+)["']/i);
    if (metaMatch?.[1]) {
      const u = this.tryDecodeUrl(metaMatch[1]);
      if (this.isLikelyExternalRecipeUrl(u))
        return u;
    }
    const offsiteLinks = html.match(/https:\/\/www\.pinterest\.com\/offsite\/\?[^"'<\s]+/gi) || [];
    for (const link of offsiteLinks) {
      try {
        const urlObj = new URL(link);
        const target = urlObj.searchParams.get("url");
        const u = this.tryDecodeUrl(target || "");
        if (this.isLikelyExternalRecipeUrl(u))
          return u;
      } catch {
      }
    }
    const escapedLinkMatches = html.match(/"link":"(https?:\\\/\\\/[^"]+)"/gi) || [];
    for (const raw of escapedLinkMatches) {
      const m = raw.match(/"link":"([^"]+)"/i);
      if (!m?.[1])
        continue;
      const u = this.tryDecodeUrl(m[1]);
      if (this.isLikelyExternalRecipeUrl(u))
        return u;
    }
    return null;
  }
  static extractRecipeObjects(html) {
    const scripts = html.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi) || [];
    const recipes = [];
    for (const scriptTag of scripts) {
      const body = scriptTag.replace(/^<script[^>]*>/i, "").replace(/<\/script>$/i, "").trim();
      const parsed = this.tryParseJsonLd(body);
      if (!parsed)
        continue;
      this.walkForRecipeObjects(parsed, recipes);
    }
    return recipes;
  }
  static walkForRecipeObjects(node, out) {
    if (!node)
      return;
    if (Array.isArray(node)) {
      for (const item of node)
        this.walkForRecipeObjects(item, out);
      return;
    }
    if (typeof node !== "object")
      return;
    if (this.isRecipeType(node["@type"])) {
      out.push(node);
    }
    for (const value of Object.values(node)) {
      this.walkForRecipeObjects(value, out);
    }
  }
  static isRecipeType(typeVal) {
    if (!typeVal)
      return false;
    if (Array.isArray(typeVal))
      return typeVal.some((t) => this.isRecipeType(t));
    return String(typeVal).toLowerCase().includes("recipe");
  }
  static recipeScore(recipe) {
    const ingredients = this.normalizeStringList(recipe.recipeIngredient || recipe.ingredients);
    const instructions = this.extractInstructions(recipe.recipeInstructions);
    let score = 0;
    score += ingredients.length * 3;
    score += instructions.length * 4;
    if (recipe.name)
      score += 5;
    if (recipe.nutrition)
      score += 2;
    return score;
  }
  static tryParseJsonLd(raw) {
    try {
      return JSON.parse(raw);
    } catch {
      try {
        const cleaned = raw.replace(/[\u0000-\u001F]+/g, "");
        return JSON.parse(cleaned);
      } catch {
        return null;
      }
    }
  }
  static extractInstructions(input) {
    const steps = [];
    const walk = (node) => {
      if (!node)
        return;
      if (Array.isArray(node)) {
        for (const item of node)
          walk(item);
        return;
      }
      if (typeof node === "string") {
        const s = this.cleanText(node);
        if (s)
          steps.push(s);
        return;
      }
      if (typeof node !== "object")
        return;
      if (typeof node.text === "string") {
        const s = this.cleanText(node.text);
        if (s)
          steps.push(s);
      }
      if (Array.isArray(node.itemListElement))
        walk(node.itemListElement);
      if (Array.isArray(node.steps))
        walk(node.steps);
    };
    walk(input);
    return this.unique(steps);
  }
  static normalizeStringList(value) {
    if (!value)
      return [];
    if (Array.isArray(value)) {
      return this.unique(
        value.map((v) => this.cleanText(String(v))).filter(Boolean)
      );
    }
    if (typeof value === "string") {
      return this.unique(
        value.split(",").map((v) => this.cleanText(v)).filter(Boolean)
      );
    }
    return [];
  }
  static normalizeYield(yieldVal) {
    if (!yieldVal)
      return "";
    if (Array.isArray(yieldVal) && yieldVal.length > 0)
      return this.cleanText(String(yieldVal[0]));
    return this.cleanText(String(yieldVal));
  }
  static formatDuration(isoDuration) {
    if (!isoDuration || typeof isoDuration !== "string")
      return "";
    const s = isoDuration.trim();
    if (!s.startsWith("P"))
      return s;
    const m = s.match(/P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?/i);
    if (!m)
      return s;
    const days = parseInt(m[1] || "0", 10);
    const hours = parseInt(m[2] || "0", 10);
    const mins = parseInt(m[3] || "0", 10);
    const parts = [];
    if (days > 0)
      parts.push(`${days}d`);
    if (hours > 0)
      parts.push(`${hours}h`);
    if (mins > 0)
      parts.push(`${mins}m`);
    return parts.join(" ");
  }
  static extractNumberString(value) {
    if (!value)
      return "";
    const s = String(value);
    const m = s.match(/([\d.]+)/);
    return m ? m[1] : "";
  }
  static detectMealType(tokens) {
    const mealTypes = [];
    const addIfMatch = (key, type) => {
      if (tokens.some((t) => t.includes(key)))
        mealTypes.push(type);
    };
    addIfMatch("breakfast", "breakfast");
    addIfMatch("brunch", "breakfast");
    addIfMatch("lunch", "lunch");
    addIfMatch("dinner", "dinner");
    addIfMatch("main", "dinner");
    addIfMatch("snack", "snack");
    addIfMatch("dessert", "dessert");
    return this.unique(mealTypes.length > 0 ? mealTypes : ["dinner"]);
  }
  static detectDietTags(tokens) {
    const labels = [
      "vegetarian",
      "vegan",
      "keto",
      "low-carb",
      "gluten-free",
      "dairy-free",
      "high-protein"
    ];
    return labels.filter((label) => {
      const normalized = label.replace("-", " ");
      return tokens.some((t) => t.includes(label) || t.includes(normalized));
    });
  }
  static tryDecodeUrl(value) {
    if (!value)
      return "";
    let s = value.trim();
    s = s.replace(/\\u002F/gi, "/").replace(/\\\//g, "/");
    try {
      s = decodeURIComponent(s);
    } catch {
    }
    return s;
  }
  static isLikelyExternalRecipeUrl(url) {
    if (!url || !/^https?:\/\//i.test(url))
      return false;
    try {
      const host = new URL(url).hostname.toLowerCase();
      return !host.includes("pinterest.com");
    } catch {
      return false;
    }
  }
  static cleanText(s) {
    return s.replace(/\s+/g, " ").trim();
  }
  static unique(values) {
    return [...new Set(values.filter(Boolean))];
  }
};

// src/main.ts
var MealPlannerPlugin = class extends import_obsidian5.Plugin {
  constructor() {
    super(...arguments);
    this.cachedRecipes = [];
  }
  async onload() {
    this.dataStore = new DataStore(this);
    await this.dataStore.load();
    this.parser = new RecipeParser(this.app, this.dataStore.getRecipeFolderPath());
    this.planner = new MealPlanner(this.dataStore);
    this.groceryGenerator = new GroceryListGenerator(this.dataStore);
    this.registerView(MEAL_PLAN_VIEW_TYPE, (leaf) => new MealPlanView(leaf, this));
    this.addCommand({
      id: "open-meal-plan",
      name: "Open meal plan",
      callback: () => this.activateView()
    });
    this.addCommand({
      id: "generate-meal-plan",
      name: "Generate weekly meal plan",
      callback: () => this.generateMealPlan()
    });
    this.addCommand({
      id: "view-grocery-list",
      name: "View grocery list",
      callback: () => this.showGroceryList()
    });
    this.addCommand({
      id: "browse-recipes",
      name: "Browse recipes",
      callback: () => this.browseRecipes()
    });
    this.addCommand({
      id: "import-recipe-from-url",
      name: "Import recipe from URL",
      callback: () => this.openImportRecipeModal()
    });
    this.addCommand({
      id: "list-parsed-recipes",
      name: "List all parsed recipes",
      callback: () => this.listParsedRecipes()
    });
    this.addCommand({
      id: "refresh-recipes",
      name: "Refresh recipe index",
      callback: () => this.refreshRecipes()
    });
    this.addSettingTab(new MealPlannerSettingTab(this.app, this));
    this.addRibbonIcon("utensils", "Meal Planner", () => {
      this.activateView();
    });
    this.app.workspace.onLayoutReady(async () => {
      await this.refreshRecipes();
    });
  }
  onunload() {
    this.app.workspace.detachLeavesOfType(MEAL_PLAN_VIEW_TYPE);
  }
  // ── Core Operations ──
  async refreshRecipes() {
    this.parser = new RecipeParser(this.app, this.dataStore.getRecipeFolderPath());
    this.cachedRecipes = await this.parser.parseAllRecipes();
    new import_obsidian5.Notice(`Indexed ${this.cachedRecipes.length} recipes`);
    this.refreshView();
  }
  async generateMealPlan() {
    if (this.cachedRecipes.length === 0) {
      await this.refreshRecipes();
    }
    try {
      const count = this.dataStore.getData().settings.dinnersPerWeek;
      const plan = this.planner.generateWeeklyPlan(this.cachedRecipes, count);
      await this.dataStore.saveWeeklyPlan(plan);
      const recipeMap = new Map(this.cachedRecipes.map((r) => [r.id, r]));
      const titles = plan.meals.map((m) => recipeMap.get(m.recipeId)?.title || "Unknown").join("\n  \xB7 ");
      new import_obsidian5.Notice(`Meal plan generated!
  \xB7 ${titles}`, 8e3);
      await this.activateView();
      this.refreshView();
    } catch (e) {
      new import_obsidian5.Notice(`Error generating plan: ${e.message}`);
    }
  }
  async showGroceryList() {
    const plan = this.dataStore.getCurrentWeekPlan();
    if (!plan || plan.meals.length === 0) {
      new import_obsidian5.Notice("No meal plan for this week. Generate one first.");
      return;
    }
    const dinnerMeals = plan.meals.filter((m) => !m.isLeftover);
    const recipeMap = new Map(this.cachedRecipes.map((r) => [r.id, r]));
    const recipes = dinnerMeals.map((m) => recipeMap.get(m.recipeId)).filter((r) => r !== void 0);
    const items = this.groceryGenerator.generate(recipes);
    new GroceryListModal(this.app, this, items).open();
  }
  browseRecipes() {
    if (this.cachedRecipes.length === 0) {
      new import_obsidian5.Notice("No recipes loaded. Refreshing...");
      this.refreshRecipes().then(() => {
        new RecipeBrowserModal(this.app, this).open();
      });
      return;
    }
    new RecipeBrowserModal(this.app, this).open();
  }
  openImportRecipeModal() {
    new ImportRecipeModal(this.app, this).open();
  }
  async importRecipeFromUrl(rawUrl) {
    const url = rawUrl.trim();
    if (!/^https?:\/\//i.test(url)) {
      throw new Error("Please enter a valid http(s) URL.");
    }
    const primaryHtml = await this.fetchHtml(url);
    let draft = WebRecipeParser.parseRecipeFromHtml(primaryHtml, url);
    if (!draft && /pinterest\.com/i.test(url)) {
      const outboundUrl = WebRecipeParser.extractPinterestOutboundUrl(primaryHtml);
      if (outboundUrl) {
        const outboundHtml = await this.fetchHtml(outboundUrl);
        draft = WebRecipeParser.parseRecipeFromHtml(outboundHtml, outboundUrl);
      }
    }
    if (!draft) {
      throw new Error("Could not find structured recipe data on that page.");
    }
    const file = await this.createImportedRecipeFile(draft);
    await this.refreshRecipes();
    return file;
  }
  async listParsedRecipes() {
    if (this.cachedRecipes.length === 0) {
      await this.refreshRecipes();
    }
    const lines = this.cachedRecipes.map((r) => {
      const stats = this.dataStore.getRecipeStats(r.id);
      const parts = [
        r.title,
        `[${r.category}${r.subcategory ? "/" + r.subcategory : ""}]`,
        `${r.caloriesPerServing} cal`,
        `${r.protein}g protein`,
        `${r.ingredients.reduce((n, s) => n + s.items.length, 0)} ingredients`
      ];
      if (stats.daysSinceLastMade !== null) {
        parts.push(`last made ${stats.daysSinceLastMade}d ago`);
      }
      return parts.join(" \xB7 ");
    });
    new import_obsidian5.Notice(`Found ${this.cachedRecipes.length} recipes. Check console for details.`);
    console.log("=== Parsed Recipes ===");
    lines.forEach((l) => console.log(l));
    console.log("=== End ===");
  }
  // ── Plan Manipulation ──
  async addRecipeToPlan(recipe) {
    let plan = this.dataStore.getCurrentWeekPlan();
    const monday = this.dataStore.getMonday(/* @__PURE__ */ new Date());
    if (!plan) {
      plan = {
        weekStart: this.dataStore.formatDate(monday),
        meals: [],
        generatedAt: (/* @__PURE__ */ new Date()).toISOString()
      };
    }
    const usedDays = new Set(plan.meals.map((m) => m.plannedDate));
    let date = null;
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
      date = new Date(monday);
      date.setDate(date.getDate() + 5);
    }
    plan.meals.push({
      recipeId: recipe.id,
      plannedDate: this.dataStore.formatDate(date),
      mealType: "dinner",
      servings: recipe.servings
    });
    await this.dataStore.saveWeeklyPlan(plan);
    this.refreshView();
  }
  async swapRecipe(meal) {
    new RecipeSuggestModal(this.app, this, async (recipe) => {
      const plan = this.dataStore.getCurrentWeekPlan();
      if (!plan)
        return;
      const idx = plan.meals.findIndex(
        (m) => m.recipeId === meal.recipeId && m.plannedDate === meal.plannedDate && m.mealType === meal.mealType
      );
      if (idx >= 0) {
        const oldRecipeId = plan.meals[idx].recipeId;
        const oldDate = plan.meals[idx].plannedDate;
        plan.meals[idx] = {
          ...plan.meals[idx],
          recipeId: recipe.id,
          servings: recipe.servings
        };
        if (!meal.isLeftover) {
          plan.meals = plan.meals.filter(
            (m) => !(m.isLeftover && m.leftoverSourceDate === oldDate && m.recipeId === oldRecipeId)
          );
          const settings = this.dataStore.getData().settings;
          if (settings.leftoverLunches && recipe.servings >= 4) {
            const nextDay = /* @__PURE__ */ new Date(oldDate + "T00:00:00");
            nextDay.setDate(nextDay.getDate() + 1);
            const nextDayStr = this.dataStore.formatDate(nextDay);
            const leftoverServings = recipe.servings >= 6 ? 2 : 1;
            plan.meals.push({
              recipeId: recipe.id,
              plannedDate: nextDayStr,
              mealType: "lunch",
              servings: leftoverServings,
              isLeftover: true,
              leftoverSourceDate: oldDate
            });
          }
          plan.meals.sort((a, b) => {
            const dc = a.plannedDate.localeCompare(b.plannedDate);
            if (dc !== 0)
              return dc;
            if (a.isLeftover && !b.isLeftover)
              return 1;
            if (!a.isLeftover && b.isLeftover)
              return -1;
            return 0;
          });
        }
        await this.dataStore.saveWeeklyPlan(plan);
        new import_obsidian5.Notice(`Swapped to "${recipe.title}"`);
        this.refreshView();
      }
    }).open();
  }
  async removeMealFromPlan(meal) {
    const plan = this.dataStore.getCurrentWeekPlan();
    if (!plan)
      return;
    plan.meals = plan.meals.filter(
      (m) => !(m.recipeId === meal.recipeId && m.plannedDate === meal.plannedDate && m.mealType === meal.mealType)
    );
    if (!meal.isLeftover) {
      plan.meals = plan.meals.filter(
        (m) => !(m.isLeftover && m.leftoverSourceDate === meal.plannedDate && m.recipeId === meal.recipeId)
      );
    }
    await this.dataStore.saveWeeklyPlan(plan);
    new import_obsidian5.Notice("Removed from plan");
    this.refreshView();
  }
  async clearCurrentWeekPlan() {
    const plan = this.dataStore.getCurrentWeekPlan();
    if (!plan || plan.meals.length === 0) {
      new import_obsidian5.Notice("No meals to clear for this week.");
      return;
    }
    plan.meals = [];
    await this.dataStore.saveWeeklyPlan(plan);
    new import_obsidian5.Notice("Cleared this week's meal plan.");
    this.refreshView();
  }
  // ── View Management ──
  async activateView() {
    const { workspace } = this.app;
    let leaf = null;
    const leaves = workspace.getLeavesOfType(MEAL_PLAN_VIEW_TYPE);
    if (leaves.length > 0) {
      leaf = leaves[0];
    } else {
      leaf = workspace.getRightLeaf(false);
      if (leaf) {
        await leaf.setViewState({
          type: MEAL_PLAN_VIEW_TYPE,
          active: true
        });
      }
    }
    if (leaf) {
      workspace.revealLeaf(leaf);
      const view = leaf.view;
      if (view && typeof view.render === "function") {
        await view.render();
      }
    }
  }
  refreshView() {
    const leaves = this.app.workspace.getLeavesOfType(MEAL_PLAN_VIEW_TYPE);
    for (const leaf of leaves) {
      const view = leaf.view;
      if (view && view.render) {
        view.render();
      }
    }
  }
  openRecipeFile(filePath) {
    const file = this.app.vault.getAbstractFileByPath(filePath);
    if (file instanceof import_obsidian5.TFile) {
      this.app.workspace.getLeaf(false).openFile(file);
    }
  }
  async fetchHtml(url) {
    const resp = await (0, import_obsidian5.requestUrl)({
      url,
      method: "GET",
      headers: {
        "User-Agent": "Mozilla/5.0 (Meal Planner Obsidian Plugin)",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
      }
    });
    if (resp.status < 200 || resp.status >= 300) {
      throw new Error(`Failed to fetch URL (${resp.status})`);
    }
    return resp.text;
  }
  async createImportedRecipeFile(draft) {
    const folder = this.getImportFolderForMealType(draft.mealType);
    await this.ensureFolderPath(folder);
    const baseName = this.toSafeFileName(draft.title || "Imported Recipe");
    const availablePath = this.app.vault.getAvailablePath(`${folder}/${baseName}`, "md");
    const markdown = this.buildImportedRecipeMarkdown(draft);
    return await this.app.vault.create(availablePath, markdown);
  }
  getImportFolderForMealType(mealTypes) {
    const root = this.dataStore.getRecipeFolderPath();
    const normalized = mealTypes.map((m) => m.toLowerCase());
    if (normalized.includes("breakfast"))
      return `${root}/0. Breakfast/Imported`;
    if (normalized.includes("lunch"))
      return `${root}/3. Salads/Imported`;
    if (normalized.includes("snack"))
      return `${root}/11. Snacks/Imported`;
    if (normalized.includes("dessert"))
      return `${root}/7. Desserts/Imported`;
    return `${root}/4. Mains/Imported`;
  }
  async ensureFolderPath(path) {
    const parts = path.split("/").filter(Boolean);
    let current = "";
    for (const part of parts) {
      current = current ? `${current}/${part}` : part;
      if (!this.app.vault.getAbstractFileByPath(current)) {
        await this.app.vault.createFolder(current);
      }
    }
  }
  toSafeFileName(name) {
    return name.replace(/[\\/:*?"<>|]/g, "").replace(/\s+/g, " ").trim().slice(0, 120) || "Imported Recipe";
  }
  buildImportedRecipeMarkdown(draft) {
    const mealType = draft.mealType.length > 0 ? draft.mealType : ["dinner"];
    const tags = draft.tags.length > 0 ? draft.tags : ["imported"];
    const ingredients = draft.ingredients.length > 0 ? draft.ingredients : ["(add ingredients)"];
    const instructions = draft.instructions.length > 0 ? draft.instructions : ["(add instructions)"];
    const lines = [
      "---",
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
      "---",
      "",
      `# ${draft.title}`,
      "",
      "## Ingredients",
      ...ingredients.map((i) => `- ${i}`),
      "",
      "## Instructions",
      ...instructions.map((step, i) => `${i + 1}. ${step}`),
      "",
      "## Notes",
      "- Imported from URL. Review and adjust as needed.",
      ""
    ];
    return lines.join("\n");
  }
  yamlArray(values) {
    const cleaned = values.map((v) => `"${this.escapeYaml(v)}"`).join(", ");
    return `[${cleaned}]`;
  }
  escapeYaml(value) {
    return String(value || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  }
};
