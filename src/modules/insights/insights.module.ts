import { Module } from '@nestjs/common';
import { EstadisticasModule } from '../estadisticas/estadisticas.module';
import { InsightsService } from './application/insights.service';
import { INSIGHT_GENERATOR } from './domain/insight-generator';
import { INSIGHT_REPOSITORY } from './domain/insight.repository';
import { GeminiInsightGenerator } from './infrastructure/gemini/gemini-insight-generator';
import { InsightsController } from './infrastructure/http/insights.controller';
import { PrismaInsightRepository } from './infrastructure/persistence/prisma-insight.repository';

@Module({
  imports: [EstadisticasModule],
  controllers: [InsightsController],
  providers: [
    InsightsService,
    { provide: INSIGHT_REPOSITORY, useClass: PrismaInsightRepository },
    { provide: INSIGHT_GENERATOR, useClass: GeminiInsightGenerator },
  ],
})
export class InsightsModule {}
