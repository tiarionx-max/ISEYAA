import { PrismaClient, AttractionCategory } from '@prisma/client';

const prisma = new PrismaClient();

// ─── LGA seed data ────────────────────────────────────────────────────────────

interface LgaSeed {
  name: string;
  slug: string;
  description: string;
  latitude: number;
  longitude: number;
  metadata: {
    history: string;
    culturalAssets: Array<{ name: string; type: string; description: string }>;
    population: number;
    knownFor: string[];
  };
}

const LGAS: LgaSeed[] = [
  {
    name: 'Abeokuta North',
    slug: 'abeokuta-north',
    description: 'Northern district of Ogun State capital, home to government institutions and the Olusegun Obasanjo Presidential Library.',
    latitude: 7.178,
    longitude: 3.358,
    metadata: {
      history: 'Abeokuta North encompasses the administrative heart of Ogun State. The area was historically settled by Egba sub-groups following the 19th-century internecine wars. It grew into a centre of colonial administration and later post-independence governance.',
      culturalAssets: [
        { name: 'Egba Textile Tradition', type: 'craft', description: 'Adire eleko (cassava-resist) and adire oniko (tie-dye) hand-dyed indigo fabrics originating in Abeokuta.' },
        { name: 'Koko Festival', type: 'festival', description: 'Annual masquerade and cultural festival celebrating Egba ancestry and spiritual heritage.' },
      ],
      population: 490000,
      knownFor: ['Presidential Library', 'Government Hill', 'Adire Textile', 'Egba culture'],
    },
  },
  {
    name: 'Abeokuta South',
    slug: 'abeokuta-south',
    description: 'Southern Abeokuta — site of the legendary Olumo Rock and cradle of Egba identity after the 1830 migration.',
    latitude: 7.152,
    longitude: 3.342,
    metadata: {
      history: 'In 1830, Egba refugees fleeing inter-tribal wars found sanctuary in the rock caves of Olumo. They named the settlement "Abeokuta" — under the rock. The city became a centre of Christian missionary activity, producing luminaries including Wole Soyinka and Fela Kuti.',
      culturalAssets: [
        { name: 'Olumo Rock Sanctuary', type: 'sacred_site', description: 'Ancient granite inselberg that sheltered the Egba people; now Ogun State\'s most iconic landmark.' },
        { name: 'Adire Market', type: 'heritage_market', description: 'Bustling Itoku Adire market where artisans produce and sell handcrafted indigo-dyed fabrics.' },
        { name: 'Centenary Hall', type: 'historical_building', description: 'Colonial-era hall marking 100 years of Abeokuta\'s founding.' },
      ],
      population: 535000,
      knownFor: ['Olumo Rock', 'Adire fabric', 'Fela Kuti birthplace', 'Egba kingdom'],
    },
  },
  {
    name: 'Ado-Odo/Ota',
    slug: 'ado-odo-ota',
    description: 'The industrial powerhouse of Ogun State on the Lagos border, famed for manufacturing, trade, and a rich pre-colonial heritage.',
    latitude: 6.692,
    longitude: 3.227,
    metadata: {
      history: 'Ado-Odo is an ancient Awori settlement whose palace tradition predates colonial contact. Ota expanded rapidly during industrialisation in the 1980s–90s, becoming the factory belt of Southwest Nigeria. The LGA hosts over 2,000 registered industries.',
      culturalAssets: [
        { name: 'Ado-Odo Palace', type: 'royal_palace', description: 'Traditional seat of the Olu of Ado-Odo, guardian of Awori history on the Ogun riverbank.' },
        { name: 'Idiroko Border Market', type: 'heritage_market', description: 'International trade market at the Nigeria–Benin Republic border crossing point.' },
      ],
      population: 965000,
      knownFor: ['Ota Industrial Zone', 'Idiroko border', 'Awori heritage', 'Lagos gateway'],
    },
  },
  {
    name: 'Egbado North',
    slug: 'egbado-north',
    description: 'Also known as Yewa North, this LGA preserves Yewa-Yoruba traditions, royal palace culture, and the scenic Yewa River corridor.',
    latitude: 6.975,
    longitude: 3.001,
    metadata: {
      history: 'The Egbado (now officially Yewa) people migrated from ancient Oyo and established kingdoms along the Yewa River. Ilaro, the administrative capital, holds the oldest palace in the region. The LGA is historically significant for its role in the trans-Atlantic slave trade route through Badagry.',
      culturalAssets: [
        { name: 'Ilaro Palace', type: 'royal_palace', description: 'Seat of the Olu of Ilaro, custodian of Yewa-Yoruba royal traditions dating to the 17th century.' },
        { name: 'Yewa River Shrine', type: 'sacred_site', description: 'Annual Yewa River festival where communities give offerings for agricultural abundance.' },
      ],
      population: 318000,
      knownFor: ['Ilaro palace', 'Yewa River', 'Yoruba royal culture', 'cashew farming'],
    },
  },
  {
    name: 'Egbado South',
    slug: 'egbado-south',
    description: 'Southernmost Ogun LGA bordering Benin Republic, with rich cultural exchange traditions and waterside eco-tourism.',
    latitude: 6.705,
    longitude: 2.933,
    metadata: {
      history: 'Egbado South (Yewa South) occupies the historic borderlands between Yoruba territory and the Fon kingdom of Dahomey. Cross-cultural exchanges shaped a unique fusion of Yoruba and West African coastal traditions. Ipokia hosts the Ohori-Ije people with distinct ritual practices.',
      culturalAssets: [
        { name: 'Ohori-Ije Festival', type: 'festival', description: 'Unique cultural festival of the Ohori-Ije people blending Yoruba and Fon (Dahomean) traditions.' },
        { name: 'Yewa Riverine Heritage', type: 'natural_heritage', description: 'Sacred forest and river sites along the Yewa used for ancestral rites.' },
      ],
      population: 205000,
      knownFor: ['Ipokia borderlands', 'Benin Republic gateway', 'Ohori-Ije culture'],
    },
  },
  {
    name: 'Ewekoro',
    slug: 'ewekoro',
    description: 'Home to one of Nigeria\'s largest cement plants and scenic Oyan River vistas; a blend of industry and natural landscapes.',
    latitude: 6.975,
    longitude: 3.213,
    metadata: {
      history: 'Ewekoro sits atop one of West Africa\'s largest limestone deposits, mined since the colonial period. The Oyan Dam, completed in 1983, transformed the LGA\'s landscape and provides water supply to Lagos and Ogun states.',
      culturalAssets: [
        { name: 'Ewekoro Masquerade Tradition', type: 'festival', description: 'Annual Oro and Egungun masquerade performances marking harvest season.' },
      ],
      population: 118000,
      knownFor: ['Ewekoro Cement', 'Oyan River', 'Limestone quarry', 'Egungun tradition'],
    },
  },
  {
    name: 'Ifo',
    slug: 'ifo',
    description: 'A fast-growing LGA on the Lagos–Ibadan corridor with expanding eco-tourism facilities and colonial railway heritage.',
    latitude: 6.820,
    longitude: 3.193,
    metadata: {
      history: 'Ifo grew along the Lagos–Kano railway line established in 1901, serving as a key agricultural collection point for cocoa and palm produce. Today it is a major satellite township absorbing Lagos urban expansion.',
      culturalAssets: [
        { name: 'Colonial Railway Heritage', type: 'industrial_heritage', description: 'Remnants of the Lagos–Kano 1901 railway infrastructure that shaped Ifo\'s growth.' },
      ],
      population: 535000,
      knownFor: ['Lagos proximity', 'Agric corridor', 'Lufasi nature reserve', 'Railway heritage'],
    },
  },
  {
    name: 'Ijebu East',
    slug: 'ijebu-east',
    description: 'Dense forest terrain hosting the UNESCO-recognised Omo Forest Reserve, one of West Africa\'s largest remaining lowland rainforests.',
    latitude: 6.820,
    longitude: 4.100,
    metadata: {
      history: 'Ijebu East is dominated by the ancient Omo Forest, a sacred reserve protected by Ijebu tradition for centuries before formal conservation status. The forest sustained communities through timber, game, and non-timber forest products. It remains a biodiversity hotspot.',
      culturalAssets: [
        { name: 'Omo Forest Sacred Tradition', type: 'sacred_site', description: 'Ijebu forest-guardian traditions that protected Omo Forest for centuries before formal conservation.' },
      ],
      population: 211000,
      knownFor: ['Omo Forest Reserve', 'Biodiversity', 'Rainforest eco-tourism'],
    },
  },
  {
    name: 'Ijebu North',
    slug: 'ijebu-north',
    description: 'Site of Sungbo\'s Eredo — the vast pre-medieval earthworks rivalling the Great Wall in scale — and pottery craft villages.',
    latitude: 6.970,
    longitude: 3.975,
    metadata: {
      history: 'Ijebu North is home to Sungbo\'s Eredo, the largest pre-colonial earthwork in Sub-Saharan Africa, built in the 10th–11th century CE. Local tradition attributes it to Birikisu Sungbo, a wealthy Ijebu queen. The earthworks span 160km and enclosed an area of 2,000 km².',
      culturalAssets: [
        { name: 'Sungbo\'s Eredo', type: 'archaeological_site', description: '10th-century earthwork ramparts spanning 160km, built by Queen Birikisu Sungbo — a wonder of the ancient world.' },
        { name: 'Ijebu-Igbo Pottery', type: 'craft', description: 'Living craft tradition of hand-coiled terracotta pottery unique to Ijebu North artisans.' },
      ],
      population: 285000,
      knownFor: ['Sungbo\'s Eredo', 'Ancient earthworks', 'Pottery craft', 'Ijebu-Igbo'],
    },
  },
  {
    name: 'Ijebu North East',
    slug: 'ijebu-north-east',
    description: 'Ago-Iwoye — a university town on the Ijebu waterfront known for academic culture, traditional wrestling, and riverside recreation.',
    latitude: 6.985,
    longitude: 3.950,
    metadata: {
      history: 'Ago-Iwoye grew as a commercial centre on the Ijebu trade routes connecting the coast to the interior. Its hosting of Tai Solarin College and later TASUED reinforced its identity as an education hub within Ijebu North East.',
      culturalAssets: [
        { name: 'Ago-Iwoye Waterfront Festival', type: 'festival', description: 'Annual riverside celebration combining canoe racing, traditional music, and fishing heritage.' },
        { name: 'Ijebu Wrestling (Gidigbo)', type: 'sport_heritage', description: 'Traditional Ijebu contact sport practised during harvest festivals.' },
      ],
      population: 145000,
      knownFor: ['Ago-Iwoye waterfront', 'University culture', 'Gidigbo wrestling'],
    },
  },
  {
    name: 'Ijebu Ode',
    slug: 'ijebu-ode',
    description: 'The historic Ijebu kingdom capital — a powerful pre-colonial city-state that controlled lucrative trade routes to the Lagos coast.',
    latitude: 6.819,
    longitude: 3.918,
    metadata: {
      history: 'Ijebu Ode was the capital of the Ijebu kingdom, one of the most powerful Yoruba states. The Awujale (king) commanded vast trade networks and a formidable military. In 1892, British forces breached the Ijebu defences at the Battle of Imagbon, opening the interior to colonial penetration.',
      culturalAssets: [
        { name: 'Awujale Palace', type: 'royal_palace', description: 'Seat of the Awujale of Ijebuland, the paramount ruler of all Ijebu people.' },
        { name: 'Ojude Oba Festival', type: 'festival', description: 'Spectacular annual durbar where Ijebu Muslims pay homage to the Awujale with equestrian displays and cultural pageantry.' },
        { name: 'Ijebu Ancient City Walls', type: 'archaeological_site', description: 'Remnants of the 16th-century defensive earthwork that protected the Ijebu kingdom capital.' },
      ],
      population: 340000,
      knownFor: ['Awujale of Ijebuland', 'Ojude Oba festival', 'Ancient kingdom', 'Ijebu trade heritage'],
    },
  },
  {
    name: 'Ikenne',
    slug: 'ikenne',
    description: 'Birthplace of Chief Obafemi Awolowo — Nigeria\'s foremost statesman — nestled in scenic Remo hills in Ikenne-Remo.',
    latitude: 6.878,
    longitude: 3.707,
    metadata: {
      history: 'Ikenne-Remo is world-famous as the hometown of Chief Obafemi Awolowo (1909–1987), regarded by many as the best president Nigeria never had. The town was a centre of Remo intellectual life and Awolowo\'s vision of free education, free healthcare, and regional self-governance.',
      culturalAssets: [
        { name: 'Awolowo Homestead', type: 'heritage_site', description: 'Original residence of Chief Obafemi Awolowo, now preserved as a national monument.' },
        { name: 'Remo Festival of Arts', type: 'festival', description: 'Annual cultural showcase of Remo music, drama, weaving, and culinary traditions.' },
      ],
      population: 167000,
      knownFor: ['Obafemi Awolowo', 'Remo hills', 'Political history', 'Education heritage'],
    },
  },
  {
    name: 'Imeko Afon',
    slug: 'imeko-afon',
    description: 'Remote highland LGA on the Benin Republic border, celebrated for sacred hilltop shrines and untouched forest landscapes.',
    latitude: 7.250,
    longitude: 2.750,
    metadata: {
      history: 'Imeko Afon occupies the northwestern highlands of Ogun State, bordering the Benin Republic. The area has been inhabited since antiquity by Ketu-Yoruba groups whose sacred sites and oral traditions remain largely intact. Its relative isolation preserved a rich corpus of pre-colonial ritual practice.',
      culturalAssets: [
        { name: 'Imeko Sacred Hills', type: 'sacred_site', description: 'Series of hilltop shrines venerated by Ketu-Yoruba communities for divination and ancestral communion.' },
        { name: 'Oluwole Festival', type: 'festival', description: 'Biennial festival bringing diaspora Ketu communities back to Imeko for ancestral rites.' },
      ],
      population: 91000,
      knownFor: ['Sacred shrines', 'Ketu-Yoruba culture', 'Benin border', 'Highland forests'],
    },
  },
  {
    name: 'Ipokia',
    slug: 'ipokia',
    description: 'Borderland LGA where Yoruba and Fon cultures intersect, with the Yewa River estuary and cross-border cultural traditions.',
    latitude: 6.617,
    longitude: 2.903,
    metadata: {
      history: 'Ipokia sits at the southwestern tip of Ogun State, where the Yewa River meets the coastal lagoons draining toward Cotonou. The Anago-Yoruba communities here developed unique bilingual and bicultural identities from centuries of contact with Fon-speaking Dahomeans.',
      culturalAssets: [
        { name: 'Anago-Yoruba Heritage', type: 'cultural_tradition', description: 'Unique Yoruba sub-group in Ipokia with distinct language, dress, and ritual practices shaped by Fon contact.' },
        { name: 'Yewa River Crossing', type: 'natural_heritage', description: 'Historic ferry crossing that has facilitated trade and cultural exchange for centuries.' },
      ],
      population: 134000,
      knownFor: ['Benin Republic border', 'Anago-Yoruba culture', 'Yewa estuary'],
    },
  },
  {
    name: 'Obafemi Owode',
    slug: 'obafemi-owode',
    description: 'Agricultural heartland of Ogun State, home to Ofada rice — Nigeria\'s beloved premium local rice — and Olabisi Onabanjo University.',
    latitude: 6.972,
    longitude: 3.430,
    metadata: {
      history: 'Obafemi Owode hosts OOU (Olabisi Onabanjo University), named after former Ogun State Governor Bisi Onabanjo. The LGA is the nation\'s premier Ofada rice-growing district; the short-grained aromatic rice has a Geographical Indication status and is central to Yoruba cuisine.',
      culturalAssets: [
        { name: 'Ofada Rice Tradition', type: 'culinary_heritage', description: 'Centuries-old cultivation of aromatic short-grain Ofada rice, eaten with native palm oil stew.' },
        { name: 'OOU Cultural Week', type: 'festival', description: 'Annual university cultural festival showcasing Yoruba performing arts and agri-innovation.' },
      ],
      population: 255000,
      knownFor: ['Ofada rice', 'OOU campus', 'Agriculture', 'Yoruba gastronomy'],
    },
  },
  {
    name: 'Odeda',
    slug: 'odeda',
    description: 'Scenic LGA bordering the Oyan Reservoir, offering wildlife, dam tourism, and access to Abeokuta\'s outskirts.',
    latitude: 7.150,
    longitude: 3.230,
    metadata: {
      history: 'Odeda district remained largely rural until the construction of the Oyan Dam in 1983. The reservoir created a large inland water body that transformed the economy, environment, and recreational opportunities of the LGA.',
      culturalAssets: [
        { name: 'Oyan Dam Heritage', type: 'engineering_heritage', description: 'The Oyan Dam (1983) supplies water to Lagos and Ogun states; the reservoir is a major inland fishery.' },
      ],
      population: 134000,
      knownFor: ['Oyan Dam', 'Game reserve', 'Inland fishing', 'Nature tourism'],
    },
  },
  {
    name: 'Odogbolu',
    slug: 'odogbolu',
    description: 'Ijebu sub-group heartland with sacred forest traditions, royal palace heritage, and artisan pottery craft.',
    latitude: 6.783,
    longitude: 3.817,
    metadata: {
      history: 'Odogbolu hosts one of the oldest Ijebu palace lineages, tracing its roots to the founding kingdoms of Ijebu. The LGA\'s sacred forests were protected by royal edict and served as retreats for secret societies and rites of passage.',
      culturalAssets: [
        { name: 'Ode-Lemo Palace', type: 'royal_palace', description: 'Ancient palace of the Olode of Ode-Lemo, custodian of northern Ijebu royal traditions.' },
        { name: 'Odogbolu Sacred Forest', type: 'sacred_site', description: 'Preserved royal forest used for initiation rites by Ijebu secret societies.' },
      ],
      population: 148000,
      knownFor: ['Ijebu palace culture', 'Sacred forest', 'Pottery craft'],
    },
  },
  {
    name: 'Ogun Waterside',
    slug: 'ogun-waterside',
    description: 'Nigeria\'s riverine paradise — where the Ogun River meets dense mangroves, offering boat safaris, fishing villages, and wetland eco-tourism.',
    latitude: 6.710,
    longitude: 4.220,
    metadata: {
      history: 'Ogun Waterside is the most easterly LGA of Ogun State, characterised by riverine communities who have fished the Ogun River and its tributaries for millennia. The area was a transit zone on canoe trade routes between the Benin coast and the Yoruba hinterland.',
      culturalAssets: [
        { name: 'Ogun River Fishing Culture', type: 'cultural_tradition', description: 'Communities using traditional net and basket-fishing methods passed down through generations.' },
        { name: 'Canoe Regatta', type: 'festival', description: 'Annual boat festival on the Ogun River celebrating the fishing heritage of waterside communities.' },
      ],
      population: 87000,
      knownFor: ['Ogun River safari', 'Wetlands', 'Fishing culture', 'Canoe regatta'],
    },
  },
  {
    name: 'Remo North',
    slug: 'remo-north',
    description: 'Hill-country LGA north of Sagamu with world-class pottery traditions, sacred Ogun groves, and lush Remo highland scenery.',
    latitude: 6.900,
    longitude: 3.680,
    metadata: {
      history: 'Remo North encompasses the northern Remo highlands, historically known as the source of fine clay pottery distributed across Yorubaland. The sacred Oro and Ogun festivals regulated community life and the agricultural calendar.',
      culturalAssets: [
        { name: 'Remo Pottery Tradition', type: 'craft', description: 'Centuries-old tradition of hand-coiled pots and water vessels crafted from Remo highland clay.' },
        { name: 'Oro Masquerade', type: 'sacred_festival', description: 'Night-time masquerade festival of the Oro secret society, marking harvest and community purification.' },
      ],
      population: 112000,
      knownFor: ['Remo pottery', 'Sacred groves', 'Oro festival', 'Highland landscape'],
    },
  },
  {
    name: 'Shagamu',
    slug: 'shagamu',
    description: 'Ancient Remo kingdom city at the Lagos–Ibadan expressway junction — a commercial hub with deep royal traditions and living craft culture.',
    latitude: 6.842,
    longitude: 3.650,
    metadata: {
      history: 'Sagamu (officially Shagamu) is the seat of the Akarigbo of Remoland, a paramount traditional ruler. The city grew at the confluence of Lagos–Ibadan and Benin highway trade routes, making it one of Ogun State\'s most commercially vibrant cities. Its rubber and cocoa exports fuelled colonial wealth.',
      culturalAssets: [
        { name: 'Akarigbo Palace', type: 'royal_palace', description: 'Seat of the Akarigbo of Remoland — paramount ruler of all Remo communities.' },
        { name: 'Sagamu Pottery', type: 'craft', description: 'Living tradition of Remo ceramic artisans producing household and ceremonial pottery.' },
        { name: 'Lisabi Festival', type: 'festival', description: 'Annual Egba/Remo cultural festival celebrating Lisabi, the 18th-century Egba revolutionary hero.' },
      ],
      population: 402000,
      knownFor: ['Akarigbo of Remoland', 'Lagos–Ibadan expressway', 'Rubber and cocoa heritage', 'Pottery'],
    },
  },
];

// ─── Attraction seed data ─────────────────────────────────────────────────────

interface AttractionSeed {
  lgaSlug: string;
  name: string;
  slug: string;
  description: string;
  category: AttractionCategory;
  imageUrls: string[];
  latitude: number;
  longitude: number;
  address: string;
  entryFee: number;
  metadata: object;
}

const ATTRACTIONS: AttractionSeed[] = [
  // ─── Abeokuta North ──────────────────────────────────────────────────────
  {
    lgaSlug: 'abeokuta-north',
    name: 'Olusegun Obasanjo Presidential Library',
    slug: 'olusegun-obasanjo-presidential-library',
    description: 'A world-class presidential library and museum complex in Oke-Mosan, Abeokuta, housing the archives, personal collections, and legacy of Nigeria\'s former President Olusegun Obasanjo. Features a conference centre, gardens, and an extensive research library.',
    category: 'HISTORICAL',
    imageUrls: ['https://storage.iseyaa.ng/attractions/obasanjo-library-1.jpg'],
    latitude: 7.1725,
    longitude: 3.3547,
    address: 'Oke-Mosan, Abeokuta, Ogun State',
    entryFee: 1000,
    metadata: { openingHours: '09:00–17:00 Mon–Fri, 10:00–15:00 Sat', established: 2005, type: 'presidential_library' },
  },
  {
    lgaSlug: 'abeokuta-north',
    name: 'Centenary City Park',
    slug: 'centenary-city-park',
    description: 'A modern recreational park and commercial development celebrating Ogun State\'s centenary. Features landscaped gardens, fountains, a cultural pavilion, and family entertainment facilities in the heart of Abeokuta.',
    category: 'RECREATIONAL',
    imageUrls: ['https://storage.iseyaa.ng/attractions/centenary-city-1.jpg'],
    latitude: 7.1636,
    longitude: 3.3652,
    address: 'Abeokuta, Ogun State',
    entryFee: 500,
    metadata: { openingHours: '08:00–20:00 daily', amenities: ['fountain', 'food court', 'children playground'] },
  },
  {
    lgaSlug: 'abeokuta-north',
    name: 'Abeokuta Cultural Centre',
    slug: 'abeokuta-cultural-centre',
    description: 'The premier hub for Egba arts, crafts, and performing arts in Ogun State. Regular exhibitions of Adire textiles, bronze work, and wood carving; hosts the state government\'s cultural events and international arts festivals.',
    category: 'CULTURAL',
    imageUrls: ['https://storage.iseyaa.ng/attractions/abeokuta-cultural-centre-1.jpg'],
    latitude: 7.1584,
    longitude: 3.3612,
    address: 'Cultural Centre Road, Abeokuta',
    entryFee: 0,
    metadata: { openingHours: '09:00–18:00 Mon–Sat', amenities: ['gallery', 'craft market', 'performance stage'] },
  },

  // ─── Abeokuta South ──────────────────────────────────────────────────────
  {
    lgaSlug: 'abeokuta-south',
    name: 'Olumo Rock',
    slug: 'olumo-rock',
    description: 'Ogun State\'s most iconic landmark — a massive granite inselberg that sheltered Egba refugees during 19th-century wars. Climb 137 steps to the summit for panoramic views of Abeokuta. Includes a museum, caves, and a traditional shrine. Listed among Nigeria\'s Seven Wonders.',
    category: 'HISTORICAL',
    imageUrls: ['https://storage.iseyaa.ng/attractions/olumo-rock-1.jpg', 'https://storage.iseyaa.ng/attractions/olumo-rock-2.jpg'],
    latitude: 7.1547,
    longitude: 3.3487,
    address: 'Olumo Rock Road, Ibara, Abeokuta',
    entryFee: 500,
    metadata: { openingHours: '09:00–18:00 daily', elevation: 137, established: 1830, amenities: ['elevator', 'museum', 'restaurant', 'souvenir shop'] },
  },
  {
    lgaSlug: 'abeokuta-south',
    name: 'Itoku Adire Market',
    slug: 'itoku-adire-market',
    description: 'The living heart of Abeokuta\'s famous Adire textile tradition. Hundreds of artisans dye, print, and sell handcrafted indigo-resist fabrics in vibrant open stalls. Watch the traditional cassava-starch and tie-and-dye processes up close and commission bespoke designs.',
    category: 'CULTURAL',
    imageUrls: ['https://storage.iseyaa.ng/attractions/itoku-adire-1.jpg'],
    latitude: 7.1502,
    longitude: 3.3441,
    address: 'Itoku Market, Abeokuta South',
    entryFee: 0,
    metadata: { openingHours: '08:00–19:00 Mon–Sat', specialty: 'Adire eleko and adire oniko textiles' },
  },
  {
    lgaSlug: 'abeokuta-south',
    name: 'Lafenwa Market Heritage Quarter',
    slug: 'lafenwa-market-heritage-quarter',
    description: 'One of Ogun State\'s oldest commercial marketplaces, tracing its roots to 19th-century Egba trade. The heritage quarter preserves colonial-era architecture alongside traditional pottery, woodcraft, and food stalls.',
    category: 'CULTURAL',
    imageUrls: ['https://storage.iseyaa.ng/attractions/lafenwa-1.jpg'],
    latitude: 7.1476,
    longitude: 3.3398,
    address: 'Lafenwa, Abeokuta South',
    entryFee: 0,
    metadata: { openingHours: '07:00–20:00 daily', specialty: 'traditional pottery, woodcraft, foodstuffs' },
  },

  // ─── Ado-Odo/Ota ─────────────────────────────────────────────────────────
  {
    lgaSlug: 'ado-odo-ota',
    name: 'Ado-Odo Palace and Awori Heritage Museum',
    slug: 'ado-odo-palace-awori-heritage-museum',
    description: 'The traditional seat of the Olu of Ado-Odo overlooks the Ogun River. The adjacent heritage museum documents the Awori people\'s pre-colonial civilization, including artefacts from the riverine trade era and ceremonial regalia.',
    category: 'HISTORICAL',
    imageUrls: ['https://storage.iseyaa.ng/attractions/ado-odo-palace-1.jpg'],
    latitude: 6.6024,
    longitude: 3.0462,
    address: 'Palace Road, Ado-Odo, Ogun State',
    entryFee: 500,
    metadata: { openingHours: '09:00–17:00 Mon–Sat', established: 'pre-1800s' },
  },
  {
    lgaSlug: 'ado-odo-ota',
    name: 'Idiroko Border Heritage Market',
    slug: 'idiroko-border-heritage-market',
    description: 'Nigeria\'s busiest border market with Benin Republic — a vibrant cross-cultural trading point where Yoruba, Fon, and international traders exchange goods, cuisine, and culture. The market has operated continuously since the colonial era.',
    category: 'CULTURAL',
    imageUrls: ['https://storage.iseyaa.ng/attractions/idiroko-1.jpg'],
    latitude: 6.6134,
    longitude: 2.9508,
    address: 'Idiroko Border, Ado-Odo/Ota',
    entryFee: 0,
    metadata: { openingHours: '06:00–20:00 daily', type: 'border_market', international: true },
  },
  {
    lgaSlug: 'ado-odo-ota',
    name: 'Ota Waterfalls and Nature Trail',
    slug: 'ota-waterfalls-nature-trail',
    description: 'A scenic waterfall cascade fed by seasonal streams north of Ota town. The surrounding nature trail passes through secondary forest with bird-watching opportunities and provides a cool retreat from the industrial town.',
    category: 'NATURAL',
    imageUrls: ['https://storage.iseyaa.ng/attractions/ota-waterfalls-1.jpg'],
    latitude: 6.7025,
    longitude: 3.2283,
    address: 'Northern Ota, Ado-Odo/Ota LGA',
    entryFee: 200,
    metadata: { bestSeason: 'June–October', trail_km: 3.5 },
  },

  // ─── Egbado North ────────────────────────────────────────────────────────
  {
    lgaSlug: 'egbado-north',
    name: 'Ilaro Palace and Cultural Museum',
    slug: 'ilaro-palace-cultural-museum',
    description: 'Seat of the Olu of Ilaro, one of the oldest royal institutions in Yewa territory. The attached cultural museum exhibits royal regalia, ancestral masks, and historical documents spanning 400 years of Yewa-Yoruba kingship.',
    category: 'CULTURAL',
    imageUrls: ['https://storage.iseyaa.ng/attractions/ilaro-palace-1.jpg'],
    latitude: 6.8893,
    longitude: 3.0007,
    address: 'Palace Road, Ilaro, Egbado North',
    entryFee: 500,
    metadata: { openingHours: '09:00–16:00 Mon–Sat', established: '17th century' },
  },
  {
    lgaSlug: 'egbado-north',
    name: 'Yewa River Scenic Park',
    slug: 'yewa-river-scenic-park',
    description: 'A peaceful riverside park along the Yewa River north of Ilaro, featuring walking trails, picnic areas, and canoe hire. The annual Yewa Festival takes place here, drawing thousands of visitors for ancestral river rites and cultural performances.',
    category: 'NATURAL',
    imageUrls: ['https://storage.iseyaa.ng/attractions/yewa-river-1.jpg'],
    latitude: 6.9012,
    longitude: 3.0095,
    address: 'Yewa River Bank, Ilaro',
    entryFee: 0,
    metadata: { amenities: ['picnic area', 'canoe hire', 'fishing'], bestSeason: 'Nov–April' },
  },
  {
    lgaSlug: 'egbado-north',
    name: 'Ilaro Agric Heritage Farm',
    slug: 'ilaro-agric-heritage-farm',
    description: 'An agro-tourism farm demonstrating traditional Yewa farming practices alongside modern sustainable agriculture. Visitors can harvest tropical fruits, tour the cashew orchards, and participate in palm-wine tapping demonstrations.',
    category: 'RECREATIONAL',
    imageUrls: ['https://storage.iseyaa.ng/attractions/ilaro-farm-1.jpg'],
    latitude: 6.8804,
    longitude: 2.9982,
    address: 'Farm Road, Ilaro, Egbado North',
    entryFee: 1000,
    metadata: { openingHours: '08:00–17:00 Tue–Sun', amenities: ['guided tours', 'fruit picking', 'palm wine'] },
  },

  // ─── Egbado South ────────────────────────────────────────────────────────
  {
    lgaSlug: 'egbado-south',
    name: 'Ipokia Palace and Heritage Complex',
    slug: 'ipokia-palace-heritage-complex',
    description: 'The royal compound of the Onipokia of Ipokia kingdom, one of the ancient Anago-Yoruba chieftaincies. The complex includes a small heritage museum, sacred groves, and guest facilities for cultural tourism.',
    category: 'HISTORICAL',
    imageUrls: ['https://storage.iseyaa.ng/attractions/ipokia-palace-1.jpg'],
    latitude: 6.6173,
    longitude: 2.9028,
    address: 'Palace Square, Ipokia, Egbado South',
    entryFee: 300,
    metadata: { openingHours: '09:00–16:00', specialty: 'Anago-Yoruba culture' },
  },
  {
    lgaSlug: 'egbado-south',
    name: 'Yewa River Eco-Tourism Forest',
    slug: 'yewa-river-eco-tourism-forest',
    description: 'A community-managed forest reserve along the lower Yewa River, featuring riverine wetlands, migratory birds, and traditional canoe tours. The site is managed by local women\'s cooperatives and delivers conservation income to the community.',
    category: 'NATURAL',
    imageUrls: ['https://storage.iseyaa.ng/attractions/yewa-eco-forest-1.jpg'],
    latitude: 6.7098,
    longitude: 2.9412,
    address: 'Lower Yewa, Egbado South',
    entryFee: 500,
    metadata: { amenities: ['canoe tours', 'bird watching', 'nature trail'], community_managed: true },
  },
  {
    lgaSlug: 'egbado-south',
    name: 'Benin Republic Border Cultural Centre',
    slug: 'benin-republic-border-cultural-centre',
    description: 'A cross-cultural exchange centre at the Egbado South–Benin Republic border, showcasing the blended traditions of Anago-Yoruba and Fon peoples. Regular cultural showcases, bilingual storytelling, and craft exhibitions.',
    category: 'CULTURAL',
    imageUrls: ['https://storage.iseyaa.ng/attractions/border-cultural-1.jpg'],
    latitude: 6.6201,
    longitude: 2.9097,
    address: 'Nigeria-Benin Border Zone, Ipokia',
    entryFee: 0,
    metadata: { languages: ['Yoruba', 'Fon', 'French', 'English'], specialty: 'cross-cultural exchange' },
  },

  // ─── Ewekoro ─────────────────────────────────────────────────────────────
  {
    lgaSlug: 'ewekoro',
    name: 'Oyan Lake and Dam Viewpoint',
    slug: 'oyan-lake-dam-viewpoint',
    description: 'The Oyan Dam reservoir stretches across the Ogun/Oyo border and is one of Nigeria\'s major water supply infrastructures. The viewpoint park offers stunning panoramas of the lake, fishing activity, and the 1983 dam structure. Boat tours available.',
    category: 'NATURAL',
    imageUrls: ['https://storage.iseyaa.ng/attractions/oyan-lake-1.jpg'],
    latitude: 6.9731,
    longitude: 3.2134,
    address: 'Oyan Dam Road, Ewekoro',
    entryFee: 0,
    metadata: { amenities: ['boat tours', 'picnic area', 'fishing'], dam_completed: 1983 },
  },
  {
    lgaSlug: 'ewekoro',
    name: 'Ewekoro Limestone Gorge',
    slug: 'ewekoro-limestone-gorge',
    description: 'A dramatic geological formation of exposed limestone cliffs and karst gullies formed over 60 million years. The site offers guided geological tours and photography opportunities. The cliffs change colour spectacularly at sunset.',
    category: 'NATURAL',
    imageUrls: ['https://storage.iseyaa.ng/attractions/limestone-gorge-1.jpg'],
    latitude: 6.9785,
    longitude: 3.2150,
    address: 'Ewekoro Industrial Area, Ewekoro LGA',
    entryFee: 300,
    metadata: { geology: 'Cretaceous limestone', guided_tours: true },
  },
  {
    lgaSlug: 'ewekoro',
    name: 'Ewekoro Community Wildlife Sanctuary',
    slug: 'ewekoro-community-wildlife-sanctuary',
    description: 'A community-conserved wildlife area protecting mammals, reptiles, and over 80 bird species in the Oyan River catchment. Guided walks reveal vervet monkeys, pangolins (rare), and diverse birdlife.',
    category: 'NATURAL',
    imageUrls: ['https://storage.iseyaa.ng/attractions/ewekoro-sanctuary-1.jpg'],
    latitude: 6.9892,
    longitude: 3.2219,
    address: 'Ewekoro Conservation Area',
    entryFee: 500,
    metadata: { bird_species: 80, mammals: ['vervet monkey', 'bush baby', 'mongoose'], amenities: ['guided walks'] },
  },

  // ─── Ifo ─────────────────────────────────────────────────────────────────
  {
    lgaSlug: 'ifo',
    name: 'Lufasi Nature Park',
    slug: 'lufasi-nature-park',
    description: 'A privately managed nature reserve on the Lagos–Ibadan expressway corridor, featuring mangrove boardwalks, bird hides, and educational trails through secondary rainforest. Home to rare forest birds, reptiles, and seasonal butterflies.',
    category: 'NATURAL',
    imageUrls: ['https://storage.iseyaa.ng/attractions/lufasi-park-1.jpg'],
    latitude: 6.6450,
    longitude: 3.1820,
    address: 'Lagos-Ibadan Expressway Corridor, Ifo LGA',
    entryFee: 2000,
    metadata: { amenities: ['boardwalk', 'bird hides', 'guided tours', 'picnic'], private: true },
  },
  {
    lgaSlug: 'ifo',
    name: 'Ifo Colonial Railway Heritage Site',
    slug: 'ifo-colonial-railway-heritage-site',
    description: 'A preserved section of the original 1901 Lagos–Kano railway line through Ifo. The heritage site includes restored station buildings, vintage rolling stock, and an interpretive exhibit on how the railway transformed commerce across southwest Nigeria.',
    category: 'HISTORICAL',
    imageUrls: ['https://storage.iseyaa.ng/attractions/ifo-railway-1.jpg'],
    latitude: 6.8205,
    longitude: 3.1948,
    address: 'Old Railway Station, Ifo',
    entryFee: 300,
    metadata: { railway_established: 1901, gauge: 'metre gauge', artefacts: ['vintage locomotives', 'colonial signage'] },
  },
  {
    lgaSlug: 'ifo',
    name: 'Ifo Agro-Tourism Recreation Centre',
    slug: 'ifo-agro-tourism-recreation-centre',
    description: 'A family-friendly farm experience combining agro-tourism with outdoor recreation — fruit picking, ATV rides through cocoa plantations, and a children\'s petting zoo. Overnight glamping pods available on request.',
    category: 'RECREATIONAL',
    imageUrls: ['https://storage.iseyaa.ng/attractions/ifo-agro-1.jpg'],
    latitude: 6.8212,
    longitude: 3.1981,
    address: 'Farm Estate, Ifo, Ogun State',
    entryFee: 1500,
    metadata: { amenities: ['ATV rides', 'glamping', 'petting zoo', 'fruit picking'], openingHours: '09:00–18:00 daily' },
  },

  // ─── Ijebu East ──────────────────────────────────────────────────────────
  {
    lgaSlug: 'ijebu-east',
    name: 'Omo Forest Reserve',
    slug: 'omo-forest-reserve',
    description: 'One of the largest remaining lowland rainforests in West Africa, spanning 130,000 hectares straddling Ogun and Ondo states. Home to 156 tree species, forest elephants, chimpanzees, and over 200 bird species. Eco-tourism camps, guided forest walks, and canopy trails available.',
    category: 'NATURAL',
    imageUrls: ['https://storage.iseyaa.ng/attractions/omo-forest-1.jpg', 'https://storage.iseyaa.ng/attractions/omo-forest-2.jpg'],
    latitude: 6.7333,
    longitude: 4.1167,
    address: 'Omo Forest Reserve, Ijebu East, Ogun State',
    entryFee: 1500,
    metadata: { area_ha: 130000, tree_species: 156, mammal_species: ['forest elephant', 'chimpanzee', 'bushbuck'], bird_species: 200, amenities: ['eco-camp', 'guided walks', 'canopy trail'] },
  },
  {
    lgaSlug: 'ijebu-east',
    name: 'Apena Waterfall',
    slug: 'apena-waterfall',
    description: 'A hidden waterfall deep within the Omo Forest buffer zone, accessible via a 3km guided forest trail. The multi-tiered cascade drops 25 metres into a clear natural pool, ideal for swimming and photography.',
    category: 'NATURAL',
    imageUrls: ['https://storage.iseyaa.ng/attractions/apena-waterfall-1.jpg'],
    latitude: 6.7501,
    longitude: 4.1004,
    address: 'Omo Forest Buffer Zone, Ijebu East',
    entryFee: 500,
    metadata: { trail_km: 3, height_m: 25, swimming: true, guide_required: true },
  },
  {
    lgaSlug: 'ijebu-east',
    name: 'Ijebu East Cultural Museum',
    slug: 'ijebu-east-cultural-museum',
    description: 'A community museum documenting the history and material culture of the eastern Ijebu communities, including forest-based livelihoods, traditional medicine, and the spiritual relationship between the Ijebu people and the Omo Forest.',
    category: 'CULTURAL',
    imageUrls: ['https://storage.iseyaa.ng/attractions/ijebu-east-museum-1.jpg'],
    latitude: 6.7202,
    longitude: 4.0802,
    address: 'Museum Road, Ijebu East LGA Headquarters',
    entryFee: 300,
    metadata: { collections: ['forest artefacts', 'traditional medicine', 'oral history recordings'] },
  },

  // ─── Ijebu North ─────────────────────────────────────────────────────────
  {
    lgaSlug: 'ijebu-north',
    name: 'Birikisu Sungbo Shrine and Eredo Earthworks',
    slug: 'birikisu-sungbo-shrine-eredo-earthworks',
    description: 'One of Africa\'s most extraordinary archaeological wonders — 160km of earthwork ramparts and moats built in the 10th–11th century CE, enclosing an area of 2,000 km². Built by the legendary Ijebu queen Birikisu Sungbo, it predates the Great Zimbabwe and rivals the Great Wall in scale. The central shrine is a pilgrimage destination for both Muslims and followers of Yoruba tradition.',
    category: 'HISTORICAL',
    imageUrls: ['https://storage.iseyaa.ng/attractions/sungbo-eredo-1.jpg', 'https://storage.iseyaa.ng/attractions/sungbo-eredo-2.jpg'],
    latitude: 6.9301,
    longitude: 3.9449,
    address: 'Oke-Eri Village, Ijebu North, Ogun State',
    entryFee: 1000,
    metadata: { age_century: '10th–11th CE', total_length_km: 160, enclosed_area_km2: 2000, UNESCO_nomination: true, significance: 'largest pre-colonial earthwork in Sub-Saharan Africa' },
  },
  {
    lgaSlug: 'ijebu-north',
    name: 'Ijebu-Igbo Pottery Village',
    slug: 'ijebu-igbo-pottery-village',
    description: 'A living craft village where artisan potters hand-coil red terracotta vessels using techniques unchanged for 800 years. Visitors can participate in pottery classes, commission custom pieces, and browse the village market for local ceramics.',
    category: 'CULTURAL',
    imageUrls: ['https://storage.iseyaa.ng/attractions/ijebu-pottery-1.jpg'],
    latitude: 6.9682,
    longitude: 3.9978,
    address: 'Pottery Quarter, Ijebu-Igbo, Ogun State',
    entryFee: 0,
    metadata: { craft: 'hand-coiled terracotta pottery', workshop: true, class_price_ngn: 2500 },
  },
  {
    lgaSlug: 'ijebu-north',
    name: 'Ijebu-Igbo Sacred Grove',
    slug: 'ijebu-igbo-sacred-grove',
    description: 'A royal-protected forest grove that served Ijebu North\'s secret societies for rites of passage and ancestral worship. Guided spiritual ecology tours reveal medicinal plants, shrine structures, and the forest\'s biodiversity. Respectful dress required.',
    category: 'RELIGIOUS',
    imageUrls: ['https://storage.iseyaa.ng/attractions/ijebu-igbo-grove-1.jpg'],
    latitude: 6.9720,
    longitude: 4.0010,
    address: 'Forest Edge, Ijebu-Igbo',
    entryFee: 500,
    metadata: { dress_code: 'modest', guide_required: true, spiritual_significance: 'high' },
  },

  // ─── Ijebu North East ────────────────────────────────────────────────────
  {
    lgaSlug: 'ijebu-north-east',
    name: 'Ago-Iwoye Waterfront Park',
    slug: 'ago-iwoye-waterfront-park',
    description: 'A tranquil riverfront park in the university town of Ago-Iwoye, offering sunset views over the waterway, fishing platforms, and a promenade. A popular gathering spot for students, families, and visitors to Tai Solarin University of Education (TASUED).',
    category: 'NATURAL',
    imageUrls: ['https://storage.iseyaa.ng/attractions/ago-iwoye-waterfront-1.jpg'],
    latitude: 6.9833,
    longitude: 3.9500,
    address: 'Waterfront Road, Ago-Iwoye, Ijebu North East',
    entryFee: 0,
    metadata: { amenities: ['fishing platform', 'promenade', 'food stalls'], nearby: 'TASUED campus' },
  },
  {
    lgaSlug: 'ijebu-north-east',
    name: 'Awaiye Sacred Forest',
    slug: 'awaiye-sacred-forest',
    description: 'A protected ancestral forest near Awaiye village in Ijebu North East, used for Ijebu initiation rites and regarded as the abode of forest spirits. Guided nature-spiritual tours available with prior arrangement.',
    category: 'RELIGIOUS',
    imageUrls: ['https://storage.iseyaa.ng/attractions/awaiye-forest-1.jpg'],
    latitude: 6.9782,
    longitude: 3.9403,
    address: 'Awaiye Village, Ijebu North East',
    entryFee: 300,
    metadata: { guide_required: true, advance_booking: true, spiritual_significance: 'very high' },
  },
  {
    lgaSlug: 'ijebu-north-east',
    name: 'Ago-Iwoye Heritage Pottery Market',
    slug: 'ago-iwoye-heritage-pottery-market',
    description: 'A weekly craft market in Ago-Iwoye showcasing the finest Ijebu pottery, woven textiles, and carved furniture. The market has operated continuously since the 1940s and is a key outlet for local artisans.',
    category: 'CULTURAL',
    imageUrls: ['https://storage.iseyaa.ng/attractions/ago-iwoye-market-1.jpg'],
    latitude: 6.9830,
    longitude: 3.9480,
    address: 'Central Market, Ago-Iwoye',
    entryFee: 0,
    metadata: { market_days: ['Thursday', 'Saturday'], specialty: 'pottery, textiles, woodcraft' },
  },

  // ─── Ijebu Ode ───────────────────────────────────────────────────────────
  {
    lgaSlug: 'ijebu-ode',
    name: 'Awujale Palace (Ijebu Ode Royal Court)',
    slug: 'awujale-palace-ijebu-ode-royal-court',
    description: 'The ancient palace of the Awujale of Ijebuland — the paramount ruler of all Ijebu people and one of the most powerful traditional rulers in Yorubaland. The palace complex dates to the 16th century and features royal courtyards, a museum of Ijebu regalia, and ancestral shrines.',
    category: 'HISTORICAL',
    imageUrls: ['https://storage.iseyaa.ng/attractions/awujale-palace-1.jpg'],
    latitude: 6.8186,
    longitude: 3.9183,
    address: 'Oba Adesanya Way, Ijebu-Ode',
    entryFee: 500,
    metadata: { established: '16th century', amenities: ['museum', 'royal courtyard', 'guided tours'], ruler: 'Awujale of Ijebuland' },
  },
  {
    lgaSlug: 'ijebu-ode',
    name: 'Ijebu Ode Museum of Antiquities',
    slug: 'ijebu-ode-museum-of-antiquities',
    description: 'A comprehensive museum displaying Ijebu archaeological finds, royal artefacts, and documentation of the 1892 Battle of Imagbon — when British forces breached the Ijebu kingdom. Features rare 14th–17th century bronzes recovered from palace sites.',
    category: 'CULTURAL',
    imageUrls: ['https://storage.iseyaa.ng/attractions/ijebu-museum-1.jpg'],
    latitude: 6.8198,
    longitude: 3.9162,
    address: 'Museum Road, Ijebu-Ode',
    entryFee: 300,
    metadata: { collections: ['14th–17th century bronzes', 'colonial-era documents', 'royal regalia'] },
  },
  {
    lgaSlug: 'ijebu-ode',
    name: 'Ojude Oba Festival Ground',
    slug: 'ojude-oba-festival-ground',
    description: 'The grand ceremonial ground where the Ojude Oba festival takes place — a spectacular annual durbar where Muslim Ijebu chiefs and communities pay homage to the Awujale with equestrian displays, colourful processions, and cultural pageantry. Rated among Nigeria\'s top 5 annual festivals.',
    category: 'CULTURAL',
    imageUrls: ['https://storage.iseyaa.ng/attractions/ojude-oba-1.jpg'],
    latitude: 6.8201,
    longitude: 3.9175,
    address: 'Festival Ground, Ijebu-Ode',
    entryFee: 1000,
    metadata: { festival_timing: '3rd day after Eid al-Fitr', significance: 'Muslim-Yoruba royalty celebration', attendees_annually: 50000 },
  },

  // ─── Ikenne ───────────────────────────────────────────────────────────────
  {
    lgaSlug: 'ikenne',
    name: 'Chief Obafemi Awolowo Homestead Museum',
    slug: 'chief-obafemi-awolowo-homestead-museum',
    description: 'The original family compound and residence of Chief Obafemi Awolowo (1909–1987) in Ikenne-Remo. The national monument preserves Awolowo\'s personal library, study, and family memorabilia. A pilgrimage site for students of Nigerian political history and the Yoruba self-determination movement.',
    category: 'HISTORICAL',
    imageUrls: ['https://storage.iseyaa.ng/attractions/awolowo-homestead-1.jpg'],
    latitude: 6.8830,
    longitude: 3.7078,
    address: 'Awolowo Road, Ikenne-Remo, Ogun State',
    entryFee: 500,
    metadata: { born: '1909-03-06', died: '1987-05-09', significance: 'foremost Nigerian statesman', amenities: ['personal library', 'guided tour', 'archive'] },
  },
  {
    lgaSlug: 'ikenne',
    name: 'Ikenne Remo Hills Nature Reserve',
    slug: 'ikenne-remo-hills-nature-reserve',
    description: 'A scenic nature reserve in the Remo hills northeast of Ikenne, with hiking trails, rock formations, and panoramic views over the Ogun State agricultural plains. The reserve hosts rare Afromontane plant communities.',
    category: 'NATURAL',
    imageUrls: ['https://storage.iseyaa.ng/attractions/remo-hills-1.jpg'],
    latitude: 6.8854,
    longitude: 3.7152,
    address: 'Remo Hills, Ikenne LGA',
    entryFee: 500,
    metadata: { trail_km: 5, elevation_m: 320, amenities: ['hiking', 'bird watching', 'photography'] },
  },
  {
    lgaSlug: 'ikenne',
    name: 'Remo Festival of Arts and Culture Centre',
    slug: 'remo-festival-arts-culture-centre',
    description: 'A permanent cultural centre in Ikenne hosting the annual Remo Arts Festival and year-round exhibitions of local weaving, sculpture, and performing arts. The venue incubates young Remo artists and provides craft training workshops.',
    category: 'CULTURAL',
    imageUrls: ['https://storage.iseyaa.ng/attractions/remo-arts-centre-1.jpg'],
    latitude: 6.8802,
    longitude: 3.7065,
    address: 'Arts Centre Road, Ikenne',
    entryFee: 0,
    metadata: { amenities: ['gallery', 'workshop rooms', 'performance stage'], annual_festival: 'Remo Arts Festival' },
  },

  // ─── Imeko Afon ──────────────────────────────────────────────────────────
  {
    lgaSlug: 'imeko-afon',
    name: 'Imeko Sacred Hills and Ketu Shrines',
    slug: 'imeko-sacred-hills-ketu-shrines',
    description: 'A series of hilltop sacred sites venerated by Ketu-Yoruba communities for divination, ancestral communion, and healing rites. The granite outcrops offer breathtaking views of the Nigeria–Benin Republic border landscape. Guides from local shrine custodian families lead respectful visits.',
    category: 'RELIGIOUS',
    imageUrls: ['https://storage.iseyaa.ng/attractions/imeko-hills-1.jpg'],
    latitude: 7.2500,
    longitude: 2.7500,
    address: 'Imeko, Imeko Afon LGA, Ogun State',
    entryFee: 500,
    metadata: { altitude_m: 420, guide_required: true, significance: 'Ketu-Yoruba ancestral religion', dress_code: 'modest' },
  },
  {
    lgaSlug: 'imeko-afon',
    name: 'Afon Forest Reserve',
    slug: 'afon-forest-reserve',
    description: 'A pristine highland forest reserve near Afon town in the Imeko highlands. The reserve contains important water catchment vegetation, endemic plant species, and serves as a buffer zone protecting communities from desertification creeping from the north.',
    category: 'NATURAL',
    imageUrls: ['https://storage.iseyaa.ng/attractions/afon-forest-1.jpg'],
    latitude: 7.2453,
    longitude: 2.7432,
    address: 'Afon, Imeko Afon LGA',
    entryFee: 0,
    metadata: { vegetation: 'highland forest transition zone', ecological_role: 'water catchment, biodiversity corridor' },
  },
  {
    lgaSlug: 'imeko-afon',
    name: 'Imeko Cross-Border Cultural Exchange Centre',
    slug: 'imeko-cross-border-cultural-exchange-centre',
    description: 'A bi-national cultural centre at the Nigeria–Benin Republic border in Imeko, celebrating the shared Ketu-Yoruba heritage across both nations. Features a bilingual (English/French) heritage gallery, cross-border craft market, and annual Oluwole Festival facilities.',
    category: 'CULTURAL',
    imageUrls: ['https://storage.iseyaa.ng/attractions/imeko-cultural-1.jpg'],
    latitude: 7.2524,
    longitude: 2.7527,
    address: 'Border Zone, Imeko, Ogun State',
    entryFee: 0,
    metadata: { languages: ['Ketu-Yoruba', 'French', 'English'], annual_festival: 'Oluwole Festival', cross_border: true },
  },

  // ─── Ipokia ──────────────────────────────────────────────────────────────
  {
    lgaSlug: 'ipokia',
    name: 'Ipokia Anago Kingdom Heritage Site',
    slug: 'ipokia-anago-kingdom-heritage-site',
    description: 'The historic seat of the Anago-Yoruba of Ipokia — a Yoruba sub-group whose identity was shaped by centuries of contact with Fon-speaking Dahomeans. The heritage site includes the Onipokia\'s palace, oral history archive, and traditional dress museum.',
    category: 'HISTORICAL',
    imageUrls: ['https://storage.iseyaa.ng/attractions/ipokia-heritage-1.jpg'],
    latitude: 6.6173,
    longitude: 2.9028,
    address: 'Ipokia Town Centre, Ipokia LGA',
    entryFee: 300,
    metadata: { people: 'Anago-Yoruba', significance: 'unique Yoruba-Fon cultural fusion' },
  },
  {
    lgaSlug: 'ipokia',
    name: 'Yewa-Oni Waterside Recreation',
    slug: 'yewa-oni-waterside-recreation',
    description: 'A scenic riverside area where the Yewa and Oni rivers converge near Ipokia. Community-run boat tours, fishing, and riverside picnic facilities attract visitors from Cotonou and Lagos. A stunning wetland ecosystem at the Nigeria–Benin border.',
    category: 'NATURAL',
    imageUrls: ['https://storage.iseyaa.ng/attractions/yewa-oni-waterside-1.jpg'],
    latitude: 6.6201,
    longitude: 2.9082,
    address: 'River Confluence, Ipokia LGA',
    entryFee: 0,
    metadata: { amenities: ['boat tours', 'fishing', 'picnic'], ecology: 'riverine wetland' },
  },
  {
    lgaSlug: 'ipokia',
    name: 'Ohori-Ije Cultural Festival Ground',
    slug: 'ohori-ije-cultural-festival-ground',
    description: 'The ceremonial ground for the Ohori-Ije people\'s annual festival — a unique cultural event blending Yoruba masquerade, Fon drumming traditions, and communal feast. The only festival in Nigeria with official Beninoise (Fon) cultural participation.',
    category: 'CULTURAL',
    imageUrls: ['https://storage.iseyaa.ng/attractions/ohori-ije-1.jpg'],
    latitude: 6.6149,
    longitude: 2.8981,
    address: 'Festival Ground, Ipokia',
    entryFee: 0,
    metadata: { festival_timing: 'August annually', international: true, participating_nations: ['Nigeria', 'Benin Republic'] },
  },

  // ─── Obafemi Owode ───────────────────────────────────────────────────────
  {
    lgaSlug: 'obafemi-owode',
    name: 'Ofada Rice Heritage Farm',
    slug: 'ofada-rice-heritage-farm',
    description: 'A working heritage farm in Ofada town — origin of Nigeria\'s famous premium short-grain rice with Geographical Indication status. Visitors can tour the paddy fields, learn traditional wet-land cultivation methods, and sample freshly milled Ofada rice with authentic stew at the farm kitchen.',
    category: 'CULTURAL',
    imageUrls: ['https://storage.iseyaa.ng/attractions/ofada-rice-farm-1.jpg'],
    latitude: 6.9745,
    longitude: 3.4352,
    address: 'Ofada Town, Obafemi Owode LGA',
    entryFee: 1000,
    metadata: { specialty: 'Ofada rice (Geographical Indication)', amenities: ['farm tour', 'tasting', 'rice mill'], harvest_season: 'September–November' },
  },
  {
    lgaSlug: 'obafemi-owode',
    name: 'OOU Botanic Garden and Agro-Tourism Centre',
    slug: 'oou-botanic-garden-agro-tourism',
    description: 'The landscaped botanic garden and teaching farm of Olabisi Onabanjo University (OOU) in Ago-Iwoye. Open to the public, the garden hosts rare tropical plant collections, medicinal herb gardens, and a research demonstration farm with weekend agro-tourism programmes.',
    category: 'RECREATIONAL',
    imageUrls: ['https://storage.iseyaa.ng/attractions/oou-botanic-1.jpg'],
    latitude: 6.9722,
    longitude: 3.4295,
    address: 'OOU Campus, Obafemi Owode LGA',
    entryFee: 500,
    metadata: { plant_species: 400, amenities: ['guided tours', 'medicinal herb walk', 'teaching farm'] },
  },
  {
    lgaSlug: 'obafemi-owode',
    name: 'Owode Cultural Heritage Square',
    slug: 'owode-cultural-heritage-square',
    description: 'A vibrant public square in Owode town centre hosting weekly cultural markets, traditional music performances, and storytelling sessions. The square marks the historical boundary of the old Owode chieftaincy compound.',
    category: 'CULTURAL',
    imageUrls: ['https://storage.iseyaa.ng/attractions/owode-heritage-square-1.jpg'],
    latitude: 6.9698,
    longitude: 3.4248,
    address: 'Heritage Square, Owode, Obafemi Owode LGA',
    entryFee: 0,
    metadata: { market_day: 'Saturday', performances: 'Friday evenings' },
  },

  // ─── Odeda ───────────────────────────────────────────────────────────────
  {
    lgaSlug: 'odeda',
    name: 'Oyan Dam Reservoir and Boat Park',
    slug: 'oyan-dam-reservoir-boat-park',
    description: 'The Oyan Reservoir — a 270km² artificial lake created by the Oyan Dam — is one of Nigeria\'s largest inland water bodies. Boat safaris reveal rich birdlife, floating fishing villages, and spectacular sunsets. The dam wall viewpoint provides commanding views of the reservoir.',
    category: 'NATURAL',
    imageUrls: ['https://storage.iseyaa.ng/attractions/oyan-dam-1.jpg', 'https://storage.iseyaa.ng/attractions/oyan-dam-2.jpg'],
    latitude: 7.1481,
    longitude: 3.2151,
    address: 'Oyan Dam, Odeda LGA, Ogun State',
    entryFee: 0,
    metadata: { area_km2: 270, depth_m: 45, amenities: ['boat safari', 'fishing', 'viewpoint'], fish_species: ['tilapia', 'catfish', 'mudfish'] },
  },
  {
    lgaSlug: 'odeda',
    name: 'Odeda Game Reserve',
    slug: 'odeda-game-reserve',
    description: 'A gazetted wildlife reserve in Odeda LGA protecting grassland and forest mosaic habitats. Wildlife includes duikers, warthogs, green monkeys, and over 120 bird species. Ranger-guided game drives and nature walks available.',
    category: 'NATURAL',
    imageUrls: ['https://storage.iseyaa.ng/attractions/odeda-game-reserve-1.jpg'],
    latitude: 7.1552,
    longitude: 3.2248,
    address: 'Game Reserve Road, Odeda LGA',
    entryFee: 1000,
    metadata: { area_ha: 8500, wildlife: ['duiker', 'warthog', 'green monkey', 'mongoose'], amenities: ['game drives', 'nature walks', 'ranger guides'] },
  },
  {
    lgaSlug: 'odeda',
    name: 'Odeda Heritage Trail',
    slug: 'odeda-heritage-trail',
    description: 'A 7km cultural trail through Odeda town linking historic sites: the 18th-century Odeda palace ruins, the colonial administrative building, a sacred iroko grove, and the Oyan River crossing point.',
    category: 'HISTORICAL',
    imageUrls: ['https://storage.iseyaa.ng/attractions/odeda-trail-1.jpg'],
    latitude: 7.1498,
    longitude: 3.2195,
    address: 'Heritage Trail Start, Odeda Town',
    entryFee: 0,
    metadata: { trail_km: 7, duration_hours: 3, highlights: ['palace ruins', 'colonial building', 'sacred iroko grove', 'river crossing'] },
  },

  // ─── Odogbolu ────────────────────────────────────────────────────────────
  {
    lgaSlug: 'odogbolu',
    name: 'Odogbolu Sacred Forest',
    slug: 'odogbolu-sacred-forest',
    description: 'A royal-protected ancient forest in Odogbolu preserved by chieftaincy edict as the retreat of Ijebu secret societies. The forest harbours exceptional old-growth trees, medicinal plants, and the shrines of Agemo — the primordial Ijebu masquerade deity.',
    category: 'NATURAL',
    imageUrls: ['https://storage.iseyaa.ng/attractions/odogbolu-forest-1.jpg'],
    latitude: 6.7830,
    longitude: 3.8170,
    address: 'Sacred Forest, Odogbolu, Ogun State',
    entryFee: 500,
    metadata: { deity: 'Agemo (primordial Ijebu masquerade)', guide_required: true, old_growth: true },
  },
  {
    lgaSlug: 'odogbolu',
    name: 'Ode-Lemo Palace and Artefacts Gallery',
    slug: 'ode-lemo-palace-artefacts-gallery',
    description: 'The palace of the Olode of Ode-Lemo, with an adjacent gallery exhibiting rare Ijebu bronze castings, royal beadwork, and woven aso-oke textiles. One of the best-preserved examples of traditional Ijebu royal architecture in Ogun State.',
    category: 'HISTORICAL',
    imageUrls: ['https://storage.iseyaa.ng/attractions/ode-lemo-palace-1.jpg'],
    latitude: 6.7875,
    longitude: 3.8198,
    address: 'Palace Road, Ode-Lemo, Odogbolu',
    entryFee: 300,
    metadata: { collections: ['bronzes', 'royal beadwork', 'aso-oke textiles'], established: '18th century' },
  },
  {
    lgaSlug: 'odogbolu',
    name: 'Odogbolu Pottery Artisan Village',
    slug: 'odogbolu-pottery-artisan-village',
    description: 'A cluster of artisan homesteads in Odogbolu where 200+ potters produce ceremonial and domestic terracotta using locally sourced clay. A UNESCO-recognised intangible heritage craft; visitors can commission and watch live production.',
    category: 'CULTURAL',
    imageUrls: ['https://storage.iseyaa.ng/attractions/odogbolu-pottery-1.jpg'],
    latitude: 6.7802,
    longitude: 3.8148,
    address: 'Potters\' Quarter, Odogbolu',
    entryFee: 0,
    metadata: { potters: 200, UNESCO: 'intangible heritage recognition', workshop: true },
  },

  // ─── Ogun Waterside ──────────────────────────────────────────────────────
  {
    lgaSlug: 'ogun-waterside',
    name: 'Ogun River Safari',
    slug: 'ogun-river-safari',
    description: 'A boat safari along the lower Ogun River and its mangrove tributaries, passing through stilt-house fishing villages, crocodile-inhabited creeks, and galleries of ancient iroko trees. A 3-hour guided safari reveals riverine biodiversity found nowhere else in Ogun State.',
    category: 'NATURAL',
    imageUrls: ['https://storage.iseyaa.ng/attractions/ogun-river-safari-1.jpg'],
    latitude: 6.7102,
    longitude: 4.2198,
    address: 'Safari Jetty, Ogun Waterside LGA',
    entryFee: 3000,
    metadata: { duration_hours: 3, wildlife: ['crocodile', 'monitor lizard', 'kingfisher', 'fish eagle'], amenities: ['life jackets', 'guide', 'refreshments'] },
  },
  {
    lgaSlug: 'ogun-waterside',
    name: 'Ogun Waterside Community Beach',
    slug: 'ogun-waterside-community-beach',
    description: 'A freshwater beach on the wide Ogun River estuary, popular for swimming, volleyball, and weekend barbecues. The adjacent fish market sells freshly caught Ogun River perch, catfish, and shrimp every morning.',
    category: 'NATURAL',
    imageUrls: ['https://storage.iseyaa.ng/attractions/ogun-beach-1.jpg'],
    latitude: 6.7051,
    longitude: 4.2151,
    address: 'Riverfront, Ogun Waterside',
    entryFee: 0,
    metadata: { type: 'freshwater beach', amenities: ['swimming', 'volleyball', 'fish market', 'canoe hire'] },
  },
  {
    lgaSlug: 'ogun-waterside',
    name: 'Ogun Wetlands Eco-Tourism Reserve',
    slug: 'ogun-wetlands-eco-tourism-reserve',
    description: 'A RAMSAR-listed wetland ecosystem in Ogun Waterside, protecting mangrove forests, freshwater marshes, and migratory bird stopover habitats. Community eco-guides lead dawn bird-watching walks that can yield 50+ species in a single morning.',
    category: 'NATURAL',
    imageUrls: ['https://storage.iseyaa.ng/attractions/ogun-wetlands-1.jpg'],
    latitude: 6.7152,
    longitude: 4.2252,
    address: 'Wetlands Reserve, Ogun Waterside LGA',
    entryFee: 800,
    metadata: { RAMSAR: true, bird_species: 180, habitat: 'mangrove + freshwater marsh', guide: 'community eco-guides' },
  },

  // ─── Remo North ──────────────────────────────────────────────────────────
  {
    lgaSlug: 'remo-north',
    name: 'Shagamu Pottery Village',
    slug: 'shagamu-pottery-village',
    description: 'A renowned cluster of pottery workshops in the hills north of Sagamu, where Remo women potters have crafted water pots, food vessels, and ceremonial urns using the same coiling and open-firing techniques for centuries. A living heritage experience.',
    category: 'CULTURAL',
    imageUrls: ['https://storage.iseyaa.ng/attractions/shagamu-pottery-1.jpg'],
    latitude: 6.9002,
    longitude: 3.6802,
    address: 'Pottery Village, Remo North LGA',
    entryFee: 0,
    metadata: { craft: 'hand-coiled terracotta pottery', artisans: 'Remo women potters', workshop: true },
  },
  {
    lgaSlug: 'remo-north',
    name: 'Sacred Grove of Ogun',
    slug: 'sacred-grove-of-ogun',
    description: 'A protected forest grove sacred to Ogun — the Yoruba deity of iron, warfare, and the hunt. The grove is the ceremonial venue for the Oro Festival and houses some of the oldest iroko trees in Ogun State. A place of profound spiritual and ecological significance.',
    category: 'RELIGIOUS',
    imageUrls: ['https://storage.iseyaa.ng/attractions/ogun-sacred-grove-1.jpg'],
    latitude: 6.9051,
    longitude: 3.6851,
    address: 'Sacred Grove Road, Remo North',
    entryFee: 500,
    metadata: { deity: 'Ogun (Yoruba iron deity)', festival: 'Oro Festival', old_growth: true, guide_required: true },
  },
  {
    lgaSlug: 'remo-north',
    name: 'Remo Hills Nature Trek',
    slug: 'remo-hills-nature-trek',
    description: 'A guided 8km highland trekking route through the scenic Remo hills north of Sagamu. The trail passes granite boulders, forest patches, cassava and cocoa farms, and culminates at a summit with 360-degree views over Ogun State and Lagos on clear days.',
    category: 'NATURAL',
    imageUrls: ['https://storage.iseyaa.ng/attractions/remo-hills-trek-1.jpg'],
    latitude: 6.9100,
    longitude: 3.6900,
    address: 'Trek Trailhead, Remo North LGA',
    entryFee: 500,
    metadata: { trail_km: 8, elevation_m: 360, duration_hours: 4, amenities: ['guide', 'water point', 'rest shelter'] },
  },

  // ─── Shagamu ─────────────────────────────────────────────────────────────
  {
    lgaSlug: 'shagamu',
    name: 'Sagamu Heritage Museum',
    slug: 'sagamu-heritage-museum',
    description: 'The main heritage museum of Sagamu (Shagamu), documenting the rise of the Remo kingdom, the reign of Akarigbo rulers, and Sagamu\'s role as a colonial commercial hub. Notable exhibits include 15th-century trade goods from the trans-Atlantic period and Remo royal regalia.',
    category: 'HISTORICAL',
    imageUrls: ['https://storage.iseyaa.ng/attractions/sagamu-museum-1.jpg'],
    latitude: 6.8417,
    longitude: 3.6497,
    address: 'Museum Road, Sagamu, Ogun State',
    entryFee: 300,
    metadata: { collections: ['Remo royal regalia', 'colonial trade goods', '15th-century artefacts'] },
  },
  {
    lgaSlug: 'shagamu',
    name: 'Akarigbo Palace and Remo Cultural Centre',
    slug: 'akarigbo-palace-remo-cultural-centre',
    description: 'The palace of the Akarigbo of Remoland — paramount ruler of all Remo communities. The palace hosts the annual Lisabi Festival and a permanent exhibition on Remo history, governance, and traditional crafts. One of the most visited royal institutions in Ogun State.',
    category: 'CULTURAL',
    imageUrls: ['https://storage.iseyaa.ng/attractions/akarigbo-palace-1.jpg'],
    latitude: 6.8445,
    longitude: 3.6521,
    address: 'Akarigbo Palace, Sagamu',
    entryFee: 0,
    metadata: { ruler: 'Akarigbo of Remoland', amenities: ['cultural exhibition', 'royal court', 'guided tour'], festival: 'Lisabi Festival' },
  },
  {
    lgaSlug: 'shagamu',
    name: 'Sagamu Ancient Market Heritage Site',
    slug: 'sagamu-ancient-market-heritage-site',
    description: 'The oldest market in Sagamu, operating continuously since the 17th century at the intersection of the Lagos–Ibadan and Sagamu–Benin roads. The heritage site preserves the original market layout with trader guilds still operating in traditional craft sections.',
    category: 'CULTURAL',
    imageUrls: ['https://storage.iseyaa.ng/attractions/sagamu-market-1.jpg'],
    latitude: 6.8402,
    longitude: 3.6481,
    address: 'Central Market, Sagamu',
    entryFee: 0,
    metadata: { established: '17th century', market_days: 'daily', specialty: 'rubber, cocoa, pottery, textiles' },
  },
  {
    lgaSlug: 'shagamu',
    name: 'Sagamu Moloney Bridge Historical Site',
    slug: 'sagamu-moloney-bridge-historical-site',
    description: 'A colonial-era iron bridge built in 1905 by the Lagos colonial administration, named after Governor Alfred Moloney. The bridge served the Lagos–Ibadan railway feeder road. Now preserved as a heritage structure with an interpretive panel on its construction and significance.',
    category: 'HISTORICAL',
    imageUrls: ['https://storage.iseyaa.ng/attractions/moloney-bridge-1.jpg'],
    latitude: 6.8448,
    longitude: 3.6553,
    address: 'Moloney Bridge, Sagamu',
    entryFee: 0,
    metadata: { built: 1905, material: 'iron truss', named_after: 'Governor Alfred Moloney', colonial_period: 'British Lagos Protectorate' },
  },
];

async function main() {
  console.log('🌱 Starting ISEYAA seed...');

  // ─── 1. Seed LGAs ──────────────────────────────────────────────────────
  console.log('📍 Seeding 20 Ogun State LGAs...');
  const lgaMap: Record<string, string> = {};

  for (const lga of LGAS) {
    const record = await prisma.lGA.upsert({
      where: { slug: lga.slug },
      create: {
        name: lga.name,
        slug: lga.slug,
        stateCode: 'OG',
        description: lga.description,
        latitude: lga.latitude,
        longitude: lga.longitude,
        isActive: true,
        metadata: lga.metadata as any,
      },
      update: {
        description: lga.description,
        latitude: lga.latitude,
        longitude: lga.longitude,
        metadata: lga.metadata as any,
      },
    });
    lgaMap[lga.slug] = record.id;
    process.stdout.write(`  ✓ ${lga.name}\n`);
  }

  // ─── 2. Seed Attractions ───────────────────────────────────────────────
  console.log('\n🏛️  Seeding attractions...');
  let created = 0;
  let skipped = 0;

  for (const attr of ATTRACTIONS) {
    const lgaId = lgaMap[attr.lgaSlug];
    if (!lgaId) {
      console.warn(`  ⚠️  LGA not found: ${attr.lgaSlug}`);
      continue;
    }

    const existing = await prisma.attraction.findUnique({ where: { slug: attr.slug } });
    if (existing) {
      skipped++;
      continue;
    }

    await prisma.attraction.create({
      data: {
        lgaId,
        name: attr.name,
        slug: attr.slug,
        description: attr.description,
        category: attr.category,
        imageUrls: attr.imageUrls,
        latitude: attr.latitude,
        longitude: attr.longitude,
        address: attr.address,
        entryFee: attr.entryFee,
        isActive: true,
        metadata: attr.metadata as any,
      },
    });
    created++;
  }

  console.log(`  ✓ Created: ${created} attractions, skipped (already exist): ${skipped}`);

  // ─── 3. Seed Transport PlatformConfig ─────────────────────────────────────
  console.log('\n🚗 Seeding transport PlatformConfig rows...');

  const transportConfigs: Array<{ key: string; value: number }> = [
    { key: 'transport_platform_fee_pct', value: 15 },
    { key: 'transport_base_fare_bike', value: 200 },
    { key: 'transport_base_fare_tricycle', value: 350 },
    { key: 'transport_base_fare_car', value: 500 },
    { key: 'transport_base_fare_minibus', value: 700 },
    { key: 'transport_per_km_bike', value: 50 },
    { key: 'transport_per_km_tricycle', value: 80 },
    { key: 'transport_per_km_car', value: 120 },
    { key: 'transport_per_km_minibus', value: 150 },
    { key: 'transport_surge_threshold', value: 1.5 },
    { key: 'transport_match_radius_km', value: 5 },
  ];

  for (const config of transportConfigs) {
    try {
      await prisma.platformConfig.upsert({
        where: { key: config.key },
        create: { key: config.key, value: config.value, isPublic: false },
        update: { value: config.value },
      });
      process.stdout.write(`  ✓ ${config.key} = ${config.value}\n`);
    } catch (err) {
      console.error(`  ✗ Failed to upsert ${config.key}:`, (err as Error).message);
    }
  }

  // ─── 4. Summary ────────────────────────────────────────────────────────
  const lgaCount = await prisma.lGA.count();
  const attractionCount = await prisma.attraction.count();
  const platformConfigCount = await prisma.platformConfig.count();
  console.log('\n✅ Seed complete!');
  console.log(`   LGAs: ${lgaCount}`);
  console.log(`   Attractions: ${attractionCount}`);
  console.log(`   PlatformConfig rows: ${platformConfigCount}`);
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
