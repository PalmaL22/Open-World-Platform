# Open World Platform

This repository contains the **Open World Platform**, a web application for **open-world communication** in a live, shared environment. It targets use cases such as **events, conferences, meetups, and social spaces**, where users move between a **lobby**, **game world**, and **real-time interactions** backed by a **Node.js API**, **Socket.IO**, and **PostgreSQL**.


## Overview

This project connects:

- A **React + Vite** client with registration, login, a **lobby** for choosing servers, and a **Phaser**-based game view for the live space  
- An **Express** HTTP API for authentication, user profiles, and server listings  
- **Socket.IO** for real-time presence and game-related messaging  
- **PostgreSQL** with **Prisma** for users, characters, and server metadata  

Users sign up with email validation rules, pick a display name and character color, then join a server from the lobby and enter the shared world. Sessions are protected with **JWT**-based auth.


## Problem Statement & Significance

Event and conference platforms often split **video**, **chat**, and **spatial presence** across different tools. This project explores a **single live environment** where participants share a **visual, open-world-style space** and communicate in real time—useful for demos, networking floors, and lightweight virtual venues without stitching together many unrelated apps.

It demonstrates:

- **Unified auth and game flow** (register → lobby → join → game)  
- **Real-time coordination** via Socket.IO alongside a relational data model  
- A path toward richer features (stages, booths, schedules) on top of the same stack  


## Key Features

### Web Client (React + Vite + Tailwind)

- **Auth pages** (register / login) with email validation and protected routes  
- **Lobby** listing available game servers with capacity and join actions  
- **Game view** using **Phaser** for the interactive canvas  
- **Zustand** for client-side auth state; **Axios** for HTTP API calls  
- Branded UI oriented toward **live events and venues** (ambient visuals, shared design system)  

### API Server (Express + TypeScript)

- REST routes under `/api/auth` and `/api/servers`  
- **JWT** authentication and rate limiting on sensitive routes  
- **CORS** configured for the Vite dev origin and configurable production origin  
- Health check at `/api/health`  

### Real-Time Layer (Socket.IO)

- Socket.IO server attached to the same HTTP server as Express  
- Authenticated socket connections for in-world coordination (see `server/src/socket/`)  

### Database (PostgreSQL + Prisma 7)

- **Prisma** schema for `User`, `Character`, and `Server`  
- **Prisma 7** uses `prisma.config.ts` for the datasource URL (`DATABASE_URL`); the schema file declares the provider only  
- Optional **seed** script (`npm run db-server` in `server/package.json`)  

### Security & Configuration

- **Environment variables** for database URL, JWT secret, API port, and client origin  
- Password hashing for user accounts  
- Client API base URL via `VITE_API_URL` (see Environment Variables)  

---

## Project Structure

```
.
├── client/
│   ├── public/
│   │   └── favicon.svg
│   ├── src/
│   │   ├── api/
│   │   ├── components/
│   │   ├── game/
│   │   ├── layouts/
│   │   ├── lib/
│   │   ├── pages/
│   │   ├── store/
│   │   ├── App.tsx
│   │   └── main.tsx
│   ├── index.html
│   ├── package.json
│   ├── vite.config.ts
│   └── tailwind.config.js
│
├── server/
│   ├── prisma/
│   │   ├── schema.prisma
│   │   └── seed.ts
│   ├── src/
│   │   ├── middleware/
│   │   ├── routes/
│   │   ├── socket/
│   │   ├── lib/
│   │   ├── types/
│   │   └── index.ts
│   ├── prisma.config.ts
│   ├── package.json
│   └── .env                 (create locally; not committed)
│
├── .gitignore
└── README.md
```

---

## Setup Guide

### Prerequisites

- **Node.js** (LTS recommended)  
- **PostgreSQL** running locally or reachable on the network  
- **npm** (or compatible package manager)  

### Initial Setup (install dependencies)

Work in **`server`** and **`client`** separately—each has its own `package.json`.

1. **Server**

   ```bash
   cd server
   npm install
   ```

2. **Client**

   ```bash
   cd client
   npm install
   ```

### Database

1. Create a PostgreSQL database for the app (example name: `OpenWorld`).  
2. In **`server/`**, create a **`.env`** file (same folder as `package.json` and `prisma.config.ts`) and set **`DATABASE_URL`**, for example:

   ```ini
   DATABASE_URL="postgresql://USER:PASSWORD@localhost:5432/DATABASE_NAME"
   ```

3. From **`server`**, generate the Prisma client and apply the schema:

   ```bash
   npm run db-generate
   ```

   `db-generate` runs `prisma generate`. To sync the schema to the database, use:

   ```bash
   npm run db-put
   ```

   (`db-put` runs `prisma db push`.)

4. **Other database scripts** (see `server/package.json`):

   - `npm run db-server` — run the seed script (`tsx prisma/seed.ts`)  
   - `npm run db-frontend` — open **Prisma Studio** for browsing data  

Always run Prisma commands with your shell’s current directory set to **`server`** so `prisma/schema.prisma` and `prisma.config.ts` resolve correctly. Prisma loads **`server/.env`** via `prisma.config.ts`.

### Server environment (API + JWT)

In **`server/.env`**, also set (names are required by the running app—see `server/src/types/env.ts`):

- **`JWT_SECRET`** — strong secret for signing tokens  
- **`CLIENT_ORIGIN`** — origin of the web app (e.g. `http://localhost:5173` in development)  
- **`PORT`** — API and Socket.IO port (e.g. `3002`)  

### Client environment

Optional: in **`client/.env`**, set the API base URL (no trailing slash):

```ini
VITE_API_URL=http://localhost:3002
```

If omitted in development, the client defaults to `http://localhost:3002` when using Vite’s dev server (see `client/src/lib/apiOrigin.ts`).

### Run the application

1. **Start the API** (from `server/`):

   ```bash
   npm run dev
   ```

   You should see the server listening on the configured `PORT` (e.g. `http://localhost:3002`).

2. **Start the client** (from `client/`):

   ```bash
   npm run dev
   ```

   Open the URL Vite prints (typically **`http://localhost:5173`**). The API root (`/`) returns a short JSON hint that this port is API-only; the **UI is the Vite app**.

3. **Production build (client)**

   ```bash
   cd client
   npm run build
   ```

   Output is under `client/dist/`.

---

## Environment Variables

### `server/.env` (required for running the API and Prisma)

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | PostgreSQL connection string for Prisma |
| `JWT_SECRET` | Secret for JWT signing |
| `CLIENT_ORIGIN` | Allowed browser origin for CORS / Socket.IO |
| `PORT` | HTTP + Socket.IO listen port |

### `client/.env` (optional)

| Variable | Purpose |
|----------|---------|
| `VITE_API_URL` | Base URL of the API (e.g. `http://localhost:3002`) |

Do **not** commit real `.env` files; keep secrets local or in your deployment platform’s secret store.

---

## Tech Stack

- **TypeScript** — server and client  
- **Node.js** — runtime  
- **Express** — HTTP API  
- **Socket.IO** — real-time layer  
- **Prisma 7** + **PostgreSQL** — persistence  
- **React 18** + **React Router** — SPA  
- **Vite** — client build and dev server  
- **Tailwind CSS** — styling  
- **Phaser 3** — game canvas  
- **Zustand** — client state  
- **Axios** — HTTP client  


## Demo Outline (suggested)

### Introduction

- Team and roles  
- What the Open World Platform is (live spaces, events/conferences angle)  
- Problem: fragmented tools vs. one navigable space  

### Demonstration

- Register and log in  
- Lobby: server list and capacity  
- Join a server and show the game / real-time behavior  
- Brief mention of API + Socket.IO + database  

### Technical Notes

- Architecture: React client → Express + Socket.IO → PostgreSQL  
- Auth: JWT, protected routes, Prisma models  
- Challenges: CORS, env configuration, real-time sync  

### Wrap-up

- Summary and possible extensions  
- Q&A  


## Contributors

- Jonathan Conde  
- Felipe Monsalvo  
- Luis Palma  


## Future Improvements

- Richer event metadata (schedules, rooms, speaker stages)  
- In-world voice or text chat tied to regions  
- Roles (organizer, attendee, exhibitor)  
- Metrics and moderation tooling  
- Deployment guides (Docker, hosted Postgres, CI)  
