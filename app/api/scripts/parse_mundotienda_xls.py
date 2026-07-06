#!/usr/bin/env python3
import argparse
import json
import math
import os
import re
import sys
import unicodedata
from collections import Counter

import xlrd


if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')


SOURCE_FILE = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(__file__)))),
    'PRODUCTOR MUNDOTIENDA.XLS',
)

SOURCE_DATE = '2026-06-25'
SOURCE_NAME = 'PRODUCTOR MUNDOTIENDA.XLS'
DEFAULT_BRAND = 'Mundo Tienda'

ACCENT_REPAIRS = str.maketrans(
    {
        'À': 'Á',
        'È': 'É',
        'Ì': 'Í',
        'Ò': 'Ó',
        'Ù': 'Ú',
        'à': 'á',
        'è': 'é',
        'ì': 'í',
        'ò': 'ó',
        'ù': 'ú',
    }
)

WORD_REPAIRS = {
    'AXÍON': 'AXION',
    'AXIÓN': 'AXION',
    'AXIÓN': 'AXION',
    'JOHNSON´S': "JOHNSON'S",
    'KLAREN´S': "KLAREN'S",
}

IMAGE_URLS = {
    'Abarrotes y Granos': 'https://images.unsplash.com/photo-1586201375761-83865001e31c?auto=format&fit=crop&w=1200&q=80',
    'Bebidas': 'https://images.unsplash.com/photo-1544145945-f90425340c7e?auto=format&fit=crop&w=1200&q=80',
    'Carnes y Pescados': 'https://images.unsplash.com/photo-1607623814075-e51df1bdc82f?auto=format&fit=crop&w=1200&q=80',
    'Condimentos y Salsas': 'https://images.unsplash.com/photo-1509358271058-acd22cc93898?auto=format&fit=crop&w=1200&q=80',
    'Cuidado Personal': 'https://images.unsplash.com/photo-1526947425960-945c6e72858f?auto=format&fit=crop&w=1200&q=80',
    'Desechables y Empaques': 'https://images.unsplash.com/photo-1615485290382-441e4d049cb5?auto=format&fit=crop&w=1200&q=80',
    'Ferreteria y Electricos': 'https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&w=1200&q=80',
    'Frutas y Verduras': 'https://images.unsplash.com/photo-1610832958506-aa56368176cf?auto=format&fit=crop&w=1200&q=80',
    'Lacteos y Huevos': 'https://images.unsplash.com/photo-1563636619-e9143da7973b?auto=format&fit=crop&w=1200&q=80',
    'Limpieza del Hogar': 'https://images.unsplash.com/photo-1583947582886-f40ec95dd752?auto=format&fit=crop&w=1200&q=80',
    'Mascotas y Veterinaria': 'https://images.unsplash.com/photo-1587300003388-59208cc962cb?auto=format&fit=crop&w=1200&q=80',
    'Panaderia y Reposteria': 'https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=1200&q=80',
    'Papeleria y Hogar': 'https://images.unsplash.com/photo-1517842645767-c639042777db?auto=format&fit=crop&w=1200&q=80',
    'Snacks y Dulces': 'https://images.unsplash.com/photo-1499636136210-6f4ee915583e?auto=format&fit=crop&w=1200&q=80',
    'Utensilios y Cocina': 'https://images.unsplash.com/photo-1517705008128-361805f42e86?auto=format&fit=crop&w=1200&q=80',
}

TYPE_RULES = [
    (
        'Ferreteria y Electricos',
        [
            'BOMBILLO',
            'EXTENSION',
            'ENCHUFE',
            'CABLE',
            'PILA',
            'BATERIA',
            'FOCO',
            'LINTERNA',
            'TOMA',
            'SWITCH',
            'CINTA AISLANTE',
            'CLAVO',
            'TORNILLO',
            'PEGA RATA',
            'MOUSE',
        ],
    ),
    (
        'Frutas y Verduras',
        [
            'PAPA',
            'YUCA',
            'PLATANO',
            'BANANO',
            'CEBOLLA',
            'TOMATE',
            'AJO',
            'LIMON',
            'NARANJA',
            'MANZANA',
            'PEPINO',
            'ZANAHORIA',
            'AGUACATE',
            'MAZORCA',
            'LECHUGA',
            'CILANTRO',
            'PIMENTON',
            'REPOLLO',
            'CEBOLLIN',
            'LULO',
            'GUAYABA',
            'REMOLACHA',
            'AJI',
        ],
    ),
    (
        'Limpieza del Hogar',
        [
            'ESCOBA',
            'TRAPERO',
            'CEPILLO',
            'DETERGENTE',
            'JABON',
            'CLORO',
            'DESINFECT',
            'SUAVIZANTE',
            'AMBIENTADOR',
            'BRILLO',
            'LAVALOZA',
            'INSECTICIDA',
            'BASURA',
            'ESCOBILLON',
            'ESPONJA',
        ],
    ),
    (
        'Cuidado Personal',
        [
            'SHAMPOO',
            'CREMA DENTAL',
            'DESODORANTE',
            'JABON DE TOCADOR',
            'TALCO',
            'PANAL',
            'TOALLA HIGIENICA',
            'AFEITAR',
            'LOCION',
            'COLONIA',
            'ACONDICIONADOR',
            'ENJUAGUE BUCAL',
            'PAPEL HIGIENICO',
            'TOALLA HUMEDA',
        ],
    ),
    (
        'Lacteos y Huevos',
        [
            'LECHE',
            'QUESO',
            'YOGUR',
            'YOGURT',
            'MANTEQUILLA',
            'MARGARINA',
            'HUEVO',
            'HUEVOS',
            'SUERO',
            'KUMIS',
        ],
    ),
    (
        'Carnes y Pescados',
        [
            'POLLO',
            'CARNE',
            'CERDO',
            'RES',
            'PESCADO',
            'ATUN',
            'SARDINA',
            'HIGADO',
            'CODILLO',
            'COSTILLA',
            'MOLIDA',
            'PECHUGA',
            'CHORIZO',
            'SALCHICHA',
            'TOCINO',
            'MORTADELA',
            'JAMON',
        ],
    ),
    (
        'Condimentos y Salsas',
        [
            'SALSA',
            'MAYONESA',
            'MOSTAZA',
            'VINAGRE',
            'CONDIMENTO',
            'COMINO',
            'CANELA',
            'CLAVOS DE OLOR',
            'PIMIENTA',
            'OREGANO',
            'AJO EN POLVO',
            'COLOR',
            'CURRY',
            'CALDO',
            'SABORIZANTE',
        ],
    ),
    (
        'Panaderia y Reposteria',
        [
            'HARINA',
            'LEVADURA',
            'CHOCOLATE',
            'PAN',
            'GALLETA',
            'BIZCOCHO',
            'AVENA',
            'MAIZENA',
            'AREPA',
            'PONQUE',
            'TORTA',
            'REPOSTER',
            'MAICENA',
        ],
    ),
    (
        'Snacks y Dulces',
        [
            'DULCE',
            'BOMBON',
            'CHICLE',
            'CONFITE',
            'GOMA',
            'MANI',
            'PAPITA',
            'SNACK',
            'HELADO',
            'PALETA',
            'CARAMELO',
            'GALLETA',
            'BARRA',
        ],
    ),
    (
        'Bebidas',
        [
            'GASEOSA',
            'JUGO',
            'AGUA',
            'BEBIDA',
            'ENERGIZANTE',
            'REFRESCO',
            'TE',
            'CAFÉ',
            'CAFE',
            'MALTA',
            'CERVEZA',
            'RON',
            'WHISKY',
            'VINO',
        ],
    ),
    (
        'Desechables y Empaques',
        [
            'VASO',
            'PLATO',
            'CUCHARA',
            'TENEDOR',
            'SERVILLETA',
            'BOLSA',
            'ALUMINIO',
            'VINILPEL',
            'ICOPOR',
            'EMPAQUE',
            'PITILLO',
            'DESECHABLE',
        ],
    ),
    (
        'Utensilios y Cocina',
        [
            'OLLA',
            'SARTEN',
            'CUCHILLO',
            'VASIJA',
            'TAZA',
            'PLASTICO',
            'RECIPIENTE',
            'TERMICO',
            'COCINA',
            'ESPATULA',
            'COLADOR',
        ],
    ),
    (
        'Mascotas y Veterinaria',
        [
            'PERRO',
            'GATO',
            'MASCOTA',
            'VETERIN',
            'ALIMENTO CANINO',
            'ALIMENTO FELINO',
            'CONCENTRADO',
            'PURINA',
            'SUPERCAN',
            'DOG CHOW',
            'CAT CHOW',
        ],
    ),
    (
        'Papeleria y Hogar',
        [
            'CUADERNO',
            'LAPIZ',
            'BORRADOR',
            'CARTULINA',
            'PAPEL',
            'PEGANTE',
            'SILICONA',
            'MARCADOR',
            'RESALTADOR',
            'LIBRETA',
            'CARPETA',
        ],
    ),
]

LIQUID_KEYWORDS = (
    'ACEITE',
    'VINAGRE',
    'CLORO',
    'SUAVIZANTE',
    'DESINFECT',
    'AMBIENTADOR',
    'JUGO',
    'AGUA',
    'BEBIDA',
    'ESENCIA',
    'MIEL',
    'MELAZA',
    'SABILA',
)

WEIGHT_KEYWORDS = (
    'A GRANEL',
    'HIGADO',
    'CODILLO',
    'CARNE',
    'POLLO',
    'CERDO',
    'RES',
    'PESCADO',
    'QUESO',
)


def clean_text(value):
    text = str(value or '').strip()
    text = re.sub(r'\s+', ' ', text)
    text = repair_text(text)
    return text


def repair_text(text):
    if not text:
        return text

    normalized = text.translate(ACCENT_REPAIRS).replace('º', '°')
    normalized = normalized.replace('´S', "'S").replace('´s', "'s")
    normalized = re.sub(
        r'([AEIOUaeiou])´(?=\b)',
        lambda match: {
            'A': 'Á',
            'E': 'É',
            'I': 'Í',
            'O': 'Ó',
            'U': 'Ú',
            'a': 'á',
            'e': 'é',
            'i': 'í',
            'o': 'ó',
            'u': 'ú',
        }[match.group(1)],
        normalized,
    )
    normalized = re.sub(r'(?<=\d)°(?=[A-Za-z])', '', normalized)

    for source, target in WORD_REPAIRS.items():
        normalized = normalized.replace(source, target)

    return normalized


def normalize_match_text(value):
    text = clean_text(value).upper().replace('�', 'I')
    text = unicodedata.normalize('NFD', text)
    text = ''.join(char for char in text if unicodedata.category(char) != 'Mn')
    text = re.sub(r'[^A-Z0-9]+', ' ', text)
    return f' {re.sub(r"\s+", " ", text).strip()} '


def normalize_code(value):
    if isinstance(value, float):
        if value.is_integer():
            return str(int(value))
        return format(value, '.4f').rstrip('0').rstrip('.')
    return clean_text(value)


def normalize_amount(value):
    if not isinstance(value, (int, float)):
        return 0
    normalized = round(float(value), 2)
    if normalized < 0:
        return 0
    return normalized


def looks_like_data_row(row):
    description = clean_text(row[2]).upper()
    if not description or description == "''":
        return False

    joined = ' '.join(clean_text(value) for value in row if clean_text(value))
    if 'REPORTE DE PRODUCTOS' in joined.upper():
        return False
    if 'TIPO PROD.' in joined.upper():
        return False
    if 'SUB TOTAL DE PRODUCTOS' in joined.upper():
        return False
    if 'TOTAL DE PRODUCTOS' in joined.upper():
        return False
    if description.startswith('DESCRIP'):
        return False

    return isinstance(row[10], (int, float)) and float(row[10]) > 0


def classify_product_type(name):
    match_text = normalize_match_text(name)
    for product_type, keywords in TYPE_RULES:
        if any(f' {normalize_match_text(keyword).strip()} ' in match_text for keyword in keywords):
            return product_type

    return 'Abarrotes y Granos'


def infer_unit(name, stock):
    upper_name = name.upper()
    has_fractional_stock = abs(float(stock) - round(float(stock))) > 0.001
    is_liquid = any(keyword in upper_name for keyword in LIQUID_KEYWORDS)
    is_weighted = any(keyword in upper_name for keyword in WEIGHT_KEYWORDS)

    if 'A GRANEL' in upper_name or (has_fractional_stock and (is_weighted or is_liquid)):
        if is_liquid:
            return 'L'
        return 'KG'

    if has_fractional_stock and not upper_name.endswith('UND'):
        return 'KG'

    return 'UND'


def normalize_stock(value):
    if not isinstance(value, (int, float)):
        return 0

    numeric = float(value)
    if numeric <= 0:
        return 0
    if abs(numeric - round(numeric)) <= 0.001:
        return int(round(numeric))
    return int(math.ceil(numeric))


def build_description(code, source_stock, source_cost):
    parts = []
    if code:
        parts.append(f'Codigo origen: {code}.')
    parts.append(f'Stock origen: {source_stock}.')
    parts.append(f'Costo unitario origen: {source_cost}.')
    parts.append(f'Importado desde {SOURCE_NAME} ({SOURCE_DATE}).')
    return ' '.join(parts)


def parse_products(file_path):
    workbook = xlrd.open_workbook(file_path)
    sheet = workbook.sheet_by_index(0)
    products = []

    for row_index in range(sheet.nrows):
        row = sheet.row_values(row_index)
        if not looks_like_data_row(row):
            continue

        code = normalize_code(row[0])
        name = clean_text(row[2]).upper()
        cost = normalize_amount(row[6])
        raw_stock = float(row[7]) if isinstance(row[7], (int, float)) else 0
        price1 = normalize_amount(row[10])
        price2 = normalize_amount(row[12])
        price3 = normalize_amount(row[14])

        product_type = classify_product_type(name)
        unit = infer_unit(name, raw_stock)
        stock = normalize_stock(raw_stock)
        prices = []

        for label, value in (
            ('Precio 1', price1),
            ('Precio 2', price2),
            ('Precio 3', price3),
        ):
            if value <= 0:
                continue
            prices.append(
                {
                    'name': label,
                    'price': value,
                    'unit': unit,
                    'quantity': 1,
                    'isDefault': label == 'Precio 1',
                }
            )

        if not prices:
            continue

        products.append(
            {
                'code': code,
                'name': name,
                'brand': DEFAULT_BRAND,
                'description': build_description(code, raw_stock, cost),
                'productType': product_type,
                'unit': unit,
                'taxRate': 0,
                'minimumStock': 0,
                'maximumStock': None,
                'stock': stock,
                'sourceStock': raw_stock,
                'imageUrl': IMAGE_URLS[product_type],
                'cost': {
                    'cost': cost,
                    'unit': unit,
                    'quantity': 1,
                },
                'prices': prices,
            }
        )

    return products


def build_summary(products):
    product_types = Counter(product['productType'] for product in products)
    units = Counter(product['unit'] for product in products)
    stocked = sum(1 for product in products if product['stock'] > 0)

    return {
        'sourceFile': SOURCE_NAME,
        'sourceDate': SOURCE_DATE,
        'productCount': len(products),
        'stockedProducts': stocked,
        'productTypes': dict(sorted(product_types.items())),
        'units': dict(sorted(units.items())),
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--file', default=SOURCE_FILE)
    parser.add_argument('--summary', action='store_true')
    args = parser.parse_args()

    if not os.path.exists(args.file):
        print(json.dumps({'error': f'No existe el archivo: {args.file}'}))
        sys.exit(1)

    products = parse_products(args.file)

    if args.summary:
        print(json.dumps(build_summary(products), ensure_ascii=False, indent=2))
        return

    print(json.dumps(products, ensure_ascii=False))


if __name__ == '__main__':
    main()
