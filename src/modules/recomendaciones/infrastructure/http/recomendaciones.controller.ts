import { Controller, Get } from '@nestjs/common';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../../../common/decorators/current-user.decorator';
import { Roles } from '../../../../common/decorators/roles.decorator';
import { Role } from '../../../../common/enums/role.enum';
import { GetRecommendationsUseCase } from '../../application/get-recommendations.use-case';

/** PU-03: las recomendaciones son solo para comensales autenticados (RN3). */
@Controller('recomendaciones')
export class RecomendacionesController {
  constructor(private readonly getRecommendations: GetRecommendationsUseCase) {}

  @Get()
  @Roles(Role.COMENSAL)
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.getRecommendations.execute(user.id);
  }
}
