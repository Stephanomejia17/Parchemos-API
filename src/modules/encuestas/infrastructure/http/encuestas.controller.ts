import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../../../common/decorators/current-user.decorator';
import { Roles } from '../../../../common/decorators/roles.decorator';
import { Role } from '../../../../common/enums/role.enum';
import { EncuestasService } from '../../application/encuestas.service';
import {
  AssignSurveyRestaurantsDto,
  CreateSurveyDto,
  SaveSurveyDto,
  SubmitSurveyDto,
  SurveyReportQueryDto,
} from './encuestas.dto';

@Controller()
export class EncuestasController {
  constructor(private readonly encuestas: EncuestasService) {}

  @Get('encuestas')
  @Roles(Role.RESTAURANTE, Role.ADMINISTRADOR)
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.encuestas.listSurveys(user);
  }

  @Post('encuestas')
  @Roles(Role.RESTAURANTE, Role.ADMINISTRADOR)
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateSurveyDto) {
    return this.encuestas.createSurvey(user, dto);
  }

  @Put('encuestas/:surveyId')
  @Roles(Role.RESTAURANTE, Role.ADMINISTRADOR)
  update(
    @Param('surveyId', ParseUUIDPipe) surveyId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SaveSurveyDto,
  ) {
    return this.encuestas.updateSurvey(surveyId, user, dto);
  }

  @Put('encuestas/:surveyId/restaurantes')
  @Roles(Role.RESTAURANTE, Role.ADMINISTRADOR)
  assignRestaurants(
    @Param('surveyId', ParseUUIDPipe) surveyId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: AssignSurveyRestaurantsDto,
  ) {
    return this.encuestas.assignRestaurants(surveyId, user, dto.restaurantIds);
  }

  @Get('encuestas/restaurante/:restaurantId/reportes')
  @Roles(Role.RESTAURANTE, Role.ADMINISTRADOR)
  report(
    @Param('restaurantId', ParseUUIDPipe) restaurantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: SurveyReportQueryDto,
  ) {
    return this.encuestas.getReport(restaurantId, user, query);
  }

  @Get('pedidos/:orderId/encuesta')
  @Roles(Role.COMENSAL)
  orderSurvey(
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.encuestas.getOrderSurvey(orderId, user.id);
  }

  @Post('pedidos/:orderId/encuesta/respuestas')
  @Roles(Role.COMENSAL)
  answer(
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SubmitSurveyDto,
  ) {
    return this.encuestas.submitOrderSurvey(orderId, user.id, dto);
  }
}
