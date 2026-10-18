import {
  pointTransactionListQuerySchema,
  pointTransactionListResponseSchema,
} from "@ukiyo-e/shared";
import type { FastifyInstance } from "fastify";
import { listPointTransactions } from "../db/queries/point-transactions";
import { sendValidationError } from "./helpers";

export async function pointsRoutes(app: FastifyInstance): Promise<void> {
  app.get("/points/transactions", { preHandler: app.requireAuth }, async (request, reply) => {
    const parsed = pointTransactionListQuerySchema.safeParse(request.query);
    if (!parsed.success) return sendValidationError(reply, parsed.error);

    const { limit, offset } = parsed.data;
    const result = listPointTransactions(app.db, {
      userId: request.user!.id,
      limit,
      offset,
    });

    return reply.send(
      pointTransactionListResponseSchema.parse({
        items: result.items.map((item) => ({
          id: item.id,
          amount: item.amount,
          balanceAfter: item.balance_after,
          reason: item.reason,
          refType: item.ref_type,
          refId: item.ref_id,
          note: item.note,
          createdAt: item.created_at,
        })),
        total: result.total,
        limit,
        offset,
      }),
    );
  });
}
