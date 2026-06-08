// Generador de un .xlsx de ejemplo para probar el IMPORTADOR de productos.
// Replica EXACTAMENTE el formato/orden de la plantilla nueva (Fase 12).
const path = require('path');
const ExcelJS = require(require.resolve('exceljs', { paths: ['./apps/api'] }));

// Bodegas objetivo (coinciden con la siembra: Bodega / Tienda / Mercado libre).
// Por cada bodega van 2 columnas: "Stock bodega X" + "Ubicación bodega X".
const WAREHOUSES = ['Bodega', 'Tienda', 'Mercado libre'];

const FIXED_BEFORE = [
  'SKU',
  'Códigos compatibles',
  'Categoría',
  'Nombre',
  'Marca',
  'Marca de vehículo',
  'Modelo de vehículo',
  'Año',
];
const FIXED_AFTER = [
  'Stock mínimo',
  'Tipo (ORIGINAL/ALTERNATIVE)',
  'Costo (bruto)',
  'Precio (bruto)',
  'Observación',
];

const headers = [
  ...FIXED_BEFORE,
  ...WAREHOUSES.flatMap((w) => [`Stock bodega ${w}`, `Ubicación bodega ${w}`]),
  ...FIXED_AFTER,
];

// Cada fila: [sku, codigos, categoria, nombre, marca, vMake, vModel, anios,
//   (stock+ubic por bodega...), minStock, tipo, costo, precio, desc, obs]
const rows = [
  {
    sku: 'FIL-AC-001',
    codigos: 'A12345; B67890; XYZ-001',
    categoria: 'Filtros',
    nombre: 'Filtro de aire Toyota Corolla',
    marca: 'Mahle',
    vMake: 'Toyota; Toyota',
    vModel: 'Corolla; Yaris',
    anios: '2014, 2015, 2016, 2017, 2018, 2019; 2018, 2019, 2020',
    stock: { Bodega: 20, Tienda: 5, 'Mercado libre': 0 },
    ubic: { Bodega: 'A-12-3', Tienda: 'M-2', 'Mercado libre': '' },
    minStock: 5,
    tipo: 'ORIGINAL',
    costo: 8000,
    precio: 15000,
    desc: 'Filtro de aire para motor 1.8L',
    obs: 'Revisar empaque al recibir',
  },
  {
    sku: 'FRE-PA-002',
    codigos: 'D2055; D2056',
    categoria: 'Frenos',
    nombre: 'Pastillas de freno delanteras',
    marca: 'Bosch',
    vMake: 'Nissan',
    vModel: 'Sentra',
    anios: '2016, 2017, 2018',
    stock: { Bodega: 12, Tienda: 3, 'Mercado libre': 8 },
    ubic: { Bodega: 'B-04-1', Tienda: '', 'Mercado libre': 'ML-01' },
    minStock: 4,
    tipo: 'ORIGINAL',
    costo: 12000,
    precio: 22000,
    desc: 'Juego de pastillas cerámicas',
    obs: '',
  },
  {
    sku: 'ENC-BU-003',
    codigos: 'BKR6E; 7090',
    categoria: 'Eléctrico',
    nombre: 'Bujía de encendido NGK',
    marca: 'NGK',
    vMake: '',
    vModel: '',
    anios: '',
    stock: { Bodega: 50, Tienda: 10, 'Mercado libre': 0 },
    ubic: { Bodega: 'C-01-2', Tienda: '', 'Mercado libre': '' },
    minStock: 10,
    tipo: 'ALTERNATIVE',
    costo: 2500,
    precio: 4500,
    desc: 'Bujía estándar de níquel',
    obs: '',
  },
  {
    sku: 'ACE-15W40-004',
    codigos: '',
    categoria: 'Aceites y lubricantes',
    nombre: 'Aceite motor 15W-40 1L',
    marca: 'Shell',
    vMake: '',
    vModel: '',
    anios: '',
    stock: { Bodega: 30, Tienda: 15, 'Mercado libre': 5 },
    ubic: { Bodega: 'D-02', Tienda: 'E-01', 'Mercado libre': '' },
    minStock: 8,
    tipo: 'ORIGINAL',
    costo: 4000,
    precio: 7500,
    desc: 'Aceite mineral multigrado',
    obs: 'Producto de alta rotación',
  },
  {
    sku: 'SUS-AM-005',
    codigos: 'G-12345',
    categoria: 'Suspensión',
    nombre: 'Amortiguador delantero',
    marca: 'Monroe',
    vMake: 'Chevrolet; Chevrolet; Suzuki',
    vModel: 'Sail; Spark; Swift',
    anios: '2013, 2014, 2015; 2011, 2012, 2013; 2015, 2016',
    stock: { Bodega: 6, Tienda: 0, 'Mercado libre': 2 },
    ubic: { Bodega: 'F-03-4', Tienda: '', 'Mercado libre': 'ML-22' },
    minStock: 2,
    tipo: 'ALTERNATIVE',
    costo: 18000,
    precio: 32000,
    desc: 'Amortiguador a gas',
    obs: '',
  },
];

async function main() {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Inventario (ejemplo)';
  wb.created = new Date();

  // El parser busca la hoja llamada "Productos" primero.
  const sheet = wb.addWorksheet('Productos');
  sheet.columns = headers.map((h) => ({ header: h, key: h, width: Math.max(h.length + 2, 14) }));
  sheet.getRow(1).font = { bold: true };
  sheet.views = [{ state: 'frozen', ySplit: 1 }];

  for (const r of rows) {
    const cells = {
      SKU: r.sku,
      'Códigos compatibles': r.codigos,
      'Categoría': r.categoria,
      Nombre: r.nombre,
      Marca: r.marca,
      'Marca de vehículo': r.vMake,
      'Modelo de vehículo': r.vModel,
      'Año': r.anios,
      'Stock mínimo': r.minStock,
      'Tipo (ORIGINAL/ALTERNATIVE)': r.tipo,
      'Costo (bruto)': r.costo,
      'Precio (bruto)': r.precio,
      'Observación': r.obs,
    };
    for (const w of WAREHOUSES) {
      cells[`Stock bodega ${w}`] = r.stock[w];
      cells[`Ubicación bodega ${w}`] = r.ubic[w];
    }
    sheet.addRow(cells);
  }

  const out = path.resolve('productos-ejemplo-import.xlsx');
  await wb.xlsx.writeFile(out);
  console.log('OK ->', out);
  console.log('Columnas:', headers.length);
  console.log('Filas de datos:', rows.length);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
