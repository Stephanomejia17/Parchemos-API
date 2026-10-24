import { randomUUID } from 'node:crypto';
import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, SurveyQuestionType, SurveyResponseStatus } from '../../../../generated/prisma/client';
import { Role } from '../../../common/enums/role.enum';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import type { AuthenticatedUser } from '../../../common/decorators/current-user.decorator';
import type {
  CreateSurveyDto,
  SaveSurveyDto,
  SubmitSurveyDto,
  SurveyReportQueryDto,
} from '../infrastructure/http/encuestas.dto';

const QUESTION_TYPES = new Set(Object.values(SurveyQuestionType));

@Injectable()
export class EncuestasService {
  constructor(private readonly prisma: PrismaService) {}

  async listSurveys(user: AuthenticatedUser) {
    const restaurants = await this.getAuthorizedRestaurants(user);
    const ownerIds = this.getAuthorizedOwnerIds(user, restaurants);
    const surveys = ownerIds.length
      ? await this.prisma.survey.findMany({
          where: { ownerId: { in: ownerIds } },
          include: {
            assignments: true,
            questions: { orderBy: { position: 'asc' } },
          },
          orderBy: { updatedAt: 'desc' },
        })
      : [];
    const owners = [...new Map(restaurants.map((restaurant) => [
      restaurant.ownerId,
      { id: restaurant.ownerId, businessName: restaurant.businessName },
    ])).values()];
    return {
      restaurants,
      owners,
      surveys: surveys.map((survey) => this.toConfiguration(survey)),
    };
  }

  async createSurvey(user: AuthenticatedUser, dto: CreateSurveyDto) {
    const restaurants = await this.getAuthorizedRestaurants(user);
    const ownerId = user.role === Role.ADMINISTRADOR ? dto.ownerId : user.id;
    if (!ownerId || !this.getAuthorizedOwnerIds(user, restaurants).includes(ownerId)) {
      throw new ForbiddenException('No puedes crear encuestas para esta cuenta.');
    }
    this.validateQuestions(dto.questions);
    const survey = await this.prisma.$transaction(async (tx) => {
      const created = await tx.survey.create({
        data: { ownerId, title: dto.title.trim(), isActive: dto.isActive },
      });
      await this.createQuestions(tx, created.id, dto.questions);
      return tx.survey.findUniqueOrThrow({
        where: { id: created.id },
        include: {
          assignments: true,
          questions: { orderBy: { position: 'asc' } },
        },
      });
    });
    return this.toConfiguration(survey);
  }

  async updateSurvey(surveyId: string, user: AuthenticatedUser, dto: SaveSurveyDto) {
    const existing = await this.findManageableSurvey(surveyId, user);
    this.validateQuestions(dto.questions);
    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.survey.update({
        where: { id: existing.id },
        data: {
          title: dto.title.trim(),
          isActive: dto.isActive,
          version: existing.version + 1,
        },
      });
      await tx.surveyQuestion.deleteMany({ where: { surveyId: existing.id } });
      await this.createQuestions(tx, existing.id, dto.questions);
      return tx.survey.findUniqueOrThrow({
        where: { id: existing.id },
        include: {
          assignments: true,
          questions: { orderBy: { position: 'asc' } },
        },
      });
    });
    return this.toConfiguration(updated);
  }

  async assignRestaurants(surveyId: string, user: AuthenticatedUser, restaurantIds: string[]) {
    const survey = await this.findManageableSurvey(surveyId, user);
    const restaurants = await this.getAuthorizedRestaurants(user);
    const uniqueIds = [...new Set(restaurantIds)];
    if (uniqueIds.some((id) => !restaurants.some(
      (restaurant) => restaurant.id === id && restaurant.ownerId === survey.ownerId,
    ))) {
      throw new ForbiddenException('Solo puedes asignar la encuesta a restaurantes de su propietario.');
    }
    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.surveyRestaurant.deleteMany({ where: { surveyId } });
      if (uniqueIds.length) {
        await tx.surveyRestaurant.createMany({
          data: uniqueIds.map((restaurantId) => ({ surveyId, restaurantId })),
        });
      }
      return tx.survey.findUniqueOrThrow({
        where: { id: surveyId },
        include: {
          assignments: true,
          questions: { orderBy: { position: 'asc' } },
        },
      });
    });
    return this.toConfiguration(updated);
  }

  async getOrderSurvey(orderId: string, dinerId: string) {
    const order = await this.prisma.order.findFirst({ where: { id: orderId, dinerId, status: 'entregado' }, select: { id: true, restaurantId: true } });
    if (!order) return { surveys: [] };
    const surveys = await this.prisma.survey.findMany({
      where: { isActive: true, assignments: { some: { restaurantId: order.restaurantId } } },
      include: {
        questions: { orderBy: { position: 'asc' } },
        responses: { where: { orderId }, select: { id: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
    return {
      surveys: surveys.map((survey) => ({
        id: survey.id,
        title: survey.title,
        version: survey.version,
        alreadyResponded: survey.responses.length > 0,
        questions: survey.questions.map((question) => this.toQuestion(question)),
      })),
    };
  }

  async submitOrderSurvey(orderId: string, dinerId: string, dto: SubmitSurveyDto) {
    const order = await this.prisma.order.findFirst({ where: { id: orderId, dinerId, status: 'entregado' }, select: { id: true, restaurantId: true } });
    if (!order) throw new NotFoundException('El pedido aún no está disponible para encuesta.');
    const survey = await this.prisma.survey.findFirst({
      where: {
        id: dto.surveyId,
        isActive: true,
        assignments: { some: { restaurantId: order.restaurantId } },
      },
      include: { questions: { orderBy: { position: 'asc' } } },
    });
    if (!survey) throw new NotFoundException('No hay una encuesta activa para este restaurante.');
    const byId = new Map(survey.questions.map((question) => [question.id, question]));
    const uniqueAnswers = new Map(dto.answers.map((answer) => [answer.questionId, answer.value.trim()]));
    for (const question of survey.questions) {
      const value = uniqueAnswers.get(question.id);
      if (question.required && !value) throw new ConflictException(`La pregunta "${question.prompt}" es obligatoria.`);
      if (value) this.validateAnswer(question, value);
    }
    for (const questionId of uniqueAnswers.keys()) if (!byId.has(questionId)) throw new ConflictException('La encuesta cambió. Recarga e inténtalo nuevamente.');
    try {
      const response = await this.prisma.surveyResponse.create({
        data: {
          surveyId: survey.id,
          restaurantId: order.restaurantId,
          orderId: order.id,
          dinerId,
          surveyVersion: survey.version,
          questionsSnapshot: survey.questions.map((question) => ({ id: question.id, prompt: question.prompt, type: question.type, required: question.required, position: question.position, options: question.options })),
          answers: { create: survey.questions.filter((question) => uniqueAnswers.has(question.id)).map((question) => ({ questionId: question.id, questionPrompt: question.prompt, questionType: question.type, optionsSnapshot: Array.isArray(question.options) ? question.options : [], value: uniqueAnswers.get(question.id)! })) },
        },
        select: { id: true, submittedAt: true, surveyVersion: true },
      });
      return response;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException('Este pedido ya tiene una respuesta para esta encuesta.');
      throw error;
    }
  }

  async getReport(restaurantId: string, user: AuthenticatedUser, query: SurveyReportQueryDto) {
    await this.assertCanManageRestaurant(restaurantId, user);
    const submittedAt: Prisma.SurveyResponseWhereInput['submittedAt'] = {};
    if (query.from) submittedAt.gte = new Date(`${query.from.slice(0, 10)}T00:00:00.000Z`);
    if (query.to) { const end = new Date(`${query.to.slice(0, 10)}T00:00:00.000Z`); end.setUTCDate(end.getUTCDate() + 1); submittedAt.lt = end; }
    const responses = await this.prisma.surveyResponse.findMany({ where: { restaurantId, status: SurveyResponseStatus.respondida, ...(query.surveyId ? { surveyId: query.surveyId } : {}), ...(query.orderId ? { orderId: query.orderId } : {}), ...(Object.keys(submittedAt).length ? { submittedAt } : {}) }, include: { answers: true }, orderBy: { submittedAt: 'desc' } });
    const questions = new Map<string, { id: string; prompt: string; type: string; answers: string[] }>();
    for (const response of responses) for (const answer of response.answers) { const current = questions.get(answer.questionPrompt) ?? { id: answer.questionId ?? answer.questionPrompt, prompt: answer.questionPrompt, type: answer.questionType, answers: [] }; current.answers.push(answer.value); questions.set(answer.questionPrompt, current); }
    return { totalResponses: responses.length, responses: responses.map((response) => ({ id: response.id, orderId: response.orderId, surveyVersion: response.surveyVersion, submittedAt: response.submittedAt })), questions: [...questions.values()].map((question) => ({ ...question, average: question.type === SurveyQuestionType.calificacion && question.answers.length ? question.answers.reduce((sum, value) => sum + Number(value), 0) / question.answers.length : null, distribution: question.answers.reduce<Record<string, number>>((result, value) => { result[value] = (result[value] ?? 0) + 1; return result; }, {}) })) };
  }

  private async getAuthorizedRestaurants(user: AuthenticatedUser) {
    return this.prisma.restaurant.findMany({ where: user.role === Role.ADMINISTRADOR ? undefined : { ownerId: user.id }, select: { id: true, businessName: true, ownerId: true }, orderBy: { businessName: 'asc' } });
  }

  private getAuthorizedOwnerIds(
    user: AuthenticatedUser,
    restaurants: Array<{ ownerId: string }>,
  ) {
    return user.role === Role.ADMINISTRADOR
      ? [...new Set(restaurants.map((restaurant) => restaurant.ownerId))]
      : [user.id];
  }

  private async findManageableSurvey(surveyId: string, user: AuthenticatedUser) {
    const restaurants = await this.getAuthorizedRestaurants(user);
    const ownerIds = this.getAuthorizedOwnerIds(user, restaurants);
    const survey = await this.prisma.survey.findFirst({
      where: { id: surveyId, ownerId: { in: ownerIds } },
      select: { id: true, ownerId: true, version: true },
    });
    if (!survey) throw new ForbiddenException('No puedes administrar esta encuesta.');
    return survey;
  }

  private async createQuestions(
    tx: Prisma.TransactionClient,
    surveyId: string,
    questions: SaveSurveyDto['questions'],
  ) {
    await tx.surveyQuestion.createMany({
      data: questions.map((question, position) => ({
        id: randomUUID(),
        surveyId,
        prompt: question.prompt.trim(),
        type: question.type,
        required: question.required,
        position,
        options: question.type === SurveyQuestionType.opciones
          ? question.options.map((option) => option.trim()).filter(Boolean)
          : [],
      })),
    });
  }

  private async assertCanManageRestaurant(restaurantId: string, user: AuthenticatedUser) {
    const restaurant = await this.prisma.restaurant.findFirst({ where: { id: restaurantId, ...(user.role === Role.ADMINISTRADOR ? {} : { ownerId: user.id }) }, select: { id: true } });
    if (!restaurant) throw new ForbiddenException('No puedes consultar encuestas de este restaurante.');
  }

  private validateQuestions(questions: SaveSurveyDto['questions']) {
    const positions = new Set<number>();
    for (const question of questions) {
      if (!QUESTION_TYPES.has(question.type) || positions.has(question.position)) throw new ConflictException('Las preguntas deben tener tipos y posiciones válidos.');
      if (question.type === SurveyQuestionType.opciones && question.options.filter((option) => option.trim()).length < 2) throw new ConflictException('Las preguntas de selección necesitan al menos dos opciones.');
      positions.add(question.position);
    }
  }

  private validateAnswer(question: { type: SurveyQuestionType; options: unknown }, value: string) {
    if (question.type === SurveyQuestionType.calificacion && (!/^[1-5]$/.test(value))) throw new ConflictException('La calificación debe estar entre 1 y 5.');
    if (question.type === SurveyQuestionType.opciones && (!Array.isArray(question.options) || !question.options.includes(value))) throw new ConflictException('La opción seleccionada no es válida.');
  }

  private toConfiguration(survey: { id: string; ownerId: string; title: string; isActive: boolean; version: number; assignments: Array<{ restaurantId: string }>; questions: Array<{ id: string; prompt: string; type: SurveyQuestionType; required: boolean; position: number; options: unknown }> }) {
    return { id: survey.id, ownerId: survey.ownerId, title: survey.title, isActive: survey.isActive, version: survey.version, restaurantIds: survey.assignments.map((assignment) => assignment.restaurantId), questions: survey.questions.map((question) => this.toQuestion(question)) };
  }

  private toQuestion(question: { id: string; prompt: string; type: SurveyQuestionType; required: boolean; position: number; options: unknown }) {
    return { id: question.id, prompt: question.prompt, type: question.type, required: question.required, position: question.position, options: Array.isArray(question.options) ? question.options : [] };
  }
}
