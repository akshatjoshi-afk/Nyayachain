import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  ParseIntPipe,
  HttpCode,
  HttpStatus,
  UseGuards,
  Request,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { Throttle, SkipThrottle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RolesGuard } from './roles.guard';
import { Roles } from './roles.decorator';

class LoginDto {
  username: string;
  password: string;
}

class ForgotPasswordDto {
  username: string;
}

/**
 * AuthController — login, user-list, and password-reset-request flow.
 *
 * Public routes (no JWT):
 *   POST /api/auth/login
 *   POST /api/auth/forgot-password
 *
 * Admin-only routes (JWT + ADMIN role):
 *   GET  /api/auth/users
 *   GET  /api/auth/reset-requests          — PENDING only
 *   GET  /api/auth/reset-requests/all      — all (for audit)
 *   POST /api/auth/reset-requests/:id/approve
 *   POST /api/auth/reset-requests/:id/reject
 */
@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  // ─── Public ───────────────────────────────────────────────────────────────

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: parseInt(process.env.THROTTLE_LIMIT || '10', 10), ttl: parseInt(process.env.THROTTLE_TTL || '60000', 10) } })
  async login(@Body() body: LoginDto) {
    return this.authService.login(body.username, body.password);
  }

  /**
   * POST /api/auth/forgot-password — public, no auth required.
   * Always returns a generic message (no username enumeration).
   */
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60000 } }) // light throttle to prevent request spam
  async forgotPassword(@Body() body: ForgotPasswordDto) {
    return this.authService.requestPasswordReset(body.username);
  }

  // ─── Admin-only ───────────────────────────────────────────────────────────

  @Get('users')
  @SkipThrottle()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  async getUsers() {
    return this.authService.getAllUsers();
  }

  @Get('reset-requests/all')
  @SkipThrottle()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  async getAllResetRequests() {
    return this.authService.getAllResetRequests();
  }

  @Get('reset-requests')
  @SkipThrottle()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  async getPendingResetRequests() {
    return this.authService.getPendingResetRequests();
  }

  @Post('reset-requests/:id/approve')
  @SkipThrottle()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  async approveResetRequest(
    @Param('id', ParseIntPipe) id: number,
    @Request() req: any,
  ) {
    try {
      return await this.authService.approveResetRequest(id, req.user.id);
    } catch (err: any) {
      throw new BadRequestException(err.message);
    }
  }

  @Post('reset-requests/:id/reject')
  @SkipThrottle()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  async rejectResetRequest(
    @Param('id', ParseIntPipe) id: number,
    @Request() req: any,
  ) {
    try {
      return await this.authService.rejectResetRequest(id, req.user.id);
    } catch (err: any) {
      throw new BadRequestException(err.message);
    }
  }
}
