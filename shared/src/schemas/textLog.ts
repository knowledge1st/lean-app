import { z } from 'zod';
import { entryStatusSchema, gramsSchema, localDateSchema, mealSchema } from './entry';
import { foodSchema } from './food';

export const TEXT_LOG_MAX_CHARS = 1000;
export const TEXT_LOG_MAX_ITEMS = 30;
export const TEXT_LOG_DAILY_LIMIT = 20;

export const parseMealTextSchema = z.object({
  text: z
    .string()
    .trim()
    .min(1, 'Escribí qué comiste')
    .max(TEXT_LOG_MAX_CHARS, 'Texto demasiado largo'),
  date: localDateSchema,
  defaultMeal: mealSchema,
});

export const aiMealParseSchema = z.object({
  items: z
    .array(
      z.object({
        meal: mealSchema.nullable(),
        said: z.string().max(80),
        catalogIndex: z.number().int().nonnegative().nullable(),
        searchQuery: z.string().max(60),
        grams: z.number().positive().max(5000),
        gramsStated: z.boolean(),
        units: z.number().positive().max(50).nullable(),
        approximate: z.boolean(),
      }),
    )
    .max(TEXT_LOG_MAX_ITEMS),
  otherDayMentioned: z.boolean(),
});

export const aiMealParseJsonSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    items: {
      type: 'array',
      maxItems: TEXT_LOG_MAX_ITEMS,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          meal: {
            anyOf: [
              {
                type: 'string',
                enum: ['breakfast', 'lunch', 'afternoon_snack', 'dinner', 'snack'],
              },
              { type: 'null' },
            ],
          },
          said: { type: 'string', maxLength: 80 },
          catalogIndex: {
            type: ['integer', 'null'],
            minimum: 0,
            maximum: Number.MAX_SAFE_INTEGER,
          },
          searchQuery: { type: 'string', maxLength: 60 },
          grams: { type: 'number', exclusiveMinimum: 0, maximum: 5000 },
          gramsStated: { type: 'boolean' },
          units: { type: ['number', 'null'], exclusiveMinimum: 0, maximum: 50 },
          approximate: { type: 'boolean' },
        },
        required: [
          'meal',
          'said',
          'catalogIndex',
          'searchQuery',
          'grams',
          'gramsStated',
          'units',
          'approximate',
        ],
      },
    },
    otherDayMentioned: { type: 'boolean' },
  },
  required: ['items', 'otherDayMentioned'],
} as const;

export const proposedItemSchema = z.object({
  key: z.string(),
  meal: mealSchema,
  mealSource: z.enum(['text', 'default']),
  said: z.string(),
  grams: gramsSchema,
  gramsEstimated: z.boolean(),
  match: z.enum(['exact', 'approximate', 'none']),
  food: foodSchema.nullable(),
  alternatives: z.array(foodSchema).max(3),
  searchQuery: z.string(),
});

export const parseMealTextResponseSchema = z.object({
  items: z.array(proposedItemSchema),
  warnings: z.array(z.string()),
  remainingToday: z.number().int().nonnegative(),
  interpreter: z.enum(['ai', 'rules']),
});

export const createEntriesBatchSchema = z.object({
  date: localDateSchema,
  status: entryStatusSchema,
  items: z
    .array(z.object({ meal: mealSchema, foodId: z.uuid(), grams: gramsSchema }))
    .min(1)
    .max(TEXT_LOG_MAX_ITEMS),
});

export const textLogStatusSchema = z.object({
  available: z.boolean(),
  candidates: z.array(z.string()),
  degraded: z.array(z.string()),
  checkedAt: z.string().nullable(),
  freeRemainingToday: z.number().int().nullable(),
});

export const meFeaturesSchema = z.object({ textLog: z.boolean(), textLogAi: z.boolean() });

export type ParseMealText = z.infer<typeof parseMealTextSchema>;
export type AiMealParse = z.infer<typeof aiMealParseSchema>;
export type ProposedItem = z.infer<typeof proposedItemSchema>;
export type ParseMealTextResponse = z.infer<typeof parseMealTextResponseSchema>;
export type CreateEntriesBatch = z.infer<typeof createEntriesBatchSchema>;
export type TextLogStatus = z.infer<typeof textLogStatusSchema>;
export type MeFeatures = z.infer<typeof meFeaturesSchema>;
