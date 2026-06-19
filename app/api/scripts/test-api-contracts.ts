type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE';

type TestRecord = {
  endpoint: string;
  checks: string[];
};

const API_URL = process.env.API_URL ?? 'http://localhost:3000';
const suffix = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
const records = new Map<string, TestRecord>();

function record(endpoint: string, check: string) {
  const current = records.get(endpoint) ?? { endpoint, checks: [] };
  current.checks.push(check);
  records.set(endpoint, current);
}

function expectCondition(endpoint: string, check: string, condition: unknown) {
  if (!condition) {
    throw new Error(`Falló ${endpoint}: ${check}`);
  }

  record(endpoint, check);
}

async function request<T>(
  method: HttpMethod,
  path: string,
  body?: unknown,
  expectedStatus?: number | number[],
): Promise<{ status: number; data: T }> {
  const response = await fetch(`${API_URL}${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  const expected = Array.isArray(expectedStatus)
    ? expectedStatus
    : expectedStatus
      ? [expectedStatus]
      : [200, 201];

  if (!expected.includes(response.status)) {
    throw new Error(
      `${method} ${path} respondió ${response.status}. Body: ${text}`,
    );
  }

  return { status: response.status, data };
}

async function main() {
  const clients = [] as any[];
  const products = [] as any[];
  const invoices = [] as any[];
  const deliveries = [] as any[];
  const referrals = [] as any[];

  const productType = (
    await request<any>('POST', '/tipos-producto', {
      name: `Tipo pruebas ${suffix}`,
      description: 'Tipo generado por prueba automatizada',
    })
  ).data;

  const warehouse = (
    await request<any>('POST', '/bodegas', {
      location: `Bodega pruebas ${suffix}`,
    })
  ).data;

  const tag = (
    await request<any>('POST', '/etiquetas', {
      name: `Etiqueta pruebas ${suffix}`,
      description: 'Etiqueta generada por prueba automatizada',
    })
  ).data;

  for (let index = 1; index <= 5; index++) {
    clients.push(
      (
        await request<any>('POST', '/clientes', {
          identification: `TEST-${suffix}-${index}`,
          firstName: `Cliente${index}`,
          lastName: 'Pruebas',
          phone: `300000000${index}`,
          address: `Direccion prueba ${index}`,
        })
      ).data,
    );
  }

  for (let index = 1; index <= 5; index++) {
    products.push(
      (
        await request<any>('POST', '/productos', {
          productTypeId: productType.id,
          name: `Producto prueba ${suffix}-${index}`,
          description: `Producto generado por prueba ${index}`,
          taxRate: 19,
          quantity: 30,
          warehouseId: warehouse.id,
          tagIds: [tag.id],
          prices: [
            {
              name: `Precio normal ${index}`,
              price: 10000 + index,
              isDefault: true,
            },
            {
              name: `Precio alterno ${index}`,
              price: 9000 + index,
            },
          ],
        })
      ).data,
    );
  }

  const productEndpoint = 'POST /productos';
  expectCondition(
    productEndpoint,
    'crea producto con precios iniciales',
    products[0].id,
  );
  expectCondition(
    productEndpoint,
    'incluye productType en respuesta',
    products[0].productType?.id === productType.id,
  );
  expectCondition(
    productEndpoint,
    'incluye warehouse en respuesta',
    products[0].warehouse?.id === warehouse.id,
  );
  expectCondition(
    productEndpoint,
    'incluye tags planos',
    products[0].tags?.[0]?.id === tag.id,
  );
  expectCondition(
    productEndpoint,
    'incluye prices',
    products[0].prices?.length === 2,
  );

  const productList = (await request<any[]>('GET', '/productos?estado=todos'))
    .data;
  const productGetEndpoint = 'GET /productos';
  expectCondition(
    productGetEndpoint,
    'retorna array',
    Array.isArray(productList),
  );
  expectCondition(
    productGetEndpoint,
    'incluye productos creados',
    productList.some((item) => item.id === products[0].id),
  );
  expectCondition(
    productGetEndpoint,
    'soporta estado=todos',
    productList.length >= 5,
  );
  expectCondition(
    productGetEndpoint,
    'incluye prices en listado',
    productList.find((item) => item.id === products[0].id)?.prices?.length ===
      2,
  );
  expectCondition(
    productGetEndpoint,
    'incluye tags en listado',
    Array.isArray(productList.find((item) => item.id === products[0].id)?.tags),
  );

  const oneProduct = (await request<any>('GET', `/productos/${products[0].id}`))
    .data;
  const productOneEndpoint = 'GET /productos/:id';
  expectCondition(
    productOneEndpoint,
    'consulta por id',
    oneProduct.id === products[0].id,
  );
  expectCondition(
    productOneEndpoint,
    'retorna productType',
    oneProduct.productType.id === productType.id,
  );
  expectCondition(
    productOneEndpoint,
    'retorna warehouse',
    oneProduct.warehouse.id === warehouse.id,
  );
  expectCondition(
    productOneEndpoint,
    'retorna prices',
    oneProduct.prices.length === 2,
  );
  expectCondition(
    productOneEndpoint,
    'retorna 404 si no existe',
    (await request<any>('GET', '/productos/999999999', undefined, 404))
      .status === 404,
  );

  const updatedProduct = (
    await request<any>('PATCH', `/productos/${products[0].id}`, {
      quantity: 35,
      tagIds: [tag.id],
    })
  ).data;
  const productPatchEndpoint = 'PATCH /productos/:id';
  expectCondition(
    productPatchEndpoint,
    'actualiza cantidad',
    updatedProduct.quantity === 35,
  );
  expectCondition(
    productPatchEndpoint,
    'mantiene tags enviados',
    updatedProduct.tags.length === 1,
  );
  expectCondition(
    productPatchEndpoint,
    'mantiene prices',
    updatedProduct.prices.length === 2,
  );
  expectCondition(
    productPatchEndpoint,
    'rechaza quantity negativa',
    (
      await request<any>(
        'PATCH',
        `/productos/${products[0].id}`,
        { quantity: -1 },
        400,
      )
    ).status === 400,
  );
  expectCondition(
    productPatchEndpoint,
    'retorna 404 si no existe',
    (await request<any>('PATCH', '/productos/999999999', { quantity: 1 }, 404))
      .status === 404,
  );

  const priceList = (await request<any[]>('GET', '/precios-producto')).data;
  const priceListEndpoint = 'GET /precios-producto';
  expectCondition(priceListEndpoint, 'retorna array', Array.isArray(priceList));
  expectCondition(
    priceListEndpoint,
    'incluye precios creados',
    priceList.some((price) => price.productId === products[0].id),
  );
  expectCondition(
    priceListEndpoint,
    'incluye product',
    !!priceList.find((price) => price.productId === products[0].id)?.product,
  );
  expectCondition(
    priceListEndpoint,
    'incluye isActive',
    typeof priceList.find((price) => price.productId === products[0].id)
      ?.isActive === 'boolean',
  );
  expectCondition(
    priceListEndpoint,
    'incluye isDefault',
    typeof priceList.find((price) => price.productId === products[0].id)
      ?.isDefault === 'boolean',
  );

  const productPrices = (
    await request<any[]>('GET', `/productos/${products[0].id}/precios`)
  ).data;
  const pricesByProductEndpoint = 'GET /productos/:id/precios';
  expectCondition(
    pricesByProductEndpoint,
    'retorna precios del producto',
    productPrices.length === 2,
  );
  expectCondition(
    pricesByProductEndpoint,
    'pertenecen al producto',
    productPrices.every((price) => price.productId === products[0].id),
  );
  expectCondition(
    pricesByProductEndpoint,
    'incluye default',
    productPrices.some((price) => price.isDefault),
  );
  expectCondition(
    pricesByProductEndpoint,
    'incluye product',
    !!productPrices[0].product,
  );
  expectCondition(
    pricesByProductEndpoint,
    'retorna 404 producto inexistente',
    (await request<any>('GET', '/productos/999999999/precios', undefined, 404))
      .status === 404,
  );

  const createdPrice = (
    await request<any>('POST', `/productos/${products[0].id}/precios`, {
      name: `Precio extra ${suffix}`,
      price: 7777,
    })
  ).data;
  const pricePostEndpoint = 'POST /productos/:id/precios';
  expectCondition(pricePostEndpoint, 'crea precio', createdPrice.id);
  expectCondition(
    pricePostEndpoint,
    'asocia producto',
    createdPrice.productId === products[0].id,
  );
  expectCondition(
    pricePostEndpoint,
    'queda activo por defecto',
    createdPrice.isActive === true,
  );
  expectCondition(
    pricePostEndpoint,
    'no queda default por defecto',
    createdPrice.isDefault === false,
  );
  expectCondition(
    pricePostEndpoint,
    'rechaza precio negativo',
    (
      await request<any>(
        'POST',
        `/productos/${products[0].id}/precios`,
        { name: 'Malo', price: -1 },
        400,
      )
    ).status === 400,
  );

  const onePrice = (
    await request<any>('GET', `/precios-producto/${createdPrice.id}`)
  ).data;
  const priceOneEndpoint = 'GET /precios-producto/:id';
  expectCondition(
    priceOneEndpoint,
    'consulta por id',
    onePrice.id === createdPrice.id,
  );
  expectCondition(priceOneEndpoint, 'incluye product', !!onePrice.product);
  expectCondition(
    priceOneEndpoint,
    'retorna price',
    Number(onePrice.price) === 7777,
  );
  expectCondition(
    priceOneEndpoint,
    'retorna isActive',
    onePrice.isActive === true,
  );
  expectCondition(
    priceOneEndpoint,
    'retorna 404 si no existe',
    (await request<any>('GET', '/precios-producto/999999999', undefined, 404))
      .status === 404,
  );

  const patchedPrice = (
    await request<any>('PATCH', `/precios-producto/${createdPrice.id}`, {
      name: `Precio extra actualizado ${suffix}`,
      price: 8888,
    })
  ).data;
  const pricePatchEndpoint = 'PATCH /precios-producto/:id';
  expectCondition(
    pricePatchEndpoint,
    'actualiza nombre',
    patchedPrice.name.includes('actualizado'),
  );
  expectCondition(
    pricePatchEndpoint,
    'actualiza precio',
    Number(patchedPrice.price) === 8888,
  );
  expectCondition(
    pricePatchEndpoint,
    'mantiene producto',
    patchedPrice.productId === products[0].id,
  );
  expectCondition(
    pricePatchEndpoint,
    'rechaza rango de fechas inválido',
    (
      await request<any>(
        'PATCH',
        `/precios-producto/${createdPrice.id}`,
        {
          startsAt: '2026-12-31T00:00:00.000Z',
          endsAt: '2026-01-01T00:00:00.000Z',
        },
        400,
      )
    ).status === 400,
  );
  expectCondition(
    pricePatchEndpoint,
    'retorna 404 si no existe',
    (
      await request<any>(
        'PATCH',
        '/precios-producto/999999999',
        { price: 1 },
        404,
      )
    ).status === 404,
  );

  const defaultPrice = (
    await request<any>('PATCH', `/precios-producto/${createdPrice.id}/default`)
  ).data;
  const priceDefaultEndpoint = 'PATCH /precios-producto/:id/default';
  const pricesAfterDefault = (
    await request<any[]>('GET', `/productos/${products[0].id}/precios`)
  ).data;
  expectCondition(
    priceDefaultEndpoint,
    'marca default',
    defaultPrice.isDefault === true,
  );
  expectCondition(
    priceDefaultEndpoint,
    'desmarca otros default',
    pricesAfterDefault.filter((price) => price.isDefault).length === 1,
  );
  expectCondition(
    priceDefaultEndpoint,
    'mantiene activo',
    defaultPrice.isActive === true,
  );
  expectCondition(
    priceDefaultEndpoint,
    'pertenece al producto',
    defaultPrice.productId === products[0].id,
  );
  expectCondition(
    priceDefaultEndpoint,
    'retorna 404 si no existe',
    (
      await request<any>(
        'PATCH',
        '/precios-producto/999999999/default',
        undefined,
        404,
      )
    ).status === 404,
  );

  const deletedPrice = (
    await request<any>('DELETE', `/precios-producto/${createdPrice.id}`)
  ).data;
  const priceDeleteEndpoint = 'DELETE /precios-producto/:id';
  expectCondition(
    priceDeleteEndpoint,
    'desactiva precio',
    deletedPrice.isActive === false,
  );
  expectCondition(
    priceDeleteEndpoint,
    'quita default',
    deletedPrice.isDefault === false,
  );
  expectCondition(
    priceDeleteEndpoint,
    'conserva registro',
    deletedPrice.id === createdPrice.id,
  );
  expectCondition(
    priceDeleteEndpoint,
    'conserva producto',
    deletedPrice.productId === products[0].id,
  );
  expectCondition(
    priceDeleteEndpoint,
    'retorna 404 si no existe',
    (
      await request<any>(
        'DELETE',
        '/precios-producto/999999999',
        undefined,
        404,
      )
    ).status === 404,
  );

  for (let index = 0; index < 5; index++) {
    invoices.push(
      (
        await request<any>('POST', '/facturas', {
          clientId: clients[index].id,
          items: [
            {
              productId: products[index].id,
              productPriceId: products[index].prices[0].id,
              quantity: 1,
            },
          ],
        })
      ).data,
    );
  }

  const invoicePostEndpoint = 'POST /facturas';
  expectCondition(invoicePostEndpoint, 'crea factura', invoices[0].id);
  expectCondition(
    invoicePostEndpoint,
    'guarda productPriceId',
    invoices[0].items[0].productPriceId === products[0].prices[0].id,
  );
  expectCondition(
    invoicePostEndpoint,
    'incluye productPrice',
    !!invoices[0].items[0].productPrice,
  );
  expectCondition(
    invoicePostEndpoint,
    'congela unitPrice',
    Number(invoices[0].items[0].unitPrice) ===
      Number(products[0].prices[0].price),
  );
  expectCondition(
    invoicePostEndpoint,
    'rechaza productPriceId de otro producto',
    (
      await request<any>(
        'POST',
        '/facturas',
        {
          clientId: clients[0].id,
          items: [
            {
              productId: products[0].id,
              productPriceId: products[1].prices[0].id,
              quantity: 1,
            },
          ],
        },
        400,
      )
    ).status === 400,
  );

  for (let index = 0; index < 5; index++) {
    deliveries.push(
      (
        await request<any>('POST', '/domicilios', {
          invoiceId: invoices[index].id,
          address: `Direccion domicilio ${suffix}-${index}`,
          recipientName: `Receptor ${index}`,
          recipientPhone: `311000000${index}`,
          notes: `Nota ${index}`,
        })
      ).data,
    );
  }

  const deliveryPostEndpoint = 'POST /domicilios';
  expectCondition(deliveryPostEndpoint, 'crea domicilio', deliveries[0].id);
  expectCondition(
    deliveryPostEndpoint,
    'asocia factura',
    deliveries[0].invoiceId === invoices[0].id,
  );
  expectCondition(
    deliveryPostEndpoint,
    'incluye consecutivo factura',
    !!deliveries[0].invoice?.consecutive,
  );
  expectCondition(
    deliveryPostEndpoint,
    'estado inicial pendiente',
    deliveries[0].status === 'PENDIENTE',
  );
  expectCondition(
    deliveryPostEndpoint,
    'rechaza domicilio duplicado por factura',
    (
      await request<any>(
        'POST',
        '/domicilios',
        {
          invoiceId: invoices[0].id,
          address: 'Otra direccion',
          recipientName: 'Otro',
          recipientPhone: '3000000000',
        },
        409,
      )
    ).status === 409,
  );

  const deliveryList = (await request<any[]>('GET', '/domicilios')).data;
  const deliveryListEndpoint = 'GET /domicilios';
  expectCondition(
    deliveryListEndpoint,
    'retorna array',
    Array.isArray(deliveryList),
  );
  expectCondition(
    deliveryListEndpoint,
    'incluye domicilios creados',
    deliveryList.some((delivery) => delivery.id === deliveries[0].id),
  );
  expectCondition(
    deliveryListEndpoint,
    'incluye invoice',
    !!deliveryList.find((delivery) => delivery.id === deliveries[0].id)
      ?.invoice,
  );
  expectCondition(
    deliveryListEndpoint,
    'incluye consecutive',
    !!deliveryList.find((delivery) => delivery.id === deliveries[0].id)?.invoice
      ?.consecutive,
  );
  expectCondition(
    deliveryListEndpoint,
    'incluye status',
    !!deliveryList.find((delivery) => delivery.id === deliveries[0].id)?.status,
  );

  const oneDelivery = (
    await request<any>('GET', `/domicilios/${deliveries[0].id}`)
  ).data;
  const deliveryOneEndpoint = 'GET /domicilios/:id';
  expectCondition(
    deliveryOneEndpoint,
    'consulta por id',
    oneDelivery.id === deliveries[0].id,
  );
  expectCondition(
    deliveryOneEndpoint,
    'incluye factura',
    !!oneDelivery.invoice,
  );
  expectCondition(
    deliveryOneEndpoint,
    'incluye consecutive',
    !!oneDelivery.invoice.consecutive,
  );
  expectCondition(
    deliveryOneEndpoint,
    'incluye estado',
    oneDelivery.status === 'PENDIENTE',
  );
  expectCondition(
    deliveryOneEndpoint,
    'retorna 404 si no existe',
    (await request<any>('GET', '/domicilios/999999999', undefined, 404))
      .status === 404,
  );

  const patchedDelivery = (
    await request<any>('PATCH', `/domicilios/${deliveries[0].id}`, {
      address: `Direccion actualizada ${suffix}`,
      recipientPhone: '3222222222',
      notes: 'Nota actualizada',
    })
  ).data;
  const deliveryPatchEndpoint = 'PATCH /domicilios/:id';
  expectCondition(
    deliveryPatchEndpoint,
    'actualiza direccion',
    patchedDelivery.address.includes('actualizada'),
  );
  expectCondition(
    deliveryPatchEndpoint,
    'actualiza telefono',
    patchedDelivery.recipientPhone === '3222222222',
  );
  expectCondition(
    deliveryPatchEndpoint,
    'actualiza notas',
    patchedDelivery.notes === 'Nota actualizada',
  );
  expectCondition(
    deliveryPatchEndpoint,
    'mantiene factura',
    patchedDelivery.invoiceId === invoices[0].id,
  );
  expectCondition(
    deliveryPatchEndpoint,
    'retorna 404 si no existe',
    (
      await request<any>(
        'PATCH',
        '/domicilios/999999999',
        { address: 'Direccion larga' },
        404,
      )
    ).status === 404,
  );

  const preparing = (
    await request<any>('PATCH', `/domicilios/${deliveries[0].id}/estado`, {
      status: 'EN_PREPARACION',
    })
  ).data;
  const delivered = (
    await request<any>('PATCH', `/domicilios/${deliveries[0].id}/estado`, {
      status: 'ENTREGADO',
    })
  ).data;
  const reopened = (
    await request<any>('PATCH', `/domicilios/${deliveries[0].id}/estado`, {
      status: 'EN_CAMINO',
    })
  ).data;
  const deliveryStatusEndpoint = 'PATCH /domicilios/:id/estado';
  expectCondition(
    deliveryStatusEndpoint,
    'cambia a EN_PREPARACION',
    preparing.status === 'EN_PREPARACION',
  );
  expectCondition(
    deliveryStatusEndpoint,
    'cambia a ENTREGADO',
    delivered.status === 'ENTREGADO',
  );
  expectCondition(
    deliveryStatusEndpoint,
    'llena deliveredAt',
    !!delivered.deliveredAt,
  );
  expectCondition(
    deliveryStatusEndpoint,
    'limpia deliveredAt al salir de ENTREGADO',
    reopened.deliveredAt === null,
  );
  expectCondition(
    deliveryStatusEndpoint,
    'rechaza estado inválido',
    (
      await request<any>(
        'PATCH',
        `/domicilios/${deliveries[0].id}/estado`,
        { status: 'INVALIDO' },
        400,
      )
    ).status === 400,
  );

  const cancelledDelivery = (
    await request<any>('DELETE', `/domicilios/${deliveries[0].id}`)
  ).data;
  const deliveryDeleteEndpoint = 'DELETE /domicilios/:id';
  expectCondition(
    deliveryDeleteEndpoint,
    'marca cancelado',
    cancelledDelivery.status === 'CANCELADO',
  );
  expectCondition(
    deliveryDeleteEndpoint,
    'limpia deliveredAt',
    cancelledDelivery.deliveredAt === null,
  );
  expectCondition(
    deliveryDeleteEndpoint,
    'conserva registro',
    cancelledDelivery.id === deliveries[0].id,
  );
  expectCondition(
    deliveryDeleteEndpoint,
    'conserva factura',
    cancelledDelivery.invoiceId === invoices[0].id,
  );
  expectCondition(
    deliveryDeleteEndpoint,
    'retorna 404 si no existe',
    (await request<any>('DELETE', '/domicilios/999999999', undefined, 404))
      .status === 404,
  );

  const codeClient = (
    await request<any>('POST', `/clientes/${clients[0].id}/codigo-referido`)
  ).data;
  const sameCodeClient = (
    await request<any>('POST', `/clientes/${clients[0].id}/codigo-referido`)
  ).data;
  const referralCodeEndpoint = 'POST /clientes/:id/codigo-referido';
  expectCondition(
    referralCodeEndpoint,
    'genera codigo',
    !!codeClient.referralCode,
  );
  expectCondition(
    referralCodeEndpoint,
    'retorna existente',
    sameCodeClient.referralCode === codeClient.referralCode,
  );
  expectCondition(
    referralCodeEndpoint,
    'mantiene cliente',
    sameCodeClient.id === clients[0].id,
  );
  expectCondition(
    referralCodeEndpoint,
    'codigo en mayusculas',
    sameCodeClient.referralCode === sameCodeClient.referralCode.toUpperCase(),
  );
  expectCondition(
    referralCodeEndpoint,
    'retorna 404 si no existe',
    (
      await request<any>(
        'POST',
        '/clientes/999999999/codigo-referido',
        undefined,
        404,
      )
    ).status === 404,
  );

  for (let index = 1; index <= 4; index++) {
    referrals.push(
      (
        await request<any>('POST', '/referidos', {
          referredClientId: clients[index].id,
          codeUsed: codeClient.referralCode,
        })
      ).data,
    );
  }

  const referralPostEndpoint = 'POST /referidos';
  expectCondition(referralPostEndpoint, 'crea referido', referrals[0].id);
  expectCondition(
    referralPostEndpoint,
    'asocia referrer',
    referrals[0].referrerClient.id === clients[0].id,
  );
  expectCondition(
    referralPostEndpoint,
    'asocia referred',
    referrals[0].referredClient.id === clients[1].id,
  );
  expectCondition(
    referralPostEndpoint,
    'guarda codeUsed',
    referrals[0].codeUsed === codeClient.referralCode,
  );
  expectCondition(
    referralPostEndpoint,
    'rechaza referido duplicado',
    (
      await request<any>(
        'POST',
        '/referidos',
        { referredClientId: clients[1].id, codeUsed: codeClient.referralCode },
        409,
      )
    ).status === 409,
  );

  const referralList = (await request<any[]>('GET', '/referidos')).data;
  const referralListEndpoint = 'GET /referidos';
  expectCondition(
    referralListEndpoint,
    'retorna array',
    Array.isArray(referralList),
  );
  expectCondition(
    referralListEndpoint,
    'incluye referidos creados',
    referralList.some((referral) => referral.id === referrals[0].id),
  );
  expectCondition(
    referralListEndpoint,
    'incluye referrerClient',
    !!referralList.find((referral) => referral.id === referrals[0].id)
      ?.referrerClient,
  );
  expectCondition(
    referralListEndpoint,
    'incluye referredClient',
    !!referralList.find((referral) => referral.id === referrals[0].id)
      ?.referredClient,
  );
  expectCondition(
    referralListEndpoint,
    'incluye codeUsed',
    !!referralList.find((referral) => referral.id === referrals[0].id)
      ?.codeUsed,
  );

  const oneReferral = (
    await request<any>('GET', `/referidos/${referrals[0].id}`)
  ).data;
  const referralOneEndpoint = 'GET /referidos/:id';
  expectCondition(
    referralOneEndpoint,
    'consulta por id',
    oneReferral.id === referrals[0].id,
  );
  expectCondition(
    referralOneEndpoint,
    'incluye referrerClient',
    !!oneReferral.referrerClient,
  );
  expectCondition(
    referralOneEndpoint,
    'incluye referredClient',
    !!oneReferral.referredClient,
  );
  expectCondition(
    referralOneEndpoint,
    'incluye codeUsed',
    oneReferral.codeUsed === codeClient.referralCode,
  );
  expectCondition(
    referralOneEndpoint,
    'retorna 404 si no existe',
    (await request<any>('GET', '/referidos/999999999', undefined, 404))
      .status === 404,
  );

  const clientReferrals = (
    await request<any[]>('GET', `/clientes/${clients[0].id}/referidos`)
  ).data;
  const clientReferralsEndpoint = 'GET /clientes/:id/referidos';
  expectCondition(
    clientReferralsEndpoint,
    'retorna array',
    Array.isArray(clientReferrals),
  );
  expectCondition(
    clientReferralsEndpoint,
    'retorna 4 referidos creados',
    clientReferrals.length >= 4,
  );
  expectCondition(
    clientReferralsEndpoint,
    'incluye cliente referido',
    !!clientReferrals[0].referredClient,
  );
  expectCondition(
    clientReferralsEndpoint,
    'pertenece al referrer',
    clientReferrals.every(
      (referral) => referral.referrerClientId === clients[0].id,
    ),
  );
  expectCondition(
    clientReferralsEndpoint,
    'retorna 404 cliente inexistente',
    (await request<any>('GET', '/clientes/999999999/referidos', undefined, 404))
      .status === 404,
  );

  for (const [endpoint, result] of records) {
    if (result.checks.length < 5) {
      throw new Error(
        `${endpoint} solo tuvo ${result.checks.length} pruebas registradas`,
      );
    }
  }

  console.log(
    JSON.stringify(
      {
        apiUrl: API_URL,
        suffix,
        created: {
          clients: clients.length,
          products: products.length,
          invoices: invoices.length,
          deliveries: deliveries.length,
          referrals: referrals.length,
        },
        endpoints: Array.from(records.values()).map((record) => ({
          endpoint: record.endpoint,
          checks: record.checks.length,
          cases: record.checks,
        })),
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
