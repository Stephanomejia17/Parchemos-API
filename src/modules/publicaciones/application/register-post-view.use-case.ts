import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';

@Injectable()
export class RegisterPostViewUseCase {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async execute(postId: string, userId: string): Promise<void> {
    await this.prisma.$executeRaw`
      insert into public.post_views (post_id, user_id)
      select p.id, ${userId}::uuid
      from public.posts p
      where p.id = ${postId}::uuid
        and p.status = 'publicada'
        and p.author_id <> ${userId}::uuid
      on conflict (post_id, user_id, view_date) do nothing`;
  }
}
