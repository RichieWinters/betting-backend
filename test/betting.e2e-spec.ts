import 'dotenv/config';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { type Server } from 'http';
import * as bcrypt from 'bcrypt';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Betting Flow (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let adminToken: string;
  let userToken: string;
  let userId: number;
  let matchId: number;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        stopAtFirstError: true,
      }),
    );

    await app.init();

    prisma = app.get<PrismaService>(PrismaService);

    await prisma.bet.deleteMany();
    await prisma.match.deleteMany();
    await prisma.user.deleteMany();

    // Seed admin user
    const hashedPassword = await bcrypt.hash('Admin1234!', 10);
    await prisma.user.create({
      data: {
        name: 'Admin',
        email: 'admin@test.com',
        password: hashedPassword,
        role: 'ADMIN',
      },
    });

    const adminLogin = await request(app.getHttpServer() as Server)
      .post('/auth/login')
      .send({ email: 'admin@test.com', password: 'Admin1234!' });
    adminToken = (adminLogin.body as { token: string }).token;

    // Register a regular bettor via the public auth endpoint
    const registerRes = await request(app.getHttpServer() as Server)
      .post('/auth/register')
      .send({
        name: 'Gambler',
        email: 'gambler@test.com',
        password: 'Gambler123!',
      });

    const registerBody = registerRes.body as {
      token: string;
      user: { id: number };
    };
    userToken = registerBody.token;
    userId = registerBody.user.id;

    // Give the gambler a known balance for deterministic tests
    await prisma.user.update({
      where: { id: userId },
      data: { balance: 1000 },
    });
  });

  afterAll(async () => {
    await prisma.bet.deleteMany();
    await prisma.match.deleteMany();
    await prisma.user.deleteMany();

    await app.close();
  });

  describe('Unauthenticated access', () => {
    it('POST /matches returns 401 without a token', () => {
      return request(app.getHttpServer() as Server)
        .post('/matches')
        .send({
          date: '2026-03-15T20:00:00Z',
          sportType: 'DOTA2',
          teamA: 'NaVi',
          teamB: 'Virtus.pro',
        })
        .expect(401);
    });

    it('POST /bets returns 401 without a token', () => {
      return request(app.getHttpServer() as Server)
        .post('/bets')
        .send({ userId, matchId: 1, amount: 100, team: 'NaVi' })
        .expect(401);
    });

    it('GET /bets returns 401 without a token', () => {
      return request(app.getHttpServer() as Server).get('/bets').expect(401);
    });
  });

  describe('Match creation (admin)', () => {
    it('creates a match as admin', async () => {
      const res = await request(app.getHttpServer() as Server)
        .post('/matches')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          date: '2026-03-15T20:00:00Z',
          sportType: 'DOTA2',
          teamA: 'NaVi',
          teamB: 'Virtus.pro',
        })
        .expect(201);

      const body = res.body as { id: number; status: string };
      matchId = body.id;
      expect(body.status).toBe('PENDING');
    });

    it('returns 403 when a regular user attempts to create a match', () => {
      return request(app.getHttpServer() as Server)
        .post('/matches')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          date: '2026-03-15T20:00:00Z',
          sportType: 'DOTA2',
          teamA: 'NaVi',
          teamB: 'Virtus.pro',
        })
        .expect(403);
    });
  });

  describe('Placing bets (authenticated user)', () => {
    it('places a bet and deducts balance', async () => {
      const res = await request(app.getHttpServer() as Server)
        .post('/bets')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ userId, matchId, amount: 200, team: 'NaVi' })
        .expect(201);

      const body = res.body as {
        amount: number;
        team: string;
        user: { balance: number };
      };
      expect(body.amount).toBe(200);
      expect(body.team).toBe('NaVi');
      expect(body.user.balance).toBe(800); // 1000 - 200
    });

    it('returns 400 when balance is insufficient', () => {
      return request(app.getHttpServer() as Server)
        .post('/bets')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ userId, matchId, amount: 1000, team: 'NaVi' }) // only 800 left
        .expect(400)
        .expect((res) => {
          expect((res.body as { message: string }).message).toContain(
            'Insufficient balance',
          );
        });
    });

    it('returns 400 when the bet team is not a participant', () => {
      return request(app.getHttpServer() as Server)
        .post('/bets')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ userId, matchId, amount: 50, team: 'WrongTeam' })
        .expect(400)
        .expect((res) => {
          expect((res.body as { message: string }).message).toContain(
            'must be either',
          );
        });
    });
  });

  describe('Match status transitions (admin)', () => {
    it('moves match to IN_PROGRESS', async () => {
      const res = await request(app.getHttpServer() as Server)
        .patch(`/matches/${matchId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'IN_PROGRESS' })
        .expect(200);

      expect((res.body as { status: string }).status).toBe('IN_PROGRESS');
    });

    it('returns 400 when trying to bet on a non-pending match', () => {
      return request(app.getHttpServer() as Server)
        .post('/bets')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ userId, matchId, amount: 50, team: 'NaVi' })
        .expect(400)
        .expect((res) => {
          expect((res.body as { message: string }).message).toContain('pending');
        });
    });

    it('completes the match with a winner and triggers payouts', async () => {
      const res = await request(app.getHttpServer() as Server)
        .patch(`/matches/${matchId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'COMPLETED', winner: 'NaVi' })
        .expect(200);

      const body = res.body as { status: string; winner: string };
      expect(body.status).toBe('COMPLETED');
      expect(body.winner).toBe('NaVi');

      // Balance should have increased by payout (200 * 1.9 = 380)
      const user = await prisma.user.findUnique({ where: { id: userId } });
      expect(user!.balance).toBeCloseTo(800 + 200 * 1.9, 1);
    });
  });

  describe('Admin: GET /bets', () => {
    it('returns all bets to admin', async () => {
      const res = await request(app.getHttpServer() as Server)
        .get('/bets')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const body = res.body as { amount: number }[];
      expect(body).toHaveLength(1);
      expect(body[0].amount).toBe(200);
    });

    it('returns 403 for a regular user', () => {
      return request(app.getHttpServer() as Server)
        .get('/bets')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(403);
    });
  });

  // ─── GET /bets/user-bets ───────────────────────────────────────────────────

  describe('GET /bets/user-bets', () => {
    it("returns only the requesting user's own bets (not another user's)", async () => {
      // Register a second bettor with their own balance
      const secondRegisterRes = await request(app.getHttpServer() as Server)
        .post('/auth/register')
        .send({
          name: 'SecondBettor',
          email: 'secondbettor@test.com',
          password: 'SecondBettor123!',
        });

      const secondBody = secondRegisterRes.body as {
        token: string;
        user: { id: number };
      };
      const secondUserToken = secondBody.token;
      const secondUserId = secondBody.user.id;

      await prisma.user.update({
        where: { id: secondUserId },
        data: { balance: 1000 },
      });

      // Place a bet for the second user on the already-completed matchId
      // We need a fresh PENDING match for this bet
      const newMatchRes = await request(app.getHttpServer() as Server)
        .post('/matches')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          date: '2026-09-01T18:00:00Z',
          sportType: 'DOTA2',
          teamA: 'TeamA',
          teamB: 'TeamB',
        })
        .expect(201);

      const newMatchId = (newMatchRes.body as { id: number }).id;

      await request(app.getHttpServer() as Server)
        .post('/bets')
        .set('Authorization', `Bearer ${secondUserToken}`)
        .send({ userId: secondUserId, matchId: newMatchId, amount: 50, team: 'TeamA' })
        .expect(201);

      // First user requests their own bets
      const res = await request(app.getHttpServer() as Server)
        .get('/bets/user-bets')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);

      const body = res.body as { userId: number }[];
      const ids = body.map((b) => b.userId);
      // All returned bets belong to the first user
      expect(ids.every((id) => id === userId)).toBe(true);
      // The second user's bet is NOT included
      expect(ids).not.toContain(secondUserId);
    });

    it('returns 401 without a token', () => {
      return request(app.getHttpServer() as Server)
        .get('/bets/user-bets')
        .expect(401);
    });
  });

  // ─── POST /bets — additional validation ────────────────────────────────────

  describe('POST /bets — additional validation', () => {
    it('returns 400 when amount is 0 (@IsPositive rejects zero)', async () => {
      // Need a fresh PENDING match to attempt the bet against
      const freshMatchRes = await request(app.getHttpServer() as Server)
        .post('/matches')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          date: '2026-10-01T18:00:00Z',
          sportType: 'DOTA2',
          teamA: 'Alpha',
          teamB: 'Beta',
        })
        .expect(201);

      const freshMatchId = (freshMatchRes.body as { id: number }).id;

      return request(app.getHttpServer() as Server)
        .post('/bets')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ userId, matchId: freshMatchId, amount: 0, team: 'Alpha' })
        .expect(400);
    });
  });
});
