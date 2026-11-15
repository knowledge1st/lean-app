import { z } from 'zod';

export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_BYTES = 72;
const usernameSchema = z
  .string({ error: 'Usuario requerido' })
  .trim()
  .toLowerCase()
  .min(1, 'Usuario requerido')
  .max(64, 'Usuario demasiado largo');
const passwordSchema = z
  .string({ error: 'Contraseña requerida' })
  .min(1, 'Contraseña requerida')
  .max(200, 'Contraseña demasiado larga');

export const loginRequestSchema = z.object({
  username: usernameSchema,
  password: passwordSchema,
});
export const changePasswordRequestSchema = z.object({
  currentPassword: passwordSchema,
  newPassword: z
    .string({ error: 'Contraseña nueva requerida' })
    .min(PASSWORD_MIN_LENGTH, 'La contraseña nueva debe tener al menos 10 caracteres')
    .refine((value) => new TextEncoder().encode(value).length <= PASSWORD_MAX_BYTES, {
      message: 'La contraseña nueva es demasiado larga',
    }),
});
export const userSchema = z.object({
  id: z.uuid(),
  username: usernameSchema,
  displayName: z.string(),
});
export const loginResponseSchema = z.object({ token: z.string().min(1), user: userSchema });

export type LoginRequest = z.infer<typeof loginRequestSchema>;
export type ChangePasswordRequest = z.infer<typeof changePasswordRequestSchema>;
export type PublicUser = z.infer<typeof userSchema>;
export type LoginResponse = z.infer<typeof loginResponseSchema>;
