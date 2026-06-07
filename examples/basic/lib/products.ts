/**
 * Fake catalog "API" for the bake() demo.
 * In a real app this would fetch a backend API; for bake demos it is a static
 * object.
 */

export interface Product {
  slug: string;
  name: string;
  description: string;
  price: number;
  currency: string;
  image: string;
}

export const products: Product[] = [
  {
    slug: "mado-mug",
    name: "Mado mug",
    description: "A mug with a “zero dependencies” print.",
    price: 12,
    currency: "EUR",
    image: "https://placehold.co/600x400?text=Mado+Mug",
  },
  {
    slug: "raw-bundler",
    name: "No Bundlers sticker",
    description: "A small but loud laptop sticker.",
    price: 3,
    currency: "EUR",
    image: "https://placehold.co/600x400?text=Sticker",
  },
  {
    slug: "shadow-dom",
    name: "Shadow DOM T-shirt",
    description: "A black T-shirt with CSS encapsulation.",
    price: 25,
    currency: "EUR",
    image: "https://placehold.co/600x400?text=T-Shirt",
  },
];

export function findProduct(slug: string): Product | undefined {
  return products.find((p) => p.slug === slug);
}
