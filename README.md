# Intelligent Meal Planner

Intelligent meal planning for Obsidian with recipe indexing, weekly planning, manual meal selection, grocery list generation, and cooking history tracking.

## Features

- Weekly meal plan generation from your recipe vault.
- Manual meal planning (`Select Meals`) with multi-add flow.
- Leftover lunch auto-generation from dinner servings.
- Drag-and-drop reorder by day.
- Mark meals cooked and track history.
- Grocery list generation with category/store grouping.
- Grocery export to vault markdown or clipboard.

## Commands

- `Open meal plan`
- `Generate weekly meal plan`
- `View grocery list`
- `Browse recipes`
- `List all parsed recipes`
- `Refresh recipe index`

## Sidebar Actions

- `Generate Plan`
- `Select Meals`
- `Clear Plan`
- `Grocery List`

## Settings

- Recipe folder path
- Dinners per week
- Leftover lunches
- Plan categories
- Grocery list file path

## Recipe Format

This plugin expects markdown recipe notes in your recipe folder with YAML frontmatter and an `## Ingredients` section. It parses frontmatter and ingredient lists to drive planning and grocery features.

Example frontmatter:

```yaml
---
title: Creamy Chicken Tortilla Soup
meal_type: [dinner]
servings: 6
calories_per_serving: 380
net_carbs: 12
protein: 28
diet: [gluten-free]
tags: [chicken, soup, easy]
---
```

## Author

- Author: Piplup Stitched
- GitHub: https://github.com/piplupstitched
- Donate: https://ko-fi.com/piplupstitched
