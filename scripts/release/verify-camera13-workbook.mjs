import path from 'node:path';
import process from 'node:process';
import ExcelJS from 'exceljs';

const EXPECTED_HEADERS = [
  'Website',
  'Tên sản phẩm',
  'Hàng cũ/Hàng mới',
  'Thông số mô tả',
  'Giá thuê/ngày',
  'Điều kiện thuê',
  'Phụ kiện đi kèm',
  'Combo/gói đi kèm',
  'Điểm đánh giá',
  'Số lượt đánh giá/review',
  'Tồn kho',
  'Giá bán',
  'URL',
];

const secretPatterns = [
  ['Google API key', /AIza[0-9A-Za-z_-]{35}/],
  ['GitHub token', /(?:gh[pousr]_[A-Za-z0-9]{20,255}|github_pat_[A-Za-z0-9_]{20,255})/],
  ['OpenAI-style key', /sk-(?:proj-)?[A-Za-z0-9_-]{20,}/],
  ['Private key material', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
];

const workbookPath = process.argv[2];
if (!workbookPath) {
  console.error('Usage: node scripts/release/verify-camera13-workbook.mjs <workbook.xlsx>');
  process.exit(2);
}

const workbook = new ExcelJS.Workbook();
await workbook.xlsx.readFile(workbookPath);

const cameraSheet = workbook.getWorksheet('Camera Data');
if (!cameraSheet) {
  console.error('Workbook verification FAILED: missing "Camera Data" sheet.');
  process.exit(1);
}

const actualHeaders = [];
for (let column = 1; column <= EXPECTED_HEADERS.length + 5; column += 1) {
  const value = cameraSheet.getCell(1, column).value;
  if (value === null || value === undefined || String(value).trim() === '') break;
  actualHeaders.push(String(value).trim());
}

const exact = actualHeaders.length === EXPECTED_HEADERS.length &&
  actualHeaders.every((header, index) => header === EXPECTED_HEADERS[index]);

const findings = [];
if (!exact) {
  findings.push(`Camera Data headers mismatch. Expected ${JSON.stringify(EXPECTED_HEADERS)}, got ${JSON.stringify(actualHeaders)}`);
}

for (const worksheet of workbook.worksheets) {
  worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    row.eachCell({ includeEmpty: false }, (cell, columnNumber) => {
      const text = typeof cell.text === 'string' ? cell.text : String(cell.value ?? '');
      for (const [label, regex] of secretPatterns) {
        if (regex.test(text)) findings.push(`${worksheet.name}!R${rowNumber}C${columnNumber}: ${label}`);
      }
    });
  });
}

if (findings.length > 0) {
  console.error(`Workbook verification FAILED: ${path.basename(workbookPath)}`);
  for (const finding of findings) console.error(`- ${finding}`);
  process.exit(1);
}

console.log(`Workbook verification PASS: ${path.basename(workbookPath)} has exact 13-column Camera Data contract and no recognized secret material.`);
