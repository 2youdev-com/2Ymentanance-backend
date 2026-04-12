# LOC Asset Maintenance System — Backend API

Node.js + Express + TypeScript + Prisma + PostgreSQL

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Copy env file
cp .env.example .env
# Edit .env with your DATABASE_URL, JWT_SECRET, Cloudinary keys

# 3. Generate Prisma client
npm run db:generate

# 4. Run migrations
npm run db:migrate

# 5. Seed demo data (23 assets, 4 users)
npm run db:seed

# 6. Start dev server
npm run dev
```

## Demo Credentials

| Username   | Password | Role       | Sites         |
|------------|----------|------------|---------------|
| supervisor | demo1234 | ADMIN      | Tower + NRR   |
| tech1      | demo1234 | TECHNICIAN | Tower only    |
| tech2      | demo1234 | TECHNICIAN | NRR only      |
| viewer     | demo1234 | VIEWER     | Tower + NRR   |

## API Endpoints

### Auth
| Method | Endpoint       | Description         |
|--------|----------------|---------------------|
| POST   | /api/auth/login | Login, returns JWT |
| GET    | /api/auth/me    | Get current user   |

### Assets
| Method | Endpoint              | Description                     |
|--------|-----------------------|---------------------------------|
| GET    | /api/assets           | List all assets (paginated)     |
| GET    | /api/assets/stats     | Dashboard KPI counts            |
| GET    | /api/assets/qr/:uuid  | Lookup asset by QR UUID         |
| GET    | /api/assets/:id       | Get asset detail + history      |
| POST   | /api/assets           | Register new asset              |
| PATCH  | /api/assets/:id       | Update asset                    |

### Maintenance
| Method | Endpoint                          | Description              |
|--------|-----------------------------------|--------------------------|
| GET    | /api/maintenance                  | List maintenance logs    |
| GET    | /api/maintenance/:id              | Get log detail           |
| POST   | /api/maintenance                  | Start maintenance        |
| POST   | /api/maintenance/:logId/checklist | Submit checklist + photos|
| POST   | /api/maintenance/:logId/complete  | Complete maintenance     |

### Reports
| Method | Endpoint                  | Description              |
|--------|---------------------------|--------------------------|
| GET    | /api/reports              | List problem reports     |
| GET    | /api/reports/:id          | Get report detail        |
| POST   | /api/reports              | Create problem report    |
| PATCH  | /api/reports/:id/resolve  | Mark report resolved     |

### Other
| Method | Endpoint                              | Description              |
|--------|---------------------------------------|--------------------------|
| GET    | /api/sites                            | List sites               |
| GET    | /api/activity                         | Live activity feed       |
| GET    | /api/checklists/:assetType/:mainType  | Get checklist template   |
| GET    | /health                               | Health check             |

## Socket.io Events

```js
// Client joins site room
socket.emit('join:site', siteId)

// Server emits on new activity
socket.on('activity', (event) => {
  // { type, assetId, assetName, technicianName, siteId, timestamp, details }
})
```

## Tech Stack

- **Runtime**: Node.js 20+
- **Framework**: Express 4
- **Language**: TypeScript 5
- **ORM**: Prisma 5 + PostgreSQL
- **Auth**: JWT (8h sessions)
- **Files**: Cloudinary (photos, video, audio)
- **Real-time**: Socket.io
- **Security**: helmet, cors, express-rate-limit

## NFR Compliance

- NFR-B-01: Dashboard load < 3s — paginated queries with indexed fields
- NFR-M-01: QR decode < 2s — single indexed lookup by qr_uuid
- NFR-B-08: 50+ concurrent users — rate limiter + connection pooling
- NFR-B-09: HTTPS only — enforced at hosting level (Railway/Render)
- NFR-B-10: JWT 8h session — configured in JWT_EXPIRES_IN
- NFR-B-14: Signed media URLs — Cloudinary signed tokens
