import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { authMiddleware } from "../middleware/authMiddleware.js";

export const serversRouter = Router();

serversRouter.use(authMiddleware);

serversRouter.get("/server-list", async (_req, res) => {
  try {
    const servers = await prisma.server.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        maxCapacity: true,
        _count: {
          select: {
            users: true,
          },
        },
      },
    });

    res.json({
      servers: servers.map((s) => ({
        id: s.id,
        name: s.name,
        maxCapacity: s.maxCapacity,
        playerCount: s._count.users,
      })),
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to load servers" });
  }
});
