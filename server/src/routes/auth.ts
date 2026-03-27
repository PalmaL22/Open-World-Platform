import { Router } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { prisma } from "../lib/prisma.js";
import { authMiddleware } from "../middleware/auth.js";

export const authRouter = Router();

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) throw new Error("No key found");

const SALT_ROUNDS = 10;

authRouter.post("/register", async (req, res) => {
  try {
    const { email, password, username, characterColor } = req.body;

    if (!email || !password || !username) {
      return res.status(400).json({ error: "Email, password, and username are required" });
    }

    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        username,
        character: {
          create: {
            color: characterColor ?? "#3498db",
          },
        },
      },
      include: { character: true },
    });

    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: "7d" });

    res.status(201).json({
      token,
      user: {
        id: user.id,
        username: user.username,
        character: user.character,
      },
    });

  } catch (e: unknown) {
    if (e && typeof e === "object" && "code" in e && e.code === "P2002") {
      const meta = "meta" in e ? (e.meta as { target?: string[] }) : null;
      const target = meta?.target?.[0];

      if (target === "email") 
        return res.status(400).json({ error: "Email already taken" });
      else if (target === "username") 
        return res.status(400).json({ error: "Username already taken" });
    }

    console.error(e);
    res.status(500).json({ error: "Registration failed" });
  }
});

authRouter.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email){
      return res.status(400).json({ error: "Email is required" });
    }
    else if (!password) {
      return res.status(400).json({ error: "Password is required" });
    }

    // Find the user by email with prisma client
    const user = await prisma.user.findUnique({
      where: { email },
      include: { character: true },
    });

    // Future question: should we check if the user exists and then compare the password? or would this bring vulnerabilities?
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: "7d" });

    res.status(200).json({
      token,
      user: {
        id: user.id,
        username: user.username,
        character: user.character,
      },
    });

  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Login failed" });
  }
});

// Still deciding if we want to send the user info or just token validation for this route
authRouter.get("/me", authMiddleware, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      include: { character: true },
    });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json({
      id: user.id,
      username: user.username,
      character: user.character,
    });

  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to load user" });
  }
});
