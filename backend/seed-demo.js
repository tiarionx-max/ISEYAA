const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const ADMIN_ID = 'ac6fe201-c5aa-409b-b6c9-5caa10517858';
const LGA_ABEOKUTA_S = 'b222882d-59af-411f-836b-41a412d9069e';
const LGA_IJEBU_ODE  = 'f33e1db8-5d94-4261-80b9-71d38db0a4d7';
const LGA_SHAGAMU    = '3fa49b70-447c-4189-822d-c07d1c565a38';

async function seed() {
  console.log('Seeding events...');
  const events = await Promise.all([
    prisma.event.create({ data: {
      lgaId: LGA_ABEOKUTA_S,
      organizerId: ADMIN_ID,
      title: 'Lisabi Festival 2026',
      slug: 'lisabi-festival-2026',
      description: 'The grand annual celebration of Lisabi, the Egba hero who liberated Abeokuta. Three days of cultural displays, traditional music, masquerades, and community feasting across the ancient city.',
      imageUrls: ['https://images.unsplash.com/photo-1533174072545-7a4b6ad7a6c3?w=800'],
      venue: 'Ake Palace Grounds, Abeokuta',
      address: 'Ake, Abeokuta, Ogun State',
      startDate: new Date('2026-08-14'),
      endDate: new Date('2026-08-16'),
      status: 'PUBLISHED',
      isFeatured: true,
    }}),
    prisma.event.create({ data: {
      lgaId: LGA_ABEOKUTA_S,
      organizerId: ADMIN_ID,
      title: 'Ogun State Music Summit',
      slug: 'ogun-music-summit-2026',
      description: 'A premier gathering of Afrobeats, Fuji, and contemporary artists from Ogun State and beyond. Workshops, live performances, and a marketplace for creatives.',
      imageUrls: ['https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=800'],
      venue: 'Olusegun Obasanjo Presidential Library',
      address: 'Presidential Library Complex, Abeokuta',
      startDate: new Date('2026-10-03'),
      endDate: new Date('2026-10-04'),
      status: 'PUBLISHED',
      isFeatured: false,
    }}),
    prisma.event.create({ data: {
      lgaId: LGA_SHAGAMU,
      organizerId: ADMIN_ID,
      title: 'Abeokuta Food & Culture Fair',
      slug: 'abeokuta-food-fair-2026',
      description: 'Savour the rich culinary heritage of Ogun State — from Amala Abeokuta to fresh Ijebu Garri and palm-oil stew. Local chefs, food vendors, and cultural exhibitions.',
      imageUrls: ['https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=800'],
      venue: 'Sagamu Town Square',
      address: 'Sagamu, Ogun State',
      startDate: new Date('2026-12-19'),
      endDate: new Date('2026-12-21'),
      status: 'PUBLISHED',
      isFeatured: true,
    }}),
  ]);
  console.log('  Created', events.length, 'events');

  console.log('Seeding properties...');
  const properties = await Promise.all([
    prisma.property.create({ data: {
      lgaId: LGA_ABEOKUTA_S,
      name: 'Olumo Rock Retreat',
      slug: 'olumo-rock-retreat',
      description: 'A serene boutique villa carved into the hillside overlooking the historic Olumo Rock. Wake up to panoramic views of Abeokuta, enjoy locally-sourced breakfast, and walk to the rock in minutes.',
      type: 'VILLA',
      imageUrls: ['https://images.unsplash.com/photo-1571896349842-33c89424de2d?w=800'],
      address: '12 Olumo Rock Road, Abeokuta, Ogun State',
      pricePerNight: 45000,
      maxGuests: 6,
      amenities: ['WiFi', 'Pool', 'Air Conditioning', 'Generator', 'Breakfast Included', 'Mountain View'],
      isActive: true,
    }}),
    prisma.property.create({ data: {
      lgaId: LGA_IJEBU_ODE,
      name: 'Ijebu Heritage Guesthouse',
      slug: 'ijebu-heritage-guesthouse',
      description: 'A lovingly restored colonial-era guesthouse in the heart of Ijebu-Ode. Antique Yoruba furnishings, a lush tropical garden, and proximity to the Sungbo Eredo heritage site.',
      type: 'GUESTHOUSE',
      imageUrls: ['https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?w=800'],
      address: '5 Folagbade Street, Ijebu-Ode, Ogun State',
      pricePerNight: 28000,
      maxGuests: 4,
      amenities: ['WiFi', 'Air Conditioning', 'Parking', 'Garden', 'Library'],
      isActive: true,
    }}),
    prisma.property.create({ data: {
      lgaId: LGA_SHAGAMU,
      name: 'Sagamu River Farm Stay',
      slug: 'sagamu-river-farm-stay',
      description: 'Disconnect from city life at this working cocoa and cassava farm along the Ogun River. Guided farm tours, fresh produce meals, evening campfire by the river, and a private fishing jetty.',
      type: 'VILLA',
      imageUrls: ['https://images.unsplash.com/photo-1590490360182-c33d57733427?w=800'],
      address: 'Km 3 Sagamu-Ikorodu Road, Sagamu, Ogun State',
      pricePerNight: 35000,
      maxGuests: 8,
      amenities: ['WiFi', 'Generator', 'Farm Tours', 'Fishing', 'Bonfire Pit', 'River View'],
      isActive: true,
    }}),
  ]);
  console.log('  Created', properties.length, 'properties');

  console.log('Seeding vendor...');
  const vendor = await prisma.vendor.create({ data: {
    userId: ADMIN_ID,
    lgaId: LGA_ABEOKUTA_S,
    businessName: 'Ogun Artisans Co-op',
    slug: 'ogun-artisans-coop',
    description: 'A cooperative of over 200 skilled craftspeople from across Ogun State, specialising in Adire textile, Yoruba pottery, beaded jewellery, and organic farm products.',
    status: 'ACTIVE',
    commissionRate: 8,
    govtLevyPct: 2,
  }});
  console.log('  Created vendor:', vendor.businessName);

  console.log('Seeding products...');
  const products = await Promise.all([
    prisma.product.create({ data: {
      vendorId: vendor.id,
      name: 'Hand-Dyed Adire Fabric (2 Yards)',
      slug: 'adire-fabric-2yards',
      description: 'Authentic indigo-dyed Adire Eleko fabric, hand-crafted by master dyers in Abeokuta using traditional resist-dyeing techniques passed down for generations. Each piece is unique.',
      imageUrls: ['https://images.unsplash.com/photo-1610030469983-98e550d6193c?w=800'],
      price: 8500,
      stock: 45,
      isActive: true,
    }}),
    prisma.product.create({ data: {
      vendorId: vendor.id,
      name: 'Yoruba Ceremonial Pottery Set',
      slug: 'yoruba-pottery-set',
      description: 'A hand-thrown and kiln-fired set of three traditional Yoruba pots decorated with geometric Aso-Oke patterns. Perfect for display or ceremonial use.',
      imageUrls: ['https://images.unsplash.com/photo-1565193566173-7a0ee3dbe261?w=800'],
      price: 24000,
      stock: 12,
      isActive: true,
    }}),
    prisma.product.create({ data: {
      vendorId: vendor.id,
      name: 'Beaded Coral Jewellery Set',
      slug: 'beaded-coral-jewellery',
      description: 'Premium Yoruba coral beadwork — necklace, two bangles, and earring set. Handcrafted by Ile-Ife-trained bead artists now based in Ijebu-Ode. A statement of royalty.',
      imageUrls: ['https://images.unsplash.com/photo-1515562141207-7a88fb7ce338?w=800'],
      price: 18750,
      stock: 20,
      isActive: true,
    }}),
    prisma.product.create({ data: {
      vendorId: vendor.id,
      name: 'Organic Ijebu Garri (5kg)',
      slug: 'organic-ijebu-garri-5kg',
      description: 'Sun-dried, coarsely processed cassava flakes from the Ijebu heartland. Naturally sour, low-moisture, and packed with flavour — the Gold Standard of Nigerian garri.',
      imageUrls: ['https://images.unsplash.com/photo-1604329760661-e71dc83f8f26?w=800'],
      price: 4200,
      stock: 200,
      isActive: true,
    }}),
  ]);
  console.log('  Created', products.length, 'products');

  console.log('Seeding studio slots...');
  const studios = await Promise.all([
    prisma.studioSlot.create({ data: {
      name: 'Recording Studio A',
      type: 'RECORDING',
      description: 'Professional 48-track recording studio with Neve console, pro-grade microphones, vocal booth, and mixing suite. Ideal for artists, bands, and music producers.',
      imageUrls: ['https://images.unsplash.com/photo-1598653222000-6b7b7a552625?w=800'],
      pricePerHour: 25000,
      durationMinutes: 60,
      capacity: 6,
      isActive: true,
    }}),
    prisma.studioSlot.create({ data: {
      name: 'Podcast & Radio Suite',
      type: 'PODCAST',
      description: 'A fully soundproofed podcast suite with 4 broadcast-quality mics, Rodecaster interface, DSLR webcam for video recording, and real-time streaming capability.',
      imageUrls: ['https://images.unsplash.com/photo-1478737270239-2f02b77fc618?w=800'],
      pricePerHour: 12000,
      durationMinutes: 60,
      capacity: 4,
      isActive: true,
    }}),
    prisma.studioSlot.create({ data: {
      name: 'Cinematic Video Studio',
      type: 'VIDEO',
      description: 'Cinema-grade lighting rigs, multiple backdrop options, Sony FX3 cameras, and a full colour-grading workstation. Perfect for music videos, short films, and brand shoots.',
      imageUrls: ['https://images.unsplash.com/photo-1601506521793-dc748fc80b67?w=800'],
      pricePerHour: 35000,
      durationMinutes: 120,
      capacity: 10,
      isActive: true,
    }}),
  ]);
  console.log('  Created', studios.length, 'studio slots');

  console.log('\nSeed complete!');
  console.log('Events:', events.map(e => e.title).join(', '));
  console.log('Properties:', properties.map(p => p.name).join(', '));
  console.log('Products:', products.map(p => p.name).join(', '));
  console.log('Studios:', studios.map(s => s.name).join(', '));
}

seed()
  .catch(e => { console.error('SEED FAILED:', e.message); process.exit(1); })
  .finally(() => prisma.$disconnect());
