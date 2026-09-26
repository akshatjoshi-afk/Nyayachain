import { Injectable, UnauthorizedException, BadRequestException, HttpException, HttpStatus } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcryptjs';

const MAX_ATTEMPTS = parseInt(process.env.LOGIN_MAX_ATTEMPTS || '5', 10);
const LOCKOUT_MINUTES = parseInt(process.env.LOGIN_LOCKOUT_MINUTES || '15', 10);

/**
 * AuthService handles credential validation, JWT issuance,
 * per-account lockout, and auth audit logging.
 */
@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

  /**
   * Main login method with lockout enforcement.
   * Flow:
   *  1. Find user by username (case-insensitive).
   *  2. If lockedUntil is in the future → reject immediately (no password check).
   *  3. Compare password with bcrypt.
   *  4. If WRONG → increment failedLoginAttempts; if ≥ MAX_ATTEMPTS → set lockedUntil.
   *  5. If CORRECT → reset counter + lockedUntil, issue JWT.
   */
  async login(username: string, password: string) {
    if (!username || !password) {
      throw new UnauthorizedException('Username and password are required.');
    }

    const cleanUsername = username.trim().toLowerCase();

    // 1. Find user
    const user = await this.prisma.user.findFirst({
      where: { username: { equals: cleanUsername } },
    });

    if (!user) {
      // Don't reveal that the user doesn't exist — return same message as bad password
      throw new UnauthorizedException('Invalid username or password.');
    }

    // 2. Check account lockout BEFORE touching the password
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      const unlockTime = user.lockedUntil.toLocaleTimeString('en-IN', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
        timeZone: 'Asia/Kolkata',
      });
      const unlockISO = user.lockedUntil.toISOString();

      // Audit log the blocked attempt
      await this.prisma.auditLog.create({
        data: {
          userId: user.id,
          action: 'LOGIN_FAILED',
          result: `Blocked login attempt for locked account "${user.username}". Locked until ${unlockISO}.`,
        },
      });

      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          error: 'Account Locked',
          message: `Account locked due to too many failed attempts. Try again after ${unlockTime}.`,
          lockedUntil: unlockISO,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // 3. Validate password
    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);

    if (!isPasswordValid) {
      // 4. Wrong password → increment counter
      const newAttempts = user.failedLoginAttempts + 1;
      const willLock = newAttempts >= MAX_ATTEMPTS;
      const lockedUntil = willLock
        ? new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000)
        : null;

      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          failedLoginAttempts: newAttempts,
          lockedUntil: willLock ? lockedUntil : undefined,
        },
      });

      // Audit: log every failure
      await this.prisma.auditLog.create({
        data: {
          userId: user.id,
          action: willLock ? 'ACCOUNT_LOCKED' : 'LOGIN_FAILED',
          result: willLock
            ? `Account "${user.username}" LOCKED after ${newAttempts} failed attempts. Locked until ${lockedUntil!.toISOString()}.`
            : `Failed login attempt ${newAttempts}/${MAX_ATTEMPTS} for "${user.username}".`,
        },
      });

      if (willLock) {
        const unlockTime = lockedUntil!.toLocaleTimeString('en-IN', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: true,
          timeZone: 'Asia/Kolkata',
        });
        throw new HttpException(
          {
            statusCode: HttpStatus.TOO_MANY_REQUESTS,
            error: 'Account Locked',
            message: `Account locked due to too many failed attempts. Try again after ${unlockTime}.`,
            lockedUntil: lockedUntil!.toISOString(),
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }

      throw new UnauthorizedException('Invalid username or password.');
    }

    // 5. Password correct → reset lockout state
    await this.prisma.user.update({
      where: { id: user.id },
      data: { failedLoginAttempts: 0, lockedUntil: null },
    });

    // Audit: successful login
    await this.prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'LOGIN_SUCCESS',
        result: `User "${user.username}" logged in successfully.`,
      },
    });

    const payload = {
      sub: user.id,
      username: user.username,
      role: user.role,
    };

    return {
      access_token: this.jwtService.sign(payload),
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
      },
    };
  }

  /**
   * Returns all users (id, username, role) — used by Admin to populate assign dropdown.
   */
  async getAllUsers() {
    return this.prisma.user.findMany({
      select: { id: true, username: true, role: true },
      orderBy: { id: 'asc' },
    });
  }

  // ─── Password Reset Request Flow ────────────────────────────────────────────

  /**
   * POST /auth/forgot-password (public)
   * Creates a PENDING PasswordResetRequest for the user.
   * Always returns a generic message — never reveals whether the username exists.
   */
  async requestPasswordReset(username: string): Promise<{ message: string }> {
    const GENERIC_MSG = 'If this account exists, a request has been sent to the Admin.';

    if (!username?.trim()) return { message: GENERIC_MSG };

    const user = await this.prisma.user.findFirst({
      where: { username: { equals: username.trim().toLowerCase() } },
    });

    if (!user) return { message: GENERIC_MSG }; // don't reveal non-existence

    // Reject if there's already a PENDING request for this user
    const existing = await this.prisma.passwordResetRequest.findFirst({
      where: { userId: user.id, status: 'PENDING' },
    });

    if (existing) return { message: GENERIC_MSG }; // silent dedup

    await this.prisma.passwordResetRequest.create({
      data: { userId: user.id },
    });

    // Audit log
    await this.prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'PASSWORD_RESET_REQUESTED',
        result: `Password reset requested for user "${user.username}".`,
      },
    });

    return { message: GENERIC_MSG };
  }

  /**
   * GET /auth/reset-requests (Admin only)
   * Returns all PENDING requests with username and requestedAt.
   */
  async getPendingResetRequests() {
    return this.prisma.passwordResetRequest.findMany({
      where: { status: 'PENDING' },
      include: {
        user: { select: { id: true, username: true, role: true } },
      },
      orderBy: { requestedAt: 'asc' },
    });
  }

  /**
   * GET /auth/reset-requests/all (Admin only)
   * Returns all requests (PENDING + resolved) for audit view, excluding temp password.
   */
  async getAllResetRequests() {
    return this.prisma.passwordResetRequest.findMany({
      include: {
        user: { select: { id: true, username: true, role: true } },
        resolvedBy: { select: { id: true, username: true } },
      },
      orderBy: { requestedAt: 'desc' },
    });
  }

  /**
   * POST /auth/reset-requests/:id/approve (Admin only)
   * - Generates a random 8-char alphanumeric temp password
   * - Bcrypt-hashes it and updates User.passwordHash
   * - Clears failedLoginAttempts + lockedUntil (in case they were locked)
   * - Stores PLAINTEXT on the request record so admin can relay it manually
   * - Sets status → APPROVED
   */
  async approveResetRequest(requestId: number, adminId: number) {
    const req = await this.prisma.passwordResetRequest.findUnique({
      where: { id: requestId },
      include: { user: true },
    });

    if (!req) throw new Error('Reset request not found.');
    if (req.status !== 'PENDING') throw new Error('This request has already been resolved.');

    // Generate a random 8-char alphanumeric temp password
    const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    const tempPassword = Array.from({ length: 8 }, () =>
      chars[Math.floor(Math.random() * chars.length)],
    ).join('');

    const hashedPassword = await bcrypt.hash(tempPassword, 10);

    // Update user: new password + clear lockout
    await this.prisma.user.update({
      where: { id: req.userId },
      data: {
        passwordHash: hashedPassword,
        failedLoginAttempts: 0,
        lockedUntil: null,
      },
    });

    // Update request record
    await this.prisma.passwordResetRequest.update({
      where: { id: requestId },
      data: {
        status: 'APPROVED',
        resolvedAt: new Date(),
        resolvedById: adminId,
      },
    });

    // Audit log
    await this.prisma.auditLog.create({
      data: {
        userId: req.userId,
        action: 'PASSWORD_RESET_APPROVED',
        result: `Password reset APPROVED for "${req.user.username}" by admin #${adminId}. Lockout also cleared.`,
      },
    });

    return {
      message: `Password reset approved for ${req.user.username}.`,
      username: req.user.username,
      tempPassword, // returned once to admin UI — never again
    };
  }

  /**
   * POST /auth/reset-requests/:id/reject (Admin only)
   * Sets status → REJECTED; no password change.
   */
  async rejectResetRequest(requestId: number, adminId: number) {
    const req = await this.prisma.passwordResetRequest.findUnique({
      where: { id: requestId },
      include: { user: true },
    });

    if (!req) throw new Error('Reset request not found.');
    if (req.status !== 'PENDING') throw new Error('This request has already been resolved.');

    await this.prisma.passwordResetRequest.update({
      where: { id: requestId },
      data: {
        status: 'REJECTED',
        resolvedAt: new Date(),
        resolvedById: adminId,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        userId: req.userId,
        action: 'PASSWORD_RESET_REJECTED',
        result: `Password reset REJECTED for "${req.user.username}" by admin #${adminId}.`,
      },
    });

    return { message: `Reset request for ${req.user.username} rejected.` };
  }

  /**
   * POST /auth/change-password (Authenticated User)
   * Allows logged-in user to safely change their password by validating current password.
   */
  async changePassword(userId: number, currentPassword: string, newPassword: string) {
    if (!currentPassword || !newPassword) {
      throw new BadRequestException('Both current password and new password are required.');
    }

    if (newPassword.length < 8) {
      throw new BadRequestException('New password must be at least 8 characters long.');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new UnauthorizedException('User not found.');
    }

    const isCurrentValid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!isCurrentValid) {
      throw new UnauthorizedException('Current password is incorrect.');
    }

    const isSamePassword = await bcrypt.compare(newPassword, user.passwordHash);
    if (isSamePassword) {
      throw new BadRequestException('New password cannot be the same as the current password.');
    }

    const newPasswordHash = await bcrypt.hash(newPassword, 10);

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        passwordHash: newPasswordHash,
        failedLoginAttempts: 0,
        lockedUntil: null,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'PASSWORD_CHANGE',
        result: `User "${user.username}" successfully changed their password.`,
      },
    });

    return { message: 'Password changed successfully.' };
  }
}

