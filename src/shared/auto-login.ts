import { z } from "zod";
export const loginCredentials = z
  .object({
    username: z.string().trim().min(1).max(128),
    password: z.string().max(256),
  })
  .strict();
export const autoLoginInput = z.discriminatedUnion("enabled", [
  z.object({ enabled: z.literal(false) }).strict(),
  z
    .object({
      enabled: z.literal(true),
      username: z.string().trim().min(1).max(128),
      password: z.string().max(256).optional(),
    })
    .strict(),
]);
export type AutoLoginInput = z.infer<typeof autoLoginInput>;
export type AutoLoginStatus = {
  enabled: boolean;
  available: boolean;
  username?: string;
  error?: string;
};
