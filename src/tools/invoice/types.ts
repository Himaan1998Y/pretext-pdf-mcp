/** Shared types and constants for invoice generation. */

export interface InvoiceParty {
  company: string
  address?: string
  gstin?: string
  email?: string
  phone?: string
}

export interface InvoiceItem {
  description: string
  hsn_code?: string
  quantity: number
  rate: number
  gst_rate?: number
}

export const SUPPORTED_CURRENCIES = ['INR', 'USD', 'EUR', 'GBP'] as const
export type SupportedCurrency = typeof SUPPORTED_CURRENCIES[number]

export const CURRENCY_SYMBOLS: Record<SupportedCurrency, string> = {
  INR: '₹',
  USD: '$',
  EUR: '€',
  GBP: '£',
}

export const CURRENCY_LOCALES: Record<SupportedCurrency, string> = {
  INR: 'en-IN',
  USD: 'en-US',
  EUR: 'de-DE',
  GBP: 'en-GB',
}

export interface InvoiceInput {
  from: InvoiceParty
  to: InvoiceParty
  invoice_number?: string
  date?: string
  due_date?: string
  currency?: SupportedCurrency
  items: InvoiceItem[]
  notes?: string
  upi_qr_data?: string
}
