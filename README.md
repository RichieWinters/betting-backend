# Betting Backend API

A REST API for managing cyber-sports betting platform where users can view matches and place bets on teams.

## Task Requirements

✅ **Implemented Features:**
- REST API for cyber-sports betting
- User management with balance tracking
- Match creation and status management
- Bet placement with validations
- Automated tests (unit + E2E)
- API documentation with Swagger
- PostgreSQL database with Prisma ORM

**Business Rules:**
- Only 1v1 matches (no draws)
- Users can only bet on pending matches
- Bet amount cannot exceed user balance
- Balance is automatically deducted when bet is placed
- Matches have statuses: PENDING, IN_PROGRESS, COMPLETED, CANCELLED

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

5. Start the development server:

```bash
npm run start:dev
```

## 📚 API Documentation

Once the server is running, access the interactive Swagger documentation at:

```
http://localhost:3000/api
```

### API Endpoints

#### Users
- `GET /users` - Get all users
- `POST /users` - Create a new user

#### Matches
- `GET /matches` - Get all matches
- `POST /matches` - Create a new match
- `PATCH /matches/:id` - Update match status or winner

#### Bets
- `GET /bets` - Get all bets
- `POST /bets` - Place a bet

## 🧪 Testing

### Run Unit Tests
```bash
npm test
```

### Run E2E Tests
```bash
npm run test:e2e
```

### Test Coverage
- Unit tests for business logic (validations, calculations)
- E2E tests for full API flows
- Tests cover: user creation, match management, betting flow, validations

## Available Scripts

- `npm run start:dev` - Start development server
- `npm run start:prod` - Start production server
- `npm run build` - Build the project
- `npm test` - Run unit tests
- `npm run test:e2e` - Run E2E tests
- `npm run db:generate` - Generate Prisma Client
- `npm run db:migrate` - Run database migrations
- `npm run db:push` - Push schema changes (development)
- `npm run db:studio` - Open Prisma Studio (database GUI)
