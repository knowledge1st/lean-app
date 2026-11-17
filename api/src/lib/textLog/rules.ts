import { TEXT_LOG_MAX_ITEMS, type AiMealParse } from '@lean/shared';

type Meal = AiMealParse['items'][number]['meal'];
const normalize = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
const mealPattern =
  /\b(desayuno|desayune|almuerzo|almorce|merienda|merende|cena|cene|snack|colacion|picoteo)\b/g;
const meals: Record<string, Meal> = {
  desayuno: 'breakfast',
  desayune: 'breakfast',
  almuerzo: 'lunch',
  almorce: 'lunch',
  merienda: 'afternoon_snack',
  merende: 'afternoon_snack',
  cena: 'dinner',
  cene: 'dinner',
  snack: 'snack',
  colacion: 'snack',
  picoteo: 'snack',
};
const quantities: Record<string, number> = {
  media: 0.5,
  medio: 0.5,
  un: 1,
  una: 1,
  uno: 1,
  dos: 2,
  tres: 3,
  cuatro: 4,
  cinco: 5,
  seis: 6,
  siete: 7,
  ocho: 8,
  nueve: 9,
  diez: 10,
};
const quantityPattern =
  /^(\d+\s*\/\s*\d+|\d+(?:[.,]\d+)?|media|medio|uno|una|un|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez)(?=\s|g\b|gramos\b|$)\s*/;
const dayPattern = /\b(ayer|anoche|manana|lunes|martes|miercoles|jueves|viernes|sabado|domingo)\b/g;

// Match on an accent-free projection, then remove the corresponding original spans.
function removeNormalized(text: string, pattern: RegExp): string {
  const offsets: number[] = [];
  let position = 0;
  for (const character of text) {
    for (let i = 0; i < normalize(character).length; i++) offsets.push(position);
    position += character.length;
  }
  offsets.push(text.length);
  const normalized = normalize(text);
  let result = '';
  let end = 0;
  for (const match of normalized.matchAll(pattern)) {
    const start = offsets[match.index]!;
    result += text.slice(end, start) + ' ';
    end = offsets[match.index + match[0].length]!;
  }
  return result + text.slice(end);
}

export function parseWithRules(text: string): AiMealParse {
  const items: AiMealParse['items'] = [];
  const normalized = normalize(text);
  let currentMeal: Meal = null;
  for (const originalSegment of text.split(/(?:(?<!\d),|,(?!\d)|[;\n])+/)) {
    const segment = normalize(originalSegment);
    const markers = [...segment.matchAll(mealPattern)];
    // A trailing meal applies to the entire comma-delimited span, including con/y.
    const trailing =
      markers.length === 1 &&
      !segment
        .slice(markers[0]!.index! + markers[0]![0].length)
        .replace(/[.!?]+/g, '')
        .trim();
    if (trailing) currentMeal = meals[markers[0]![0]] ?? null;
    const parts = originalSegment.split(/\s+(?:y|con)\s+/i);
    for (const originalPart of parts) {
      const part = normalize(originalPart);
      const marker = [...part.matchAll(mealPattern)].at(-1);
      if (marker) currentMeal = meals[marker[0]] ?? null;
      let query = removeNormalized(originalPart, mealPattern);
      query = removeNormalized(query, dayPattern);
      query = removeNormalized(
        query,
        /\b(?:me\s+comi|comi|tome|comido|tomado|para|en|el|la|los|las|de|del|al|hoy)\b/g,
      )
        .replace(/\s+/g, ' ')
        .trim();
      let grams = 100;
      let gramsStated = false;
      let units: number | null = null;
      const quantity = normalize(query).match(quantityPattern);
      if (quantity) {
        const spelling = quantity[1]!;
        const fraction = spelling.split('/').map(Number);
        const amount = spelling.includes('/')
          ? fraction[0]! / fraction[1]!
          : (quantities[spelling] ?? Number(spelling.replace(',', '.')));
        query = query.slice(quantity[0].length).trim();
        const gramUnit = normalize(query).match(/^(?:gramos|gramo|gr|g)\b\s*/);
        if (gramUnit) {
          grams = amount;
          gramsStated = true;
          query = query
            .slice(gramUnit[0].length)
            .replace(/^de\s+/, '')
            .trim();
        } else units = amount;
      }
      if (
        !/[a-z]/.test(normalize(query)) ||
        !Number.isFinite(grams) ||
        grams <= 0 ||
        (units !== null && (!Number.isFinite(units) || units <= 0 || units > 50))
      )
        continue;
      items.push({
        meal: currentMeal,
        said: originalPart.trim().slice(0, 80),
        catalogIndex: null,
        searchQuery: query.slice(0, 60),
        grams: Math.min(5000, grams),
        gramsStated,
        units,
        approximate: false,
      });
      if (items.length === TEXT_LOG_MAX_ITEMS) break;
    }
    if (items.length === TEXT_LOG_MAX_ITEMS) break;
  }
  return {
    items,
    otherDayMentioned:
      /\b(ayer|anoche|manana|lunes|martes|miercoles|jueves|viernes|sabado|domingo)\b/.test(
        normalized,
      ),
  };
}
