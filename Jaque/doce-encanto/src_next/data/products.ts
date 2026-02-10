export interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  category: string;
  image?: string;
}

export const categories = [
  "Bolos",
  "Tortas",
  "Brigadeiros",
  "Doces Finos",
  "Kits Festa",
];

export const products: Product[] = [
  {
    id: "1",
    name: "Bolo Red Velvet",
    description: "Massa aveludada vermelha com recheio cremoso de cream cheese e frutas vermelhas.",
    price: 120.00,
    category: "Bolos",
    image: "https://images.unsplash.com/photo-1616541823729-00fe0aacd32c?auto=format&fit=crop&w=800&q=80",
  },
  {
    id: "2",
    name: "Torta de Limão Siciliano",
    description: "Base crocante de biscoito, creme de limão siciliano suave e merengue maçaricado.",
    price: 95.00,
    category: "Tortas",
    image: "https://images.unsplash.com/photo-1519915028121-7d3463d20b13?auto=format&fit=crop&w=800&q=80",
  },
  {
    id: "3",
    name: "Caixa Brigadeiros (12 un.)",
    description: "Seleção de brigadeiros gourmet: Belga, Ninho com Nutella, Churros e Pistache.",
    price: 48.00,
    category: "Brigadeiros",
    image: "https://images.unsplash.com/photo-1579372786545-d24232daf58c?auto=format&fit=crop&w=800&q=80",
  },
  {
    id: "4",
    name: "Doces Finos (25 un.)",
    description: "Sortimento de doces finos para casamentos e eventos. Camafeu, Ouriço, Trufas.",
    price: 110.00,
    category: "Doces Finos",
    image: "https://images.unsplash.com/photo-1599785209707-a456fc1337bb?auto=format&fit=crop&w=800&q=80",
  },
  {
    id: "5",
    name: "Kit Festa Mini",
    description: "1 Bolo (15cm) + 20 Brigadeiros + 10 Salgados. Ideal para pequenas comemorações.",
    price: 190.00,
    category: "Kits Festa",
    image: "https://images.unsplash.com/photo-1470124182917-cc6e71b22ecc?auto=format&fit=crop&w=800&q=80",
  },
  {
    id: "6",
    name: "Bolo de Chocolate Belga",
    description: "Massa úmida de chocolate 50% cacau com ganache de chocolate belga meio amargo.",
    price: 135.00,
    category: "Bolos",
    image: "https://images.unsplash.com/photo-1578985545062-69928b1d9587?auto=format&fit=crop&w=800&q=80",
  },
  {
    id: "7",
    name: "Torta de Morango",
    description: "Creme de confeiteiro leve com morangos frescos e geléia de brilho artesanal.",
    price: 85.00,
    category: "Tortas",
    image: "https://images.unsplash.com/photo-1565958011703-44f9829ba187?auto=format&fit=crop&w=800&q=80",
  },
  {
    id: "8",
    name: "Caixa Degustação",
    description: "Uma experiência completa com 6 mini porções dos nossos best-sellers.",
    price: 65.00,
    category: "Kits Festa",
    image: "https://images.unsplash.com/photo-1526081347589-7fa3cb41b4b2?auto=format&fit=crop&w=800&q=80",
  },
];
