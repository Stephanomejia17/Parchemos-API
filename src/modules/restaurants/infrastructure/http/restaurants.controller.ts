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
import { imageUploadOptions } from '../../../../common/http/image-upload.options';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../../../common/decorators/current-user.decorator';
import { Public } from '../../../../common/decorators/public.decorator';
import { Roles } from '../../../../common/decorators/roles.decorator';
import { Role } from '../../../../common/enums/role.enum';
import { Restaurant } from '../../domain/entities/restaurant.entity';
import { Location } from '../../domain/entities/location.entity';
import { AddGalleryImageUseCase } from '../../application/use-cases/add-gallery-image.use-case';
import { ApproveLocationUseCase } from '../../application/use-cases/approve-location.use-case';
import { CreateLocationUseCase } from '../../application/use-cases/create-location.use-case';
import { CreateRestaurantUseCase } from '../../application/use-cases/create-restaurant.use-case';
import { CreateStaffUserUseCase } from '../../application/use-cases/create-staff-user.use-case';
import { GetPublicLocationProfileUseCase } from '../../application/use-cases/get-public-location-profile.use-case';
import { GetStaffDetailUseCase } from '../../application/use-cases/get-staff-detail.use-case';
import { ListAllLocationsForAdminUseCase } from '../../application/use-cases/list-all-locations-for-admin.use-case';
import { ListMyRestaurantsUseCase } from '../../application/use-cases/list-my-restaurants.use-case';
import { ListPendingLocationsUseCase } from '../../application/use-cases/list-pending-locations.use-case';
import { ListStaffUseCase } from '../../application/use-cases/list-staff.use-case';
import { PreviewLocationUseCase } from '../../application/use-cases/preview-location.use-case';
import { ReassignStaffUseCase } from '../../application/use-cases/reassign-staff.use-case';
import { RejectLocationUseCase } from '../../application/use-cases/reject-location.use-case';
import { RemoveGalleryImageUseCase } from '../../application/use-cases/remove-gallery-image.use-case';
import { ReplaceSchedulesUseCase } from '../../application/use-cases/replace-schedules.use-case';
import { RequestLocationApprovalUseCase } from '../../application/use-cases/request-location-approval.use-case';
import { SetLocationImageUseCase } from '../../application/use-cases/set-location-image.use-case';
import { SetStaffEnabledUseCase } from '../../application/use-cases/set-staff-enabled.use-case';
import { UpdateLocationUseCase } from '../../application/use-cases/update-location.use-case';
import { UpdateStaffUseCase } from '../../application/use-cases/update-staff.use-case';
import { UploadLocationImageUseCase } from '../../application/use-cases/upload-location-image.use-case';
import {
  CreateLocationDto,
  CreateRestaurantDto,
  CreateStaffDto,
  ImageUrlDto,
  ReassignStaffLocationDto,
  RejectLocationDto,
  ReplaceSchedulesDto,
  UpdateLocationDto,
  UpdateStaffDto,
} from './restaurant.dto';

@Controller('restaurantes')
export class RestaurantsController {
  constructor(
    private readonly createRestaurant: CreateRestaurantUseCase,
    private readonly listMyRestaurants: ListMyRestaurantsUseCase,
    private readonly createLocation: CreateLocationUseCase,
    private readonly updateLocation: UpdateLocationUseCase,
    private readonly replaceSchedules: ReplaceSchedulesUseCase,
    private readonly setLocationImage: SetLocationImageUseCase,
    private readonly uploadLocationImage: UploadLocationImageUseCase,
    private readonly addGalleryImage: AddGalleryImageUseCase,
    private readonly removeGalleryImage: RemoveGalleryImageUseCase,
    private readonly previewLocation: PreviewLocationUseCase,
    private readonly getPublicLocationProfile: GetPublicLocationProfileUseCase,
    private readonly requestLocationApproval: RequestLocationApprovalUseCase,
    private readonly listPendingLocations: ListPendingLocationsUseCase,
    private readonly listAllLocationsForAdmin: ListAllLocationsForAdminUseCase,
    private readonly approveLocation: ApproveLocationUseCase,
    private readonly rejectLocation: RejectLocationUseCase,
    private readonly listStaff: ListStaffUseCase,
    private readonly getStaffDetail: GetStaffDetailUseCase,
    private readonly createStaffUser: CreateStaffUserUseCase,
    private readonly updateStaff: UpdateStaffUseCase,
    private readonly reassignStaff: ReassignStaffUseCase,
    private readonly setStaffEnabled: SetStaffEnabledUseCase,
  ) {}

  /** AN-01: una cuenta restaurante puede crear y administrar varias empresas. */
  @Post()
  @Roles(Role.RESTAURANTE)
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateRestaurantDto,
  ) {
    const restaurant = await this.createRestaurant.execute(user.id, dto);
    return flattenRestaurant(restaurant, []);
  }

  @Get('mios')
  @Roles(Role.RESTAURANTE)
  async listMine(@CurrentUser() user: AuthenticatedUser) {
    const rows = await this.listMyRestaurants.execute(user.id);
    return rows.map(({ restaurant, locations }) =>
      flattenRestaurant(restaurant, locations),
    );
  }

  /** GU-05: solo el restaurante propietario y aprobado gestiona su personal. */
  @Get('personal')
  @Roles(Role.RESTAURANTE)
  listStaffMembers(@CurrentUser() user: AuthenticatedUser) {
    return this.listStaff.execute(user.id);
  }

  @Post('personal')
  @Roles(Role.RESTAURANTE)
  createStaffMember(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateStaffDto,
  ) {
    return this.createStaffUser.execute(user.id, dto);
  }

  @Get('personal/:staffId')
  @Roles(Role.RESTAURANTE)
  staffDetail(
    @CurrentUser() user: AuthenticatedUser,
    @Param('staffId') staffId: string,
  ) {
    return this.getStaffDetail.execute(user.id, staffId);
  }

  @Patch('personal/:staffId')
  @Roles(Role.RESTAURANTE)
  updateStaffMember(
    @CurrentUser() user: AuthenticatedUser,
    @Param('staffId') staffId: string,
    @Body() dto: UpdateStaffDto,
  ) {
    return this.updateStaff.execute(user.id, staffId, dto);
  }

  @Put('personal/:staffId/sede')
  @Roles(Role.RESTAURANTE)
  reassignStaffMember(
    @CurrentUser() user: AuthenticatedUser,
    @Param('staffId') staffId: string,
    @Body() dto: ReassignStaffLocationDto,
  ) {
    return this.reassignStaff.execute(user.id, staffId, dto.locationId);
  }

  @Post('personal/:staffId/habilitar')
  @Roles(Role.RESTAURANTE)
  enableStaffMember(
    @CurrentUser() user: AuthenticatedUser,
    @Param('staffId') staffId: string,
  ) {
    return this.setStaffEnabled.execute(user.id, staffId, true);
  }

  @Post('personal/:staffId/deshabilitar')
  @Roles(Role.RESTAURANTE)
  disableStaffMember(
    @CurrentUser() user: AuthenticatedUser,
    @Param('staffId') staffId: string,
  ) {
    return this.setStaffEnabled.execute(user.id, staffId, false);
  }

  @Post(':restaurantId/sedes')
  @Roles(Role.RESTAURANTE)
  createLocationForRestaurant(
    @CurrentUser() user: AuthenticatedUser,
    @Param('restaurantId') restaurantId: string,
    @Body() dto: CreateLocationDto,
  ) {
    return this.createLocation.execute(user.id, restaurantId, dto);
  }

  @Patch('sedes/:locationId')
  @Roles(Role.RESTAURANTE)
  updateLocationById(
    @CurrentUser() user: AuthenticatedUser,
    @Param('locationId') locationId: string,
    @Body() dto: UpdateLocationDto,
  ) {
    return this.updateLocation.execute(user.id, locationId, dto);
  }

  @Put('sedes/:locationId/horarios')
  @Roles(Role.RESTAURANTE)
  replaceLocationSchedules(
    @CurrentUser() user: AuthenticatedUser,
    @Param('locationId') locationId: string,
    @Body() dto: ReplaceSchedulesDto,
  ) {
    return this.replaceSchedules.execute(user.id, locationId, dto.schedules);
  }

  @Put('sedes/:locationId/logo')
  @Roles(Role.RESTAURANTE)
  setLogo(
    @CurrentUser() user: AuthenticatedUser,
    @Param('locationId') locationId: string,
    @Body() dto: ImageUrlDto,
  ) {
    return this.setLocationImage.execute(user.id, locationId, 'logo', dto.url);
  }

  @Post('sedes/:locationId/logo/upload')
  @Roles(Role.RESTAURANTE)
  @UseInterceptors(FileInterceptor('file', imageUploadOptions))
  uploadLogo(
    @CurrentUser() user: AuthenticatedUser,
    @Param('locationId') locationId: string,
    @UploadedFile() file: UploadedImageFile,
  ) {
    return this.uploadLocationImage.execute(
      user.id,
      locationId,
      'logo',
      requiredFile(file),
    );
  }

  @Put('sedes/:locationId/portada')
  @Roles(Role.RESTAURANTE)
  setCover(
    @CurrentUser() user: AuthenticatedUser,
    @Param('locationId') locationId: string,
    @Body() dto: ImageUrlDto,
  ) {
    return this.setLocationImage.execute(user.id, locationId, 'cover', dto.url);
  }

  @Post('sedes/:locationId/portada/upload')
  @Roles(Role.RESTAURANTE)
  @UseInterceptors(FileInterceptor('file', imageUploadOptions))
  uploadCover(
    @CurrentUser() user: AuthenticatedUser,
    @Param('locationId') locationId: string,
    @UploadedFile() file: UploadedImageFile,
  ) {
    return this.uploadLocationImage.execute(
      user.id,
      locationId,
      'cover',
      requiredFile(file),
    );
  }

  @Post('sedes/:locationId/galeria')
  @Roles(Role.RESTAURANTE)
  addGalleryImageByUrl(
    @CurrentUser() user: AuthenticatedUser,
    @Param('locationId') locationId: string,
    @Body() dto: ImageUrlDto,
  ) {
    return this.addGalleryImage.execute(user.id, locationId, dto.url);
  }

  @Post('sedes/:locationId/galeria/upload')
  @Roles(Role.RESTAURANTE)
  @UseInterceptors(FileInterceptor('file', imageUploadOptions))
  uploadGalleryImage(
    @CurrentUser() user: AuthenticatedUser,
    @Param('locationId') locationId: string,
    @UploadedFile() file: UploadedImageFile,
  ) {
    return this.uploadLocationImage.execute(
      user.id,
      locationId,
      'gallery',
      requiredFile(file),
    );
  }

  @Delete('sedes/:locationId/galeria/:imageId')
  @Roles(Role.RESTAURANTE)
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeGalleryImageById(
    @CurrentUser() user: AuthenticatedUser,
    @Param('locationId') locationId: string,
    @Param('imageId') imageId: string,
  ) {
    await this.removeGalleryImage.execute(user.id, locationId, imageId);
  }

  @Get('sedes/:locationId/vista-previa')
  @Roles(Role.RESTAURANTE)
  preview(
    @CurrentUser() user: AuthenticatedUser,
    @Param('locationId') locationId: string,
  ) {
    return this.previewLocation.execute(user.id, locationId);
  }

  @Post('sedes/:locationId/solicitud-autorizacion')
  @Roles(Role.RESTAURANTE)
  requestApproval(
    @CurrentUser() user: AuthenticatedUser,
    @Param('locationId') locationId: string,
  ) {
    return this.requestLocationApproval.execute(user.id, locationId);
  }

  /** Solo las sedes aprobadas se exponen a los comensales. */
  @Public()
  @Get('publicos/:locationId')
  publicProfile(@Param('locationId') locationId: string) {
    return this.getPublicLocationProfile.execute(locationId);
  }

  @Get('administracion/solicitudes-pendientes')
  @Roles(Role.ADMINISTRADOR)
  pendingForReview() {
    return this.listPendingLocations.execute();
  }

  @Get('administracion')
  @Roles(Role.ADMINISTRADOR)
  locationsForAdmin() {
    return this.listAllLocationsForAdmin.execute();
  }

  @Post('administracion/sedes/:locationId/aprobar')
  @Roles(Role.ADMINISTRADOR)
  approve(@Param('locationId') locationId: string) {
    return this.approveLocation.execute(locationId);
  }

  @Post('administracion/sedes/:locationId/rechazar')
  @Roles(Role.ADMINISTRADOR)
  reject(
    @Param('locationId') locationId: string,
    @Body() dto: RejectLocationDto,
  ) {
    return this.rejectLocation.execute(locationId, dto.reason);
  }
}

interface UploadedImageFile {
  buffer: Buffer;
  mimetype: string;
  size: number;
}

function requiredFile(file: UploadedImageFile | undefined) {
  if (!file) {
    throw new BadRequestException(
      'Debes adjuntar un archivo en el campo "file".',
    );
  }
  return { buffer: file.buffer, mimetype: file.mimetype, size: file.size };
}

/** Aplana {restaurant, locations} al shape plano que ya devolvia Prisma por defecto. */
function flattenRestaurant(restaurant: Restaurant, locations: Location[]) {
  return { ...restaurant, locations };
}
