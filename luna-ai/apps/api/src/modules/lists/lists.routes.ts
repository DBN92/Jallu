import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../../middleware/auth';

const idParam = z.object({ id: z.string().regex(/^[a-z0-9]{8,40}$/) });
const status = z.enum(['have', 'buy']);
const itemBody = z.object({ name: z.string().min(1).max(60), status: status.default('buy'), quantity: z.string().max(30).nullable().optional() });
const itemPatch = z.object({ name: z.string().min(1).max(60).optional(), status: status.optional(), quantity: z.string().max(30).nullable().optional() });
const noteBody = z.object({ text: z.string().min(1).max(4000) });
const notePatch = z.object({ text: z.string().min(1).max(4000).optional(), pinned: z.boolean().optional() });

/** Lista da casa (em casa / comprar) e notas: qualquer pessoa da casa com login vê e edita. */
export async function listsRoutes(app: FastifyInstance) {
  const { lists } = app.services;

  app.get('/api/lists/items', { preHandler: requireAuth }, async () => lists.items());
  app.post('/api/lists/items', { preHandler: requireAuth }, async (req) => {
    const b = itemBody.parse(req.body);
    return lists.upsertItem(b.name, b.status, b.quantity);
  });
  app.post('/api/lists/items/bought-all', { preHandler: requireAuth }, async () => lists.boughtAll());
  app.patch('/api/lists/items/:id', { preHandler: requireAuth }, async (req) => lists.updateItem(idParam.parse(req.params).id, itemPatch.parse(req.body)));
  app.delete('/api/lists/items/:id', { preHandler: requireAuth }, async (req) => lists.removeItem(idParam.parse(req.params).id));

  app.get('/api/lists/notes', { preHandler: requireAuth }, async () => lists.notes());
  app.post('/api/lists/notes', { preHandler: requireAuth }, async (req) => lists.addNote(noteBody.parse(req.body).text));
  app.patch('/api/lists/notes/:id', { preHandler: requireAuth }, async (req) => lists.updateNote(idParam.parse(req.params).id, notePatch.parse(req.body)));
  app.delete('/api/lists/notes/:id', { preHandler: requireAuth }, async (req) => lists.removeNote(idParam.parse(req.params).id));
}
