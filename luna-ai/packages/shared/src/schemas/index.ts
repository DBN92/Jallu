import { z } from 'zod';

export const aiModeSchema = z.enum(['local', 'cloud', 'hybrid']);

export const coordinatesSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});

export const loginSchema = z.object({
  username: z.string().trim().min(3).max(40),
  password: z.string().min(8).max(200),
});

export const setupSchema = loginSchema.extend({
  displayName: z.string().trim().min(1).max(60),
  setupCode: z.string().min(4).max(200),
});

export const createUserSchema = loginSchema.extend({
  displayName: z.string().trim().min(1).max(60),
  role: z.enum(['admin', 'member']).default('member'),
});

export const chatRequestSchema = z.object({
  message: z.string().trim().min(1).max(4000),
  conversationId: z.string().min(1).max(64).optional(),
  channel: z.enum(['text', 'voice']).default('text'),
  /** Coordenadas efêmeras do dispositivo. Nunca são persistidas. */
  location: coordinatesSchema.optional(),
});

export const vacuumCommandSchema = z.object({
  command: z.enum(['start', 'pause', 'stop', 'return_to_base', 'locate', 'set_fan_speed']),
  /** Obrigatório para set_fan_speed: uma das opções informadas pelo robô */
  fanSpeed: z.string().min(1).max(60).optional(),
});

/** Controle extra do robô: apertar (ação), escolher opção ou ligar/desligar. */
export const vacuumExtraSchema = z.object({
  id: z.string().regex(/^[a-z_]+\.[a-z0-9_]+$/),
  value: z.union([z.string().min(1).max(60), z.boolean()]).optional(),
});

export const litterAutoSchema = z.object({
  on: z.boolean(),
  /** Espera antes de limpar, em segundos (a caixa aceita de 1 a 600) */
  delaySeconds: z.number().int().min(1).max(3600).optional(),
});

export const litterCatSchema = z.object({
  name: z.string().trim().min(1).max(30).optional(),
  /** Peso de referência em kg; null volta a aprender sozinho */
  weightKg: z.number().min(0.5).max(15).nullable().optional(),
});

export const brightnessSchema = z.object({
  /** Brilho em porcentagem (0–100). */
  brightness: z.number().int().min(0).max(100),
});

export const deviceUpdateSchema = z.object({
  /** Novo nome na DIA; null volta ao nome do Home Assistant */
  name: z.string().trim().min(1).max(60).nullable().optional(),
  aiAllowed: z.boolean().optional(),
  aliases: z.array(z.string().trim().min(1).max(60)).max(10).optional(),
  hidden: z.boolean().optional(),
});

export const memoryCreateSchema = z.object({
  type: z.enum(['preference', 'fact', 'home', 'context', 'summary']).default('fact'),
  content: z.string().trim().min(2).max(1000),
});

export const settingsUpdateSchema = z.object({
  aiMode: aiModeSchema.optional(),
  voiceName: z.string().max(120).nullable().optional(),
  voiceRate: z.number().min(0.5).max(2).optional(),
  autoSpeak: z.boolean().optional(),
  realtimeVoice: z.string().max(40).optional(),
  allowCloudMemory: z.boolean().optional(),
  allowCloudTranscription: z.boolean().optional(),
  wakeWordEnabled: z.boolean().optional(),
});

export const homeLocationSchema = z.object({
  name: z.string().trim().min(1).max(120),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});

export const weatherQuerySchema = z.object({
  latitude: z.coerce.number().min(-90).max(90).optional(),
  longitude: z.coerce.number().min(-180).max(180).optional(),
});

export const geocodeQuerySchema = z.object({
  q: z.string().trim().min(2).max(100),
});

export const automationTriggerSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('time'), at: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM') }),
  z.object({ type: z.literal('sunset'), offsetMinutes: z.number().int().min(-180).max(180).default(0) }),
  z.object({ type: z.literal('sunrise'), offsetMinutes: z.number().int().min(-180).max(180).default(0) }),
  z.object({ type: z.literal('leave_home'), personEntityId: z.string().regex(/^person\.[a-z0-9_]+$/) }),
  z.object({ type: z.literal('arrive_home'), personEntityId: z.string().regex(/^person\.[a-z0-9_]+$/) }),
]);

export const automationActionSchema = z.object({
  service: z.enum(['turn_on', 'turn_off']),
  /** Lista de entity_id autorizados, ou "all_lights" para todas as luzes autorizadas. */
  target: z.union([z.literal('all_lights'), z.array(z.string().min(3)).min(1).max(30)]),
});

export const automationDraftSchema = z.object({
  name: z.string().trim().min(3).max(80),
  trigger: automationTriggerSchema,
  action: automationActionSchema,
});

export const voiceToolSchema = z.object({
  name: z.string().min(1).max(64),
  arguments: z.record(z.string(), z.unknown()).default({}),
  conversationId: z.string().max(64).optional(),
  location: coordinatesSchema.optional(),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type SetupInput = z.infer<typeof setupSchema>;
export type ChatRequest = z.infer<typeof chatRequestSchema>;
export type SettingsUpdate = z.infer<typeof settingsUpdateSchema>;
export type AutomationDraft = z.infer<typeof automationDraftSchema>;
export type AutomationTrigger = z.infer<typeof automationTriggerSchema>;
export type HomeLocation = z.infer<typeof homeLocationSchema>;
export type Coordinates = z.infer<typeof coordinatesSchema>;

export const ptzSchema = z.object({
  action: z.enum(['up', 'down', 'left', 'right', 'zoom_in', 'zoom_out', 'stop']),
});
