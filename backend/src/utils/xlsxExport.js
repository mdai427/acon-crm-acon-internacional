const ExcelJS = require('exceljs');

// ============================================
// Generación de hojas de cálculo
// ============================================
//
// Se usa exceljs en vez de la librería `xlsx` (SheetJS): esa arrastra CVE de
// alta severidad (prototype pollution y ReDoS) sin parche disponible en la
// versión publicada en npm.
//
// Aquí solo se ESCRIBE. Si alguna vez hay que leer hojas subidas por usuarios,
// hacerlo también con exceljs y con límites de tamaño.

/**
 * Convierte filas planas en un buffer .xlsx.
 * Las columnas se toman de las claves de la primera fila, que es como venían
 * armadas las exportaciones (objetos con la cabecera en español como clave).
 *
 * @param {Array<object>} rows
 * @param {string} sheetName
 * @returns {Promise<Buffer>}
 */
async function rowsToXlsxBuffer(rows, sheetName = 'Datos') {
  const workbook = new ExcelJS.Workbook();
  workbook.created = new Date();
  const sheet = workbook.addWorksheet(sheetName);

  const headers = rows.length ? Object.keys(rows[0]) : [];
  if (headers.length) {
    sheet.columns = headers.map(header => ({
      header,
      key: header,
      // Ancho aproximado al contenido, con topes para que no queden columnas
      // ilegibles ni absurdamente anchas.
      width: Math.min(Math.max(header.length + 2, 12), 40),
    }));
    sheet.getRow(1).font = { bold: true };
    for (const row of rows) sheet.addRow(row);
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

module.exports = { rowsToXlsxBuffer };
