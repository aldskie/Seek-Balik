// itemOptionGroups.js
//
// Narrows a verification question's dropdown choices to the ones that
// fit the KIND of item being claimed. The saved Question Bank lists are
// shared by a whole category (e.g. every "Accessories" item gets one
// brand list with watch, jewelry, eyewear and clothing brands), so a
// Ring would otherwise offer "Ray-Ban" or "G-Shock" as its brand.
//
// How it works:
//   1. The item KIND is worked out from the Item Name within its
//      Category (e.g. Accessories + "Ring" -> ring, Electronic +
//      "Mobile Phone" -> cellphone). See ITEM_KINDS.
//   2. Brand, size and design/feature questions are narrowed to that
//      kind's list. Items with no specific kind still get their
//      category's design list (CATEGORY_DEFAULTS).
//   3. Color and every other question keep their full list. If nothing
//      in a list fits, the original list is returned unchanged.
//
// Used by BOTH FoundItems.jsx (the staff "correct answer" dropdown and
// the list saved on the item) and ClaimModal.jsx, so the claimant always
// sees the same choices staff picked the correct answer from.

// Always allowed in a narrowed list so "I don't know" answers survive.
const ALWAYS_KEEP = ['other', 'others', 'unknown', 'other / unknown', 'none', 'not sure'];

const inches = (...nums) => nums.map((n) => `${n} inches`);
const STORAGE = ['32GB', '64GB', '128GB', '256GB', '512GB', '1TB', '2TB', '4TB', '5TB+'];
const LETTER_SIZES = ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL', '4XL', '5XL'];
const GENERIC_SIZES = ['Mini', 'Small', 'Medium', 'Large', 'Compact', 'Standard'];

// ── Design / feature lists ─────────────────────────────────────────────
const DESIGN = {
  device: ['Sticker', 'Keychain', 'Charm', 'Strap', 'Lanyard', 'Case/Cover', 'Skin', 'PopSocket',
    'Photo', 'Character', 'Logo', 'Name Label', 'Initials', 'Engraving', 'Custom Print',
    'Custom Drawing', 'Tag'],
  gadget: ['Sticker', 'Keychain', 'Case/Cover', 'Skin', 'Logo', 'Name Label', 'Initials', 'Engraving',
    'Custom Print', 'Custom Drawing', 'Tag', 'Character', 'Strap'],
  watch: ['Strap', 'Engraving', 'Logo', 'Initials', 'Metal', 'Rubber', 'Gemstones', 'Beads', 'Charm',
    'Custom Print'],
  jewelry: ['Charm', 'Engraving', 'Initials', 'Beads', 'Gemstones', 'Metal', 'Acrylic', 'Rubber',
    'Ribbon', 'Bow', 'Clip', 'Logo', 'Custom Print'],
  eyewear: ['Case/Cover', 'Strap', 'Logo', 'Engraving', 'Initials', 'Metal', 'Rubber', 'Acrylic',
    'Gemstones', 'Custom Print'],
  hair: ['Bow', 'Ribbon', 'Beads', 'Charm', 'Character', 'Plush', 'Acrylic', 'Metal', 'Rubber',
    'Gemstones', 'Clip', 'Custom Print'],
  lanyard: ['Lanyard', 'Clip', 'Charm', 'Keychain', 'Pin', 'Patch', 'Embroidery', 'Logo', 'Name Label',
    'Initials', 'Photo', 'Character', 'Plush', 'Acrylic', 'Metal', 'Rubber', 'Ribbon', 'Beads', 'Tag',
    'Custom Print', 'Custom Drawing'],
  wearable: ['Embroidery', 'Patch', 'Pin', 'Logo', 'Name Label', 'Initials', 'Tag', 'Character',
    'Ribbon', 'Bow', 'Beads', 'Metal', 'Custom Print', 'Custom Drawing'],
  footwear: ['Logo', 'Embroidery', 'Patch', 'Name Label', 'Initials', 'Strap', 'Rubber', 'Character',
    'Custom Print', 'Custom Drawing', 'Tag'],
  bag: ['Sticker', 'Keychain', 'Charm', 'Pin', 'Patch', 'Embroidery', 'Logo', 'Name Label', 'Initials',
    'Strap', 'Character', 'Plush', 'Acrylic', 'Ribbon', 'Bow', 'Scarf', 'Tag', 'Metal', 'Beads',
    'Custom Print', 'Custom Drawing'],
  wallet: ['Embroidery', 'Logo', 'Initials', 'Engraving', 'Charm', 'Keychain', 'Name Label', 'Photo',
    'Metal', 'Character', 'Clip', 'Custom Print'],
  paper: ['Sticker', 'Name Label', 'Initials', 'Photo', 'Character', 'Clip', 'Tag', 'Ribbon',
    'Case/Cover', 'Custom Print', 'Custom Drawing'],
  writing: ['Sticker', 'Name Label', 'Initials', 'Character', 'Engraving', 'Clip', 'Charm', 'Metal',
    'Rubber', 'Custom Print'],
  keys: ['Keychain', 'Charm', 'Tag', 'Name Label', 'Lanyard', 'Plush', 'Acrylic', 'Metal', 'Rubber',
    'Character', 'Beads', 'Ribbon', 'Clip', 'Custom Print'],
  id: ['Lanyard', 'Case/Cover', 'Clip', 'Sticker', 'Photo', 'Name Label', 'Tag', 'Custom Print'],
};

// ── Brand lists ────────────────────────────────────────────────────────
const BRANDS = {
  cellphone: ['Apple', 'Samsung', 'Xiaomi', 'Redmi', 'POCO', 'Oppo', 'Vivo', 'Realme', 'Huawei', 'Honor',
    'Google', 'Google Pixel', 'OnePlus', 'Nokia', 'Motorola', 'Infinix', 'Tecno', 'Itel', 'Asus', 'Sony',
    'ZTE', 'Nothing', 'LG', 'Cherry Mobile', 'MyPhone', 'Starmobile', 'CloudFone', 'Torque'],
  tablet: ['Apple', 'Samsung', 'Xiaomi', 'Redmi', 'Huawei', 'Honor', 'Lenovo', 'Realme', 'Oppo', 'Vivo',
    'Amazon', 'Microsoft', 'Asus', 'Acer', 'Nokia', 'Cherry Mobile', 'MyPhone', 'Starmobile', 'Infinix'],
  laptop: ['Apple', 'Asus', 'Acer', 'Dell', 'HP', 'Lenovo', 'MSI', 'Microsoft', 'Huawei', 'Samsung',
    'Razer', 'Toshiba', 'Gigabyte', 'LG', 'Xiaomi', 'Fujitsu', 'Alienware', 'Chuwi'],
  watch: ['Casio', 'G-Shock', 'Seiko', 'Citizen', 'Fossil', 'Timex', 'Swatch', 'Rolex', 'Tissot', 'Omega',
    'Tag Heuer', 'Orient', 'Daniel Wellington', 'Apple', 'Samsung', 'Garmin', 'Huawei', 'Xiaomi',
    'Amazfit', 'Fitbit', 'Michael Kors', 'Bench', 'Penshoppe', 'Kultura'],
  audio: ['Apple', 'Samsung', 'Sony', 'JBL', 'Anker', 'Soundcore', 'Jabra', 'Bose', 'Sennheiser',
    'Skullcandy', 'Audio-Technica', 'Logitech', 'Marshall', 'Harman Kardon', 'Xiaomi', 'Huawei',
    'Realme', 'Oppo', 'Baseus', 'UGREEN', 'Beats', 'Edifier', 'QCY', 'Lenovo'],
  camera: ['Canon', 'Nikon', 'Sony', 'Fujifilm', 'Panasonic', 'GoPro', 'DJI', 'Kodak', 'Olympus', 'Leica',
    'Insta360', 'Instax'],
  power: ['Anker', 'Romoss', 'UGREEN', 'Baseus', 'Aukey', 'Belkin', 'Apple', 'Samsung', 'Xiaomi', 'Huawei',
    'Oppo', 'Vivo', 'Realme', 'Cherry Mobile', 'Lenovo', 'HP', 'Dell', 'Asus', 'Acer'],
  peripheral: ['Logitech', 'A4Tech', 'Redragon', 'Corsair', 'SteelSeries', 'Razer', 'HP', 'Dell',
    'Lenovo', 'Asus', 'Microsoft', 'Apple', 'Rapoo', 'Genius'],
  storage: ['SanDisk', 'Kingston', 'Transcend', 'Toshiba', 'Lexar', 'Samsung', 'Crucial',
    'Western Digital', 'Seagate', 'HP', 'Sony', 'Verbatim'],
  calculator: ['Casio', 'Canon', 'Sharp', 'Citizen', 'Texas Instruments', 'HP', 'Deli'],
  jewelry: ['Jewelmer', 'Haliya', 'Hiraya', 'Golden South Sea Pearls', 'Pandora', 'Swarovski',
    'Tiffany & Co.', 'Cartier', 'Bvlgari', 'Michael Kors', 'Coach', 'Kate Spade', 'Fossil', 'Gucci',
    'Kultura', 'Bench', 'Penshoppe'],
  eyewear: ['Sunnies Studios', 'Ideal Vision', 'EO Executive Optical', 'Ray-Ban', 'Oakley', 'JINS',
    'Gucci', 'Prada', 'Persol', 'Polaroid', 'Michael Kors', 'Coach', 'Kate Spade'],
  headwear: ['Nike', 'Adidas', 'Puma', 'New Era', 'Vans', 'Converse', 'Under Armour', 'Bench',
    'Penshoppe', 'OXGN', 'Team Manila', 'Bocu', 'Regatta', 'ForMe', 'Memo', "Levi's", 'Calvin Klein',
    'Zara', 'Tommy Hilfiger', 'Lacoste', 'Kultura', 'Uniqlo', 'H&M'],
  belt: ["Levi's", 'Calvin Klein', 'Tommy Hilfiger', 'Lacoste', 'Zara', 'Bench', 'Penshoppe', 'OXGN',
    'Fossil', 'Gucci', 'Michael Kors', 'Coach', 'Regatta', 'Bocu'],
  smallFashion: ['Bench', 'Penshoppe', 'Kultura', 'OXGN', 'Team Manila', 'Bocu', 'Regatta', 'ForMe',
    'Memo', 'Zara', 'H&M', 'Uniqlo', 'Nike', 'Adidas', 'Puma'],
  paper: ['Cattleya', 'Advance', 'Corona', 'Best Buy', 'Expressions', 'National Book Store', 'Kokuyo',
    'Muji', 'Moleskine', 'Campus', 'Rhodia', 'Oxford', 'Clairefontaine', 'Deli'],
  book: ['Rex Book Store', 'C&E Publishing', 'Pearson', 'McGraw Hill', 'Cengage', 'Wiley', 'Cambridge',
    'Macmillan', 'Oxford', 'National Book Store'],
  writing: ['Pilot', 'Uni', 'Zebra', 'Pentel', 'Faber-Castell', 'Stabilo', 'Schneider', 'Paper Mate',
    'Sharpie', 'Staedtler', 'Maped', 'Deli', 'Sakura', 'Crayola', 'HBW', 'Mongol', 'Muji', 'Kokuyo'],
  ruler: ['Maped', 'Staedtler', 'Deli', 'Faber-Castell', 'Kokuyo', 'Muji'],
  art: ['Crayola', 'Faber-Castell', 'Sakura', 'Staedtler', 'Maped', 'Pentel', 'Deli', 'Stabilo',
    'Pilot', 'Uni', 'Sharpie'],
  wallet: ['Coach', 'Michael Kors', 'Kate Spade', 'Charles & Keith', 'Fossil', 'Calvin Klein',
    'Tommy Hilfiger', 'Lacoste', "Levi's", 'Bench', 'Penshoppe', 'Kultura', 'Bayo', 'ForMe',
    'Longchamp', 'Anello', 'Baggu', 'Uniqlo', 'Herschel', 'Nike', 'Adidas', 'Puma'],
  backpack: ['Hawk', 'Tiger', 'Straightforward', 'Jansport', 'Herschel', 'Nike', 'Adidas', 'Puma',
    'Fjällräven', 'The North Face', 'Doughnut', 'Eastpak', 'Samsonite', 'Targus', 'Case Logic',
    'Lenovo', 'HP', 'Dell', 'Anello', 'SwissGear', 'Victorinox', 'Bench', 'Penshoppe', 'OXGN',
    'World Balance', 'Team Manila', 'Kultura', 'Uniqlo'],
  handbag: ['Coach', 'Michael Kors', 'Kate Spade', 'Charles & Keith', 'Longchamp', 'Baggu', 'Anello',
    'Fossil', 'Calvin Klein', 'Tommy Hilfiger', 'Lacoste', "Levi's", 'Aranaz', 'Bayo', 'ForMe',
    'Kultura', 'Bench', 'Penshoppe', 'Uniqlo', 'Herschel', 'Nike', 'Adidas', 'Puma', 'Doughnut'],
  travel: ['American Tourister', 'Samsonite', 'World Traveller', 'Delsey', 'Tumi', 'Victorinox',
    'SwissGear', 'R2R', 'Hawk', 'The North Face', 'Jansport', 'Nike', 'Adidas', 'Uniqlo'],
  footwear: ['Nike', 'Adidas', 'Puma', 'World Balance', 'Rusty Lopez', 'Parisian', 'Bristol', 'Easy Soft',
    'Spartan', 'Islander', 'Banana Peel', 'Tribu', 'Reebok', 'Skechers', 'Crocs', 'Asics', 'Fila', 'On',
    'Hoka', 'Havaianas', 'Birkenstock', 'Vans', 'Converse', 'New Balance', 'Under Armour',
    'Charles & Keith'],
  innerwear: ['Hanes', 'Hanes Philippines', 'Jockey', 'Bench', 'Uniqlo', 'H&M', 'Calvin Klein', 'Nike',
    'Adidas', 'Puma', 'Under Armour', 'Penshoppe', 'Cotton On'],
  apparel: ['Bench', 'Penshoppe', 'OXGN', 'Human', 'Oxygen', 'Memo', 'ForMe', 'Regatta', 'Bocu', 'Bayo',
    'Jag', 'RRJ', 'Team Manila', 'Straightforward', 'Nike', 'Adidas', 'Puma', 'Uniqlo', 'H&M', 'Zara',
    "Levi's", 'Lacoste', 'Tommy Hilfiger', 'Calvin Klein', 'Gap', 'Cotton On', 'Giordano',
    'Under Armour', 'New Balance', 'Champion', 'The North Face', 'Columbia', 'Vans', 'Converse',
    'Wrangler', 'Lee', 'Dickies', 'Carhartt', 'Plains & Prints', 'Kamiseta', 'R.A.F.', 'Mango',
    'Forever 21', 'Reebok', 'Fila'],
  houseKey: ['Union', 'Yale', 'Schlage', 'Kwikset', 'Dormakaba', 'Master Lock', 'Ace'],
  vehicleKey: ['Rusi', 'MotorStar', 'Honda', 'Yamaha', 'Suzuki', 'Kawasaki', 'KTM', 'Vespa', 'Kymco',
    'Toyota', 'Mitsubishi', 'Nissan', 'Isuzu', 'Ford', 'Mazda', 'Hyundai', 'Kia', 'Chevrolet', 'Subaru',
    'BMW', 'Mercedes-Benz', 'Audi', 'Volkswagen'],
};

// ── Item kinds ─────────────────────────────────────────────────────────
// Checked in order; the first kind whose category and name pattern both
// match wins. More specific patterns come first (e.g. "headphone" and
// "smartwatch" before "phone", "keychain" before "chain").
const ITEM_KINDS = [
  // Electronic
  { key: 'watch', label: 'Watch', categories: ['Electronic', 'Accessories'], match: /watch|wristband|fitness band/i,
    brand: BRANDS.watch, size: ['Small', 'Medium', 'Large', 'One Size', 'Adjustable', '38mm', '40mm', '41mm', '42mm', '44mm', '45mm', '46mm'], design: DESIGN.watch },
  { key: 'audio', label: 'Earphones / Headphones / Speaker', categories: ['Electronic'], match: /earphone|earbud|headphone|headset|airpods|speaker/i,
    brand: BRANDS.audio, size: GENERIC_SIZES, design: DESIGN.gadget },
  { key: 'tablet', label: 'Tablet', categories: ['Electronic'], match: /tablet|ipad|\btab\b/i,
    brand: BRANDS.tablet, size: [...GENERIC_SIZES, ...inches(7, 8, 9, 10, 11, 12, 13, 14), ...STORAGE], design: DESIGN.device },
  { key: 'laptop', label: 'Laptop', categories: ['Electronic'], match: /laptop|macbook|chromebook|netbook|ultrabook/i,
    brand: BRANDS.laptop, size: [...GENERIC_SIZES, ...inches(11, 12, 13, 14, 15, 16, 17, 18), ...STORAGE], design: DESIGN.device },
  { key: 'camera', label: 'Camera', categories: ['Electronic'], match: /camera|dslr|mirrorless|gopro|action cam/i,
    brand: BRANDS.camera, size: GENERIC_SIZES, design: DESIGN.gadget },
  { key: 'power', label: 'Power Bank / Charger / Cable', categories: ['Electronic'], match: /power ?bank|charger|charging|cable|adapter|power supply|hdmi/i,
    brand: BRANDS.power, size: GENERIC_SIZES, design: DESIGN.gadget },
  { key: 'peripheral', label: 'Mouse / Keyboard', categories: ['Electronic'], match: /mouse|keyboard/i,
    brand: BRANDS.peripheral, size: GENERIC_SIZES, design: DESIGN.gadget },
  { key: 'storage', label: 'USB / Flash Drive / Hard Drive', categories: ['Electronic', 'Academic Materials'], match: /usb|flash ?drive|hard ?drive|\bssd\b|memory card|sd card/i,
    brand: BRANDS.storage, size: [...GENERIC_SIZES, ...STORAGE], design: DESIGN.gadget },
  { key: 'calculator', label: 'Calculator', categories: ['Electronic', 'Academic Materials'], match: /calculator/i,
    brand: BRANDS.calculator, size: [...GENERIC_SIZES, 'Pocket'], design: DESIGN.gadget },
  { key: 'cellphone', label: 'Mobile Phone', categories: ['Electronic'],
    match: /cell ?phone|mobile ?phone|smart ?phone|\bphone\b|iphone|android|galaxy|redmi|poco|\boppo\b|\bvivo\b|realme|infinix|tecno/i,
    brand: BRANDS.cellphone, size: [...GENERIC_SIZES, ...inches(4, 5, 6, 7), ...STORAGE], design: DESIGN.device },

  // Accessories
  { key: 'lanyard', label: 'ID Lace / Keychain', categories: ['Accessories'], match: /id lace|lanyard|keychain|key chain/i,
    brand: BRANDS.smallFashion, size: ['Small', 'Medium', 'Large', 'One Size', 'Short', 'Medium Length', 'Long'], design: DESIGN.lanyard },
  { key: 'ring', label: 'Ring', categories: ['Accessories'], match: /\bring\b/i,
    brand: BRANDS.jewelry, size: ['Small', 'Medium', 'Large', 'Adjustable', 'Ring Size 5–12'], design: DESIGN.jewelry },
  { key: 'jewelry', label: 'Bracelet / Necklace / Earrings / Brooch', categories: ['Accessories'], match: /bracelet|necklace|earring|brooch|pin\b|anklet|pendant|chain/i,
    brand: BRANDS.jewelry, size: ['Small', 'Medium', 'Large', 'One Size', 'Adjustable', 'Short', 'Medium Length', 'Long'], design: DESIGN.jewelry },
  { key: 'eyewear', label: 'Sunglasses / Eyeglasses', categories: ['Accessories'], match: /sunglass|eyeglass|glasses|spectacle|eyewear/i,
    brand: BRANDS.eyewear, size: ['Small', 'Medium', 'Large', 'One Size'], design: DESIGN.eyewear },
  { key: 'headwear', label: 'Cap / Hat', categories: ['Accessories', 'Clothing'], match: /\bcap\b|\bhat\b|cap\/hat|beanie|visor/i,
    brand: BRANDS.headwear, size: ['S', 'M', 'L', 'XL', 'Small', 'Medium', 'Large', 'One Size', 'Adjustable'], design: DESIGN.wearable },
  { key: 'belt', label: 'Belt', categories: ['Accessories', 'Clothing'], match: /belt/i,
    brand: BRANDS.belt, size: ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'Small', 'Medium', 'Large', 'One Size', 'Adjustable', '26', '28', '30', '32', '34', '36', '38', '40', '42', '44'], design: DESIGN.wearable },
  { key: 'hair', label: 'Hair Accessories', categories: ['Accessories'], match: /hair|scrunchie|headband/i,
    brand: BRANDS.smallFashion, size: ['Small', 'Medium', 'Large', 'One Size'], design: DESIGN.hair },

  // Academic Materials (pencil case is listed under Bags too)
  { key: 'pencilCase', label: 'Pencil Case', categories: ['Academic Materials', 'Bags & Wallets'], match: /pencil case|pencil pouch/i,
    brand: [...BRANDS.writing, ...BRANDS.handbag], size: ['Mini', 'Small', 'Medium', 'Large'], design: DESIGN.bag },
  { key: 'book', label: 'Textbook / Book', categories: ['Academic Materials'], match: /textbook|reference book|\bbook\b/i,
    brand: BRANDS.book, size: ['Small', 'Medium', 'Large', 'Pocket', 'A5', 'A4', 'Letter', 'Short', 'Long', 'Standard'], design: DESIGN.paper },
  { key: 'paper', label: 'Notebook / Paper / Folder', categories: ['Academic Materials'], match: /notebook|binder|folder|envelope|yellow pad|index card|document|assignment|exam|reviewer|module|paper|pad/i,
    brand: BRANDS.paper, size: ['Small', 'Medium', 'Large', 'Pocket', 'A5', 'A4', 'Letter', 'Legal', 'Short', 'Long', 'Standard'], design: DESIGN.paper },
  { key: 'ruler', label: 'Ruler', categories: ['Academic Materials'], match: /ruler/i,
    brand: BRANDS.ruler, size: ['Short', 'Long', 'Standard', ...inches(6, 12, 18, 24)], design: DESIGN.writing },
  { key: 'art', label: 'Art Materials', categories: ['Academic Materials'], match: /art material|crayon|paint|color pencil|coloring/i,
    brand: BRANDS.art, size: ['Small', 'Medium', 'Large', 'Standard'], design: DESIGN.writing },
  { key: 'writing', label: 'Pen / Pencil / Marker / Eraser', categories: ['Academic Materials'], match: /pencil|ballpen|\bpen\b|marker|highlighter|eraser/i,
    brand: BRANDS.writing, size: ['Small', 'Medium', 'Large', 'Short', 'Long', 'Standard'], design: DESIGN.writing },

  // Bags & Wallets
  { key: 'wallet', label: 'Wallet / Purse / Pouch', categories: ['Bags & Wallets'], match: /wallet|coin purse|\bpurse\b|pouch/i,
    brand: BRANDS.wallet, size: ['Mini', 'Small', 'Medium', 'Large'], design: DESIGN.wallet },
  { key: 'travel', label: 'Travel Bag / Luggage', categories: ['Bags & Wallets'], match: /travel|luggage|suitcase|duffel/i,
    brand: BRANDS.travel, size: ['Small', 'Medium', 'Large', 'XL', 'XXL', 'Carry-on'], design: DESIGN.bag },
  { key: 'backpack', label: 'Backpack / School Bag / Laptop Bag', categories: ['Bags & Wallets'], match: /backpack|school bag|laptop bag|drawstring/i,
    brand: BRANDS.backpack, size: ['Mini', 'Small', 'Medium', 'Large', 'XL', ...inches(11, 13, 14, 15, 16, 17)], design: DESIGN.bag },
  { key: 'handbag', label: 'Handbag / Tote / Sling Bag', categories: ['Bags & Wallets'], match: /handbag|shoulder|tote|sling|clutch/i,
    brand: BRANDS.handbag, size: ['Mini', 'Small', 'Medium', 'Large', 'XL'], design: DESIGN.bag },

  // Clothing
  { key: 'footwear', label: 'Shoes / Sneakers / Slippers', categories: ['Clothing'], match: /shoe|sneaker|slipper|sandal|boots?\b|flip ?flop/i,
    brand: BRANDS.footwear, size: ['34', '36', '38', '40', '42', '44', 'Small', 'Medium', 'Large', 'One Size'], design: DESIGN.footwear },
  { key: 'innerwear', label: 'Socks / Underwear', categories: ['Clothing'], match: /sock|underwear|brief|boxer|bra\b|undershirt/i,
    brand: BRANDS.innerwear, size: [...LETTER_SIZES, 'One Size'], design: DESIGN.wearable },
  { key: 'bottoms', label: 'Pants / Jeans / Shorts / Skirt', categories: ['Clothing'], match: /pants|jeans|shorts|skirt|trousers|slacks|leggings/i,
    brand: BRANDS.apparel, size: [...LETTER_SIZES, '26', '28', '30', '32', '34', '36', '38', '40', '42', '44', 'One Size', 'Adjustable'], design: DESIGN.wearable },
  { key: 'apparel', label: 'Shirt / Jacket / Uniform', categories: ['Clothing'], match: /shirt|polo|uniform|jacket|hoodie|sweater|dress|blouse|vest|coat|scarf|gloves|raincoat|jersey/i,
    brand: BRANDS.apparel, size: [...LETTER_SIZES, 'One Size', 'Adjustable'], design: DESIGN.wearable },

  // Keys
  { key: 'vehicleKey', label: 'Motorcycle / Car Key', categories: ['Keys'], match: /motor|car\b|vehicle|scooter|bike|ignition/i,
    brand: BRANDS.vehicleKey, size: ['Mini', 'Small', 'Standard', 'Large', '2 Keys', '3 Keys', '4+ Keys'], design: DESIGN.keys },
  { key: 'houseKey', label: 'House / Door / Locker Key', categories: ['Keys'], match: /house|door|locker|padlock|room|cabinet|gate|drawer/i,
    brand: BRANDS.houseKey, size: ['Mini', 'Small', 'Standard', 'Large', '2 Keys', '3 Keys', '4+ Keys'], design: DESIGN.keys },
];

// Design lists for items whose name doesn't match a specific kind.
const CATEGORY_DEFAULTS = {
  electronic: { design: DESIGN.device },
  accessories: { design: [...new Set([...DESIGN.jewelry, ...DESIGN.lanyard, ...DESIGN.eyewear])] },
  'academic materials': { design: DESIGN.paper },
  'bags & wallets': { design: DESIGN.bag },
  clothing: { design: DESIGN.wearable },
  keys: { design: DESIGN.keys },
  id: { design: DESIGN.id },
};

const norm = (v) => String(v ?? '').trim().toLowerCase();

// ── Admin-linked choices (Question Bank "option_groups") ──────────────
// In the Question Bank an admin can add a choice and link it to an item
// type (e.g. "Tecno Pova" -> Mobile Phone) or to "All item types".
// Those links are loaded here (setQuestionBankGroups) and added on top
// of the built-in lists above when narrowing.
export const ALL_KINDS_KEY = '__all__';

let customGroupsByQuestion = new Map(); // norm(question text) -> { kindKey: Set(norm option) }

/** Load the Question Bank entries (each may have `option_groups`). */
export function setQuestionBankGroups(entries) {
  const next = new Map();
  (Array.isArray(entries) ? entries : []).forEach((entry) => {
    const groups = entry && typeof entry.option_groups === 'object' ? entry.option_groups : null;
    if (!groups || !entry.text) return;
    const qKey = norm(entry.text);
    const merged = next.get(qKey) || {};
    Object.entries(groups).forEach(([kindKey, choices]) => {
      if (!Array.isArray(choices)) return;
      const set = merged[kindKey] || new Set();
      choices.forEach((c) => set.add(norm(c)));
      merged[kindKey] = set;
    });
    next.set(qKey, merged);
  });
  customGroupsByQuestion = next;
}

const customChoicesFor = (questionText, kindKey) => {
  const groups = customGroupsByQuestion.get(norm(questionText));
  if (!groups) return [];
  return [...(groups[kindKey] || []), ...(groups[ALL_KINDS_KEY] || [])];
};

/** Item types offered for a category ("General" / "All" -> every type). */
export function getKindsForCategory(category) {
  const cat = norm(category);
  const list =
    !cat || cat === 'general' || cat === 'all'
      ? ITEM_KINDS
      : ITEM_KINDS.filter((kind) => kind.categories.some((c) => norm(c) === cat));
  return list.map((kind) => ({ key: kind.key, label: kind.label, categories: kind.categories }));
}

/**
 * True when `option` belongs under item type `kindKey` for this kind of
 * question — either from the built-in lists or because the admin linked
 * it (`optionGroups` is that question's own option_groups object).
 */
export function optionFitsKind(kindKey, questionKind, option, optionGroups = {}) {
  const value = norm(option);
  if (!value) return false;
  const linked = (key) =>
    Array.isArray(optionGroups?.[key]) && optionGroups[key].some((c) => norm(c) === value);
  if (linked(kindKey)) return true;
  const kind = ITEM_KINDS.find((k) => k.key === kindKey);
  const builtIn = kind?.[questionKind];
  return Array.isArray(builtIn) && builtIn.some((c) => norm(c) === value);
}

/** True for choices kept for every item ("Other", "Unknown", "None"...). */
export const isAlwaysKeptOption = (option) => ALWAYS_KEEP.includes(norm(option));

/** The item kind for an Item Name + Category, or null. */
export function getItemKind(itemTitle = '', category = '') {
  const title = String(itemTitle || '').trim();
  if (!title) return null;
  const cat = norm(category);
  return (
    ITEM_KINDS.find(
      (kind) =>
        (!cat || cat === 'all' || kind.categories.some((c) => norm(c) === cat)) &&
        kind.match.test(title)
    ) || null
  );
}

/** 'brand' | 'size' | 'design' | null for a question's text. */
export function getQuestionKind(questionText = '') {
  const q = norm(questionText);
  if (q.includes('brand')) return 'brand';
  if (q.includes('size')) return 'size';
  if (q.includes('design') || q.includes('feature')) return 'design';
  return null;
}

/**
 * Returns `options` narrowed to what fits this item's kind, or the
 * original `options` when no rule applies / nothing would be left.
 */
export function narrowOptionsForItem(questionText, options, itemTitle, category) {
  if (!Array.isArray(options) || options.length === 0) return options;

  const questionKind = getQuestionKind(questionText);
  if (!questionKind) return options;

  const kind = getItemKind(itemTitle, category);
  const allowed = kind?.[questionKind] || CATEGORY_DEFAULTS[norm(category)]?.[questionKind];
  if (!allowed) return options;

  // Built-in list + anything the admin linked to this item type (or to
  // all item types) in the Question Bank.
  const custom = customChoicesFor(questionText, kind ? kind.key : ALL_KINDS_KEY);
  const allowedSet = new Set([...allowed, ...ALWAYS_KEEP].map(norm));
  custom.forEach((c) => allowedSet.add(c));
  const narrowed = options.filter((o) => typeof o === 'string' && allowedSet.has(norm(o)));

  // Nothing (or only "Other/Unknown") matched: keep the full list rather
  // than leave the claimant with no real choice.
  const real = narrowed.filter((o) => !ALWAYS_KEEP.includes(norm(o)));
  return real.length > 0 ? narrowed : options;
}
