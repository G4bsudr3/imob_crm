-- =====================================================================
-- Seed: populate properties for gabreda188@gmail.com's organization
-- Run in Supabase SQL Editor (postgres role bypasses RLS)
-- =====================================================================

do $$
declare
  v_user_id uuid;
  v_org_id uuid;
begin
  -- Find the user
  select id into v_user_id
  from auth.users
  where email = 'gabreda188@gmail.com';

  if v_user_id is null then
    raise exception 'User gabreda188@gmail.com not found in auth.users';
  end if;

  -- Find their organization
  select organization_id into v_org_id
  from public.profiles
  where id = v_user_id;

  if v_org_id is null then
    raise exception 'Profile has no organization_id. User must complete onboarding first.';
  end if;

  raise notice 'Seeding properties for org % (user %)', v_org_id, v_user_id;

  -- Insert properties
  insert into public.properties
    (organization_id, title, type, location, neighborhood, city, price, bedrooms, bathrooms, area_m2, description, available)
  values
    (v_org_id, 'Apartamento moderno 2 quartos — Vila Olímpia', 'apartamento',
     'Rua Gomes de Carvalho, 1200', 'Vila Olímpia', 'São Paulo',
     850000, 2, 2, 72,
     'Apartamento reformado, cozinha americana, 1 vaga, varanda gourmet. Prédio com piscina e academia.',
     true),

    (v_org_id, 'Cobertura duplex 3 suítes — Itaim Bibi', 'apartamento',
     'Rua Joaquim Floriano, 850', 'Itaim Bibi', 'São Paulo',
     2450000, 3, 4, 220,
     'Cobertura com terraço privativo, churrasqueira, jacuzzi. 3 vagas. Vista panorâmica.',
     true),

    (v_org_id, 'Apartamento 1 dormitório — Pinheiros', 'apartamento',
     'Rua dos Pinheiros, 540', 'Pinheiros', 'São Paulo',
     480000, 1, 1, 38,
     'Studio com ótimo aproveitamento, próximo à Faria Lima e metrô. Ideal para investimento.',
     true),

    (v_org_id, 'Casa térrea 3 quartos — Alto de Pinheiros', 'casa',
     'Rua Arruda Alvim, 180', 'Alto de Pinheiros', 'São Paulo',
     1650000, 3, 3, 185,
     'Casa em rua tranquila, quintal com churrasqueira, 2 vagas cobertas. Recém reformada.',
     true),

    (v_org_id, 'Apartamento 2 dormitórios — Moema', 'apartamento',
     'Alameda dos Arapanés, 410', 'Moema', 'São Paulo',
     920000, 2, 2, 68,
     'Andar alto, claridade o dia todo, 1 vaga. Prédio com portaria 24h.',
     true),

    (v_org_id, 'Casa de condomínio 4 suítes — Granja Viana', 'casa',
     'Av. São Camilo, 800 — Cond. Parque das Artes', 'Granja Viana', 'Cotia',
     2100000, 4, 5, 320,
     'Casa em condomínio fechado com segurança 24h, clube, quadra. Ampla área verde.',
     true),

    (v_org_id, 'Apartamento compacto — Vila Madalena', 'apartamento',
     'Rua Harmonia, 275', 'Vila Madalena', 'São Paulo',
     620000, 1, 1, 45,
     'Perto dos bares e restaurantes da Vila. Planejado, com varanda.',
     true),

    (v_org_id, 'Terreno 500m² — Alphaville', 'terreno',
     'Alameda Grajaú, quadra 8, lote 12', 'Alphaville', 'Barueri',
     1800000, null, null, 500,
     'Terreno plano em condomínio residencial de alto padrão. Aceita permuta.',
     true),

    (v_org_id, 'Sala comercial 45m² — Berrini', 'comercial',
     'Av. Eng. Luís Carlos Berrini, 1500', 'Brooklin', 'São Paulo',
     720000, null, 1, 45,
     'Sala mobiliada, andar alto, vista para o rio Pinheiros. 1 vaga.',
     true),

    (v_org_id, 'Apartamento 3 quartos — Perdizes', 'apartamento',
     'Rua Apinajés, 920', 'Perdizes', 'São Paulo',
     1150000, 3, 2, 105,
     'Prédio consolidado, armários planejados, 2 vagas. Próximo à PUC e metrô Sumaré.',
     false);

  raise notice 'Inserted 10 properties for organization %', v_org_id;
end $$;
