import { Router } from "express";
import { prisma } from "../lib/prisma.js";

export const serversRouter = Router();

serversRouter.get("/server-list", async (_req, res) => {
  try {
    const servers = await prisma.server.findMany({
      orderBy: { name: "asc" },
      select: { name: true },
    });

    res.json({ servers });
    
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to load servers" });
  }
});
