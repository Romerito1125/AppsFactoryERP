require('dotenv').config()

const { randomBytes, scryptSync } = require('crypto')
const { PrismaPg } = require('@prisma/adapter-pg')
const { PrismaClient } = require('@prisma/client')

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL })
const prisma = new PrismaClient({ adapter })

const BASE_NOW = new Date()

function round2(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100
}

function hashPassword(password) {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(password, salt, 64).toString('hex')
  return `${salt}:${hash}`
}

function daysAgo(days, hour = 10, minute = 0) {
  const date = new Date(BASE_NOW)
  date.setDate(date.getDate() - days)
  date.setHours(hour, minute, 0, 0)
  return date
}

function daysFromNow(days, hour = 10, minute = 0) {
  const date = new Date(BASE_NOW)
  date.setDate(date.getDate() + days)
  date.setHours(hour, minute, 0, 0)
  return date
}

function subtractDays(date, days) {
  const value = new Date(date)
  value.setDate(value.getDate() - days)
  return value
}

function addDays(date, days) {
  const value = new Date(date)
  value.setDate(value.getDate() + days)
  return value
}

const clientData = [
  {
    key: 'santiago_montes',
    identification: '900110001',
    firstName: 'Santiago',
    lastName: 'Montes',
    phone: '3001001001',
    address: 'Calle 9 # 12-30, Centro',
    clientType: 'MINORISTA',
    createdAt: daysAgo(200),
  },
  {
    key: 'valentina_ruiz',
    identification: '900110002',
    firstName: 'Valentina',
    lastName: 'Ruiz',
    phone: '3001001002',
    address: 'Calle 9 # 12-30, Centro',
    clientType: 'MINORISTA',
    createdAt: daysAgo(196),
  },
  {
    key: 'diego_pineda',
    identification: '900110003',
    firstName: 'Diego',
    lastName: 'Pineda',
    phone: '3001001003',
    address: 'Bodega Principal, Zona Industrial',
    clientType: 'MINORISTA',
    createdAt: daysAgo(194),
  },
  {
    key: 'camila_torres',
    identification: '900110004',
    firstName: 'Camila',
    lastName: 'Torres',
    phone: '3001001004',
    address: 'Cra 4 # 18-20, Centro',
    clientType: 'MINORISTA',
    createdAt: daysAgo(190),
  },
  {
    key: 'ferreteria_faro',
    identification: '901200111',
    firstName: 'Ferreteria El Faro',
    lastName: 'SAS',
    phone: '3002001111',
    address: 'Av. del Puerto # 45-18',
    clientType: 'MAYORISTA',
    referralCode: 'FARO11',
    referralLevel: 1,
    createdAt: daysAgo(160),
  },
  {
    key: 'restaurante_puerto',
    identification: '901200112',
    firstName: 'Restaurante Sabores',
    lastName: 'del Puerto',
    phone: '3002001122',
    address: 'Malecon Gastronimico Local 12',
    clientType: 'MAYORISTA',
    createdAt: daysAgo(150),
  },
  {
    key: 'hotel_brisa',
    identification: '901200113',
    firstName: 'Hotel Brisa',
    lastName: 'Marina',
    phone: '3002001133',
    address: 'Via Costera Km 2',
    clientType: 'MAYORISTA',
    createdAt: daysAgo(148),
  },
  {
    key: 'minimercado_palmas',
    identification: '901200114',
    firstName: 'Minimercado Las',
    lastName: 'Palmas',
    phone: '3002001144',
    address: 'Barrio Las Palmas Calle 17',
    clientType: 'MAYORISTA',
    createdAt: daysAgo(140),
  },
  {
    key: 'laura_bustos',
    identification: '52200118',
    firstName: 'Laura',
    lastName: 'Bustos',
    phone: '3002001155',
    address: 'Calle 22 # 8-14',
    clientType: 'MINORISTA',
    referralCode: 'LAUR88',
    referralLevel: 2,
    createdAt: daysAgo(132),
  },
  {
    key: 'colegio_rios',
    identification: '901200116',
    firstName: 'Colegio Los',
    lastName: 'Rios',
    phone: '3002001166',
    address: 'Carrera 8 # 30-12',
    clientType: 'MAYORISTA',
    createdAt: daysAgo(130),
  },
  {
    key: 'cafe_estacion',
    identification: '901200117',
    firstName: 'Cafe Estacion',
    lastName: 'Centro',
    phone: '3002001177',
    address: 'Plazoleta Central Local 5',
    clientType: 'MAYORISTA',
    referralCode: 'CAFE77',
    referralLevel: 1,
    createdAt: daysAgo(126),
  },
  {
    key: 'drogueria_vida',
    identification: '901200118',
    firstName: 'Drogueria Vida',
    lastName: 'Plena',
    phone: '3002001188',
    address: 'Avenida Principal # 14-50',
    clientType: 'MAYORISTA',
    createdAt: daysAgo(122),
  },
  {
    key: 'oficina_creativa',
    identification: '901200119',
    firstName: 'Oficina Creativa',
    lastName: 'Studio',
    phone: '3002001199',
    address: 'Torre Empresarial Piso 7',
    clientType: 'MAYORISTA',
    createdAt: daysAgo(118),
  },
  {
    key: 'hogar_martinez',
    identification: '80544321',
    firstName: 'Hogar',
    lastName: 'Martinez',
    phone: '3002001200',
    address: 'Urbanizacion Santa Maria Casa 18',
    clientType: 'MINORISTA',
    createdAt: daysAgo(115),
  },
  {
    key: 'distribuidora_litoral',
    identification: '901200121',
    firstName: 'Distribuidora',
    lastName: 'Litoral',
    phone: '3002001211',
    address: 'Zona Franca Bodega 4',
    clientType: 'MAYORISTA',
    createdAt: daysAgo(112),
  },
  {
    key: 'panaderia_miguel',
    identification: '901200122',
    firstName: 'Panaderia San',
    lastName: 'Miguel',
    phone: '3002001222',
    address: 'Calle 28 # 10-22',
    clientType: 'MAYORISTA',
    createdAt: daysAgo(108),
  },
  {
    key: 'salon_aurora',
    identification: '901200123',
    firstName: 'Salon Aurora',
    lastName: 'SPA',
    phone: '3002001233',
    address: 'Boulevard Comercial Local 9',
    clientType: 'MAYORISTA',
    createdAt: daysAgo(102),
  },
  {
    key: 'cliente_antiguo',
    identification: '901200124',
    firstName: 'Cliente Antiguo',
    lastName: 'Inactivo',
    phone: '3002001244',
    address: 'Sector Historico',
    clientType: 'MINORISTA',
    isActive: false,
    deletedAt: daysAgo(35),
    createdAt: daysAgo(100),
  },
]

const userData = [
  { clientKey: 'santiago_montes', username: 'santiago.admin@appsfactory.local', password: 'Admin123*', role: 'ADMIN', createdAt: daysAgo(180) },
  { clientKey: 'laura_bustos', username: 'laura.cajero@appsfactory.local', password: 'Cajero123*', role: 'CAJERO', createdAt: daysAgo(178) },
  { clientKey: 'valentina_ruiz', username: 'valentina.ventas@appsfactory.local', password: 'Ventas123*', role: 'VENDEDOR', createdAt: daysAgo(176) },
  { clientKey: 'diego_pineda', username: 'diego.bodega@appsfactory.local', password: 'Bodega123*', role: 'BODEGA', createdAt: daysAgo(174) },
  { clientKey: 'camila_torres', username: 'camila.conta@appsfactory.local', password: 'Conta123*', role: 'CONTADOR', createdAt: daysAgo(170) },
  { clientKey: 'restaurante_puerto', username: 'nicolas.ventas@appsfactory.local', password: 'Ventas456*', role: 'VENDEDOR', createdAt: daysAgo(166) },
  { clientKey: 'hotel_brisa', username: 'paula.cajero@appsfactory.local', password: 'Caja456*', role: 'CAJERO', createdAt: daysAgo(164) },
  { clientKey: 'distribuidora_litoral', username: 'sergio.bodega@appsfactory.local', password: 'Bodega456*', role: 'BODEGA', createdAt: daysAgo(162) },
]

const warehouseData = [
  { key: 'principal', location: 'Bodega Principal Centro', createdAt: daysAgo(220) },
  { key: 'norte', location: 'Bodega Norte Reparto', createdAt: daysAgo(215) },
  { key: 'fria', location: 'Cuarto Frio Lacteos', createdAt: daysAgo(210) },
  { key: 'ecommerce', location: 'Picking E-commerce', createdAt: daysAgo(205) },
]

const productTypeData = [
  { key: 'abarrotes', name: 'Abarrotes', description: 'Despensa basica y productos de alta rotacion', createdAt: daysAgo(220) },
  { key: 'bebidas_lacteos', name: 'Bebidas y Lacteos', description: 'Cafe, bebidas y refrigerados', createdAt: daysAgo(220) },
  { key: 'snacks', name: 'Snacks y Desayuno', description: 'Granolas, galletas y consumo rapido', createdAt: daysAgo(220) },
  { key: 'limpieza', name: 'Limpieza del Hogar', description: 'Aseo y mantenimiento domestico', createdAt: daysAgo(220) },
  { key: 'cuidado', name: 'Cuidado Personal', description: 'Higiene y cuidado diario', createdAt: daysAgo(220) },
]

const providerData = [
  { key: 'monteclaro', name: 'Distribuciones Monteclaro', description: 'Cafe, granos y desayunos', createdAt: daysAgo(220) },
  { key: 'caribefoods', name: 'Alimentos Caribe Foods', description: 'Despensa seca y conservas', createdAt: daysAgo(216) },
  { key: 'lacteosvalle', name: 'Lacteos del Valle SAS', description: 'Lacteos y refrigerados', createdAt: daysAgo(214) },
  { key: 'casalimpia', name: 'Casa Limpia Mayorista', description: 'Limpieza institucional y hogar', createdAt: daysAgo(212) },
  { key: 'cuidarte', name: 'Cuidarte Personal Care', description: 'Cuidado personal y belleza', createdAt: daysAgo(210) },
]

const tagData = [
  { key: 'premium', name: 'Premium', description: 'Linea de valor agregado', createdAt: daysAgo(220) },
  { key: 'rotacion', name: 'Rotacion Alta', description: 'Productos de mayor salida', createdAt: daysAgo(218) },
  { key: 'desayuno', name: 'Desayuno', description: 'Productos para desayuno y cafeterias', createdAt: daysAgo(216) },
  { key: 'hogar', name: 'Hogar', description: 'Aseo y consumo basico del hogar', createdAt: daysAgo(214) },
  { key: 'saludable', name: 'Saludable', description: 'Linea saludable y funcional', createdAt: daysAgo(212) },
  { key: 'mayorista', name: 'Mayorista', description: 'Productos con enfoque de volumen', createdAt: daysAgo(210) },
]

const productData = [
  {
    key: 'coffee',
    name: 'Cafe de Origen Sierra 340 g',
    brand: 'Monte Claro',
    description: 'Cafe molido de tueste medio para cafeterias, oficinas y hogar.',
    productTypeKey: 'bebidas_lacteos',
    providerKey: 'monteclaro',
    tagKeys: ['premium', 'desayuno', 'rotacion'],
    taxRate: 19,
    minimumStock: 14,
    maximumStock: 70,
    imageUrl: 'https://images.unsplash.com/photo-1447933601403-0c6688de566e?auto=format&fit=crop&w=1200&q=80',
    prices: [
      { alias: 'default', name: 'Precio mostrador', price: 28900, isDefault: true },
      { alias: 'mayorista', name: 'Precio mayorista', price: 26900, isDefault: false },
    ],
    priceHistory: [
      { alias: 'default', oldPrice: 27400, newPrice: 28900, reason: 'Ajuste por costo de origen', createdAt: daysAgo(45) },
    ],
    openingWarehouseKey: 'principal',
    openingQuantity: 52,
    createdAt: daysAgo(90),
  },
  {
    key: 'rice',
    name: 'Arroz Premium 5 kg',
    brand: 'Casa Grano',
    description: 'Arroz de alta rotacion para minimercados y negocios de comida.',
    productTypeKey: 'abarrotes',
    providerKey: 'caribefoods',
    tagKeys: ['rotacion', 'mayorista'],
    taxRate: 5,
    minimumStock: 25,
    maximumStock: 120,
    imageUrl: 'https://images.unsplash.com/photo-1586201375761-83865001e31c?auto=format&fit=crop&w=1200&q=80',
    prices: [
      { alias: 'default', name: 'Precio base', price: 21400, isDefault: true },
      { alias: 'mayorista', name: 'Precio caja', price: 19900, isDefault: false },
    ],
    priceHistory: [
      { alias: 'default', oldPrice: 20500, newPrice: 21400, reason: 'Actualizacion por proveedor', createdAt: daysAgo(38) },
    ],
    openingWarehouseKey: 'principal',
    openingQuantity: 90,
    createdAt: daysAgo(90),
  },
  {
    key: 'oil',
    name: 'Aceite Vegetal 900 ml',
    brand: 'Dorado',
    description: 'Aceite multiproposito para cocina comercial y hogar.',
    productTypeKey: 'abarrotes',
    providerKey: 'caribefoods',
    tagKeys: ['rotacion', 'mayorista'],
    taxRate: 19,
    minimumStock: 20,
    maximumStock: 90,
    imageUrl: 'https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?auto=format&fit=crop&w=1200&q=80',
    prices: [
      { alias: 'default', name: 'Precio base', price: 16700, isDefault: true },
      { alias: 'mayorista', name: 'Precio caja', price: 15400, isDefault: false },
    ],
    priceHistory: [
      { alias: 'default', oldPrice: 15900, newPrice: 16700, reason: 'Incremento de materia prima', createdAt: daysAgo(34) },
    ],
    openingWarehouseKey: 'principal',
    openingQuantity: 74,
    createdAt: daysAgo(90),
  },
  {
    key: 'pasta',
    name: 'Pasta Penne 500 g',
    brand: 'Trigo Vivo',
    description: 'Pasta seca para restaurantes, hogares y combos de despensa.',
    productTypeKey: 'abarrotes',
    providerKey: 'caribefoods',
    tagKeys: ['rotacion', 'mayorista'],
    taxRate: 19,
    minimumStock: 16,
    maximumStock: 75,
    imageUrl: 'https://images.unsplash.com/photo-1551462147-ff29053bfc14?auto=format&fit=crop&w=1200&q=80',
    prices: [
      { alias: 'default', name: 'Precio base', price: 6900, isDefault: true },
      { alias: 'mayorista', name: 'Precio food service', price: 6400, isDefault: false },
    ],
    priceHistory: [
      { alias: 'default', oldPrice: 6500, newPrice: 6900, reason: 'Nueva lista trimestral', createdAt: daysAgo(32) },
    ],
    openingWarehouseKey: 'norte',
    openingQuantity: 66,
    createdAt: daysAgo(90),
  },
  {
    key: 'cookies',
    name: 'Galletas de Avena 12 und',
    brand: 'Buen Horno',
    description: 'Producto de impulso para tiendas, cafeterias y domicilios.',
    productTypeKey: 'snacks',
    providerKey: 'monteclaro',
    tagKeys: ['desayuno', 'rotacion'],
    taxRate: 19,
    minimumStock: 12,
    maximumStock: 50,
    imageUrl: 'https://images.unsplash.com/photo-1499636136210-6f4ee915583e?auto=format&fit=crop&w=1200&q=80',
    prices: [
      { alias: 'default', name: 'Precio base', price: 8300, isDefault: true },
    ],
    priceHistory: [],
    openingWarehouseKey: 'ecommerce',
    openingQuantity: 36,
    createdAt: daysAgo(88),
  },
  {
    key: 'chocolate',
    name: 'Chocolate de Mesa 250 g',
    brand: 'Cacao Real',
    description: 'Tabletas para bebidas calientes y canal institucional.',
    productTypeKey: 'abarrotes',
    providerKey: 'caribefoods',
    tagKeys: ['desayuno', 'rotacion'],
    taxRate: 19,
    minimumStock: 14,
    maximumStock: 60,
    imageUrl: 'https://images.unsplash.com/photo-1511381939415-e44015466834?auto=format&fit=crop&w=1200&q=80',
    prices: [
      { alias: 'default', name: 'Precio base', price: 11900, isDefault: true },
    ],
    priceHistory: [],
    openingWarehouseKey: 'principal',
    openingQuantity: 48,
    createdAt: daysAgo(88),
  },
  {
    key: 'tuna',
    name: 'Atun en Agua 160 g',
    brand: 'Costa Azul',
    description: 'Conserva para retail y negocios de comida rapida.',
    productTypeKey: 'abarrotes',
    providerKey: 'caribefoods',
    tagKeys: ['rotacion', 'mayorista'],
    taxRate: 19,
    minimumStock: 18,
    maximumStock: 140,
    imageUrl: 'https://images.unsplash.com/photo-1510130387422-82bed34b37e9?auto=format&fit=crop&w=1200&q=80',
    prices: [
      { alias: 'default', name: 'Precio base', price: 7200, isDefault: true },
      { alias: 'foodservice', name: 'Precio restaurante', price: 6800, isDefault: false },
    ],
    priceHistory: [],
    openingWarehouseKey: 'principal',
    openingQuantity: 110,
    createdAt: daysAgo(86),
  },
  {
    key: 'milk',
    name: 'Leche Entera UHT 1 L',
    brand: 'Prado Blanco',
    description: 'Leche de alta rotacion para panaderias, cafes y hogares.',
    productTypeKey: 'bebidas_lacteos',
    providerKey: 'lacteosvalle',
    tagKeys: ['desayuno', 'rotacion'],
    taxRate: 5,
    minimumStock: 30,
    maximumStock: 160,
    imageUrl: 'https://images.unsplash.com/photo-1563636619-e9143da7973b?auto=format&fit=crop&w=1200&q=80',
    prices: [
      { alias: 'default', name: 'Precio base', price: 5600, isDefault: true },
      { alias: 'cafe', name: 'Precio cafeteria', price: 5200, isDefault: false },
    ],
    priceHistory: [
      { alias: 'default', oldPrice: 5300, newPrice: 5600, reason: 'Ajuste por cadena fria', createdAt: daysAgo(21) },
    ],
    openingWarehouseKey: 'fria',
    openingQuantity: 120,
    createdAt: daysAgo(86),
  },
  {
    key: 'granola',
    name: 'Granola Frutos Rojos 300 g',
    brand: 'Origen Mix',
    description: 'Producto premium para desayunos saludables y gift boxes.',
    productTypeKey: 'snacks',
    providerKey: 'monteclaro',
    tagKeys: ['premium', 'saludable', 'desayuno'],
    taxRate: 19,
    minimumStock: 10,
    maximumStock: 38,
    imageUrl: 'https://images.unsplash.com/photo-1515003197210-e0cd71810b5f?auto=format&fit=crop&w=1200&q=80',
    prices: [
      { alias: 'default', name: 'Precio base', price: 15400, isDefault: true },
      { alias: 'promo', name: 'Precio web', price: 14900, isDefault: false },
    ],
    priceHistory: [],
    openingWarehouseKey: 'ecommerce',
    openingQuantity: 18,
    createdAt: daysAgo(84),
  },
  {
    key: 'detergent',
    name: 'Detergente Liquido 2 L',
    brand: 'Casa Limpia',
    description: 'Detergente multiusos para canal institucional y hogar.',
    productTypeKey: 'limpieza',
    providerKey: 'casalimpia',
    tagKeys: ['hogar', 'rotacion', 'mayorista'],
    taxRate: 19,
    minimumStock: 12,
    maximumStock: 50,
    imageUrl: 'https://images.unsplash.com/photo-1583947582886-f40ec95dd752?auto=format&fit=crop&w=1200&q=80',
    prices: [
      { alias: 'default', name: 'Precio base', price: 25900, isDefault: true },
      { alias: 'mayorista', name: 'Precio institucional', price: 23800, isDefault: false },
    ],
    priceHistory: [
      { alias: 'default', oldPrice: 24600, newPrice: 25900, reason: 'Ajuste por empaque', createdAt: daysAgo(17) },
    ],
    openingWarehouseKey: 'principal',
    openingQuantity: 40,
    createdAt: daysAgo(84),
  },
  {
    key: 'paper',
    name: 'Papel Higienico 12 rollos',
    brand: 'Blanco Plus',
    description: 'Papel higienico para retail, oficinas y hoteles.',
    productTypeKey: 'limpieza',
    providerKey: 'casalimpia',
    tagKeys: ['hogar', 'mayorista'],
    taxRate: 19,
    minimumStock: 15,
    maximumStock: 42,
    imageUrl: 'https://images.unsplash.com/photo-1583947215259-38e31be8751f?auto=format&fit=crop&w=1200&q=80',
    prices: [
      { alias: 'default', name: 'Precio base', price: 18900, isDefault: true },
      { alias: 'hotel', name: 'Precio hotelero', price: 17500, isDefault: false },
    ],
    priceHistory: [],
    openingWarehouseKey: 'norte',
    openingQuantity: 32,
    createdAt: daysAgo(82),
  },
  {
    key: 'shampoo',
    name: 'Shampoo Hidratante 400 ml',
    brand: 'Cuidarte',
    description: 'Shampoo de uso diario para droguerias, salones y retail.',
    productTypeKey: 'cuidado',
    providerKey: 'cuidarte',
    tagKeys: ['hogar', 'premium'],
    taxRate: 19,
    minimumStock: 10,
    maximumStock: 34,
    imageUrl: 'https://images.unsplash.com/photo-1526947425960-945c6e72858f?auto=format&fit=crop&w=1200&q=80',
    prices: [
      { alias: 'default', name: 'Precio base', price: 18200, isDefault: true },
      { alias: 'salon', name: 'Precio salon', price: 16900, isDefault: false },
    ],
    priceHistory: [],
    openingWarehouseKey: 'norte',
    openingQuantity: 28,
    createdAt: daysAgo(80),
  },
]

const quoteData = [
  {
    key: 'quote_pendiente_drogueria',
    consecutive: 'COT-260531-001',
    clientKey: 'drogueria_vida',
    status: 'PENDIENTE',
    expiresAt: daysFromNow(8),
    createdAt: daysAgo(24, 9),
    items: [
      { productKey: 'shampoo', quantity: 10 },
      { productKey: 'paper', quantity: 6, priceAlias: 'hotel' },
    ],
  },
  {
    key: 'quote_aprobada_oficina',
    consecutive: 'COT-260606-002',
    clientKey: 'oficina_creativa',
    status: 'APROBADA',
    expiresAt: daysFromNow(5),
    createdAt: daysAgo(18, 11),
    items: [
      { productKey: 'coffee', quantity: 6 },
      { productKey: 'granola', quantity: 8, priceAlias: 'promo' },
    ],
  },
  {
    key: 'quote_convertida_colegio',
    consecutive: 'COT-260607-003',
    clientKey: 'colegio_rios',
    status: 'CONVERTIDA',
    expiresAt: daysAgo(10),
    createdAt: daysAgo(17, 10),
    items: [
      { productKey: 'milk', quantity: 28, priceAlias: 'cafe' },
      { productKey: 'cookies', quantity: 16 },
      { productKey: 'chocolate', quantity: 12 },
    ],
  },
  {
    key: 'quote_rechazada_ferreteria',
    consecutive: 'COT-260613-004',
    clientKey: 'ferreteria_faro',
    status: 'RECHAZADA',
    expiresAt: daysAgo(6),
    createdAt: daysAgo(11, 15),
    items: [
      { productKey: 'rice', quantity: 30, priceAlias: 'mayorista' },
      { productKey: 'oil', quantity: 20, priceAlias: 'mayorista' },
    ],
  },
  {
    key: 'quote_expirada_hotel',
    consecutive: 'COT-260617-005',
    clientKey: 'hotel_brisa',
    status: 'EXPIRADA',
    expiresAt: daysAgo(2),
    createdAt: daysAgo(7, 14),
    items: [
      { productKey: 'paper', quantity: 18, priceAlias: 'hotel' },
      { productKey: 'shampoo', quantity: 12, priceAlias: 'salon' },
    ],
  },
  {
    key: 'quote_pendiente_hogar',
    consecutive: 'COT-260621-006',
    clientKey: 'hogar_martinez',
    status: 'PENDIENTE',
    expiresAt: daysFromNow(4),
    createdAt: daysAgo(3, 16),
    items: [
      { productKey: 'milk', quantity: 8 },
      { productKey: 'cookies', quantity: 6 },
      { productKey: 'granola', quantity: 4 },
    ],
  },
]

const invoiceData = [
  {
    key: 'inv_001',
    consecutive: 'FAC-260503-001',
    clientKey: 'ferreteria_faro',
    status: 'ACTIVA',
    createdAt: daysAgo(52, 10),
    items: [
      { productKey: 'rice', quantity: 8, priceAlias: 'mayorista' },
      { productKey: 'oil', quantity: 6, priceAlias: 'mayorista' },
      { productKey: 'detergent', quantity: 4, priceAlias: 'mayorista' },
    ],
    incomeAccountKey: 'principal',
  },
  {
    key: 'inv_002',
    consecutive: 'FAC-260510-002',
    clientKey: 'panaderia_miguel',
    status: 'ACTIVA',
    createdAt: daysAgo(45, 11),
    items: [
      { productKey: 'coffee', quantity: 6 },
      { productKey: 'milk', quantity: 24, priceAlias: 'cafe' },
      { productKey: 'chocolate', quantity: 10 },
    ],
    incomeAccountKey: 'nequi',
    delivery: {
      address: 'Carrera 11 # 34-22',
      recipientName: 'Javier Molina',
      recipientPhone: '3008102201',
      notes: 'Entrega por muelle lateral',
      status: 'ENTREGADO',
      deliveredAt: daysAgo(44, 17),
    },
  },
  {
    key: 'inv_003',
    consecutive: 'FAC-260515-003',
    clientKey: 'hotel_brisa',
    status: 'ACTIVA',
    createdAt: daysAgo(40, 9),
    items: [
      { productKey: 'paper', quantity: 10, priceAlias: 'hotel' },
      { productKey: 'shampoo', quantity: 8, priceAlias: 'salon' },
      { productKey: 'detergent', quantity: 6, priceAlias: 'mayorista' },
    ],
    credit: {
      dueDate: daysFromNow(12),
      status: 'PENDIENTE',
      payments: [],
    },
  },
  {
    key: 'inv_004',
    consecutive: 'FAC-260520-004',
    clientKey: 'restaurante_puerto',
    status: 'ACTIVA',
    createdAt: daysAgo(35, 14),
    items: [
      { productKey: 'tuna', quantity: 24, priceAlias: 'foodservice' },
      { productKey: 'pasta', quantity: 18, priceAlias: 'mayorista' },
      { productKey: 'oil', quantity: 12, priceAlias: 'mayorista' },
    ],
    credit: {
      dueDate: addDays(daysAgo(35, 14), 30),
      status: 'PARCIAL',
      payments: [
        { amount: 300000, paidAt: daysAgo(22, 15), bankAccountKey: 'principal', notes: 'Abono inicial por transferencia' },
      ],
    },
  },
  {
    key: 'inv_005',
    consecutive: 'FAC-260525-005',
    clientKey: 'cafe_estacion',
    status: 'ACTIVA',
    createdAt: daysAgo(30, 10),
    items: [
      { productKey: 'coffee', quantity: 10, priceAlias: 'mayorista' },
      { productKey: 'cookies', quantity: 12 },
      { productKey: 'milk', quantity: 18, priceAlias: 'cafe' },
    ],
    credit: {
      dueDate: addDays(daysAgo(30, 10), 18),
      status: 'PAGADA',
      payments: [
        { amount: null, paidAt: daysAgo(16, 11), bankAccountKey: 'operativa', notes: 'Pago total en una sola consignacion' },
      ],
    },
  },
  {
    key: 'inv_006',
    consecutive: 'FAC-260529-006',
    clientKey: 'minimercado_palmas',
    status: 'ACTIVA',
    createdAt: daysAgo(26, 13),
    items: [
      { productKey: 'rice', quantity: 12, priceAlias: 'mayorista' },
      { productKey: 'granola', quantity: 10, priceAlias: 'promo' },
      { productKey: 'shampoo', quantity: 5 },
    ],
    credit: {
      dueDate: daysAgo(3),
      status: 'PENDIENTE',
      payments: [],
    },
  },
  {
    key: 'inv_007',
    consecutive: 'FAC-260601-007',
    clientKey: 'colegio_rios',
    status: 'ACTIVA',
    createdAt: daysAgo(23, 9),
    quoteKey: 'quote_convertida_colegio',
    items: [
      { productKey: 'milk', quantity: 28, priceAlias: 'cafe' },
      { productKey: 'cookies', quantity: 16 },
      { productKey: 'chocolate', quantity: 12 },
    ],
    incomeAccountKey: 'principal',
    delivery: {
      address: 'Carrera 8 # 30-12',
      recipientName: 'Gloria Velez',
      recipientPhone: '3008102202',
      notes: 'Recibe coordinacion academica',
      status: 'ENTREGADO',
      deliveredAt: daysAgo(22, 16),
    },
  },
  {
    key: 'inv_008',
    consecutive: 'FAC-260604-008',
    clientKey: 'drogueria_vida',
    status: 'ACTIVA',
    createdAt: daysAgo(20, 15),
    items: [
      { productKey: 'shampoo', quantity: 12, priceAlias: 'salon' },
      { productKey: 'paper', quantity: 8 },
      { productKey: 'granola', quantity: 6 },
    ],
    incomeAccountKey: 'nequi',
  },
  {
    key: 'inv_009',
    consecutive: 'FAC-260607-009',
    clientKey: 'oficina_creativa',
    status: 'ACTIVA',
    createdAt: daysAgo(17, 12),
    items: [
      { productKey: 'coffee', quantity: 8 },
      { productKey: 'granola', quantity: 10, priceAlias: 'promo' },
      { productKey: 'cookies', quantity: 14 },
    ],
    incomeAccountKey: 'principal',
  },
  {
    key: 'inv_010',
    consecutive: 'FAC-260610-010',
    clientKey: 'hogar_martinez',
    status: 'ACTIVA',
    createdAt: daysAgo(14, 10),
    items: [
      { productKey: 'milk', quantity: 10 },
      { productKey: 'pasta', quantity: 6 },
      { productKey: 'tuna', quantity: 8 },
    ],
    incomeAccountKey: 'nequi',
    delivery: {
      address: 'Urbanizacion Santa Maria Casa 18',
      recipientName: 'Hogar Martinez',
      recipientPhone: '3008102203',
      notes: 'Entrega despues de las 5 PM',
      status: 'EN_CAMINO',
      deliveredAt: null,
    },
  },
  {
    key: 'inv_011',
    consecutive: 'FAC-260613-011',
    clientKey: 'distribuidora_litoral',
    status: 'ACTIVA',
    createdAt: daysAgo(11, 11),
    items: [
      { productKey: 'rice', quantity: 20, priceAlias: 'mayorista' },
      { productKey: 'oil', quantity: 18, priceAlias: 'mayorista' },
      { productKey: 'detergent', quantity: 10, priceAlias: 'mayorista' },
      { productKey: 'paper', quantity: 12, priceAlias: 'hotel' },
    ],
    incomeAccountKey: 'operativa',
  },
  {
    key: 'inv_012',
    consecutive: 'FAC-260616-012',
    clientKey: 'laura_bustos',
    status: 'ACTIVA',
    createdAt: daysAgo(8, 16),
    items: [
      { productKey: 'coffee', quantity: 2 },
      { productKey: 'granola', quantity: 2 },
      { productKey: 'milk', quantity: 6 },
    ],
    incomeAccountKey: 'nequi',
  },
  {
    key: 'inv_013',
    consecutive: 'FAC-260619-013',
    clientKey: 'hotel_brisa',
    status: 'ANULADA',
    createdAt: daysAgo(5, 9),
    items: [
      { productKey: 'paper', quantity: 4 },
      { productKey: 'shampoo', quantity: 4 },
    ],
  },
  {
    key: 'inv_014',
    consecutive: 'FAC-260622-014',
    clientKey: 'restaurante_puerto',
    status: 'ACTIVA',
    createdAt: daysAgo(2, 13),
    items: [
      { productKey: 'tuna', quantity: 18, priceAlias: 'foodservice' },
      { productKey: 'pasta', quantity: 15, priceAlias: 'mayorista' },
      { productKey: 'oil', quantity: 10, priceAlias: 'mayorista' },
    ],
    incomeAccountKey: 'operativa',
    delivery: {
      address: 'Malecon Gastronimico Local 12',
      recipientName: 'Carolina Perez',
      recipientPhone: '3008102204',
      notes: 'Coordinar con chef principal',
      status: 'EN_PREPARACION',
      deliveredAt: null,
    },
  },
]

const offerData = [
  {
    name: 'Combo desayuno saludable',
    description: 'Aplica a cafe, leche y granola para compra cruzada.',
    discountType: 'PORCENTAJE',
    discountValue: 10,
    startsAt: daysAgo(20),
    endsAt: daysFromNow(15),
    minimumProductQuantity: 3,
    maximumProductQuantity: 20,
    isStackable: false,
    isActive: true,
    clientKeys: ['laura_bustos', 'hogar_martinez', 'oficina_creativa'],
    productKeys: ['coffee', 'milk', 'granola'],
    productTypeKeys: ['snacks', 'bebidas_lacteos'],
    tagKeys: ['desayuno', 'saludable'],
    createdAt: daysAgo(20),
  },
  {
    name: 'Mayorista despensa activa',
    description: 'Descuento por volumen para arroz, aceite, pasta y atun.',
    discountType: 'PORCENTAJE',
    discountValue: 7,
    startsAt: daysAgo(30),
    endsAt: daysFromNow(25),
    minimumProductQuantity: 10,
    maximumProductQuantity: 200,
    isStackable: true,
    isActive: true,
    clientKeys: ['ferreteria_faro', 'distribuidora_litoral', 'minimercado_palmas'],
    productKeys: ['rice', 'oil', 'pasta', 'tuna'],
    productTypeKeys: ['abarrotes'],
    tagKeys: ['mayorista', 'rotacion'],
    createdAt: daysAgo(30),
  },
  {
    name: 'Limpieza institucional junio',
    description: 'Monto fijo por canasta de detergente, papel y shampoo.',
    discountType: 'MONTO_FIJO',
    discountValue: 12000,
    startsAt: daysAgo(12),
    endsAt: daysFromNow(10),
    minimumProductQuantity: 4,
    maximumProductQuantity: 40,
    isStackable: false,
    isActive: true,
    clientKeys: ['hotel_brisa', 'drogueria_vida', 'salon_aurora'],
    productKeys: ['detergent', 'paper', 'shampoo'],
    productTypeKeys: ['limpieza', 'cuidado'],
    tagKeys: ['hogar'],
    createdAt: daysAgo(12),
  },
  {
    name: 'Oferta de temporada cerrada',
    description: 'Campana finalizada para mover inventario de snacks.',
    discountType: 'PORCENTAJE',
    discountValue: 12,
    startsAt: daysAgo(70),
    endsAt: daysAgo(40),
    minimumProductQuantity: 2,
    maximumProductQuantity: 20,
    isStackable: false,
    isActive: false,
    clientKeys: ['cafe_estacion'],
    productKeys: ['cookies', 'granola'],
    productTypeKeys: ['snacks'],
    tagKeys: ['desayuno'],
    createdAt: daysAgo(70),
  },
]

const bankAccountData = [
  {
    key: 'principal',
    name: 'Cuenta Principal',
    bankName: 'Bancolombia',
    accountNumber: '45800124567',
    accountType: 'Corriente',
    isActive: true,
    initialBalance: 8500000,
    createdAt: daysAgo(220),
  },
  {
    key: 'operativa',
    name: 'Cuenta Operativa',
    bankName: 'Davivienda',
    accountNumber: '00987451236',
    accountType: 'Ahorros',
    isActive: true,
    initialBalance: 3200000,
    createdAt: daysAgo(220),
  },
  {
    key: 'nequi',
    name: 'Nequi Recaudos',
    bankName: 'Nequi',
    accountNumber: '3009990001',
    accountType: 'Digital',
    isActive: true,
    initialBalance: 950000,
    createdAt: daysAgo(220),
  },
  {
    key: 'reserva',
    name: 'Cuenta Reserva',
    bankName: 'Banco de Bogota',
    accountNumber: '7744100021',
    accountType: 'Ahorros',
    isActive: false,
    initialBalance: 1800000,
    createdAt: daysAgo(220),
  },
]

async function main() {
  const summary = await prisma.$transaction(
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
          "InventoryMovement",
          "ProductWarehouse",
          "ProductTag",
          "Product",
          "Tag",
          "Provider",
          "ProductType",
          "Warehouse",
          "Referral",
          "User",
          "Client",
          "BankAccount"
        RESTART IDENTITY CASCADE
      `)

      const state = {
        clients: new Map(),
        warehouses: new Map(),
        productTypes: new Map(),
        providers: new Map(),
        tags: new Map(),
        products: new Map(),
        prices: new Map(),
        quotes: new Map(),
        invoices: new Map(),
        accounts: new Map(),
        balances: new Map(),
        stock: new Map(),
      }

      function setStock(productId, warehouseId, quantity) {
        const key = `${productId}:${warehouseId}`
        state.stock.set(key, quantity)
      }

      function getStock(productId, warehouseId) {
        const key = `${productId}:${warehouseId}`
        return state.stock.get(key) ?? 0
      }

      function changeStock(productId, warehouseId, quantityDelta) {
        const next = getStock(productId, warehouseId) + quantityDelta
        if (next < 0) {
          throw new Error(`Stock negativo para producto ${productId} en bodega ${warehouseId}`)
        }
        setStock(productId, warehouseId, next)
      }

      async function createBankMovement({ accountKey, type, amount, description, createdAt, invoiceId }) {
        const account = state.accounts.get(accountKey)
        if (!account) {
          throw new Error(`Cuenta bancaria no encontrada: ${accountKey}`)
        }

        const movement = await db.bankAccountMovement.create({
          data: {
            bankAccountId: account.id,
            movementType: type,
            amount,
            description,
            invoiceId,
            createdAt,
          },
        })

        const current = state.balances.get(account.id) ?? 0

        if (type === 'INGRESO' || type === 'TRANSFERENCIA_ENTRANTE') {
          state.balances.set(account.id, round2(current + amount))
        } else if (type === 'EGRESO' || type === 'TRANSFERENCIA_SALIENTE') {
          state.balances.set(account.id, round2(current - amount))
        }

        return movement
      }

      async function createBankAdjustment({ accountKey, targetBalance, description, createdAt }) {
        const account = state.accounts.get(accountKey)
        const current = state.balances.get(account.id) ?? 0
        const difference = round2(targetBalance - current)

        await db.bankAccountMovement.create({
          data: {
            bankAccountId: account.id,
            movementType: 'AJUSTE',
            amount: Math.abs(difference),
            description,
            createdAt,
          },
        })

        state.balances.set(account.id, round2(targetBalance))
      }

      async function createTransfer({ fromKey, toKey, amount, description, createdAt }) {
        await createBankMovement({
          accountKey: fromKey,
          type: 'TRANSFERENCIA_SALIENTE',
          amount,
          description,
          createdAt,
        })

        await createBankMovement({
          accountKey: toKey,
          type: 'TRANSFERENCIA_ENTRANTE',
          amount,
          description,
          createdAt: addDays(createdAt, 0),
        })
      }

      async function createInventoryMovement({ productKey, type, quantity, fromWarehouseKey, toWarehouseKey, reason, createdAt }) {
        const product = state.products.get(productKey)
        const fromWarehouse = fromWarehouseKey ? state.warehouses.get(fromWarehouseKey) : null
        const toWarehouse = toWarehouseKey ? state.warehouses.get(toWarehouseKey) : null

        if (type === 'ENTRADA' && toWarehouse) {
          changeStock(product.id, toWarehouse.id, quantity)
        }

        if (type === 'SALIDA' && fromWarehouse) {
          changeStock(product.id, fromWarehouse.id, -quantity)
        }

        if (type === 'TRASLADO' && fromWarehouse && toWarehouse) {
          changeStock(product.id, fromWarehouse.id, -quantity)
          changeStock(product.id, toWarehouse.id, quantity)
        }

        if (type === 'AJUSTE' && (fromWarehouse || toWarehouse)) {
          const targetWarehouse = toWarehouse ?? fromWarehouse
          const current = getStock(product.id, targetWarehouse.id)
          const next = toWarehouse ? current + quantity : current - quantity
          if (next < 0) {
            throw new Error(`Ajuste invalido para producto ${product.name}`)
          }
          setStock(product.id, targetWarehouse.id, next)
        }

        return db.inventoryMovement.create({
          data: {
            productId: product.id,
            fromWarehouseId: fromWarehouse?.id,
            toWarehouseId: toWarehouse?.id,
            quantity,
            movementType: type,
            reason,
            createdAt,
          },
        })
      }

      function buildCommercialItems(lines) {
        const items = lines.map((line) => {
          const product = state.products.get(line.productKey)
          const price = state.prices.get(`${line.productKey}:${line.priceAlias ?? 'default'}`)
          const unitPrice = Number(price.price)
          const taxRate = Number(product.taxRate)
          const subtotal = round2(unitPrice * line.quantity)
          const taxAmount = round2(subtotal * (taxRate / 100))
          const total = round2(subtotal + taxAmount)

          return {
            productId: product.id,
            productPriceId: price.id,
            quantity: line.quantity,
            unitPrice,
            taxRate,
            subtotal,
            taxAmount,
            total,
          }
        })

        const totals = items.reduce(
          (accumulator, item) => {
            accumulator.subtotal += item.subtotal
            accumulator.taxes += item.taxAmount
            accumulator.total += item.total
            return accumulator
          },
          { subtotal: 0, taxes: 0, total: 0 },
        )

        totals.subtotal = round2(totals.subtotal)
        totals.taxes = round2(totals.taxes)
        totals.total = round2(totals.total)

        return { items, totals }
      }

      for (const item of clientData) {
        const created = await db.client.create({
          data: {
            identification: item.identification,
            firstName: item.firstName,
            lastName: item.lastName,
            phone: item.phone,
            address: item.address,
            clientType: item.clientType,
            isActive: item.isActive ?? true,
            deletedAt: item.deletedAt ?? null,
            referralCode: item.referralCode,
            referralLevel: item.referralLevel ?? 0,
            createdAt: item.createdAt,
            updatedAt: item.createdAt,
          },
        })

        state.clients.set(item.key, created)
      }

      await db.referral.createMany({
        data: [
          {
            referrerClientId: state.clients.get('laura_bustos').id,
            referredClientId: state.clients.get('hogar_martinez').id,
            codeUsed: 'LAUR88',
            createdAt: daysAgo(90),
          },
          {
            referrerClientId: state.clients.get('cafe_estacion').id,
            referredClientId: state.clients.get('panaderia_miguel').id,
            codeUsed: 'CAFE77',
            createdAt: daysAgo(86),
          },
          {
            referrerClientId: state.clients.get('ferreteria_faro').id,
            referredClientId: state.clients.get('minimercado_palmas').id,
            codeUsed: 'FARO11',
            createdAt: daysAgo(80),
          },
        ],
      })

      for (const item of userData) {
        await db.user.create({
          data: {
            clientId: state.clients.get(item.clientKey).id,
            username: item.username,
            password: hashPassword(item.password),
            role: item.role,
            createdAt: item.createdAt,
            updatedAt: item.createdAt,
          },
        })
      }

      for (const item of warehouseData) {
        const created = await db.warehouse.create({
          data: {
            location: item.location,
            createdAt: item.createdAt,
            updatedAt: item.createdAt,
          },
        })

        state.warehouses.set(item.key, created)
      }

      for (const item of productTypeData) {
        const created = await db.productType.create({
          data: {
            name: item.name,
            description: item.description,
            createdAt: item.createdAt,
            updatedAt: item.createdAt,
          },
        })

        state.productTypes.set(item.key, created)
      }

      for (const item of providerData) {
        const created = await db.provider.create({
          data: {
            name: item.name,
            description: item.description,
            createdAt: item.createdAt,
            updatedAt: item.createdAt,
          },
        })

        state.providers.set(item.key, created)
      }

      for (const item of tagData) {
        const created = await db.tag.create({
          data: {
            name: item.name,
            description: item.description,
            createdAt: item.createdAt,
            updatedAt: item.createdAt,
          },
        })

        state.tags.set(item.key, created)
      }

      for (const item of bankAccountData) {
        const created = await db.bankAccount.create({
          data: {
            name: item.name,
            bankName: item.bankName,
            accountNumber: item.accountNumber,
            accountType: item.accountType,
            currentBalance: 0,
            isActive: item.isActive,
            createdAt: item.createdAt,
            updatedAt: item.createdAt,
          },
        })

        state.accounts.set(item.key, created)
        state.balances.set(created.id, 0)
      }

      for (const account of bankAccountData) {
        await createBankAdjustment({
          accountKey: account.key,
          targetBalance: account.initialBalance,
          description: 'Saldo inicial de apertura',
          createdAt: daysAgo(120, 8),
        })
      }

      for (const item of productData) {
        const createdProduct = await db.product.create({
          data: {
            productTypeId: state.productTypes.get(item.productTypeKey).id,
            providerId: state.providers.get(item.providerKey).id,
            name: item.name,
            description: item.description,
            taxRate: item.taxRate,
            brand: item.brand,
            minimumStock: item.minimumStock,
            maximumStock: item.maximumStock,
            imageUrl: item.imageUrl,
            createdAt: item.createdAt,
            updatedAt: item.createdAt,
          },
        })

        state.products.set(item.key, createdProduct)

        for (const price of item.prices) {
          const createdPrice = await db.productPrice.create({
            data: {
              productId: createdProduct.id,
              name: price.name,
              price: price.price,
              isDefault: price.isDefault,
              isActive: true,
              startsAt: subtractDays(item.createdAt, 5),
              createdAt: item.createdAt,
              updatedAt: item.createdAt,
            },
          })

          state.prices.set(`${item.key}:${price.alias}`, createdPrice)
        }

        if (item.tagKeys.length) {
          await db.productTag.createMany({
            data: item.tagKeys.map((tagKey) => ({
              productId: createdProduct.id,
              tagId: state.tags.get(tagKey).id,
            })),
          })
        }

        for (const history of item.priceHistory) {
          await db.productPriceHistory.create({
            data: {
              productPriceId: state.prices.get(`${item.key}:${history.alias}`).id,
              oldPrice: history.oldPrice,
              newPrice: history.newPrice,
              reason: history.reason,
              createdAt: history.createdAt,
            },
          })
        }

        await createInventoryMovement({
          productKey: item.key,
          type: 'ENTRADA',
          quantity: item.openingQuantity,
          toWarehouseKey: item.openingWarehouseKey,
          reason: 'Carga inicial de inventario',
          createdAt: subtractDays(item.createdAt, 1),
        })
      }

      await createInventoryMovement({
        productKey: 'coffee',
        type: 'TRASLADO',
        quantity: 14,
        fromWarehouseKey: 'principal',
        toWarehouseKey: 'ecommerce',
        reason: 'Abastecimiento de pedidos web',
        createdAt: daysAgo(21, 9),
      })
      await createInventoryMovement({
        productKey: 'rice',
        type: 'SALIDA',
        quantity: 26,
        fromWarehouseKey: 'principal',
        reason: 'Despacho de volumen al canal mayorista',
        createdAt: daysAgo(18, 17),
      })
      await createInventoryMovement({
        productKey: 'rice',
        type: 'ENTRADA',
        quantity: 12,
        toWarehouseKey: 'principal',
        reason: 'Reposicion del proveedor semanal',
        createdAt: daysAgo(8, 8),
      })
      await createInventoryMovement({
        productKey: 'oil',
        type: 'TRASLADO',
        quantity: 10,
        fromWarehouseKey: 'principal',
        toWarehouseKey: 'norte',
        reason: 'Reparto para ruta norte',
        createdAt: daysAgo(15, 10),
      })
      await createInventoryMovement({
        productKey: 'milk',
        type: 'ENTRADA',
        quantity: 24,
        toWarehouseKey: 'fria',
        reason: 'Recepcion de lote refrigerado',
        createdAt: daysAgo(12, 7),
      })
      await createInventoryMovement({
        productKey: 'milk',
        type: 'SALIDA',
        quantity: 18,
        fromWarehouseKey: 'fria',
        reason: 'Cadena de pedidos institucionales',
        createdAt: daysAgo(5, 18),
      })
      await createInventoryMovement({
        productKey: 'granola',
        type: 'AJUSTE',
        quantity: 12,
        fromWarehouseKey: 'ecommerce',
        reason: 'Ajuste por rotura y muestras comerciales',
        createdAt: daysAgo(4, 16),
      })
      await createInventoryMovement({
        productKey: 'paper',
        type: 'TRASLADO',
        quantity: 8,
        fromWarehouseKey: 'norte',
        toWarehouseKey: 'principal',
        reason: 'Redistribucion para entregas urbanas',
        createdAt: daysAgo(10, 11),
      })
      await createInventoryMovement({
        productKey: 'paper',
        type: 'SALIDA',
        quantity: 11,
        fromWarehouseKey: 'norte',
        reason: 'Salida para hoteleria',
        createdAt: daysAgo(3, 14),
      })
      await createInventoryMovement({
        productKey: 'shampoo',
        type: 'SALIDA',
        quantity: 13,
        fromWarehouseKey: 'norte',
        reason: 'Venta a canal droguerias',
        createdAt: daysAgo(7, 12),
      })
      await createInventoryMovement({
        productKey: 'detergent',
        type: 'AJUSTE',
        quantity: 18,
        fromWarehouseKey: 'principal',
        reason: 'Conteo fisico y merma operativa',
        createdAt: daysAgo(2, 15),
      })
      await createInventoryMovement({
        productKey: 'tuna',
        type: 'TRASLADO',
        quantity: 20,
        fromWarehouseKey: 'principal',
        toWarehouseKey: 'norte',
        reason: 'Abastecimiento para clientes food service',
        createdAt: daysAgo(6, 10),
      })

      for (const [stockKey, quantity] of state.stock.entries()) {
        if (quantity <= 0) continue

        const [productId, warehouseId] = stockKey.split(':').map(Number)
        await db.productWarehouse.create({
          data: { productId, warehouseId, quantity },
        })
      }

      for (const item of quoteData) {
        const commercial = buildCommercialItems(item.items)

        const created = await db.quote.create({
          data: {
            consecutive: item.consecutive,
            clientId: state.clients.get(item.clientKey).id,
            subtotal: commercial.totals.subtotal,
            taxes: commercial.totals.taxes,
            total: commercial.totals.total,
            status: item.status,
            expiresAt: item.expiresAt,
            createdAt: item.createdAt,
            updatedAt: item.createdAt,
            items: {
              create: commercial.items,
            },
          },
        })

        state.quotes.set(item.key, created)
      }

      for (const item of invoiceData) {
        const commercial = buildCommercialItems(item.items)

        const created = await db.invoice.create({
          data: {
            consecutive: item.consecutive,
            quoteId: item.quoteKey ? state.quotes.get(item.quoteKey).id : null,
            clientId: state.clients.get(item.clientKey).id,
            subtotal: commercial.totals.subtotal,
            taxes: commercial.totals.taxes,
            total: commercial.totals.total,
            status: item.status,
            createdAt: item.createdAt,
            updatedAt: item.createdAt,
            items: {
              create: commercial.items,
            },
          },
          include: { items: true, client: true },
        })

        state.invoices.set(item.key, created)

        if (item.incomeAccountKey) {
          await createBankMovement({
            accountKey: item.incomeAccountKey,
            type: 'INGRESO',
            amount: Number(created.total),
            description: `Recaudo factura ${created.consecutive}`,
            createdAt: addDays(item.createdAt, 1),
            invoiceId: created.id,
          })
        }

        if (item.delivery) {
          await db.delivery.create({
            data: {
              invoiceId: created.id,
              address: item.delivery.address,
              recipientName: item.delivery.recipientName,
              recipientPhone: item.delivery.recipientPhone,
              notes: item.delivery.notes,
              status: item.delivery.status,
              deliveredAt: item.delivery.deliveredAt,
              createdAt: addDays(item.createdAt, 1),
              updatedAt: item.delivery.deliveredAt ?? addDays(item.createdAt, 1),
            },
          })
        }
      }

      for (const item of offerData) {
        const created = await db.offer.create({
          data: {
            name: item.name,
            description: item.description,
            discountType: item.discountType,
            discountValue: item.discountValue,
            startsAt: item.startsAt,
            endsAt: item.endsAt,
            minimumProductQuantity: item.minimumProductQuantity,
            maximumProductQuantity: item.maximumProductQuantity,
            isStackable: item.isStackable,
            isActive: item.isActive,
            createdAt: item.createdAt,
            updatedAt: item.createdAt,
          },
        })

        if (item.clientKeys.length) {
          await db.offerClient.createMany({
            data: item.clientKeys.map((key) => ({
              offerId: created.id,
              clientId: state.clients.get(key).id,
            })),
          })
        }

        if (item.productKeys.length) {
          await db.offerProduct.createMany({
            data: item.productKeys.map((key) => ({
              offerId: created.id,
              productId: state.products.get(key).id,
            })),
          })
        }

        if (item.productTypeKeys.length) {
          await db.offerProductType.createMany({
            data: item.productTypeKeys.map((key) => ({
              offerId: created.id,
              productTypeId: state.productTypes.get(key).id,
            })),
          })
        }

        if (item.tagKeys.length) {
          await db.offerTag.createMany({
            data: item.tagKeys.map((key) => ({
              offerId: created.id,
              tagId: state.tags.get(key).id,
            })),
          })
        }
      }

      for (const item of invoiceData.filter((invoice) => invoice.credit)) {
        const invoice = state.invoices.get(item.key)
        const totalAmount = Number(invoice.total)
        let paidAmount = 0

        const createdCredit = await db.invoiceCredit.create({
          data: {
            invoiceId: invoice.id,
            dueDate: item.credit.dueDate,
            totalAmount,
            paidAmount: 0,
            balance: totalAmount,
            status: item.credit.status,
            createdAt: addDays(item.createdAt, 1),
            updatedAt: addDays(item.createdAt, 1),
          },
        })

        for (const payment of item.credit.payments) {
          const paymentAmount = payment.amount ?? totalAmount
          let bankMovementId = null

          if (payment.bankAccountKey) {
            const movement = await createBankMovement({
              accountKey: payment.bankAccountKey,
              type: 'INGRESO',
              amount: paymentAmount,
              description: `Pago credito ${invoice.consecutive}`,
              createdAt: payment.paidAt,
              invoiceId: invoice.id,
            })

            bankMovementId = movement.id
          }

          await db.creditPayment.create({
            data: {
              invoiceCreditId: createdCredit.id,
              amount: paymentAmount,
              notes: payment.notes,
              bankMovementId,
              paidAt: payment.paidAt,
            },
          })

          paidAmount = round2(paidAmount + paymentAmount)
        }

        const balance = round2(totalAmount - paidAmount)
        const status =
          balance === 0
            ? 'PAGADA'
            : item.credit.status === 'PARCIAL'
              ? 'PARCIAL'
              : item.credit.status

        await db.invoiceCredit.update({
          where: { id: createdCredit.id },
          data: {
            paidAmount,
            balance,
            status,
            updatedAt: item.credit.payments.length
              ? item.credit.payments[item.credit.payments.length - 1].paidAt
              : addDays(item.createdAt, 1),
          },
        })
      }

      await createBankMovement({
        accountKey: 'principal',
        type: 'EGRESO',
        amount: 2200000,
        description: 'Pago arriendo bodega principal',
        createdAt: daysAgo(33, 18),
      })
      await createBankMovement({
        accountKey: 'operativa',
        type: 'EGRESO',
        amount: 1650000,
        description: 'Anticipo a proveedor alimentos secos',
        createdAt: daysAgo(22, 16),
      })
      await createBankMovement({
        accountKey: 'nequi',
        type: 'EGRESO',
        amount: 450000,
        description: 'Pauta digital y promocion redes',
        createdAt: daysAgo(14, 12),
      })
      await createBankMovement({
        accountKey: 'principal',
        type: 'EGRESO',
        amount: 320000,
        description: 'Servicio de internet y telefonia',
        createdAt: daysAgo(6, 9),
      })
      await createBankMovement({
        accountKey: 'operativa',
        type: 'EGRESO',
        amount: 280000,
        description: 'Mantenimiento de vehiculo de reparto',
        createdAt: daysAgo(11, 17),
      })
      await createBankMovement({
        accountKey: 'principal',
        type: 'EGRESO',
        amount: 180000,
        description: 'Compra de insumos de oficina',
        createdAt: daysAgo(10, 13),
      })

      await createTransfer({
        fromKey: 'principal',
        toKey: 'operativa',
        amount: 1200000,
        description: 'Traslado para pagos operativos de tesoreria',
        createdAt: daysAgo(18, 10),
      })
      await createTransfer({
        fromKey: 'nequi',
        toKey: 'principal',
        amount: 250000,
        description: 'Concentracion de recaudos digitales',
        createdAt: daysAgo(8, 18),
      })
      await createBankAdjustment({
        accountKey: 'nequi',
        targetBalance: round2((state.balances.get(state.accounts.get('nequi').id) ?? 0) + 35000),
        description: 'Ajuste de conciliacion por comisiones del canal digital',
        createdAt: daysAgo(2, 18),
      })

      for (const account of state.accounts.values()) {
        await db.bankAccount.update({
          where: { id: account.id },
          data: { currentBalance: round2(state.balances.get(account.id) ?? 0) },
        })
      }

      const counts = {
        clients: await db.client.count(),
        users: await db.user.count(),
        referrals: await db.referral.count(),
        warehouses: await db.warehouse.count(),
        productTypes: await db.productType.count(),
        providers: await db.provider.count(),
        tags: await db.tag.count(),
        products: await db.product.count(),
        productPrices: await db.productPrice.count(),
        productPriceHistory: await db.productPriceHistory.count(),
        productTags: await db.productTag.count(),
        productWarehouses: await db.productWarehouse.count(),
        inventoryMovements: await db.inventoryMovement.count(),
        quotes: await db.quote.count(),
        quoteItems: await db.quoteItem.count(),
        invoices: await db.invoice.count(),
        invoiceItems: await db.invoiceItem.count(),
        deliveries: await db.delivery.count(),
        credits: await db.invoiceCredit.count(),
        creditPayments: await db.creditPayment.count(),
        offers: await db.offer.count(),
        offerClients: await db.offerClient.count(),
        offerProducts: await db.offerProduct.count(),
        offerProductTypes: await db.offerProductType.count(),
        offerTags: await db.offerTag.count(),
        bankAccounts: await db.bankAccount.count(),
        bankMovements: await db.bankAccountMovement.count(),
      }

      const sampleInvoices = await db.invoice.findMany({
        select: { consecutive: true, total: true, status: true, createdAt: true },
        orderBy: { createdAt: 'asc' },
      })

      const sampleProducts = await db.product.findMany({
        select: { name: true, imageUrl: true },
        orderBy: { id: 'asc' },
      })

      return {
        counts,
        sampleInvoices,
        sampleProducts,
      }
    },
    { timeout: 120000, maxWait: 10000 },
  )

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
