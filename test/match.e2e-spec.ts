import 'dotenv/config';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { type Server } from 'http';
import * as bcrypt from 'bcrypt';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Matches (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let adminToken: string;
  let userToken: string;
  let userId: number;

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

    // Seed admin
    const hashedPassword = await bcrypt.hash('Admin1234!', 10);
    await prisma.user.create({
      data: {
        name: 'Admin',
        email: 'admin@matchtest.com',
        password: hashedPassword,
        role: 'ADMIN',
      },
    });

    const adminLogin = await request(app.getHttpServer() as Server)
      .post('/auth/login')
      .send({ email: 'admin@matchtest.com', password: 'Admin1234!' });
    adminToken = (adminLogin.body as { token: string }).token;

    // Register a regular bettor
    const registerRes = await request(app.getHttpServer() as Server)
      .post('/auth/register')
      .send({
        name: 'Bettor',
        email: 'bettor@matchtest.com',
        password: 'Bettor123!',
      });

    const registerBody = registerRes.body as {
      token: string;
      user: { id: number };
    };
    userToken = registerBody.token;
    userId = registerBody.user.id;

    // Give the bettor a known balance
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

  // Helper: create a PENDING match via the API
  const createMatch = () =>
    request(app.getHttpServer() as Server)
      .post('/matches')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        date: '2026-06-01T18:00:00Z',
        sportType: 'DOTA2',
        teamA: 'NaVi',
        teamB: 'Virtus.pro',
      })
      .expect(201)
      .then((res) => (res.body as { id: number }).id);

  // ─── GET /matches ──────────────────────────────────────────────────────────

  describe('GET /matches', () => {
    it('excludes a DELETED match from the result', async () => {
      const matchId = await createMatch();

      await request(app.getHttpServer() as Server)
        .delete(`/matches/${matchId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const res = await request(app.getHttpServer() as Server)
        .get('/matches')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);

      const ids = (res.body as { id: number }[]).map((m) => m.id);
      expect(ids).not.toContain(matchId);
    });
  });

  // ─── POST /matches — validation ────────────────────────────────────────────

  describe('POST /matches — validation', () => {
    it('returns 400 when required fields are missing', () => {
      return request(app.getHttpServer() as Server)
        .post('/matches')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ sportType: 'DOTA2', teamA: 'NaVi' }) // missing date and teamB
        .expect(400);
    });

    it('returns 400 for an invalid sportType value', () => {
      return request(app.getHttpServer() as Server)
        .post('/matches')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          date: '2026-06-01T18:00:00Z',
          sportType: 'INVALID_SPORT',
          teamA: 'NaVi',
          teamB: 'Virtus.pro',
        })
        .expect(400);
    });
  });

  // ─── PATCH /matches/:id — cancel with refunds ──────────────────────────────

  describe('PATCH /matches/:id — cancel with refunds', () => {
    it('returns 400 for a non-existent match', () => {
      return request(app.getHttpServer() as Server)
        .patch('/matches/999999')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'CANCELLED' })
        .expect(400);
    });

    it('cancels the match and refunds all PENDING bets to the bettor', async () => {
      const matchId = await createMatch();

      // Place a bet
      await request(app.getHttpServer() as Server)
        .post('/bets')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ userId, matchId, amount: 300, team: 'NaVi' })
        .expect(201);

      const balanceAfterBet = (
        await prisma.user.findUnique({ where: { id: userId } })
      )!.balance;

      // Cancel the match
      await request(app.getHttpServer() as Server)
        .patch(`/matches/${matchId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'CANCELLED' })
        .expect(200);

      const balanceAfterRefund = (
        await prisma.user.findUnique({ where: { id: userId } })
      )!.balance;

      // Balance should be restored by the bet amount (300)
      expect(balanceAfterRefund).toBe(balanceAfterBet + 300);
    });
  });

  // ─── DELETE /matches/:id ───────────────────────────────────────────────────

  describe('DELETE /matches/:id', () => {
    it('returns 400 for a non-existent match', () => {
      return request(app.getHttpServer() as Server)
        .delete('/matches/999999')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(400);
    });

    it('returns 400 when trying to delete a COMPLETED match', async () => {
      const matchId = await createMatch();

      // Complete the match
      await request(app.getHttpServer() as Server)
        .patch(`/matches/${matchId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'IN_PROGRESS' })
        .expect(200);

      await request(app.getHttpServer() as Server)
        .patch(`/matches/${matchId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'COMPLETED', winner: 'NaVi' })
        .expect(200);

      return request(app.getHttpServer() as Server)
        .delete(`/matches/${matchId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(400);
    });

    it('soft-deletes a PENDING match, refunds bets, and hides it from GET /matches', async () => {
      // Reset bettor balance for determinism
      await prisma.user.update({
        where: { id: userId },
        data: { balance: 1000 },
      });

      const matchId = await createMatch();

      await request(app.getHttpServer() as Server)
        .post('/bets')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ userId, matchId, amount: 250, team: 'NaVi' })
        .expect(201);

      await request(app.getHttpServer() as Server)
        .delete(`/matches/${matchId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      // Bettor balance should be restored
      const user = await prisma.user.findUnique({ where: { id: userId } });
      expect(user!.balance).toBe(1000);

      // Match should no longer appear in GET /matches
      const listRes = await request(app.getHttpServer() as Server)
        .get('/matches')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);

      const ids = (listRes.body as { id: number }[]).map((m) => m.id);
      expect(ids).not.toContain(matchId);
    });
  });
});
