import { Controller, Get, Post, Delete, Body, Param, ParseIntPipe, UseGuards, Request } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CasesService } from './cases.service';

class CreateCaseDto {
  caseNumber: string;
  title: string;
}

class AssignUserDto {
  userId: number;
}

@Controller('cases')
@SkipThrottle()
@UseGuards(JwtAuthGuard, RolesGuard)
export class CasesController {
  constructor(private casesService: CasesService) {}

  @Post()
  @Roles('ADMIN')
  async createCase(@Body() body: CreateCaseDto) {
    return this.casesService.createCase(body.caseNumber, body.title);
  }

  @Post(':id/assign')
  @Roles('ADMIN')
  async assignUser(
    @Param('id', ParseIntPipe) caseId: number,
    @Body() body: AssignUserDto,
  ) {
    return this.casesService.assignUserToCase(caseId, body.userId);
  }

  @Delete(':id/assign/:userId')
  @Roles('ADMIN')
  async revokeUser(
    @Param('id', ParseIntPipe) caseId: number,
    @Param('userId', ParseIntPipe) userId: number,
  ) {
    return this.casesService.revokeUserFromCase(caseId, userId);
  }

  @Get()
  async getCases(@Request() req: any) {
    return this.casesService.getCases(req.user.id, req.user.role);
  }

  @Get(':id')
  async getCaseById(
    @Param('id', ParseIntPipe) caseId: number,
    @Request() req: any,
  ) {
    return this.casesService.getCaseById(caseId, req.user.id, req.user.role);
  }
}
