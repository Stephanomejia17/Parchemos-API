import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, AccountStatus, PostStatus, ReportReason, ReportStatus } from '../../../../generated/prisma/client';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { SupabaseStorageService } from '../../../infrastructure/storage/supabase-storage.service';
import type { ModerationReportsQueryDto } from '../infrastructure/http/moderacion.dto';

const activeReportStatuses = [ReportStatus.pendiente, ReportStatus.en_revision];
const reviewedReportStatuses = [ReportStatus.descartado, ReportStatus.resuelto];

@Injectable()
export class ModeracionService {
  constructor(private readonly prisma: PrismaService, private readonly storage: SupabaseStorageService) {}

  async reportPost(postId: string, reporterId: string, reason: ReportReason, details?: string) {
    const post = await this.prisma.post.findFirst({ where: { id: postId, status: PostStatus.publicada } });
    if (!post) throw new NotFoundException('La publicación no existe.');
    try {
      return await this.prisma.contentReport.create({
        data: { postId, reporterId, reason, details: details?.trim() || null },
        select: { id: true, status: true, createdAt: true },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Ya denunciaste esta publicación.');
      }
      throw error;
    }
  }

  async listReportedPosts(query: ModerationReportsQueryDto = {}) {
    const createdAt: Prisma.ContentReportWhereInput['createdAt'] = {};
    if (query.from) createdAt.gte = new Date(`${query.from.slice(0, 10)}T00:00:00.000Z`);
    if (query.to) {
      const end = new Date(`${query.to.slice(0, 10)}T00:00:00.000Z`);
      end.setUTCDate(end.getUTCDate() + 1);
      createdAt.lt = end;
    }
    const statuses = query.status === 'reviewed' ? reviewedReportStatuses : query.status === 'all' ? [...activeReportStatuses, ...reviewedReportStatuses] : activeReportStatuses;
    const reports = await this.prisma.contentReport.findMany({
      where: { postId: { not: null }, status: { in: statuses }, ...(Object.keys(createdAt).length ? { createdAt } : {}) },
      orderBy: { createdAt: query.sort === 'asc' ? 'asc' : 'desc' },
      include: {
        reporter: { select: { id: true, email: true, profile: { select: { fullName: true } } } },
        post: {
          include: {
            author: { select: { id: true, email: true, profile: { select: { fullName: true, photoUrl: true } } } },
            media: {
              orderBy: { position: 'asc' },
              // No devolver sizeBytes: Prisma lo representa como bigint y
              // Express no puede serializar BigInt en JSON.
              select: {
                id: true,
                mediaType: true,
                storageKey: true,
                mimeType: true,
                width: true,
                height: true,
                durationSeconds: true,
              },
            },
            location: { select: { id: true, name: true } },
          },
        },
      },
    });
    const grouped = new Map<string, any>();
    for (const report of reports) {
      if (!report.post) continue;
      const current = grouped.get(report.post.id);
      const item = {
        id: report.post.id,
        caption: report.post.caption,
        status: report.post.status,
        createdAt: report.post.createdAt,
        author: report.post.author,
        location: report.post.location,
        media: report.post.media.map((media) => ({
          id: media.id,
          mediaType: media.mediaType,
          mimeType: media.mimeType,
          width: media.width,
          height: media.height,
          durationSeconds: media.durationSeconds,
          url: this.storage.publicUrl(media.storageKey),
        })),
        reports: current?.reports ?? [],
      };
      item.reports.push({ id: report.id, reason: report.reason, details: report.details, status: report.status, createdAt: report.createdAt, resolvedAt: report.resolvedAt, resolutionNote: report.resolutionNote, reporter: report.reporter });
      grouped.set(report.post.id, item);
    }
    const postIds = [...grouped.keys()];
    const reportIds = reports.map((report) => report.id);
    const auditLogs = postIds.length || reportIds.length
      ? await this.prisma.auditLog.findMany({
          where: {
            OR: [
              ...(postIds.length ? [{ entityType: 'post', entityId: { in: postIds } }] : []),
              ...(reportIds.length ? [{ entityType: 'content_report', entityId: { in: reportIds } }] : []),
            ],
          },
          orderBy: { createdAt: 'desc' },
          include: {
            actor: { select: { id: true, email: true, profile: { select: { fullName: true } } } },
          },
        })
      : [];
    const reportPostById = new Map(reports.map((report) => [report.id, report.postId]));
    for (const item of grouped.values()) {
      item.history = auditLogs
        .filter((log) => log.entityId === item.id || (log.entityType === 'content_report' && reportPostById.get(log.entityId ?? '') === item.id))
        .map((log) => ({
          id: log.id.toString(),
          action: log.action,
          reason: log.reason,
          createdAt: log.createdAt,
          actor: log.actor,
        }));
    }
    const items = [...grouped.values()];
    const statistics = new Map<string, { reason: string; count: number; otherDetails: Array<{ text: string; count: number }> }>();
    for (const report of reports) {
      const key = report.reason;
      const current = statistics.get(key) ?? { reason: key, count: 0, otherDetails: [] };
      current.count += 1;
      if (key === ReportReason.otro && report.details?.trim()) {
        const detail = report.details.trim();
        const existing = current.otherDetails.find((entry) => entry.text === detail);
        if (existing) existing.count += 1;
        else current.otherDetails.push({ text: detail, count: 1 });
      }
      statistics.set(key, current);
    }
    return { items, statistics: [...statistics.values()], total: reports.length };
  }

  async getSummary() {
    return { pendingReports: await this.prisma.contentReport.count({ where: { postId: { not: null }, status: { in: activeReportStatuses } } }) };
  }

  async removePost(postId: string, adminId: string, reason: string) {
    const cleanReason = reason.trim();
    if (!cleanReason) throw new ConflictException('El motivo de eliminación es obligatorio.');
    return this.prisma.$transaction(async (tx) => {
      const post = await tx.post.findFirst({ where: { id: postId, status: { not: PostStatus.eliminada } }, select: { id: true, authorId: true } });
      if (!post) throw new NotFoundException('La publicación ya fue eliminada o no existe.');
      const now = new Date();
      await tx.post.update({ where: { id: postId }, data: { status: PostStatus.eliminada, removedById: adminId, removalReason: cleanReason, removedAt: now, updatedAt: now } });
      await tx.contentReport.updateMany({ where: { postId, status: { in: activeReportStatuses } }, data: { status: ReportStatus.resuelto, resolvedById: adminId, resolvedAt: now, resolutionNote: cleanReason } });
      await tx.auditLog.create({ data: { actorId: adminId, action: 'post_removed', entityType: 'post', entityId: postId, reason: cleanReason, metadata: { postAuthorId: post.authorId } } });
      await tx.notification.create({ data: { userId: post.authorId, type: 'moderation_post_removed', title: 'Publicación eliminada', body: `Tu publicación fue eliminada por el siguiente motivo: ${cleanReason}`, entityType: 'post', entityId: postId, data: { reason: cleanReason } } });
      return { id: postId, status: PostStatus.eliminada };
    });
  }

  async reviewReport(reportId: string, adminId: string, result: string) {
    const cleanResult = result.trim();
    if (!cleanResult) throw new ConflictException('El resultado de la revisión es obligatorio.');
    return this.prisma.$transaction(async (tx) => {
      const report = await tx.contentReport.findFirst({ where: { id: reportId, status: { in: activeReportStatuses } }, select: { id: true, postId: true } });
      if (!report) throw new ConflictException('La denuncia no existe o ya fue revisada.');
      const now = new Date();
      const updated = await tx.contentReport.update({ where: { id: reportId }, data: { status: ReportStatus.descartado, resolvedById: adminId, resolvedAt: now, resolutionNote: cleanResult }, select: { id: true, postId: true, status: true, createdAt: true, resolvedAt: true, resolutionNote: true } });
      await tx.auditLog.create({ data: { actorId: adminId, action: 'report_reviewed', entityType: 'content_report', entityId: report.id, reason: cleanResult, metadata: { postId: report.postId } } });
      return updated;
    });
  }

  async listUsers() {
    const users = await this.prisma.user.findMany({
      where: { role: { not: 'administrador' } }, orderBy: { createdAt: 'desc' },
      include: { profile: { select: { fullName: true, city: true, photoUrl: true } } },
    });
    return users.map((user) => ({ id: user.id, email: user.email, fullName: user.profile?.fullName ?? 'Usuario Parchemos', city: user.profile?.city, photoUrl: user.profile?.photoUrl, role: user.role, status: user.status, suspensionReason: user.suspensionReason, statusChangedAt: user.statusChangedAt, createdAt: user.createdAt }));
  }

  async suspendUser(userId: string, adminId: string, reason: string) {
    const cleanReason = reason.trim();
    if (!cleanReason) throw new ConflictException('El motivo de suspensión es obligatorio.');
    if (userId === adminId) throw new ConflictException('No puedes suspender tu propia cuenta.');
    return this.prisma.$transaction(async (tx) => {
      const result = await tx.user.updateMany({ where: { id: userId, status: AccountStatus.activa }, data: { status: AccountStatus.suspendida, suspensionReason: cleanReason, statusChangedAt: new Date(), updatedAt: new Date() } });
      if (!result.count) throw new ConflictException('La cuenta no existe o ya no está activa.');
      const now = new Date();
      await tx.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: now, revokedReason: 'cuenta_suspendida' } });
      await tx.auditLog.create({ data: { actorId: adminId, action: 'user_suspended', entityType: 'user', entityId: userId, reason: cleanReason, metadata: {} } });
      await tx.notification.create({ data: { userId, type: 'account_suspended', title: 'Cuenta suspendida', body: `Tu cuenta fue suspendida por el siguiente motivo: ${cleanReason}`, entityType: 'user', entityId: userId, data: { reason: cleanReason } } });
      return { id: userId, status: AccountStatus.suspendida, suspensionReason: cleanReason };
    });
  }

  async reactivateUser(userId: string, adminId: string) {
    return this.prisma.$transaction(async (tx) => {
      const result = await tx.user.updateMany({ where: { id: userId, status: AccountStatus.suspendida }, data: { status: AccountStatus.activa, suspensionReason: null, statusChangedAt: new Date(), updatedAt: new Date() } });
      if (!result.count) throw new ConflictException('La cuenta no existe o no está suspendida.');
      await tx.auditLog.create({ data: { actorId: adminId, action: 'user_reactivated', entityType: 'user', entityId: userId, metadata: {} } });
      await tx.notification.create({ data: { userId, type: 'account_reactivated', title: 'Cuenta activada', body: 'Tu cuenta fue activada. Puedes iniciar sesión nuevamente.', entityType: 'user', entityId: userId, data: {} } });
      return { id: userId, status: AccountStatus.activa };
    });
  }
}
