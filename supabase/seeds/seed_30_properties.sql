-- Seed 30 imóveis pra gabreda188@gmail.com's org (Imobiliária Modelo)
-- Mix: 15 venda / 7 aluguel / 2 ambos / 2 comerciais / 2 terrenos / 1 rural / 1 reservado

do $$
declare
  v_org_id uuid;
begin
  select organization_id into v_org_id
  from public.profiles
  where email = 'gabreda188@gmail.com';

  if v_org_id is null then
    raise exception 'Org não encontrada pra gabreda188@gmail.com';
  end if;

  insert into public.properties (organization_id, title, type, listing_purpose, listing_status, ref_code, featured,
    price, rent_price, condo_fee, iptu, accepts_financing, accepts_fgts, accepts_exchange,
    location, address_number, address_complement, neighborhood, city, address_state, address_zip,
    area_m2, total_area_m2, bedrooms, suites, bathrooms, parking_spots, floor, year_built,
    furnished, amenities, description, internal_notes)
  values
  (v_org_id,'Apartamento 2 quartos — Vila Olímpia','apartamento','sale','available','AP-001',true,
    850000,null,950,3200,true,true,false,'Rua Gomes de Carvalho','1200','Apto 52','Vila Olímpia','São Paulo','SP','04547-003',
    72,85,2,1,2,1,5,2018,'semi',array['pool','gym','barbecue','concierge_24h','elevator','balcony','ac'],
    'Apartamento reformado, cozinha americana, varanda gourmet.','Proprietário aceita negociar até 5%'),

  (v_org_id,'Cobertura duplex 3 suítes — Itaim Bibi','cobertura','sale','available','CB-002',true,
    2450000,null,2400,9800,true,false,true,'Rua Joaquim Floriano','850','Cobertura 01','Itaim Bibi','São Paulo','SP','04534-011',
    220,280,3,3,4,3,15,2020,'furnished',array['pool','gym','sauna','barbecue','concierge_24h','elevator','gourmet_balcony','great_view','rooftop'],
    'Cobertura com terraço privativo, jacuzzi. Vista 360°.',null),

  (v_org_id,'Studio moderno — Pinheiros','studio','sale','available','ST-003',false,
    480000,null,680,1800,true,true,false,'Rua dos Pinheiros','540','Apto 108','Pinheiros','São Paulo','SP','05422-001',
    38,38,1,0,1,0,10,2021,'furnished',array['elevator','ac','concierge_24h','coworking'],
    'Studio com ótimo aproveitamento. Próximo Faria Lima e metrô.',null),

  (v_org_id,'Apartamento 2 dormitórios — Moema','apartamento','sale','available','AP-004',false,
    920000,null,1100,3500,true,true,false,'Alameda dos Arapanés','410','Apto 72','Moema','São Paulo','SP','04524-001',
    68,75,2,1,2,1,7,2015,'unfurnished',array['concierge_24h','elevator','balcony','playground'],
    'Andar alto, claridade o dia todo.',null),

  (v_org_id,'Apartamento compacto — Vila Madalena','apartamento','sale','available','AP-005',false,
    620000,null,550,1900,true,true,false,'Rua Harmonia','275','Apto 42','Vila Madalena','São Paulo','SP','05435-000',
    45,48,1,0,1,0,4,2017,'furnished',array['elevator','balcony','pet_friendly'],
    'Perto dos bares e restaurantes. Pet friendly.',null),

  (v_org_id,'Apartamento 3 quartos — Perdizes','apartamento','sale','available','AP-006',false,
    1150000,null,1300,4200,true,true,false,'Rua Apinajés','920','Apto 111','Perdizes','São Paulo','SP','05017-000',
    105,115,3,1,2,2,11,2010,'unfurnished',array['concierge_24h','elevator','gym','party_room'],
    'Armários planejados. Próximo PUC e metrô Sumaré.',null),

  (v_org_id,'Apartamento garden — Brooklin','apartamento','sale','available','AP-007',true,
    1380000,null,1450,4800,true,false,false,'Rua Alexandre Dumas','2250','Apto 01','Brooklin','São Paulo','SP','04717-004',
    110,180,3,2,3,2,1,2019,'semi',array['pool','gym','barbecue','concierge_24h','balcony','pet_friendly','playground','green_area'],
    'Garden com quintal privativo de 60m².',null),

  (v_org_id,'Apartamento 4 quartos — Higienópolis','apartamento','sale','available','AP-008',false,
    1950000,null,2800,7500,true,false,true,'Rua Maranhão','540','Apto 81','Higienópolis','São Paulo','SP','01240-000',
    180,200,4,2,3,2,8,1998,'unfurnished',array['concierge_24h','elevator','sauna','party_room','playground'],
    'Prédio tradicional. Excelente localização.',null),

  (v_org_id,'Loft industrial — Barra Funda','loft','sale','available','LF-009',false,
    580000,null,620,1700,true,true,false,'Rua Varginha','180','Loft 05','Barra Funda','São Paulo','SP','01155-010',
    58,62,1,0,1,1,2,2016,'unfurnished',array['elevator','pet_friendly'],
    'Loft pé-direito duplo, estilo industrial.',null),

  (v_org_id,'Kitnet próxima à USP — Butantã','kitnet','sale','available','KT-010',false,
    285000,null,380,980,true,true,false,'Av. Prof. Lineu Prestes','2100','Apto 32','Butantã','São Paulo','SP','05508-000',
    28,28,1,0,1,0,3,2012,'furnished',array['elevator'],
    'Kitnet mobiliada. Ideal estudantes.',null),

  (v_org_id,'Casa térrea 3 quartos — Alto de Pinheiros','casa','sale','available','CA-011',false,
    1650000,null,null,6200,true,true,true,'Rua Arruda Alvim','180',null,'Alto de Pinheiros','São Paulo','SP','05418-030',
    185,300,3,1,3,2,1,1975,'semi',array['barbecue','pet_friendly','green_area'],
    'Casa em rua tranquila, quintal com churrasqueira.',null),

  (v_org_id,'Casa em condomínio — Granja Viana','casa','sale','available','CA-012',true,
    2100000,null,950,3800,true,false,true,'Av. São Camilo','800','Casa 42','Granja Viana','Cotia','SP','06709-150',
    320,450,4,3,5,4,1,2018,'semi',array['pool','gym','playground','barbecue','concierge_24h','green_area','pet_friendly'],
    'Condomínio fechado alto padrão.',null),

  (v_org_id,'Sobrado 4 quartos — Tatuapé','sobrado','sale','available','SB-013',false,
    890000,null,null,3100,true,true,false,'Rua Plutão','420',null,'Tatuapé','São Paulo','SP','03311-000',
    180,220,4,1,3,2,2,2005,'unfurnished',array['barbecue'],
    'Sobrado amplo, quintal. Próximo ao metrô.',null),

  (v_org_id,'Casa de vila — Vila Mariana','casa','sale','available','CA-014',false,
    1200000,null,null,4100,true,false,false,'Rua Domingos de Morais','1845',null,'Vila Mariana','São Paulo','SP','04010-100',
    120,140,3,1,2,1,1,1980,'semi',array['pet_friendly'],
    'Casa de vila charmosa.',null),

  (v_org_id,'Apartamento mobiliado — Jardins','apartamento','rent','available','AL-015',true,
    null,8500,1400,null,false,false,false,'Alameda Santos','1500','Apto 81','Jardins','São Paulo','SP','01418-100',
    85,95,2,1,2,1,8,2016,'furnished',array['pool','gym','concierge_24h','elevator','ac','great_view'],
    'Totalmente mobiliado. Pronto pra morar.',null),

  (v_org_id,'Studio para alugar — Paulista','studio','rent','available','AL-016',false,
    null,3200,750,null,false,false,false,'Av. Paulista','1600','Studio 2212','Bela Vista','São Paulo','SP','01310-200',
    32,32,1,0,1,0,22,2019,'furnished',array['concierge_24h','elevator','gym','coworking'],
    'Studio moderno no coração da Paulista.',null),

  (v_org_id,'Apartamento 2 quartos — Consolação','apartamento','rent','available','AL-017',false,
    null,4200,880,null,false,false,false,'Rua da Consolação','2980','Apto 67','Consolação','São Paulo','SP','01301-000',
    60,65,2,0,1,1,6,2014,'semi',array['elevator','concierge_24h','ac'],
    'Perto do metrô. Ideal casal.',null),

  (v_org_id,'Apartamento família — Mooca','apartamento','rent','available','AL-018',false,
    null,3800,720,null,false,false,false,'Rua da Mooca','1050','Apto 42','Mooca','São Paulo','SP','03103-001',
    78,85,3,1,2,2,4,2012,'unfurnished',array['playground','elevator','pet_friendly'],
    '3 quartos, 2 vagas.',null),

  (v_org_id,'Cobertura — Jardim Paulista','cobertura','rent','available','AL-019',true,
    null,12500,3200,null,false,false,false,'Alameda Lorena','1890','Cob 01','Jardim Paulista','São Paulo','SP','01424-002',
    160,210,3,2,3,2,10,2017,'furnished',array['pool','gym','sauna','concierge_24h','rooftop','great_view','gourmet_balcony'],
    'Cobertura com piscina privativa. Alto padrão.',null),

  (v_org_id,'Apartamento compacto — Santa Cecília','apartamento','rent','available','AL-020',false,
    null,2200,560,null,false,false,false,'Rua das Palmeiras','210','Apto 73','Santa Cecília','São Paulo','SP','01226-000',
    35,40,1,0,1,0,7,2011,'semi',array['elevator','concierge_24h'],
    'Próximo ao metrô. Reformado.',null),

  (v_org_id,'Casa 3 quartos — Pacaembu','casa','rent','available','AL-021',false,
    null,9500,null,null,false,false,false,'Rua Cardoso de Almeida','1800',null,'Pacaembu','São Paulo','SP','01251-001',
    200,320,3,1,3,2,1,1970,'unfurnished',array['barbecue','pet_friendly','green_area'],
    'Casa charmosa em rua arborizada.',null),

  (v_org_id,'Casa em condomínio — Granja Julieta','casa','rent','available','AL-022',false,
    null,7200,1800,null,false,false,false,'Rua São Benedito','4200','Casa 18','Granja Julieta','São Paulo','SP','04723-001',
    220,320,4,2,3,3,1,2015,'semi',array['pool','gym','playground','concierge_24h','pet_friendly','green_area'],
    'Casa em condomínio fechado.',null),

  (v_org_id,'Flat — Brooklin Novo','flat','both','available','AP-023',false,
    650000,4500,1150,2100,true,true,false,'Rua Bandeira Paulista','700','Flat 1205','Brooklin','São Paulo','SP','04532-001',
    45,48,1,0,1,1,12,2020,'furnished',array['pool','gym','concierge_24h','elevator','coworking'],
    'Flat novo. Pode ser comprado ou alugado.',null),

  (v_org_id,'Apartamento — Vila Clementino','apartamento','both','available','AP-024',false,
    780000,3800,920,2400,true,true,false,'Rua Botucatu','820','Apto 54','Vila Clementino','São Paulo','SP','04023-061',
    65,70,2,1,1,1,5,2016,'semi',array['concierge_24h','elevator','ac','balcony'],
    'Próximo hospital São Paulo.',null),

  (v_org_id,'Sala comercial — Berrini','sala_comercial','sale','available','CM-025',false,
    720000,null,1100,3200,true,false,false,'Av. Eng. Luís Carlos Berrini','1500','Sala 1801','Brooklin','São Paulo','SP','04571-000',
    45,48,null,null,1,1,18,2012,'unfurnished',array['concierge_24h','elevator','ac','great_view'],
    'Sala mobiliada, andar alto.',null),

  (v_org_id,'Sala comercial aluguel — Faria Lima','sala_comercial','rent','available','AL-026',true,
    null,6800,2100,null,false,false,false,'Av. Brigadeiro Faria Lima','3900','Sala 2304','Itaim Bibi','São Paulo','SP','04538-132',
    65,68,null,null,2,2,23,2019,'semi',array['concierge_24h','elevator','ac','great_view','coworking'],
    'Prédio corporativo triple A.',null),

  (v_org_id,'Terreno 500m² — Alphaville','terreno','sale','available','TR-027',false,
    1800000,null,null,null,true,false,true,'Alameda Grajaú','Quadra 8, lote 12',null,'Alphaville','Barueri','SP','06454-050',
    null,500,null,null,null,null,null,null,null,array['green_area','concierge_24h'],
    'Condomínio alto padrão. Aceita permuta.',null),

  (v_org_id,'Terreno 800m² — Granja Viana','terreno','sale','available','TR-028',false,
    950000,null,null,null,true,false,true,'Estrada da Aldeia','km 12',null,'Granja Viana','Cotia','SP','06709-150',
    null,800,null,null,null,null,null,null,null,array['green_area'],
    'Topografia plana. Vista privilegiada.',null),

  (v_org_id,'Sítio 5000m² — Mairiporã','rural','sale','available','RR-029',false,
    1450000,null,null,1200,true,false,true,'Estrada do Botujuru','km 8',null,'Zona Rural','Mairiporã','SP','07600-000',
    250,5000,4,2,3,4,1,1995,'semi',array['pool','barbecue','pet_friendly','green_area','great_view'],
    'Sítio com piscina, quadra. 30min de SP.',null),

  (v_org_id,'Apartamento reservado — Moema','apartamento','sale','reserved','AP-030',false,
    1350000,null,1650,4800,true,true,false,'Av. Ibirapuera','2900','Apto 142','Moema','São Paulo','SP','04029-200',
    130,140,3,2,3,2,14,2022,'unfurnished',array['pool','gym','sauna','concierge_24h','elevator','rooftop','great_view'],
    'Em processo de reserva.','Reservado até 25/04');

  raise notice 'Seed OK. 30 propriedades inseridas pra org %', v_org_id;
end $$;
