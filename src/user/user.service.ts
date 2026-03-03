import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';

@Injectable()
export class UserService {
  constructor(private prisma: PrismaService) {}

  // Get all users from database
  async findAll() {
    return this.prisma.user.findMany();
  }

  // Create a new user
  async create(createUserDto: CreateUserDto) {
    return this.prisma.user.create({
      data: {
        name: createUserDto.name,
        balance: createUserDto.balance || 1000,
        email: createUserDto.email,
        password: createUserDto.password,
      },
    });
  }

  async banUser(id: number) {
    return this.prisma.user.update({
      where: { id },
      data: { isBanned: true },
    });
  }

  async unbanUser(id: number) {
    return this.prisma.user.update({
      where: { id },
      data: { isBanned: false },
    });
  }

  async getMyProfile(userId: number) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        balance: true,
        role: true,
        isBanned: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }
}
