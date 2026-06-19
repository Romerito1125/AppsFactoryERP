import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './shared/prisma/prisma.module';
import { BodegasModule } from './modules/bodegas/bodegas.module';
import { ClientesModule } from './modules/clientes/clientes.module';
import { DeliveriesModule } from './modules/deliveries/deliveries.module';
import { FacturasModule } from './modules/facturas/facturas.module';
import { OfertasModule } from './modules/ofertas/ofertas.module';
import { ProductPricesModule } from './modules/product-prices/product-prices.module';
import { ProductTypesModule } from './modules/product-types/product-types.module';
import { ProductosModule } from './modules/productos/productos.module';
import { ReferralsModule } from './modules/referrals/referrals.module';
import { TagsModule } from './modules/tags/tags.module';
import { UsuariosModule } from './modules/usuarios/usuarios.module';

@Module({
  imports: [
    PrismaModule,
    UsuariosModule,
    ClientesModule,
    ProductosModule,
    ProductTypesModule,
    TagsModule,
    BodegasModule,
    FacturasModule,
    OfertasModule,
    DeliveriesModule,
    ReferralsModule,
    ProductPricesModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
