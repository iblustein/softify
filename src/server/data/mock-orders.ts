export interface Order {
  id: number;
  customer_name: string;
  total: number;
  items: string;
  status: string;
  date: string;
}

export let mockOrders: Order[] = [
  {
    id: 4001,
    customer_name: "Sarah Jenkins",
    total: 110.00,
    items: "Eco Linen Warm Shirt (1), Double-walled Ceramic Mug (1)",
    status: "Fulfilled",
    date: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString() // 4 hours ago
  },
  {
    id: 4002,
    customer_name: "David Sterling",
    total: 189.00,
    items: "Full-grain Leather Backpack (1)",
    status: "Unfulfilled",
    date: new Date(Date.now() - 14 * 60 * 60 * 1000).toISOString() // 14 hours ago
  },
  {
    id: 4003,
    customer_name: "Elena Rostova",
    total: 48.00,
    items: "Silk Contour Sleep Mask (2)",
    status: "Fulfilled",
    date: new Date(Date.now() - 26 * 60 * 60 * 1000).toISOString() // 1 day ago
  },
  {
    id: 4004,
    customer_name: "Liam O'Connor",
    total: 143.00,
    items: "Solid Walnut Headphone Stand (2), Double-walled Ceramic Mug (1)",
    status: "Fulfilled",
    date: new Date(Date.now() - 36 * 60 * 60 * 1000).toISOString() // 1.5 days ago
  }
];

export function getMockOrders(): Order[] {
  return mockOrders;
}

export function setMockOrders(newOrders: Order[]): void {
  mockOrders = newOrders;
}
