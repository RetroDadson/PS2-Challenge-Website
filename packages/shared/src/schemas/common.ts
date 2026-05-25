import { z } from "zod";

export const dateOnlySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD date");

export const nullableDateOnlySchema = z.union([dateOnlySchema, z.null()]).optional();

export const timeSpanSchema = z
  .string()
  .regex(/^(\d+\.)?\d{1,3}:\d{2}:\d{2}$/, "Expected HH:MM:SS or d.HH:MM:SS duration")
  .nullable()
  .optional();

export const idParamSchema = z.object({
  id: z.coerce.number().int().positive()
});

export const requiredString = (name: string, maxLength?: number) => {
  let schema = z.string().trim().min(1, `${name} is required`);
  if (maxLength) {
    schema = schema.max(maxLength, `${name} cannot exceed ${maxLength} characters`);
  }
  return schema;
};
