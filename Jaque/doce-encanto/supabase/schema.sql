-- Criação de tabelas para a Confeitaria Jallu (Doce Encanto)
-- Versão 1.0

-- 1. Produtos
create table if not exists products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  price numeric(10, 2) not null,
  category text not null,
  image text,
  active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Habilitar RLS (Segurança em nível de linha)
alter table products enable row level security;

-- Políticas de acesso para Produtos
-- Qualquer um pode ler produtos ativos
create policy "Produtos públicos são visíveis" on products
  for select using (active = true);

-- Apenas autenticados (admin) podem criar/editar/deletar
create policy "Admin gerencia produtos" on products
  for all using (auth.role() = 'authenticated');


-- 2. Pedidos
create type order_status as enum (
  'pending', 'accepted', 'rejected', 'preparing', 'ready', 'delivered', 'canceled'
);

create type fulfillment_type as enum ('delivery', 'pickup');

create table if not exists orders (
  id uuid primary key default gen_random_uuid(),
  code text unique, -- Código amigável para o cliente (ex: AB12CD)
  customer_name text,
  customer_phone text,
  status order_status default 'pending',
  total numeric(10, 2) not null,
  fulfillment fulfillment_type,
  shipping_fee numeric(10, 2) default 0,
  
  -- Endereço de entrega
  zip_code text,
  address_number text,
  address_line text,
  
  -- Metadados
  payment_method text,
  source text, -- 'site', 'whatsapp', 'agent'
  external_user_id text, -- ID do usuário no WorkOps/Chat
  
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Habilitar RLS
alter table orders enable row level security;

-- Políticas de acesso para Pedidos
-- Usuários anônimos podem criar pedidos (checkout)
create policy "Qualquer um pode criar pedidos" on orders
  for insert with check (true);

-- Usuários podem ver seus próprios pedidos (baseado no external_user_id ou telefone - simplificado para MVP)
-- Aqui, permitimos leitura pública pelo ID/Código para rastreamento, mas idealmente seria restrito.
create policy "Leitura de pedidos pública por código" on orders
  for select using (true); 

-- Admin gerencia tudo
create policy "Admin gerencia pedidos" on orders
  for all using (auth.role() = 'authenticated');


-- 3. Itens do Pedido
create table if not exists order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references orders(id) on delete cascade,
  product_id uuid references products(id), -- Opcional, caso o produto seja deletado
  product_name text not null, -- Snapshot do nome no momento da compra
  quantity integer not null,
  price numeric(10, 2) not null, -- Preço unitário no momento da compra
  category text,
  created_at timestamptz default now()
);

alter table order_items enable row level security;

create policy "Itens visíveis com o pedido" on order_items
  for select using (
    exists (select 1 from orders where orders.id = order_items.order_id)
  );

create policy "Criação de itens pública" on order_items
  for insert with check (true);


-- 4. Configurações do Site (Single Row)
create table if not exists site_config (
  id integer primary key check (id = 1), -- Garante apenas uma linha
  whatsapp_number text,
  shipping_fee numeric(10, 2) default 0,
  
  -- Textos
  hero_title text,
  hero_subtitle text,
  about_title text,
  about_text text,
  
  -- Configurações complexas (JSONB)
  hero_slides jsonb default '[]',
  home_sections jsonb default '[]',
  benefits jsonb default '[]',
  testimonials jsonb default '[]',
  
  -- Agente
  agent_name text,
  agent_subtitle text,
  agent_avatar_url text,
  agent_welcome_message text,
  
  updated_at timestamptz default now()
);

alter table site_config enable row level security;

create policy "Configurações públicas para leitura" on site_config
  for select using (true);

create policy "Admin edita configurações" on site_config
  for all using (auth.role() = 'authenticated');

-- Inserir configuração inicial padrão (se não existir)
insert into site_config (id, whatsapp_number, shipping_fee, hero_title)
values (1, '5511999999999', 10.00, 'Doce Encanto')
on conflict (id) do nothing;


-- Índices para performance
create index idx_orders_code on orders(code);
create index idx_orders_phone on orders(customer_phone);
create index idx_products_category on products(category);
