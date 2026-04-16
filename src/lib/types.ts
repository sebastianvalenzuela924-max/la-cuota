export type Currency = 'CLP' | 'BRL';

export interface Product {
  id: string;
  name: string;
  price: number;
  quantity: number;
}

export interface Person {
  id: string;
  name: string;
  colorIndex: number;
}

export type TipType = 'percent' | 'fixed';

export interface BankData {
  name: string;
  bank: string;
  accountType: string;
  accountNumber: string;
  rut: string;
  email: string;
}

export interface PersonTotal {
  total: number;
  items: { 
    name: string; 
    amount: number;
    baseAmount: number;
    tipAmount: number;
  }[];
}
