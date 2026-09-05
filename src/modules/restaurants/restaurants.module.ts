import { Module } from '@nestjs/common';
import { LOCATION_REPOSITORY } from './domain/repositories/location.repository';
import { RESTAURANT_REPOSITORY } from './domain/repositories/restaurant.repository';
import { SCHEDULE_REPOSITORY } from './domain/repositories/schedule.repository';
import { STAFF_REPOSITORY } from './domain/repositories/staff.repository';
import { IMAGE_STORAGE } from './domain/services/image-storage';
import { PrismaLocationRepository } from './infrastructure/persistence/prisma-location.repository';
import { PrismaRestaurantRepository } from './infrastructure/persistence/prisma-restaurant.repository';
import { PrismaScheduleRepository } from './infrastructure/persistence/prisma-schedule.repository';
import { PrismaStaffRepository } from './infrastructure/persistence/prisma-staff.repository';
import { SupabaseImageStorage } from './infrastructure/storage/supabase-image-storage';
import { RestaurantsController } from './infrastructure/http/restaurants.controller';
import { AddGalleryImageUseCase } from './application/use-cases/add-gallery-image.use-case';
import { ApproveLocationUseCase } from './application/use-cases/approve-location.use-case';
import { CreateLocationUseCase } from './application/use-cases/create-location.use-case';
import { CreateRestaurantUseCase } from './application/use-cases/create-restaurant.use-case';
import { CreateStaffUserUseCase } from './application/use-cases/create-staff-user.use-case';
import { GetPublicLocationProfileUseCase } from './application/use-cases/get-public-location-profile.use-case';
import { GetStaffDetailUseCase } from './application/use-cases/get-staff-detail.use-case';
import { ListAllLocationsForAdminUseCase } from './application/use-cases/list-all-locations-for-admin.use-case';
import { ListMyRestaurantsUseCase } from './application/use-cases/list-my-restaurants.use-case';
import { ListPendingLocationsUseCase } from './application/use-cases/list-pending-locations.use-case';
import { ListStaffUseCase } from './application/use-cases/list-staff.use-case';
import { PreviewLocationUseCase } from './application/use-cases/preview-location.use-case';
import { ReassignStaffUseCase } from './application/use-cases/reassign-staff.use-case';
import { RejectLocationUseCase } from './application/use-cases/reject-location.use-case';
import { RemoveGalleryImageUseCase } from './application/use-cases/remove-gallery-image.use-case';
import { ReplaceSchedulesUseCase } from './application/use-cases/replace-schedules.use-case';
import { RequestLocationApprovalUseCase } from './application/use-cases/request-location-approval.use-case';
import { SetLocationImageUseCase } from './application/use-cases/set-location-image.use-case';
import { SetStaffEnabledUseCase } from './application/use-cases/set-staff-enabled.use-case';
import { UpdateLocationUseCase } from './application/use-cases/update-location.use-case';
import { UpdateStaffUseCase } from './application/use-cases/update-staff.use-case';
import { UploadLocationImageUseCase } from './application/use-cases/upload-location-image.use-case';

@Module({
  controllers: [RestaurantsController],
  providers: [
    // Casos de uso.
    CreateRestaurantUseCase,
    ListMyRestaurantsUseCase,
    CreateLocationUseCase,
    UpdateLocationUseCase,
    ReplaceSchedulesUseCase,
    SetLocationImageUseCase,
    UploadLocationImageUseCase,
    AddGalleryImageUseCase,
    RemoveGalleryImageUseCase,
    PreviewLocationUseCase,
    GetPublicLocationProfileUseCase,
    RequestLocationApprovalUseCase,
    ListPendingLocationsUseCase,
    ListAllLocationsForAdminUseCase,
    ApproveLocationUseCase,
    RejectLocationUseCase,
    ListStaffUseCase,
    GetStaffDetailUseCase,
    CreateStaffUserUseCase,
    UpdateStaffUseCase,
    ReassignStaffUseCase,
    SetStaffEnabledUseCase,
    // Los casos de uso dependen de las interfaces del dominio, no de Prisma
    // ni de Supabase Storage directamente.
    { provide: RESTAURANT_REPOSITORY, useClass: PrismaRestaurantRepository },
    { provide: LOCATION_REPOSITORY, useClass: PrismaLocationRepository },
    { provide: SCHEDULE_REPOSITORY, useClass: PrismaScheduleRepository },
    { provide: STAFF_REPOSITORY, useClass: PrismaStaffRepository },
    { provide: IMAGE_STORAGE, useClass: SupabaseImageStorage },
  ],
})
export class RestaurantsModule {}
