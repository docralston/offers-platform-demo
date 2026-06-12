/**
 * Build heroSubhead, whyBullets, trims, and non-warranty FAQs.
 * Uses dealer name, city, county, and 2-4 nearby towns from store.
 * Many unique variants per slot so each page gets distinct content (modelIndex-driven).
 * No hard specs.
 *
 * For LLM-generated content, use generatePageContent from generator.ts instead of
 * buildPage/buildHeroSubhead/etc.; the CLI uses the generator when --llm is set.
 */

export interface StoreForContent {
  dealerName: string;
  location: { city: string; state: string; county?: string };
  seo?: { serviceArea?: string[] };
}

function getNearbyTowns(store: StoreForContent, modelIndex: number): string[] {
  const area = store.seo?.serviceArea ?? [];
  const exclude = (store.location?.city ?? "").trim();
  const towns = area.filter(
    (t) => String(t).trim().toLowerCase() !== exclude.toLowerCase()
  );
  if (towns.length === 0) return [];
  const count = Math.min(4, Math.max(2, Math.min(towns.length, 4)));
  const start = modelIndex % towns.length;
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    out.push(towns[(start + i) % towns.length]);
  }
  return out;
}

function nearbyTownsSentence(towns: string[]): string {
  if (towns.length === 0) return "";
  if (towns.length === 1) return towns[0];
  if (towns.length === 2) return `${towns[0]} and ${towns[1]}`;
  const last = towns[towns.length - 1];
  const rest = towns.slice(0, -1);
  return `${rest.join(", ")}, and ${last}`;
}

function applyLocation(
  text: string,
  city: string,
  county: string
): string {
  return text
    .replace(/\bDemotown\b/gi, city)
    .replace(/\bDemo County\b/gi, county);
}

function categoryKey(category: string): string {
  const c = category.toLowerCase();
  if (c.includes("truck")) return "truck";
  if (c.includes("hybrid")) return "hybrid";
  if (c.includes("grand-tourer")) return "grand-tourer";
  if (c.includes("convertible")) return "convertible";
  if (c.includes("gr") || c.includes("m-performance")) return "gr-performance";
  if (c.includes("performance")) return "gr-performance";
  if (c.includes("electric")) return "electric";
  if (c.includes("coupe")) return "coupe";
  if (c.includes("suv") || c.includes("highlander") || c.includes("cross"))
    return "family-suv";
  if (
    c.includes("sedan") ||
    c.includes("luxury-sedan") ||
    c.includes("camry") ||
    c.includes("corolla")
  )
    return "commuter-sedan";
  if (c.includes("luxury-suv")) return "luxury-suv";
  return "default";
}

// ----- Hero subheads: many unique variants per category (location placeholders) -----
const HERO_POOL: Record<string, string[]> = {
  truck: [
    "Built for capability and everyday use, with confidence for work and weekend plans around {county}.",
    "A practical choice for towing, hauling, and daily driving in {city} and the surrounding area.",
    "Rugged capability with everyday comfort, ready for {city} commutes and beyond.",
    "Strong presence when you need it, plus day-to-day usability for {county} roads and weather.",
    "Whether you're on the job site or the school run, this truck fits life around {city}.",
    "Capability when you need it and comfort the rest of the time, built for {county} drivers.",
    "From errands to weekend projects, a versatile fit for the {city} area.",
    "Confident on back roads and highways alike, with room for people and gear near {city}.",
  ],
  hybrid: [
    "Efficient daily driving with the flexibility you need for errands and longer trips around {county}.",
    "A smart choice for fuel efficiency and low emissions in the {city} area.",
    "Designed for efficient miles and everyday usability around {city} and {county}.",
    "Hybrid peace of mind for commutes and weekend trips, whether you're in {city} or beyond.",
    "Lower running costs and strong everyday usability for {county} families and commuters.",
    "Efficiency when you want it, versatility when you need it, built for life around {city}.",
    "A balanced mix of efficiency and capability for {city}-area driving.",
    "Quieter, cleaner miles without giving up space or comfort in the {county} region.",
  ],
  "gr-performance": [
    "Built for drivers who want engagement and performance on every drive, from {city} to the back roads.",
    "A focused driving experience for enthusiasts and daily drivers in the {county} area.",
    "Performance-first design that stands out on local roads and weekend drives.",
    "Where driving matters: responsive, engaging, and at home on {county} byways.",
    "Engineered for the drive, whether you're commuting from {city} or heading for twisty roads.",
    "A driver's choice for spirited commutes and weekend runs around {city} and beyond.",
    "Precision and feedback that make every trip from {city} more involving.",
    "Sporting character with everyday usability for {county} enthusiasts.",
  ],
  "family-suv": [
    "Space and versatility for families and daily life around {city} and {county}.",
    "A comfortable SUV for errands, commutes, and weekend trips in the area.",
    "Practical space and comfort for driving around {city} and the greater {county} region.",
    "Room for everyone and everything, with comfort for the school run and the road trip.",
    "Three rows or two, built for busy weeks and weekend getaways from {city}.",
    "Family-friendly space and features that fit life in and around {county}.",
    "Versatile cargo and passenger space for {city}-area families on the go.",
    "Comfort and capability in one package, suited to {county} roads and routines.",
  ],
  "commuter-sedan": [
    "Efficient and comfortable for daily commutes and errands around {city} and {county}.",
    "A reliable choice for everyday driving in the {city} area.",
    "Comfortable and practical for commutes and weekend plans in {county}.",
    "A sensible daily driver with the comfort and tech that make {city} commutes easier.",
    "Refined and efficient, whether you're heading to work or out of town from {city}.",
    "Quiet cabin, smooth ride, and strong value for {county} commuters.",
    "Built for the daily drive, with room and comfort for life around {city}.",
    "Low stress and high usability for {county} roads and parking.",
  ],
  "luxury-suv": [
    "Refined space and presence for families and daily life in the {city} area.",
    "Premium comfort and versatility for {county} drivers who want a step up.",
    "Quiet, capable, and well-appointed for commutes and trips from {city}.",
    "Luxury SUV comfort with the practicality that fits {county} lifestyles.",
    "Sophisticated styling and cabin quality for {city} and beyond.",
    "Elevated materials and features in a versatile package for {county}.",
    "Space and refinement in one, suited to {city}-area roads and routines.",
    "Premium feel with everyday usability around {county}.",
  ],
  "luxury-sedan": [
    "Refined comfort and quiet for daily drives and longer trips around {city}.",
    "A premium sedan with the poise and features that suit {county} commuters.",
    "Sophisticated cabin and smooth ride for life in and around {city}.",
    "Luxury sedan comfort and technology for {county} roads and beyond.",
    "Elegant and efficient, whether you're in {city} or on the highway.",
    "Premium materials and attention to detail for {county} drivers.",
    "Quiet, comfortable, and connected for the daily drive from {city}.",
    "A step above in comfort and refinement for the {city} area.",
  ],
  electric: [
    "Electric range and quiet drive for daily routines and longer trips from {city}.",
    "Zero tailpipe emissions with the space and comfort that fit {county} life.",
    "Designed for drivers who want to go electric without compromise in the {city} area.",
    "Smooth, quiet, and efficient for commutes and errands around {county}.",
    "Modern EV tech and usability for {city}-area drivers making the switch.",
    "Electric power with everyday practicality for {county} roads and charging.",
    "Clean and quiet miles for {city} commuters and weekend explorers.",
    "EV efficiency and refinement in a package built for {county}.",
  ],
  coupe: [
    "Focused design and driving character for enthusiasts in the {city} area.",
    "A coupe that stands out on {county} roads and weekend drives.",
    "Style and performance in a compact package for {city} and beyond.",
    "Driver-focused and distinctive, whether you're in {city} or on the back roads.",
    "Compact footprint with big presence for {county} drivers.",
    "Sporting looks and feel for daily drives and weekend runs from {city}.",
    "A coupe that's at home on {county} streets and scenic routes.",
    "Distinctive and engaging for the {city} area.",
  ],
  convertible: [
    "Open-air driving and refined dynamics, built for {county} back roads and weekend getaways from {city}.",
    "A roadster that turns heads on Route 202 and rewards the driver on every {city}-area back road.",
    "Wind-in-your-hair thrills with luxury comfort, whether you're leaving {city} or cruising Demo County.",
    "Two seats, top down, and the kind of roads {county} is known for. Built for the drive.",
    "From {city} to Riverside and beyond: a convertible that loves curves and open sky.",
    "Precision handling and open-air freedom for {county} drivers who live for the weekend run.",
    "Sophisticated roadster character with the poise to shine on {city} streets and scenic byways.",
    "Drop the top and discover why {county} back roads were made for cars like this.",
  ],
  "grand-tourer": [
    "Long-legged luxury and sporting character for {county} highways and weekend escapes from {city}.",
    "A grand tourer that eats miles in comfort and comes alive on {city}-area back roads.",
    "Refined power and presence for the drive from {city} to the Poconos or the Jersey Shore.",
    "Luxury, performance, and style in one package, built for {county} drivers who demand the best.",
    "Cross {county} in comfort, then carve the curves: a true GT for the {city} enthusiast.",
    "Elegant and capable, whether you're commuting from {city} or touring beyond Demo County.",
    "Where luxury sedan meets sports car, tailored for {county} roads and weekend adventures.",
    "The kind of car that makes every trip from {city} feel like an occasion.",
  ],
  default: [
    "A versatile choice for daily driving and weekend plans around {city} and {county}.",
    "Built for everyday use and comfort in the {city} area.",
    "Designed to fit your life around {city} and the greater {county} region.",
    "Comfort, versatility, and value for {county} drivers.",
    "A solid fit for commutes, errands, and weekend trips from {city}.",
    "Practical and comfortable for the way you drive in {county}.",
    "Everyday usability with the features that matter around {city}.",
    "Reliable and well-equipped for life in the {city} area.",
  ],
};

// ----- Why bullets: many unique sets per category -----
const WHY_POOL: Record<string, [string, string, string][]> = {
  truck: [
    ["Capability for work and weekend projects around {city}", "Confident presence for varied terrain and changing weather", "Practical utility for daily errands and longer trips"],
    ["Strong when you need to tow or haul near {county}", "Comfort for the daily drive and the occasional adventure", "Built to handle {city} roads and beyond"],
    ["Versatile bed and cab for jobs and family", "Ready for back roads and winter weather in {county}", "A practical choice for {city}-area drivers"],
    ["Work-ready with everyday comfort", "Confidence on highways and back roads around {city}", "Space for gear and passengers in {county}"],
    ["Towing and payload when you need it", "Comfortable cabin for commutes from {city}", "Durable and dependable for {county} conditions"],
    ["Truck capability with daily-driver manners", "At home on {city} streets and weekend trails", "Practical for families and projects in {county}"],
    ["Heavy-duty options for serious work", "Refined enough for the school run in {city}", "A fit for {county} lifestyles"],
    ["Payload and towing without sacrificing comfort", "Quiet and composed on {city} roads", "Built for {county} drivers who need both"],
  ],
  hybrid: [
    ["Efficient driving for commutes and errands across {county}", "Lower emissions and fuel savings for everyday use", "Flexibility for short trips and longer drives when you need it"],
    ["Hybrid efficiency for {city}-area commutes", "Quieter, cleaner miles in town and on the highway", "Strong value for {county} families"],
    ["Fewer stops at the pump around {city}", "Smooth, quiet operation in traffic and on the open road", "A practical step toward efficiency in {county}"],
    ["Fuel savings without giving up space or comfort", "Ideal for mixed driving in and around {city}", "Efficiency that fits {county} life"],
    ["Electric assist for better mileage near {city}", "Comfortable and capable for daily and weekend use", "Lower running costs for {county} drivers"],
    ["Efficient in town and on the highway", "Quiet and refined for {city} commutes", "A smart choice for {county}"],
    ["Hybrid powertrain for real-world savings", "Versatile for errands and road trips from {city}", "Built for efficiency-minded {county} drivers"],
    ["Best of both: efficiency and range", "Smooth and quiet for {city} streets", "Practical for {county} and beyond"],
  ],
  "gr-performance": [
    ["Engaging drive for enthusiasts and spirited commutes", "Standout design and feel on local and back roads", "A focused choice for drivers who care about the drive"],
    ["Responsive and rewarding on {county} byways", "Distinctive looks that fit {city} and beyond", "Built for the driving enthusiast"],
    ["Precision handling for {city} back roads", "Performance character with everyday usability", "A driver's car for {county}"],
    ["Thrilling when you want it, tame when you don't", "At home on {city} streets and weekend runs", "Engineered for engagement in {county}"],
    ["Sporting character for the daily drive from {city}", "Confidence in corners and on the highway", "A standout choice in {county}"],
    ["Driver-focused and fun on every trip", "Refined enough for {city} commutes", "Performance that fits {county} life"],
    ["Handling and power that reward the driver", "Distinctive style for {city} and beyond", "Built for {county} enthusiasts"],
    ["Engaging from the first mile", "Practical enough for {city} daily use", "A performance option for {county}"],
  ],
  "family-suv": [
    ["Space for passengers and cargo around {city} and beyond", "Comfort for daily errands and weekend getaways", "Versatile shape for families and active lifestyles"],
    ["Three rows or two, room for everyone in {county}", "Quiet and comfortable on {city} roads", "Built for busy families"],
    ["Cargo space for sports gear and groceries near {city}", "Safety and tech that families expect", "A fit for {county} life"],
    ["Family-friendly space and comfort", "Easy to live with in {city} traffic and parking", "Versatile for {county} drivers"],
    ["Room to grow and go from {city}", "Comfortable seats and cabin for long days", "Practical for {county} families"],
    ["Versatile interior for people and cargo", "Smooth ride for {city} commutes and trips", "A sensible SUV for {county}"],
    ["Space and safety in one package", "Refined enough for {city} daily use", "Built for {county} and beyond"],
    ["Comfortable and capable for the school run", "Highway-quiet and {city}-friendly", "A family SUV for {county}"],
  ],
  "commuter-sedan": [
    ["Efficient and comfortable for daily commutes", "Practical for errands and weekend plans in {county}", "Reliable choice for {city}-area drivers"],
    ["Quiet cabin and smooth ride for {city} roads", "Good mileage and value for {county} commuters", "Low stress for the daily drive"],
    ["Sensible size and features for {city}", "Comfort and tech for the commute", "A solid fit for {county}"],
    ["Refined and efficient for {city} and beyond", "Easy to park and drive in {county}", "Everyday reliability and comfort"],
    ["Comfortable for the long commute from {city}", "Tech and safety that make sense for {county}", "A practical sedan for daily use"],
    ["Smooth, quiet, and efficient", "Built for {city} traffic and highway miles", "Value and comfort in {county}"],
    ["Daily-driver comfort and reliability", "Good fit for {city} streets and parking", "A dependable choice for {county}"],
    ["Efficiency and comfort in one package", "Suited to {city} commutes and weekend trips", "Practical for {county} drivers"],
  ],
  "luxury-suv": [
    ["Refined space for passengers and cargo in {city}", "Premium comfort for daily and weekend use", "A step up for {county} families"],
    ["Quiet, capable, and well-appointed", "Luxury materials and tech for {city} roads", "Built for {county} drivers who expect more"],
    ["Sophisticated styling and cabin quality", "Versatile for {city} life and longer trips", "Premium SUV for {county}"],
    ["Space and refinement in one", "Smooth and quiet around {city}", "A luxury fit for {county}"],
    ["Elevated comfort and technology", "Practical enough for {city} errands and getaways", "Refined for {county}"],
    ["Premium feel with everyday usability", "At home on {city} streets and highways", "Luxury SUV for {county} life"],
    ["Quiet cabin and confident ride", "Room and refinement for {city} and beyond", "A premium choice in {county}"],
    ["Sophisticated and versatile", "Comfort for {city} commutes and road trips", "Built for {county} and beyond"],
  ],
  "luxury-sedan": [
    ["Refined comfort for {city} commutes and trips", "Premium materials and quiet cabin", "A luxury sedan for {county} drivers"],
    ["Sophisticated ride and styling", "Tech and comfort that suit {city} life", "Elegant and efficient in {county}"],
    ["Quiet, smooth, and well-equipped", "Built for the daily drive from {city}", "Premium sedan for {county}"],
    ["Elegant design and cabin quality", "Comfortable and connected for {city} and beyond", "A refined choice for {county}"],
    ["Premium comfort and attention to detail", "Efficient and refined for {city} roads", "Luxury that fits {county} life"],
    ["Smooth ride and upscale interior", "Tech and safety for {city} commuters", "A step above in {county}"],
    ["Refined and reliable for daily use", "Quiet and comfortable around {city}", "Luxury sedan for {county}"],
    ["Sophisticated and practical", "Built for {city} and highway miles", "Premium for {county} drivers"],
  ],
  electric: [
    ["Zero tailpipe emissions for {city} and beyond", "Quiet, smooth drive and lower running costs", "Built for {county} drivers going electric"],
    ["Electric range for daily routines from {city}", "Modern tech and cabin comfort", "A practical EV for {county}"],
    ["Clean miles for commutes and errands", "Refined and quiet on {city} roads", "EV efficiency in {county}"],
    ["Electric power with everyday usability", "Charging that fits life around {city}", "An EV for {county} and beyond"],
    ["Efficiency and refinement in one", "Quiet and responsive for {city} driving", "Built for {county} EV adopters"],
    ["Smooth, quiet, and efficient", "Range and comfort for {city} area", "Electric choice for {county}"],
    ["EV tech with real-world range", "Comfortable for {city} commutes and trips", "A fit for {county} life"],
    ["Clean and quiet for the daily drive", "Practical range for {city} and beyond", "Electric for {county}"],
  ],
  coupe: [
    ["Focused design for {city} and back roads", "Driver-oriented and distinctive", "A coupe for {county} enthusiasts"],
    ["Sporting character and compact size", "At home on {city} streets and weekend drives", "Built for {county} drivers"],
    ["Style and engagement in one package", "Practical enough for {city} daily use", "A standout in {county}"],
    ["Driver's car with everyday usability", "Distinctive on {city} roads", "Performance coupe for {county}"],
    ["Responsive and fun to drive", "Refined for {city} commutes", "A coupe for {county} and beyond"],
    ["Compact and engaging", "Comfort and tech for {city} life", "Built for {county} enthusiasts"],
    ["Sporting looks and dynamics", "Easy to live with in {city}", "A focused choice in {county}"],
    ["Fun and distinctive", "Practical for {city} and weekend runs", "Coupe for {county}"],
  ],
  convertible: [
    ["Open-air thrills on {county} back roads and beyond", "Precision handling for the drive from {city}", "A roadster for Demo County weekends"],
    ["Top down on Route 611 and the roads that connect {city}", "Refined and engaging for {county} enthusiasts", "Built for the scenic run"],
    ["Wind in your hair, curves ahead: made for {county} byways", "Luxury and sport in one package near {city}", "The weekend car {county} drivers deserve"],
    ["Two seats, open sky, and {city}-area roads that reward the drive", "Sophisticated roadster character for {county}", "From Demotown to Riverside and back"],
    ["Drop the top and explore {county} in style", "Responsive and refined for {city} and beyond", "A convertible that loves Pennsylvania back roads"],
    ["Open-air freedom for {city} commutes and weekend escapes", "At home on {county} streets and scenic routes", "Built for drivers who take the long way"],
    ["Precision and presence on every {county} back road", "Luxury roadster comfort for the drive from {city}", "A standout in the {city} area"],
    ["Sporting character with the sky overhead", "From {city} to the Delaware and beyond", "Convertible for {county} and beyond"],
  ],
  "grand-tourer": [
    ["Long-distance comfort and sporting character for {county}", "From {city} to the shore or the mountains in style", "A GT built for the open road"],
    ["Luxury that loves the highway and the back road from {city}", "Refined power for {county} drivers who demand both", "Grand touring the way it should be"],
    ["Eat up miles in comfort, then carve {county} curves", "Elegant and capable for the {city} enthusiast", "Built for the drive that never gets old"],
    ["Cross {county} in silence and style", "Performance when you want it, refinement when you need it", "A grand tourer for {city} and beyond"],
    ["Where luxury sedan meets sports car near {city}", "Comfort for the daily grind, thrill for the weekend", "The best of both for {county} drivers"],
    ["Sophisticated and powerful for {county} roads", "At home on {city} streets and weekend getaways", "A true GT for the discerning driver"],
    ["Miles of comfort, moments of excitement", "From {city} to the Poconos or the Jersey Shore", "Grand touring for {county} and beyond"],
    ["Elegant presence and engaging dynamics", "Built for the drive from {city} to anywhere", "A grand tourer for {county} enthusiasts"],
  ],
  default: [
    ["A practical fit for commuting and daily errands", "Comfort and versatility for weekend plans", "A reliable choice for {city} and {county}"],
    ["Versatile for {city} life and beyond", "Comfortable and well-equipped", "Built for {county} drivers"],
    ["Everyday usability with the features that matter", "Good fit for {city} roads and parking", "A solid choice in {county}"],
    ["Comfort and value for the daily drive", "Practical for errands and trips from {city}", "Reliable for {county}"],
    ["Well-rounded for {city} and beyond", "Comfortable and efficient", "A fit for {county} life"],
    ["Practical and comfortable", "Suited to {city} commutes and weekends", "Built for {county}"],
    ["Reliable and well-equipped", "Easy to live with in {city}", "A sensible choice for {county}"],
    ["Comfort, space, and value", "Versatile for {city} area", "Practical for {county} drivers"],
  ],
};

// ----- Trim intros + sections: many unique combos -----
const TRIM_INTROS: string[] = [
  "Choose a trim that fits your priorities, from value and comfort to tech and premium details. We can help you compare options for the {model} at the dealership.",
  "Pick a trim theme based on how you drive, daily comfort, added tech, or a more premium feel. We'll help you find the right {model} for you.",
  "Trim levels range from value-focused to fully loaded. Compare features and find the {model} that matches your needs.",
  "From everyday essentials to top-tier comfort and tech, there's a {model} trim for every driver. We can walk you through the options.",
  "Whether you want simplicity or every upgrade, the {model} lineup has choices. Let us help you narrow it down.",
  "Trim selection depends on your must-haves: space, tech, comfort, or style. We can outline the {model} options.",
  "Compare trims by features, comfort, and value. Our team can help you choose the right {model} for your routine.",
  "Each {model} trim offers a different mix of features and refinement. We'll help you decide based on your priorities.",
  "From base to top trim, the {model} gives you options. We can compare them side by side.",
  "Choose based on comfort, technology, or premium finishes. We're here to help you find the right {model}.",
  "Trim levels balance value, features, and luxury. We can help you pick the {model} that fits.",
  "Whether you prioritize efficiency, space, or tech, the {model} has a trim for you. We'll outline the differences.",
  "Compare comfort, convenience, and style across {model} trims. We can help you choose.",
  "From daily-driver value to premium details, the {model} lineup covers a range. We'll walk you through it.",
  "Pick the {model} trim that matches your driving style and must-haves. We're here to help.",
];

const TRIM_SECTIONS: Array<{
  title: string;
  items: Array<{ label: string; note: string }>;
}> = [
  {
    title: "Value + everyday",
    items: [
      { label: "Core trims", note: "balanced features for daily driving" },
      { label: "Upgraded comfort", note: "more convenience and refinement" },
    ],
  },
  {
    title: "Tech + premium",
    items: [
      { label: "Tech leaning", note: "connected features and ease of use" },
      { label: "Premium leaning", note: "elevated finish and comfort" },
    ],
  },
  {
    title: "Comfort + capability",
    items: [
      { label: "Entry trims", note: "solid value and everyday use" },
      { label: "Mid-level", note: "extra comfort and tech" },
    ],
  },
  {
    title: "Style + features",
    items: [
      { label: "Sport or design packages", note: "sharper look and feel" },
      { label: "Luxury or premium", note: "more refinement and details" },
    ],
  },
  {
    title: "Everyday + value",
    items: [
      { label: "Base and mid trims", note: "practical for daily driving" },
      { label: "Comfort and tech", note: "convenience and connectivity" },
    ],
  },
  {
    title: "Refinement + tech",
    items: [
      { label: "Premium options", note: "better materials and quiet" },
      { label: "Tech and safety", note: "connected and driver-assist features" },
    ],
  },
  {
    title: "Practical + premium",
    items: [
      { label: "Core grades", note: "reliable and well-equipped" },
      { label: "Top trims", note: "luxury touches and tech" },
    ],
  },
  {
    title: "Efficiency + comfort",
    items: [
      { label: "Value trims", note: "efficiency and space" },
      { label: "Upgraded", note: "comfort and convenience" },
    ],
  },
  {
    title: "Family + versatility",
    items: [
      { label: "Space and seating", note: "room for passengers and cargo" },
      { label: "Comfort and tech", note: "convenience for long trips" },
    ],
  },
  {
    title: "Performance + daily",
    items: [
      { label: "Sport-oriented", note: "sharper handling and styling" },
      { label: "Comfort-oriented", note: "smoother ride and quiet" },
    ],
  },
  {
    title: "Entry + upgrade",
    items: [
      { label: "Standard trims", note: "essential features and value" },
      { label: "Higher trims", note: "more luxury and technology" },
    ],
  },
  {
    title: "Utility + comfort",
    items: [
      { label: "Work and play", note: "versatile for tasks and trips" },
      { label: "Refined options", note: "comfort and premium feel" },
    ],
  },
  {
    title: "Daily + weekend",
    items: [
      { label: "Commute-friendly", note: "efficient and comfortable" },
      { label: "Trip-ready", note: "space and comfort for longer drives" },
    ],
  },
  {
    title: "Basics + upgrades",
    items: [
      { label: "Core features", note: "safety and reliability" },
      { label: "Optional packages", note: "tech, comfort, or style" },
    ],
  },
  {
    title: "Value + refinement",
    items: [
      { label: "Smart value", note: "features that matter most" },
      { label: "Upscale trim", note: "premium materials and tech" },
    ],
  },
];

// ----- FAQ answer phrasings (availability, what's new, local fit) -----
const AVAILABILITY_LEADS: string[] = [
  "Yes. The {year} {make} {model} is available at {dealer} in {city}, {state}, with inventory arriving regularly. Availability can vary by trim.",
  "Yes. {dealer} in {city}, {state} stocks the {year} {make} {model} as inventory arrives. Trim availability may vary.",
  "Yes. You can find the {year} {make} {model} at {dealer} in {city}, {state}. New stock comes in regularly; trim selection may vary.",
  "Yes. The {year} {make} {model} is offered at {dealer} in {city}, {state}. Inventory rotates, so trim availability can change.",
  "Yes. {dealer} in {city}, {state} carries the {year} {make} {model}. Arrivals are ongoing; check with us for current trim availability.",
  "Yes. The {year} {make} {model} is available at {dealer} in {city}, {state}. Stock updates regularly; we can confirm what's on the ground.",
  "Yes. You can explore the {year} {make} {model} at {dealer} in {city}, {state}. Inventory and trim availability vary over time.",
  "Yes. {dealer} in {city}, {state} has access to the {year} {make} {model}. New units arrive periodically; trim options may vary.",
];

const WHATS_NEW_LEADS: string[] = [
  "The {year} {make} {model} features updated technology, refined interior details, and enhanced driver-assistance features compared to previous model years. Specific updates may vary by trim level.",
  "For {year}, the {make} {model} brings refreshed technology, interior updates, and the latest driver-assist and safety features. Trim-level details can vary.",
  "The {year} {make} {model} offers updated tech, interior refinements, and improved driver-assistance systems versus earlier years. Exact changes depend on trim.",
  "Updates for {year} include revised technology, interior improvements, and enhanced safety and driver-assist features. Availability and specifics vary by trim.",
  "The {year} {make} {model} introduces new technology, refined cabin details, and updated driver-assistance features. Trim-level content may differ.",
  "For {year}, expect updated infotainment and connectivity, interior refinements, and the latest safety and assist tech. Specifics vary by trim.",
  "The {year} {make} {model} brings refreshed technology, interior updates, and enhanced driver-assistance compared to prior model years. Details depend on trim.",
  "Updates for the {year} {make} {model} include revised tech, interior improvements, and new or enhanced driver-assist features. Trim availability varies.",
];

const LOCAL_FIT_LEADS: string[] = [
  "Yes. The {year} {make} {model} is well suited for driving around {city}, {county}, and the surrounding area thanks to its comfort, versatility, and efficiency for daily commuting and weekend trips.",
  "Yes. It's a strong fit for {county} drivers: comfortable for commutes, versatile for errands, and efficient for both city and highway use from {city}.",
  "Yes. Whether you're in {city} or across {county}, the {year} {make} {model} offers comfort, practicality, and efficiency for everyday and longer trips.",
  "Yes. Well suited to {city} and {county} driving, with comfort for the daily grind and versatility for weekend getaways.",
  "Yes. The {year} {make} {model} fits life in {county}: comfortable, practical, and efficient for commutes and trips starting from {city}.",
  "Yes. A good match for {city}-area and {county} driving, offering comfort, space, and efficiency for daily and weekend use.",
  "Yes. Built to handle {county} roads and routines, with comfort and versatility that suit commutes and trips from {city}.",
  "Yes. Whether your routine is mostly {city} or across {county}, the {year} {make} {model} delivers comfort and practicality for daily and longer drives.",
];

export function buildHeroSubhead(
  modelDisplayName: string,
  category: string,
  modelIndex: number,
  store: StoreForContent
): string {
  const key = categoryKey(category);
  const pool = HERO_POOL[key] ?? HERO_POOL.default;
  const city = store.location?.city ?? "Demotown";
  const county = store.location?.county ?? "Demo County";
  const raw = pool[modelIndex % pool.length];
  const filled = raw.replace(/\{city\}/g, city).replace(/\{county\}/g, county);
  return applyLocation(filled, city, county);
}

export function buildWhyBullets(
  category: string,
  modelIndex: number,
  store: StoreForContent
): [string, string, string] {
  const key = categoryKey(category);
  const pool = WHY_POOL[key] ?? WHY_POOL.default;
  const city = store.location?.city ?? "Demotown";
  const county = store.location?.county ?? "Demo County";
  const set = pool[modelIndex % pool.length];
  const fill = (s: string) =>
    applyLocation(
      s.replace(/\{city\}/g, city).replace(/\{county\}/g, county),
      city,
      county
    );
  return [fill(set[0]), fill(set[1]), fill(set[2])];
}

/** Trims: unique intro + two sections per modelIndex. */
export function buildTrims(
  modelDisplayName: string,
  modelIndex: number
): {
  intro: string;
  sections: Array<{
    title: string;
    items: Array<{ label: string; note: string }>;
  }>;
} {
  const L = TRIM_INTROS.length;
  const S = TRIM_SECTIONS.length;
  const intro = TRIM_INTROS[modelIndex % L].replace(
    /\{model\}/g,
    modelDisplayName
  );
  const s1 = TRIM_SECTIONS[modelIndex % S];
  const s2 = TRIM_SECTIONS[(modelIndex + 7) % S];
  return {
    intro,
    sections: [
      { title: s1.title, items: s1.items.map((i: { label: string; note: string }) => ({ ...i })) },
      { title: s2.title, items: s2.items.map((i: { label: string; note: string }) => ({ ...i })) },
    ],
  };
}

export function buildContentFaqs(
  modelDisplayName: string,
  store: StoreForContent,
  modelIndex: number,
  options?: { make?: string; year?: number }
): Array<{ q: string; a: string }> {
  const city = store.location?.city ?? "Demotown";
  const state = store.location?.state ?? "PA";
  const county = store.location?.county ?? "Demo County";
  const dealer = store.dealerName;
  const make = options?.make ?? "Toyota";
  const year = options?.year ?? 2026;
  const towns = getNearbyTowns(store, modelIndex);
  const townsPhrase = nearbyTownsSentence(towns);
  const locationPhrase =
    townsPhrase.length > 0
      ? ` Shoppers from ${city} and nearby areas like ${townsPhrase} are encouraged to check current listings or contact the dealership for the latest updates.`
      : " Local shoppers are encouraged to check current listings or contact the dealership for the latest updates.";

  const availabilityLead =
    AVAILABILITY_LEADS[modelIndex % AVAILABILITY_LEADS.length]
      .replace(/\{year\}/g, String(year))
      .replace(/\{make\}/g, make)
      .replace(/\{model\}/g, modelDisplayName)
      .replace(/\{dealer\}/g, dealer)
      .replace(/\{city\}/g, city)
      .replace(/\{state\}/g, state);
  const whatsNewLead =
    WHATS_NEW_LEADS[modelIndex % WHATS_NEW_LEADS.length]
      .replace(/\{year\}/g, String(year))
      .replace(/\{make\}/g, make)
      .replace(/\{model\}/g, modelDisplayName);
  const localFitLead =
    LOCAL_FIT_LEADS[modelIndex % LOCAL_FIT_LEADS.length]
      .replace(/\{year\}/g, String(year))
      .replace(/\{make\}/g, make)
      .replace(/\{model\}/g, modelDisplayName)
      .replace(/\{city\}/g, city)
      .replace(/\{county\}/g, county);

  const faqs: Array<{ q: string; a: string }> = [
    {
      q: `Is the ${year} ${make} ${modelDisplayName} available at ${dealer} in ${city}, ${state}?`,
      a: availabilityLead + locationPhrase,
    },
    {
      q: `What's new on the ${year} ${make} ${modelDisplayName}?`,
      a: whatsNewLead,
    },
    {
      q: `Is the ${year} ${make} ${modelDisplayName} a good fit for ${county} and local driving?`,
      a: localFitLead,
    },
  ];

  return faqs;
}
