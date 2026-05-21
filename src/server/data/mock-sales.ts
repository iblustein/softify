export interface SalesReport {
  dailySales: { day: string; sales: number }[];
  totalWeekRevenue: number;
  conversionRate: string;
  activeSessions: number;
  popularProducts: { name: string; salesCount: number; revenue: number }[];
}

export let mockSalesReport: SalesReport = {
  dailySales: [
    { day: "Mon", sales: 420 },
    { day: "Tue", sales: 680 },
    { day: "Wed", sales: 710 },
    { day: "Thu", sales: 590 },
    { day: "Fri", sales: 880 },
    { day: "Sat", sales: 1120 },
    { day: "Sun", sales: 940 }
  ],
  totalWeekRevenue: 5340,
  conversionRate: "2.42%",
  activeSessions: 1840,
  popularProducts: [
    { name: "Eco Linen Warm Shirt", salesCount: 14, revenue: 1092 },
    { name: "Silk Contour Sleep Mask", salesCount: 18, revenue: 432 },
    { name: "Solid Walnut Headphone Stand", salesCount: 6, revenue: 390 }
  ]
};

export function getMockSalesReport(): SalesReport {
  return mockSalesReport;
}

export function setMockSalesReport(newReport: SalesReport): void {
  mockSalesReport = newReport;
}
