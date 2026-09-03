import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../../../common/decorators/current-user.decorator';
import { Public } from '../../../../common/decorators/public.decorator';
import { Roles } from '../../../../common/decorators/roles.decorator';
import { Role } from '../../../../common/enums/role.enum';
import { RestaurantProfilesService } from '../../application/restaurant-profiles.service';
import { RestaurantStaffService } from '../../application/restaurant-staff.service';
import {
  CreateLocationDto,
  CreateRestaurantDto,
  ImageUrlDto,
  RejectLocationDto,
  CreateStaffDto,
  ReassignStaffLocationDto,
  ReplaceSchedulesDto,
  UpdateStaffDto,
  UpdateLocationDto,
} from './restaurante-profile.dto';

@Controller('restaurantes')
export class RestaurantesController {
  constructor(
    private readonly profiles: RestaurantProfilesService,
    private readonly staff: RestaurantStaffService,
  ) {}

  /** AN-01: una cuenta restaurante puede crear y administrar varias empresas. */
  @Post()
  @Roles(Role.RESTAURANTE)
  createRestaurant(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateRestaurantDto) {
    return this.profiles.createRestaurant(user.id, dto);
  }

  @Get('mios')
  @Roles(Role.RESTAURANTE)
  listMine(@CurrentUser() user: AuthenticatedUser) {
    return this.profiles.listMine(user.id);
  }

  /** GU-05: solo el restaurante propietario y aprobado gestiona su personal. */
  @Get('personal')
  @Roles(Role.RESTAURANTE)
  listStaff(@CurrentUser() user: AuthenticatedUser) {
    return this.staff.list(user.id);
  }

  @Post('personal')
  @Roles(Role.RESTAURANTE)
  createStaff(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateStaffDto) {
    return this.staff.create(user.id, dto);
  }

  @Get('personal/:staffId')
  @Roles(Role.RESTAURANTE)
  staffDetail(@CurrentUser() user: AuthenticatedUser, @Param('staffId') staffId: string) {
    return this.staff.detail(user.id, staffId);
  }

  @Patch('personal/:staffId')
  @Roles(Role.RESTAURANTE)
  updateStaff(@CurrentUser() user: AuthenticatedUser, @Param('staffId') staffId: string, @Body() dto: UpdateStaffDto) {
    return this.staff.update(user.id, staffId, dto);
  }

  @Put('personal/:staffId/sede')
  @Roles(Role.RESTAURANTE)
  reassignStaff(@CurrentUser() user: AuthenticatedUser, @Param('staffId') staffId: string, @Body() dto: ReassignStaffLocationDto) {
    return this.staff.reassign(user.id, staffId, dto.locationId);
  }

  @Post('personal/:staffId/habilitar')
  @Roles(Role.RESTAURANTE)
  enableStaff(@CurrentUser() user: AuthenticatedUser, @Param('staffId') staffId: string) {
    return this.staff.setEnabled(user.id, staffId, true);
  }

  @Post('personal/:staffId/deshabilitar')
  @Roles(Role.RESTAURANTE)
  disableStaff(@CurrentUser() user: AuthenticatedUser, @Param('staffId') staffId: string) {
    return this.staff.setEnabled(user.id, staffId, false);
  }

  @Post(':restaurantId/sedes')
  @Roles(Role.RESTAURANTE)
  createLocation(
    @CurrentUser() user: AuthenticatedUser,
    @Param('restaurantId') restaurantId: string,
    @Body() dto: CreateLocationDto,
  ) {
    return this.profiles.createLocation(user.id, restaurantId, dto);
  }

  @Patch('sedes/:locationId')
  @Roles(Role.RESTAURANTE)
  updateLocation(
    @CurrentUser() user: AuthenticatedUser,
    @Param('locationId') locationId: string,
    @Body() dto: UpdateLocationDto,
  ) {
    return this.profiles.updateLocation(user.id, locationId, dto);
  }

  @Put('sedes/:locationId/horarios')
  @Roles(Role.RESTAURANTE)
  replaceSchedules(
    @CurrentUser() user: AuthenticatedUser,
    @Param('locationId') locationId: string,
    @Body() dto: ReplaceSchedulesDto,
  ) {
    return this.profiles.replaceSchedules(user.id, locationId, dto.schedules);
  }

  @Put('sedes/:locationId/logo')
  @Roles(Role.RESTAURANTE)
  setLogo(@CurrentUser() user: AuthenticatedUser, @Param('locationId') locationId: string, @Body() dto: ImageUrlDto) {
    return this.profiles.setImage(user.id, locationId, 'logo', dto.url);
  }

  @Post('sedes/:locationId/logo/upload')
  @Roles(Role.RESTAURANTE)
  @UseInterceptors(FileInterceptor('file'))
  uploadLogo(@CurrentUser() user: AuthenticatedUser, @Param('locationId') locationId: string, @UploadedFile() file: UploadedImageFile) {
    return this.profiles.uploadImage(user.id, locationId, 'logo', requiredFile(file));
  }

  @Put('sedes/:locationId/portada')
  @Roles(Role.RESTAURANTE)
  setCover(@CurrentUser() user: AuthenticatedUser, @Param('locationId') locationId: string, @Body() dto: ImageUrlDto) {
    return this.profiles.setImage(user.id, locationId, 'cover', dto.url);
  }

  @Post('sedes/:locationId/portada/upload')
  @Roles(Role.RESTAURANTE)
  @UseInterceptors(FileInterceptor('file'))
  uploadCover(@CurrentUser() user: AuthenticatedUser, @Param('locationId') locationId: string, @UploadedFile() file: UploadedImageFile) {
    return this.profiles.uploadImage(user.id, locationId, 'cover', requiredFile(file));
  }

  @Post('sedes/:locationId/galeria')
  @Roles(Role.RESTAURANTE)
  addGalleryImage(@CurrentUser() user: AuthenticatedUser, @Param('locationId') locationId: string, @Body() dto: ImageUrlDto) {
    return this.profiles.addGalleryImage(user.id, locationId, dto.url);
  }

  @Post('sedes/:locationId/galeria/upload')
  @Roles(Role.RESTAURANTE)
  @UseInterceptors(FileInterceptor('file'))
  uploadGalleryImage(@CurrentUser() user: AuthenticatedUser, @Param('locationId') locationId: string, @UploadedFile() file: UploadedImageFile) {
    return this.profiles.uploadImage(user.id, locationId, 'gallery', requiredFile(file));
  }

  @Delete('sedes/:locationId/galeria/:imageId')
  @Roles(Role.RESTAURANTE)
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeGalleryImage(@CurrentUser() user: AuthenticatedUser, @Param('locationId') locationId: string, @Param('imageId') imageId: string) {
    await this.profiles.removeGalleryImage(user.id, locationId, imageId);
  }

  @Get('sedes/:locationId/vista-previa')
  @Roles(Role.RESTAURANTE)
  preview(@CurrentUser() user: AuthenticatedUser, @Param('locationId') locationId: string) {
    return this.profiles.preview(user.id, locationId);
  }

  @Post('sedes/:locationId/solicitud-autorizacion')
  @Roles(Role.RESTAURANTE)
  requestApproval(@CurrentUser() user: AuthenticatedUser, @Param('locationId') locationId: string) {
    return this.profiles.requestApproval(user.id, locationId);
  }

  /** Solo las sedes aprobadas se exponen a los comensales. */
  @Public()
  @Get('publicos/:locationId')
  publicProfile(@Param('locationId') locationId: string) {
    return this.profiles.publicProfile(locationId);
  }

  @Get('administracion/solicitudes-pendientes')
  @Roles(Role.ADMINISTRADOR)
  pendingForReview() {
    return this.profiles.pendingForReview();
  }

  @Get('administracion')
  @Roles(Role.ADMINISTRADOR)
  locationsForAdmin() {
    return this.profiles.locationsForAdmin();
  }

  @Post('administracion/sedes/:locationId/aprobar')
  @Roles(Role.ADMINISTRADOR)
  approve(@Param('locationId') locationId: string) {
    return this.profiles.approve(locationId);
  }

  @Post('administracion/sedes/:locationId/rechazar')
  @Roles(Role.ADMINISTRADOR)
  reject(@Param('locationId') locationId: string, @Body() dto: RejectLocationDto) {
    return this.profiles.reject(locationId, dto.reason);
  }
}

interface UploadedImageFile {
  buffer: Buffer;
  mimetype: string;
  size: number;
}

function requiredFile(file: UploadedImageFile | undefined) {
  if (!file) throw new BadRequestException('Debes adjuntar un archivo en el campo "file".');
  return { buffer: file.buffer, mimetype: file.mimetype, size: file.size };
}
