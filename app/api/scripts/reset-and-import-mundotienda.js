require('dotenv').config()

const { execFileSync } = require('child_process')
const path = require('path')
const { PrismaPg } = require('@prisma/adapter-pg')
const { PrismaClient, Role } = require('@prisma/client')

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL })
const prisma = new PrismaClient({ adapter })

const SCRIPT_DIR = __dirname
const PROJECT_ROOT = path.resolve(SCRIPT_DIR, '..', '..', '..')
const EXCEL_PATH = path.join(PROJECT_ROOT, 'PRODUCTOR MUNDOTIENDA.XLS')
const PYTHON_SCRIPT = path.join(SCRIPT_DIR, 'parse_mundotienda_xls.py')
const BATCH_SIZE = 250

function loadCatalog() {
  const output = execFileSync('python', ['-X', 'utf8', PYTHON_SCRIPT, '--file', EXCEL_PATH], {
    cwd: PROJECT_ROOT,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 32,
    env: {
      ...process.env,
      PYTHONIOENCODING: 'utf-8',
      PYTHONUTF8: '1',
    },
  })

  const catalog = JSON.parse(output)

  if (!Array.isArray(catalog) || !catalog.length) {
    throw new Error('El catalogo importado desde el Excel esta vacio')
  }

  return catalog
}

async function loadAdmins() {
  const admins = await prisma.user.findMany({
    where: { role: Role.ADMIN },
    include: { client: true, employee: true },
    orderBy: { id: 'asc' },
  })

  if (!admins.length) {
    throw new Error('No existe ningun usuario administrador para preservar')
  }

  return admins
}

function chunk(items, size = BATCH_SIZE) {
  const chunks = []

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size))
  }

  return chunks
}

async function createManyInBatches(model, items) {
  for (const batch of chunk(items)) {
    await model.createMany({ data: batch })
  }
}

async function main() {
  const [admins, catalog] = await Promise.all([loadAdmins(), Promise.resolve(loadCatalog())])
  const productTypeNames = [...new Set(catalog.map((product) => product.productType))].sort()

  const baseState = await prisma.$transaction(
    async (db) => {
      await db.$executeRawUnsafe(`
        TRUNCATE TABLE
          "CreditPayment",
          "InvoiceCredit",
          "Delivery",
          "BankAccountMovement",
          "InvoiceItem",
          "Invoice",
          "QuoteItem",
          "Quote",
          "OfferClient",
          "OfferProduct",
          "OfferProductType",
          "OfferTag",
          "Offer",
          "ProductPriceHistory",
          "ProductPrice",
          "ProductCost",
          "InventoryMovement",
          "ProductWarehouse",
          "ProductTag",
          "Product",
          "Tag",
          "Provider",
          "ProductType",
          "Warehouse",
          "Referral",
          "Employee",
          "User",
          "Client",
          "BankAccount"
        RESTART IDENTITY CASCADE
      `)

      const preservedAdmins = []

      for (const admin of admins) {
        const client = await db.client.create({
          data: {
            identification: admin.client?.identification ?? `ADMIN-${admin.id}`,
            firstName: admin.client?.firstName ?? admin.username,
            lastName: admin.client?.lastName ?? 'Administrador',
            phone: admin.client?.phone ?? null,
            address: admin.client?.address ?? null,
            clientType: admin.client?.clientType ?? 'MINORISTA',
            referralCode: admin.client?.referralCode ?? null,
            referralLevel: admin.client?.referralLevel ?? 0,
            isActive: admin.client?.isActive ?? true,
            deletedAt: admin.client?.deletedAt ?? null,
            createdAt: admin.client?.createdAt ?? admin.createdAt,
            updatedAt: admin.client?.updatedAt ?? admin.updatedAt,
          },
        })

        const user = await db.user.create({
          data: {
            clientId: client.id,
            username: admin.username,
            password: admin.password,
            role: admin.role,
            isActive: admin.isActive,
            deletedAt: admin.deletedAt,
            createdAt: admin.createdAt,
            updatedAt: admin.updatedAt,
          },
        })

        if (admin.employee) {
          await db.employee.create({
            data: {
              userId: user.id,
              identification: admin.employee.identification,
              firstName: admin.employee.firstName,
              lastName: admin.employee.lastName,
              phone: admin.employee.phone,
              address: admin.employee.address,
              isActive: admin.employee.isActive,
              deletedAt: admin.employee.deletedAt,
              createdAt: admin.employee.createdAt,
              updatedAt: admin.employee.updatedAt,
            },
          })
        }

        preservedAdmins.push({ id: user.id, username: user.username })
      }

      const warehouse = await db.warehouse.create({
        data: {
          location: 'Bodega Principal Mundo Tienda',
        },
      })

      const provider = await db.provider.create({
        data: {
          name: 'Mundo Tienda Montes de Maria S.A.S',
          description: 'Proveedor base para catalogo importado desde PRODUCTOR MUNDOTIENDA.XLS',
        },
      })

      const productTypes = new Map()

      for (const productTypeName of productTypeNames) {
        const productType = await db.productType.create({
          data: {
            name: productTypeName,
            description: `Categoria inferida automaticamente durante la importacion de ${path.basename(EXCEL_PATH)}`,
          },
        })

        productTypes.set(productTypeName, productType)
      }

      return {
        preservedAdmins,
        warehouse: warehouse.location,
        warehouseId: warehouse.id,
        provider: provider.name,
        providerId: provider.id,
        productTypeIds: Object.fromEntries(
          [...productTypes.entries()].map(([name, productType]) => [name, productType.id]),
        ),
      }
    },
    {
      maxWait: 60_000,
      timeout: 120_000,
    },
  )

  const productRows = catalog.map((item) => ({
    productTypeId: baseState.productTypeIds[item.productType],
    providerId: baseState.providerId,
    name: item.name,
    description: item.description,
    taxRate: item.taxRate,
    unit: item.unit,
    brand: item.brand,
    minimumStock: item.minimumStock,
    maximumStock: item.maximumStock,
    imageUrl: item.imageUrl,
  }))

  await createManyInBatches(prisma.product, productRows)

  const createdProducts = await prisma.product.findMany({
    where: {
      providerId: baseState.providerId,
      description: { contains: 'Importado desde PRODUCTOR MUNDOTIENDA.XLS' },
    },
    select: { id: true, description: true },
    orderBy: { id: 'asc' },
  })

  const productIdsByDescription = new Map(
    createdProducts.map((product) => [product.description, product.id]),
  )

  if (createdProducts.length !== catalog.length) {
    throw new Error(
      `Se esperaban ${catalog.length} productos importados y se encontraron ${createdProducts.length}`,
    )
  }

  const priceRows = []
  const costRows = []
  const warehouseRows = []
  const movementRows = []
  let stockedProducts = 0
  let inventoryUnits = 0

  for (const item of catalog) {
    const productId = productIdsByDescription.get(item.description)

    if (!productId) {
      throw new Error(`No se encontro el producto importado: ${item.name}`)
    }

    for (const price of item.prices) {
      priceRows.push({
        productId,
        name: price.name,
        price: price.price,
        unit: price.unit,
        quantity: price.quantity,
        isDefault: price.isDefault,
        isActive: true,
      })
    }

    costRows.push({
      productId,
      cost: item.cost.cost,
      unit: item.cost.unit,
      quantity: item.cost.quantity,
      isActive: true,
    })

    if (item.stock > 0) {
      stockedProducts += 1
      inventoryUnits += item.stock

      warehouseRows.push({
        productId,
        warehouseId: baseState.warehouseId,
        quantity: item.stock,
      })

      movementRows.push({
        productId,
        toWarehouseId: baseState.warehouseId,
        quantity: item.stock,
        movementType: 'ENTRADA',
        reason: 'Carga inicial desde PRODUCTOR MUNDOTIENDA.XLS',
      })
    }
  }

  await createManyInBatches(prisma.productPrice, priceRows)
  await createManyInBatches(prisma.productCost, costRows)
  await createManyInBatches(prisma.productWarehouse, warehouseRows)
  await createManyInBatches(prisma.inventoryMovement, movementRows)

  const summary = {
    preservedAdmins: baseState.preservedAdmins,
    warehouse: baseState.warehouse,
    provider: baseState.provider,
    productTypes: productTypeNames.length,
    products: catalog.length,
    stockedProducts,
    inventoryUnits,
  }

  console.log(JSON.stringify(summary, null, 2))
}

main()
  .catch(async (error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
