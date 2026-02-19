# Betting Backend API

A REST API for managing cyber-sports betting platform where users can view matches and place bets on teams.

## Data Model

### User

- Name
- Current balance in gold coins

### Match

- Date and time
- Sport type (dota2, counter-strike, etc.)
- Status: pending, in progress, completed, cancelled
- Team A
- Team B
- Winner

### Bet

- User who placed the bet
- Bet amount
- Match
- Team

## Tech Stack

- TypeScript
- NestJS
- PostgreSQL
- Prisma ORM

## Setup

### Prerequisites

- Node.js
- Docker

### Installation

1. Install dependencies:

```bash
npm install
```

2. Start PostgreSQL database:

```bash
docker-compose up -d
```

3. Generate Prisma Client:

```bash
npm run db:generate
```

4. Run database migrations:

```bash
npm run db:migrate
```

### Available Scripts

- `npm run start:dev` - Start development server
- `npm run db:generate` - Generate Prisma Client
- `npm run db:migrate` - Run database migrations
- `npm run db:push` - Push schema changes (development)
- `npm run db:studio` - Open Prisma Studio (database GUI)
- `npm test` - Run tests
