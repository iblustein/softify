export interface Product {
  id: number;
  title: string;
  status: string;
  price: number;
  inventory: number;
  sku: string;
  description: string;
  image: string;
}

export let mockProducts: Product[] = [
  {
    id: 101,
    title: "Eco Linen Warm Shirt",
    status: "Active",
    price: 78.00,
    inventory: 42,
    sku: "SH-EC-LIN-01",
    description: "A comfortable linen shirt styled with structured collars. Breathable, made of 100% natural organic flax linen material. Standard fit.",
    image: "https://images.unsplash.com/photo-1596755094514-f87e34085b2c?w=400&auto=format&fit=crop&q=80"
  },
  {
    id: 102,
    title: "Double-walled Ceramic Mug",
    status: "Active",
    price: 32.00,
    inventory: 15,
    sku: "MG-DBL-CRM-02",
    description: "Keeps drinks warm for up to 6 hours. Features structural matte stone finish and raw clay rim. Microwave and dishwasher safe.",
    image: "https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?w=400&auto=format&fit=crop&q=80"
  },
  {
    id: 103,
    title: "Full-grain Leather Backpack",
    status: "Draft",
    price: 189.00,
    inventory: 8,
    sku: "BP-FLG-LTH-03",
    description: "Premium computer satchel with laptop compartment and brushed bronze clasps. Highly durable leather layout.",
    image: "https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=400&auto=format&fit=crop&q=80"
  },
  {
    id: 104,
    title: "Silk Contour Sleep Mask",
    status: "Active",
    price: 24.00,
    inventory: 110,
    sku: "MK-SLK-SLP-04",
    description: "Blocking luxury eye mask prepared with Mulberry silk. Fully adjustable strap designed to eliminate light entirely.",
    image: "https://images.unsplash.com/photo-1512290923902-8a9f81dc236c?w=400&auto=format&fit=crop&q=80"
  },
  {
    id: 105,
    title: "Solid Walnut Headphone Stand",
    status: "Active",
    price: 65.00,
    inventory: 24,
    sku: "ST-WNT-HDP-05",
    description: "Hand-turned display hanger for studio headphones. Heavy black steel base adds extreme stability.",
    image: "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=400&auto=format&fit=crop&q=80"
  }
];

export function getMockProducts(): Product[] {
  return mockProducts;
}

export function setMockProducts(newProducts: Product[]): void {
  mockProducts = newProducts;
}
