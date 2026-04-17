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
  
  // Regex para RUT chileno (con o sin puntos/guion)
  const rutRegex = /(\d{1,2}(?:\.\d{3}){2}-[\dkK])|(\d{7,8}-[\dkK])/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lower = line.toLowerCase();
    
    let value = '';
    let matched = false;

    // 1. Detección por dos puntos ":"
    if (line.includes(':')) {
      value = line.split(/[:]\s*/).slice(1).join(':').trim();
      matched = !!value;
    } 
    
    // 2. Detección por palabras clave (sin dos puntos)
    if (!matched) {
      const keywords = [
        { reg: /^(titular|nombre|destinatario|beneficiario)\s+/i, type: 'name' },
        { reg: /^banco\s+/i, type: 'bank' },
        { reg: /^tipo\s+(de\s+)?cuenta\s+/i, type: 'accountType' },
        { reg: /^(cuenta)\s+/i, type: 'accountNumber' },
        { reg: /^(nro|n[úu]mero|n°)\s+((de\s+)?cuenta\s+)?/i, type: 'accountNumber' },
        { reg: /^(rut|cpf)\s+/i, type: 'rut' },
        { reg: /^(correo|email|mail|e-mail)\s+/i, type: 'email' },
        { reg: /^(pix(\s+key)?|chave)\s+/i, type: 'email' }
      ];
      
      for (const k of keywords) {
        if (k.reg.test(line)) {
          value = line.replace(k.reg, '').trim();
          matched = true;
          break;
        }
      }
    }

    // 3. HEURÍSTICA: RUT "desnudo" (sin etiqueta)
    if (!matched && rutRegex.test(line)) {
      const foundRut = line.match(rutRegex)[0];
      data.rut = foundRut;
      matched = true;
      // Pre-poblar cuenta si es un RUT suelto en una cuenta RUT
      if (!data.accountNumber) {
        const cleanRut = foundRut.split('-')[0].replace(/\./g, '');
        if (/^\d+$/.test(cleanRut)) data.accountNumber = cleanRut;
      }
      continue;
    }

    // 4. HEURÍSTICA: Nombre (primera o segunda línea, sin números, texto largo)
    if (!matched && (i === 0 || i === 1) && !/\d/.test(line) && line.length > 3 && !data.name) {
      data.name = line;
      continue;
    }

    if (!value) continue;

    const isName = lower.includes('titular') || lower.includes('destinatario') || lower.includes('beneficiario') || (lower.includes('nombre') && !lower.includes('banco'));
    
    if (isName) {
      data.name = value;
    } else if (lower.includes('banco')) {
      data.bank = value;
    } else if (lower.includes('tipo') && lower.includes('cuenta')) {
      data.accountType = value;
    } else if (lower.match(/n[úu]mero|nro|n°|cuenta/) && !lower.includes('tipo')) {
      data.accountNumber = value;
    } else if (lower.includes('rut') || lower.includes('cpf')) {
      data.rut = value;
      if (!data.accountNumber) {
        const cleanRut = value.split('-')[0].replace(/\./g, '');
        if (/^\d+$/.test(cleanRut)) data.accountNumber = cleanRut;
      }
    } else if (lower.match(/correo|email|mail/)) {
      data.email = value;
    } else if (lower.includes('pix') || lower.includes('chave')) {
      data.email = value;
    }
  }

  // Sugerencia global si detecta Cuenta RUT
  if (text.toLowerCase().includes('cuenta rut')) {
    if (!data.bank) data.bank = 'Banco Estado';
    if (!data.accountType) data.accountType = 'Cuenta RUT / Vista';
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
