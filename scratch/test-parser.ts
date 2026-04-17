import { parseBankText } from '../src/lib/bill-utils.ts';

const testCases = [
  {
    name: 'With colons',
    text: `Nombre: Juan Pérez\nBanco: Banco de Chile\nTipo de cuenta: Corriente\nNúmero: 12345678\nRUT: 12.345.678-9\nEmail: juan@email.com`
  },
  {
    name: 'Without colons (Standard labels)',
    text: `Nombre Juan Pérez\nBanco Santander\nTipo de cuenta Vista\nNúmero 223344\nRUT 11222333-k\nEmail holi@mundo.com`
  },
  {
    name: 'Mixed labels',
    text: `Titular Matias\nCuenta 987654\nBanco Estado\nNro de cuenta 555666\nPix key random@pix`
  }
];

testCases.forEach(tc => {
  console.log(`--- Test: ${tc.name} ---`);
  console.log('Input:', tc.text);
  console.log('Output:', JSON.stringify(parseBankText(tc.text), null, 2));
  console.log('-------------------\n');
});
