import { Module } from '@nestjs/common';
import { SharedProductsModule } from '../../shared/products/products.module';
import { StorageModule } from '../../shared/storage/storage.module';
import { AnticiposService } from '../anticipos/anticipos.service';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { AuthModule } from '../auth/auth.module';
import { BodegasService } from '../bodegas/bodegas.service';
import { ClientesService } from '../clientes/clientes.service';
import { ComprasModule } from '../compras/compras.module';
import { CotizacionesService } from '../cotizaciones/cotizaciones.service';
import { CreditosService } from '../creditos/creditos.service';
import { CuentasBancariasService } from '../cuentas-bancarias/cuentas-bancarias.service';
import { DeliveriesService } from '../deliveries/deliveries.service';
import { DevolucionesService } from '../devoluciones/devoluciones.service';
import { FacturasModule } from '../facturas/facturas.module';
import { InventarioService } from '../inventario/inventario.service';
import { MovimientosBancariosService } from '../movimientos-bancarios/movimientos-bancarios.service';
import { NotificacionesModule } from '../notificaciones/notificaciones.module';
import { OfertasService } from '../ofertas/ofertas.service';
import { ProductProfitService } from '../productos/product-profit.service';
import { ProductosService } from '../productos/productos.service';
import { ProveedoresService } from '../proveedores/proveedores.service';
import { RecibosModule } from '../recibos/recibos.module';
import { RetencionesService } from '../retenciones/retenciones.service';
import { UsuariosService } from '../usuarios/usuarios.service';
import { MundiController } from './mundi.controller';
import { MundiService } from './mundi.service';

/**
 * Mundi reutiliza los servicios de negocio de cada módulo. Los que ya se
 * exportan se importan por su módulo; el resto son servicios sin estado
 * (Prisma + auditoría) que se registran aquí para no tocar sus módulos.
 */
@Module({
  imports: [
    AuthModule,
    AuditLogModule,
    NotificacionesModule,
    SharedProductsModule,
    StorageModule,
    FacturasModule,
    ComprasModule,
    RecibosModule,
  ],
  controllers: [MundiController],
  providers: [
    MundiService,
    AnticiposService,
    BodegasService,
    ClientesService,
    CotizacionesService,
    CreditosService,
    CuentasBancariasService,
    DeliveriesService,
    DevolucionesService,
    InventarioService,
    MovimientosBancariosService,
    OfertasService,
    ProductProfitService,
    ProductosService,
    ProveedoresService,
    RetencionesService,
    UsuariosService,
  ],
})
export class MundiModule {}
