import type { Product, Person, TipType, PersonTotal, BankData, Currency } from './types';

export const PERSON_COLORS = [
  { bg: 'hsl(210, 80%, 55%)', fg: '#fff' },
  { bg: 'hsl(340, 75%, 55%)', fg: '#fff' },
  { bg: 'hsl(152, 70%, 38%)', fg: '#fff' },
  { bg: 'hsl(30, 90%, 55%)', fg: '#fff' },
  { bg: 'hsl(270, 65%, 55%)', fg: '#fff' },
  { bg: 'hsl(50, 85%, 45%)', fg: '#1a1a1a' },
  { bg: 'hsl(190, 75%, 42%)', fg: '#fff' },
  { bg: 'hsl(0, 70%, 55%)', fg: '#fff' },
  { bg: 'hsl(120, 50%, 42%)', fg: '#fff' },
  { bg: 'hsl(300, 60%, 50%)', fg: '#fff' },
];

export function formatCurrency(amount: number, currency: Currency = 'CLP'): string {
  if (currency === 'BRL') {
    return 'R$' + amount.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  if (currency === 'USD') {
    return 'US$' + amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  if (currency === 'EUR') {
    return '€' + amount.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  return '$' + Math.round(amount).toLocaleString('es-CL');
}

export function roundValue(val: number, currency: Currency): number {
  if (currency === 'CLP') {
    return Math.round(val);
  }
  return Math.round(val * 100) / 100;
}

/** @deprecated Use formatCurrency instead */
export function formatCLP(amount: number): string {
  return formatCurrency(amount, 'CLP');
}

export function generateId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback para contextos no seguros (HTTP) en móviles
  return 'id-' + Math.random().toString(36).substring(2, 9) + '-' + Date.now().toString(36);
}

export function getInitials(name: string): string {
  return name.trim().charAt(0).toUpperCase();
}

export function parseBankText(text: string): Partial<BankData> {
  const data: Partial<BankData> = {};
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  
  const rutRegex = /(\d{1,2}(?:\.\d{3}){2}-[\dkK])|(\d{7,8}-[\dkK])/;
  let explicitBank = false;
  let explicitType = false;
  let explicitAccount = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lower = line.toLowerCase();
    let value = '';
    let matched = false;

    // 1. Detección por dos puntos ":"
    if (line.includes(':')) {
      const parts = line.split(/[:]\s*/);
      const label = parts[0].toLowerCase();
      value = parts.slice(1).join(':').trim();
      
      if (value) {
        if (label.includes('titular') || label.includes('nombre') || label.includes('destinatario')) {
          data.name = value;
          matched = true;
        } else if (label.includes('banco')) {
          data.bank = value;
          explicitBank = true;
          matched = true;
        } else if ((label.includes('tipo') && label.includes('cuenta')) || label === 'tipo') {
          data.accountType = value;
          explicitType = true;
          matched = true;
        } else if (label.match(/n[úu]mero|nro|n°|cuenta/)) {
          // Si el label es "cuenta" pero el valor parece un tipo (corriente, vista...), es tipo
          if (value.toLowerCase().match(/corriente|vista|ahorro|rut/)) {
            data.accountType = value;
            explicitType = true;
          } else {
            data.accountNumber = value.replace(/-/g, '').trim();
            explicitAccount = true;
          }
          matched = true;
        } else if (label.includes('rut') || label.includes('cpf')) {
          data.rut = value;
          matched = true;
        } else if (label.match(/correo|email|mail/)) {
          data.email = value;
          matched = true;
        }
      }
    } 
    
    // 2. Detección por palabras clave (sin dos puntos)
    if (!matched) {
      // Prioridad a Tipo de Cuenta si contiene palabras clave de tipo
      if (lower.match(/^tipo\s+(de\s+)?cuenta|^cuenta\s+(corriente|vista|ahorro|rut)/i)) {
        data.accountType = line;
        explicitType = true;
        matched = true;
      } else {
        const keywords = [
          { reg: /^(titular|nombre|destinatario|beneficiario)\s+/i, type: 'name' },
          { reg: /^banco\s+/i, type: 'bank' },
          { reg: /^(nro|n[úu]mero|n°)\s+((de\s+)?cuenta\s+)?/i, type: 'accountNumber' },
          { reg: /^(cuenta)\s+/i, type: 'accountNumber' },
          { reg: /^(rut|cpf)\s+/i, type: 'rut' },
          { reg: /^(correo|email|mail|e-mail)\s+/i, type: 'email' },
          { reg: /^(pix(\s+key)?|chave)\s+/i, type: 'email' }
        ];
        
        for (const k of keywords) {
          if (k.reg.test(line)) {
            value = line.replace(k.reg, '').trim();
            if (k.type === 'name') data.name = value;
            if (k.type === 'bank') { data.bank = line; explicitBank = true; }
            if (k.type === 'accountNumber') { 
              // Doble check: si el valor de "cuenta" es un tipo, es tipo
              if (value.toLowerCase().match(/^(corriente|vista|ahorro|rut)$/)) {
                data.accountType = line;
                explicitType = true;
              } else {
                data.accountNumber = value.replace(/-/g, '').trim(); 
                explicitAccount = true; 
              }
            }
            if (k.type === 'rut') data.rut = value;
            if (k.type === 'email') data.email = value;
            matched = true;
            break;
          }
        }
      }
    }

    // 3. HEURÍSTICA: RUT "desnudo"
    if (!matched && rutRegex.test(line)) {
      data.rut = line.match(rutRegex)![0];
      matched = true;
      continue;
    }

    // 4. HEURÍSTICA: Nombre (primera o segunda línea)
    if (!matched && (i === 0 || i === 1) && !/\d/.test(line) && line.length > 3 && !data.name) {
      data.name = line;
      continue;
    }

    // 5. HEURÍSTICA: Número de cuenta "desnudo" (6-16 dígitos)
    if (!matched && !explicitAccount && /^[0-9-]{6,18}$/.test(line) && !rutRegex.test(line)) {
      const cleanNum = line.replace(/-/g, '');
      if (cleanNum.length >= 6) {
        data.accountNumber = cleanNum;
        explicitAccount = true;
        matched = true;
        continue;
      }
    }
  }

  // Lógica final de decisión para Cuenta RUT
  const rutBody = data.rut ? data.rut.split('-')[0].replace(/\./g, '') : null;
  
  if (rutBody) {
    if (!data.accountNumber || data.accountNumber === rutBody) {
      data.accountNumber = rutBody;
      if (!explicitBank && !explicitType) {
        if (!data.bank) data.bank = 'Banco Estado';
        if (!data.accountType) data.accountType = 'Cuenta RUT / Vista';
      }
    }
  }

  // Sobrescribir si el texto dice explícitamente "cuenta rut"
  if (text.toLowerCase().includes('cuenta rut')) {
    if (!explicitBank) data.bank = 'Banco Estado';
    if (!explicitType) data.accountType = 'Cuenta RUT / Vista';
  }

  return data;
}

export function calculatePersonTotals(
  products: Product[],
  assignments: Record<string, string[]>,
  people: Person[],
  tipType: TipType,
  tipValue: number,
  currency: Currency = 'CLP'
): Record<string, PersonTotal> {
  const result: Record<string, PersonTotal> = {};

  for (const person of people) {
    result[person.id] = { total: 0, items: [] };
  }

  for (const product of products) {
    const assigned = assignments[product.id] || [];
    const productTotal = product.price * product.quantity;

    if (assigned.length > 0) {
      const perPerson = roundValue(productTotal / assigned.length, currency);

      let tipPerPerson = 0;
      if (tipType === 'percent' && tipValue > 0) {
        tipPerPerson = roundValue(perPerson * tipValue / 100, currency);
      } else if (tipType === 'fixed' && tipValue > 0) {
        const totalProducts = products.reduce((s, p) => s + p.price * p.quantity, 0);
        if (totalProducts > 0) {
          const productTipShare = roundValue(tipValue * productTotal / totalProducts, currency);
          tipPerPerson = roundValue(productTipShare / assigned.length, currency);
        }
      }

      for (const personId of assigned) {
        if (result[personId]) {
          const itemTotal = roundValue(perPerson + tipPerPerson, currency);
          result[personId].total = roundValue(result[personId].total + itemTotal, currency);
          result[personId].items.push({
            name: `${product.name}${product.quantity > 1 ? ` (${product.quantity}x)` : ''}`,
            amount: itemTotal,
            baseAmount: perPerson,
            tipAmount: tipPerPerson,
          });
        }
      }
    }
  }

  return result;
}

export function getCurrencyLabel(currency: Currency): string {
  const labels: Record<Currency, string> = {
    'CLP': 'Pesos (CLP)',
    'BRL': 'Reales (R$)',
    'USD': 'Dólares (US$)',
    'EUR': 'Euros (€)'
  };
  return labels[currency];
}

export function getCurrencyFlag(currency: Currency): string {
  const flags: Record<Currency, string> = {
    'CLP': '🇨🇱',
    'BRL': '🇧🇷',
    'USD': '🇺🇸',
    'EUR': '🇪🇺'
  };
  return flags[currency];
}

export function generateSummaryText(
  products: Product[],
  people: Person[],
  totals: Record<string, PersonTotal>,
  tipType: TipType,
  tipValue: number,
  bankData: Partial<BankData>,
  currency: Currency = 'CLP',
  targetCurrency: Currency = 'CLP',
  conversionRate?: number
): string {
  const fmt = (n: number) => formatCurrency(n, currency);
  const fmtConv = (n: number) => formatCurrency(n * (conversionRate || 1), targetCurrency);
  const subtotal = products.reduce((s, p) => s + p.price * p.quantity, 0);
  const tipAmount = tipType === 'percent'
    ? roundValue(subtotal * tipValue / 100, currency)
    : roundValue(tipValue, currency);
  const grandTotal = roundValue(subtotal + tipAmount, currency);

  let text = `📋 *La Cuota* ${getCurrencyFlag(currency)}\n`;
  text += `━━━━━━━━━━━━━━━\n`;
  text += `💰 Subtotal: ${fmt(subtotal)}\n`;
  if (tipAmount > 0) {
    text += `🫰 Propina: ${fmt(tipAmount)}${tipType === 'percent' ? ` (${tipValue}%)` : ''}\n`;
  }
  text += `💵 Total: ${fmt(grandTotal)}\n`;
  if (conversionRate && conversionRate > 0) {
    text += `${getCurrencyFlag(targetCurrency)} Total en ${targetCurrency}: ${fmtConv(grandTotal)} (cambio: ${conversionRate})\n`;
  }
  text += `━━━━━━━━━━━━━━━\n\n`;

  for (const person of people) {
    const pt = totals[person.id];
    if (!pt || pt.total === 0) continue;
    text += `👤 *${person.name}*: ${fmt(pt.total)}\n`;
    if (conversionRate && conversionRate > 0) {
      text += `   ↳ Aprox. *${fmtConv(pt.total)}*\n`;
    }
    for (const item of pt.items) {
      if (item.tipAmount > 0) {
        text += `   • ${item.name} (${fmt(item.baseAmount)} + ${fmt(item.tipAmount)} propina): ${fmt(item.amount)}\n`;
      } else {
        text += `   • ${item.name}: ${fmt(item.amount)}\n`;
      }
    }
    text += `\n`;
  }

  if (bankData.name || bankData.bank || bankData.rut) {
    text += `💳 *Datos de transferencia:*\n`;
    if (bankData.name) text += `Nombre: ${bankData.name}\n`;
    if (bankData.bank) text += `Banco: ${bankData.bank}\n`;
    if (bankData.accountType) text += `Tipo: ${bankData.accountType}\n`;
    if (bankData.accountNumber) text += `Cuenta: ${bankData.accountNumber}\n`;
    if (bankData.rut) text += `${currency === 'BRL' ? 'CPF' : 'RUT'}: ${bankData.rut}\n`;
    if (bankData.email) text += `${currency === 'BRL' ? 'PIX/Email' : 'Correo'}: ${bankData.email}\n`;
  }

  return text;
}
