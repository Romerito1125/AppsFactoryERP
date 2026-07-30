import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './shared/prisma/prisma.module';
import { BodegasModule } from './modules/bodegas/bodegas.module';
import { ClientesModule } from './modules/clientes/clientes.module';
import { DeliveriesModule } from './modules/deliveries/deliveries.module';
import { FacturasModule } from './modules/facturas/facturas.module';
import { InventarioModule } from './modules/inventario/inventario.module';
import { ProveedoresModule } from './modules/proveedores/proveedores.module';
import { CuentasBancariasModule } from './modules/cuentas-bancarias/cuentas-bancarias.module';
import { MovimientosBancariosModule } from './modules/movimientos-bancarios/movimientos-bancarios.module';
import { CreditosModule } from './modules/creditos/creditos.module';
import { CotizacionesModule } from './modules/cotizaciones/cotizaciones.module';
import { OfertasModule } from './modules/ofertas/ofertas.module';
import { ProductCostsModule } from './modules/product-costs/product-costs.module';
import { ProductBarcodesModule } from './modules/product-barcodes/product-barcodes.module';
import { ProductPricesModule } from './modules/product-prices/product-prices.module';
import { ProductTypesModule } from './modules/product-types/product-types.module';
import { ProductosModule } from './modules/productos/productos.module';
import { ReferralsModule } from './modules/referrals/referrals.module';
import { TagsModule } from './modules/tags/tags.module';
import { UsuariosModule } from './modules/usuarios/usuarios.module';
import { AuthModule } from './modules/auth/auth.module';
import { NotificacionesModule } from './modules/notificaciones/notificaciones.module';
import { ReportesModule } from './modules/reportes/reportes.module';
import { TiendaModule } from './modules/tienda/tienda.module';
import { ComprasModule } from './modules/compras/compras.module';
import { AuditLogModule } from './modules/audit-log/audit-log.module';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    ReportesModule,
    NotificacionesModule,
    UsuariosModule,
    ClientesModule,
    ProductosModule,
    ProductTypesModule,
    TagsModule,
    BodegasModule,
    ProveedoresModule,
    InventarioModule,
    FacturasModule,
    CuentasBancariasModule,
    MovimientosBancariosModule,
    CreditosModule,
    CotizacionesModule,
    OfertasModule,
    DeliveriesModule,
    ReferralsModule,
    ProductPricesModule,
    ProductCostsModule,
    ProductBarcodesModule,
    ComprasModule,
    TiendaModule,
    AuditLogModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
