import { Router } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { PrismaClientKnownRequestError } from "@prisma/client/runtime/client";
import { prisma } from "../lib/prisma.js";
import { authMiddleware } from "../middleware/authMiddleware.js";
import { JWT_SECRET } from "../types/env.js";

export const authRouter = Router();

const SALT_ROUNDS = 10;
const EMAIL_MAX_LENGTH = 100;
const EMAIL_LOCAL_MAX_LENGTH = 60;
const EMAIL_LABEL_MAX_LENGTH = 60;
const USERNAME_REGEX = /^[a-zA-Z0-9_]{3,20}$/;
const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_MAX_LENGTH = 30; 

authRouter.post("/register", async (req, res) => {
  let normalizedEmail: string | undefined;
  let normalizedUsername: string | undefined;

  try {
    const { email, password, username, characterColor } = req.body as {
      email?: unknown;
      password?: unknown;
      username?: unknown;
      characterColor?: unknown;
    };

    if (typeof email !== "string" || typeof password !== "string" || typeof username !== "string") {
      return res.status(400).json({ error: "Email, password, and username are required" });
    }

    const validation = validateCredentials({ email, password, username, requireUsername: true });
    if (!validation.ok) return res.status(400).json({ error: validation.error });
    if (!validation.username) return res.status(400).json({ error: "Invalid username" });

    normalizedEmail = validation.email;
    normalizedUsername = validation.username;

    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

    const user = await prisma.user.create({
      data: {
        email: validation.email,
        password: hashedPassword,
        username: validation.username,
        character: {
          create: {
            color: typeof characterColor === "string" ? characterColor : "#3498db",
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
    if (e instanceof PrismaClientKnownRequestError && e.code === "P2002") {
      const message = await registrationDuplicateMessage(e, normalizedEmail, normalizedUsername);
      return res.status(400).json({ error: message });
    }

    console.error(e);
    res.status(500).json({ error: "Registration failed" });
  }
});

authRouter.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body as { email?: unknown; password?: unknown };

    if (typeof email !== "string") {
      return res.status(400).json({ error: "Email is required" });
    } else if (typeof password !== "string") {
      return res.status(400).json({ error: "Password is required" });
    }

    if (password.length < PASSWORD_MIN_LENGTH || password.length > PASSWORD_MAX_LENGTH) {
      return res.status(400).json({ error: "Invalid email or password" });
    }

    const validation = validateCredentials({ email, password });
    if (!validation.ok) {
      return res.status(400).json({ error: validation.error });
    }

    const user = await prisma.user.findUnique({
      where: { email: validation.email },
      include: { character: true },
    });

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

function p2002UniqueFields(meta: unknown): string[] {
  if (!meta || typeof meta !== "object" || !("target" in meta)) return [];
  const t = (meta as { target?: unknown }).target;
  if (Array.isArray(t)) return t.filter((x): x is string => typeof x === "string");
  if (typeof t === "string") return [t];
  return [];
}

async function registrationDuplicateMessage(
  e: PrismaClientKnownRequestError,
  email: string | undefined,
  username: string | undefined,
): Promise<string> {
  const fields = p2002UniqueFields(e.meta);
  if (fields.includes("email")) {
    return "An account with this email already exists. Sign in instead.";
  }
  if (fields.includes("username")) {
    return "This username is already taken. Choose a different one.";
  }

  if (email && username) {
    const [existingEmail, existingUsername] = await Promise.all([
      prisma.user.findUnique({ where: { email }, select: { id: true } }),
      prisma.user.findUnique({ where: { username }, select: { id: true } }),
    ]);
    if (existingEmail) {
      return "An account with this email already exists. Sign in instead.";
    }
    if (existingUsername) {
      return "This username is already taken. Choose a different one.";
    }
  }

  return "This email or username is already registered. Try signing in or pick a different username.";
}

type CredentialValidationInput = {
  email: string;
  password: string;
  username?: string;
  requireUsername?: boolean;
};

type CredentialValidationResult =
  | { ok: true; email: string; password: string; username?: string }
  | { ok: false; error: string };

function isLocalPartOk(local: string): boolean {
  if (local.length === 0 || local.length > EMAIL_LOCAL_MAX_LENGTH) return false;
  if (local.length === 1) return /^[a-zA-Z0-9]$/.test(local);
  return /^[a-zA-Z0-9][a-zA-Z0-9._%+-]*[a-zA-Z0-9]$/i.test(local);
}

function isDomainLabelOk(label: string): boolean {
  if (label.length === 0 || label.length > EMAIL_LABEL_MAX_LENGTH) return false;
  if (label.length === 1) return /^[a-z0-9]$/i.test(label);
  return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/i.test(label);
}

const TWO_LABEL_SINGLE_CHAR_FIRST_OK = new Set([
  "g.co",
  "t.co",
  "x.com",
]);

function domainNonTldLabelsSubstantial(labels: string[]): boolean {
  const domain = labels.join(".");
  if (labels.length === 2 && TWO_LABEL_SINGLE_CHAR_FIRST_OK.has(domain)) {
    return true;
  }
  for (let i = 0; i < labels.length - 1; i++) {
    if (labels[i]!.length < 2) return false;
  }
  return true;
}

function isValidEmail(email: string): boolean {
  if (email.length === 0 || email.length > EMAIL_MAX_LENGTH) return false;
  const at = email.indexOf("@");
  if (at <= 0 || email.indexOf("@", at + 1) !== -1) return false;
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  if (domain.length === 0) return false;
  if (!isLocalPartOk(local)) return false;

  const labels = domain.split(".");
  if (labels.length < 2) return false;
  for (const label of labels) {
    if (!isDomainLabelOk(label)) return false;
  }

  const tld = labels[labels.length - 1]!;
  if (tld.length < 2) return false;
  if (!domainNonTldLabelsSubstantial(labels)) return false;

  return true;
}

function validateCredentials(input: CredentialValidationInput): CredentialValidationResult {
  const normalizedEmail = input.email.trim().toLowerCase();
  if (!isValidEmail(normalizedEmail)) {
    return { ok: false, error: "Invalid email format" };
  }

  if (input.password.length < PASSWORD_MIN_LENGTH || input.password.length > PASSWORD_MAX_LENGTH) {
    return {
      ok: false,
      error: "Password must be between 8 and 30 characters long",
    };
  }

  if (input.requireUsername) {
    const normalizedUsername = input.username?.trim() ?? "";
    if (!USERNAME_REGEX.test(normalizedUsername)) {
      return {
        ok: false,
        error: "Username must be 3-20 characters and use letters, numbers, or underscores only",
      };
    }

    return { ok: true, email: normalizedEmail, password: input.password, username: normalizedUsername };
  }

  return { ok: true, email: normalizedEmail, password: input.password };
}
