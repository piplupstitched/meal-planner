# Intelligent Meal Planner

Intelligent meal planning for Obsidian with recipe indexing, weekly planning, manual meal selection, grocery list generation, and URL import.

## Features

- Weekly meal plan generation from your recipe vault.
- Manual meal planning (`Select Meals`) with multi-add flow.
- Leftover lunch auto-generation from dinner servings.
- Drag-and-drop reorder by day.
- Mark meals cooked and track history.
- Grocery list generation with category/store grouping.
- Grocery export to vault markdown.
- Optional Todoist grocery sync.
- Import recipe from URL (including many Pinterest/source pages via structured recipe data).

## Commands

- `Open meal plan`
- `Generate weekly meal plan`
- `View grocery list`
- `Browse recipes`
- `Import recipe from URL`
- `List all parsed recipes`
- `Refresh recipe index`

## Sidebar Actions

- `Generate Plan`
- `Select Meals`
- `Import URL`
- `Clear Plan`
- `Grocery List`

## Settings

- Recipe folder path
- Dinners per week
- Leftover lunches
- Plan categories
- Grocery list file path
- Todoist API token
- Todoist project name

## Recipe Format

This plugin expects markdown recipe notes in your recipe folder with YAML frontmatter and an `## Ingredients` section. It parses frontmatter and ingredient lists to drive planning and grocery features.

## URL Import Notes

- Best results when source pages include JSON-LD `Recipe` data (common on recipe sites).
- Pinterest URLs are supported via outbound/source extraction when possible.
- Some sites with anti-bot protection may fail to import.

## Author

- Author: Piplup Stitched
- GitHub: https://github.com/piplupstitched
- Donate: https://ko-fi.com/piplupstitched
