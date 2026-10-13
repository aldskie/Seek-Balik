# Seeds the verification Question Bank:
#   - General (applies to every category): Color and Size questions.
#   - Each item category: Brand (Issuer for ID) and Design questions.
# Found Items then never shows an empty question list for a category.
#
# Safe to run on a database that already has questions: a question is only
# added when that category doesn't already have one with the same text
# (case-insensitive). Nothing existing is changed or deleted.

from django.db import migrations

CATEGORIES = [
    'Accessories', 'ID', 'Academic Materials', 'Bags & Wallets',
    'Clothing', 'Electronic', 'Keys',
]

COLORS = [   'Black', 'White', 'Gray', 'Silver', 'Gold', 'Rose Gold', 'Brown', 'Beige', 'Red',
    'Orange', 'Yellow', 'Green', 'Blue', 'Navy', 'Purple', 'Pink', 'Maroon', 'Brass',
    'Bronze', 'Copper', 'Clear']

DESIGN_FEATURES = [   'Sticker', 'Keychain', 'Charm', 'Pin', 'Patch', 'Embroidery', 'Logo', 'Name Label',
    'Initials', 'Engraving', 'Lanyard', 'Strap', 'Case/Cover', 'Skin', 'PopSocket',
    'Photo', 'Character', 'Plush', 'Acrylic', 'Metal', 'Rubber', 'Ribbon', 'Bow',
    'Scarf', 'Tag', 'Clip', 'Beads', 'Gemstones', 'Custom Print', 'Custom Drawing',
    'Other', 'None']

CATEGORY_BRANDS = {   'Academic Materials': [   'Cattleya', 'Advance', 'Corona', 'Best Buy',
                              'Expressions', 'National Book Store', 'Kokuyo', 'Muji',
                              'Moleskine', 'Campus', 'Rhodia', 'Oxford',
                              'Clairefontaine', 'Pilot', 'Uni', 'Zebra', 'Pentel',
                              'Faber-Castell', 'Stabilo', 'Schneider', 'Paper Mate',
                              'Sharpie', 'Staedtler', 'Maped', 'Deli', 'Casio', 'Canon',
                              'Sharp', 'Citizen', 'Texas Instruments', 'HP', 'Sakura',
                              'Crayola', 'Rex Book Store', 'C&E Publishing', 'Pearson',
                              'McGraw Hill', 'Cengage', 'Wiley', 'Cambridge',
                              'Macmillan', 'SanDisk', 'Kingston', 'Transcend',
                              'Toshiba', 'Lexar', 'Samsung', 'Crucial',
                              'Western Digital'],
    'Accessories': [   'Bench', 'Penshoppe', 'Kultura', 'Casio', 'G-Shock', 'Seiko',
                       'Citizen', 'Fossil', 'Timex', 'Swatch', 'Rolex', 'Tissot',
                       'Daniel Wellington', 'Apple', 'Samsung', 'Garmin', 'Xiaomi',
                       'Huawei', 'Amazfit', 'Jewelmer', 'Haliya', 'Hiraya',
                       'Golden South Sea Pearls', 'Pandora', 'Swarovski',
                       'Tiffany & Co.', 'Cartier', 'Bvlgari', 'Michael Kors', 'Coach',
                       'Kate Spade', 'Sunnies Studios', 'Ideal Vision',
                       'EO Executive Optical', 'Ray-Ban', 'Oakley', 'JINS', 'Gucci',
                       'Prada', 'Persol', 'Polaroid', 'OXGN', 'Team Manila', 'Bocu',
                       'Regatta', 'Nike', 'Adidas', 'Puma', 'New Era', 'Vans',
                       'Converse', 'Under Armour', 'ForMe', 'Memo', "Levi's",
                       'Calvin Klein', 'Zara', 'Tommy Hilfiger', 'Lacoste'],
    'Bags & Wallets': [   'Hawk', 'Tiger', 'Straightforward', 'Bench', 'Penshoppe',
                          'OXGN', 'World Balance', 'Team Manila', 'Jansport',
                          'Herschel', 'Nike', 'Adidas', 'Puma', 'Fjällräven',
                          'The North Face', 'Doughnut', 'Eastpak', 'Samsonite',
                          'Targus', 'Case Logic', 'Lenovo', 'HP', 'Dell',
                          'American Tourister', 'Aranaz', 'R2R', 'Kultura', 'Bayo',
                          'ForMe', 'Uniqlo', 'Longchamp', 'Coach', 'Michael Kors',
                          'Kate Spade', 'Charles & Keith', 'Baggu', 'Anello', 'Fossil',
                          'Calvin Klein', 'Tommy Hilfiger', 'Lacoste', "Levi's",
                          'World Traveller', 'Delsey', 'Tumi', 'Victorinox',
                          'SwissGear'],
    'Clothing': [   'Bench', 'Penshoppe', 'OXGN', 'Human', 'Oxygen', 'Memo', 'ForMe',
                    'Regatta', 'Bocu', 'Bayo', 'Jag', 'RRJ', 'Team Manila',
                    'Straightforward', 'Nike', 'Adidas', 'Puma', 'Uniqlo', 'H&M',
                    'Zara', "Levi's", 'Lacoste', 'Tommy Hilfiger', 'Calvin Klein',
                    'Gap', 'Cotton On', 'Giordano', 'Under Armour', 'New Balance',
                    'Champion', 'The North Face', 'Columbia', 'Vans', 'Converse',
                    'Wrangler', 'Lee', 'Dickies', 'Carhartt', 'Plains & Prints',
                    'Kamiseta', 'R.A.F.', 'Mango', 'Forever 21', 'Charles & Keith',
                    'World Balance', 'Rusty Lopez', 'Parisian', 'Bristol', 'Easy Soft',
                    'Spartan', 'Islander', 'Banana Peel', 'Tribu', 'Reebok', 'Skechers',
                    'Crocs', 'Asics', 'Fila', 'On', 'Hoka', 'Havaianas', 'Birkenstock',
                    'Hanes Philippines', 'Jockey', 'Hanes'],
    'Electronic': [   'Cherry Mobile', 'MyPhone', 'Starmobile', 'CloudFone', 'Torque',
                      'Apple', 'Samsung', 'Xiaomi', 'Redmi', 'Oppo', 'Vivo', 'Realme',
                      'Huawei', 'Google Pixel', 'OnePlus', 'Nokia', 'Motorola', 'Asus',
                      'Sony', 'HP', 'Dell', 'Lenovo', 'Acer', 'MSI', 'Microsoft',
                      'Razer', 'Amazfit', 'Garmin', 'Fitbit', 'Casio', 'JBL', 'Anker',
                      'Soundcore', 'Jabra', 'Bose', 'Sennheiser', 'Skullcandy',
                      'Audio-Technica', 'Logitech', 'Marshall', 'Harman Kardon',
                      'Romoss', 'UGREEN', 'Baseus', 'Aukey', 'Belkin', 'A4Tech',
                      'Redragon', 'Corsair', 'SteelSeries', 'Canon', 'Nikon',
                      'Fujifilm', 'Panasonic', 'GoPro', 'DJI', 'Kodak', 'Epson',
                      'Brother'],
    'ID': [   'PSA / PhilSys — National ID', 'LTO — Driver’s License', 'DFA — Passport',
              'PRC — Professional ID', 'SSS', 'PhilHealth', 'Pag-IBIG',
              'PHLPost — Postal ID', 'Saint Louis College', 'School/University',
              'Company/Employer', 'Government Agency', 'Organization', 'BDO', 'BPI',
              'Metrobank', 'PNB', 'UnionBank', 'RCBC', 'Security Bank', 'LandBank',
              'DBP', 'China Bank', 'EastWest Bank', 'AUB', 'Maybank', 'HSBC',
              'Citibank'],
    'Keys': [   'Union', 'Yale', 'Schlage', 'Kwikset', 'Dormakaba', 'Master Lock',
                'Ace', 'Rusi', 'MotorStar', 'Honda', 'Yamaha', 'Suzuki', 'Kawasaki',
                'KTM', 'Vespa', 'Kymco', 'Toyota', 'Mitsubishi', 'Nissan', 'Isuzu',
                'Ford', 'Mazda', 'Hyundai', 'Kia', 'Chevrolet', 'Subaru', 'BMW',
                'Mercedes-Benz', 'Audi', 'Volkswagen']}

CATEGORY_SIZES = {   'Academic Materials': [   'Small', 'Medium', 'Large', 'Pocket', 'A5', 'A4',
                              'Letter', 'Legal', 'Short', 'Long', '6 inches',
                              '12 inches', '18 inches', '24 inches', 'Standard',
                              'Other', 'Unknown'],
    'Accessories': [   'Small', 'Medium', 'Large', 'XS', 'S', 'M', 'L', 'XL', 'XXL',
                       'One Size', 'Adjustable', 'Short', 'Medium Length', 'Long',
                       'Ring Size 5–12', 'Other', 'Unknown'],
    'Bags & Wallets': [   'Mini', 'Small', 'Medium', 'Large', 'XL', 'XXL', 'Carry-on',
                          '11 inches', '13 inches', '14 inches', '15 inches',
                          '16 inches', '17 inches', 'Other', 'Unknown'],
    'Clothing': [   'XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL', '4XL', '5XL', '26',
                    '28', '30', '32', '34', '36', '38', '40', '42', '44', 'One Size',
                    'Adjustable', 'Other', 'Unknown'],
    'Electronic': [   'Mini', 'Small', 'Medium', 'Large', 'Compact', 'Standard',
                      '7 inches', '8 inches', '10 inches', '11 inches', '12 inches',
                      '13 inches', '14 inches', '15 inches', '16 inches', '17 inches',
                      '19 inches', '21 inches', '24 inches', '27 inches', '32 inches',
                      '34+ inches', '256GB', '512GB', '1TB', '2TB', '4TB', '5TB+',
                      'Other', 'Unknown'],
    'ID': [   'Standard ID Size', 'Standard Card Size', 'Passport Size', 'Other',
              'Unknown'],
    'Keys': [   'Mini', 'Small', 'Standard', 'Large', '2 Keys', '3 Keys', '4+ Keys',
                'Other', 'Unknown']}

# One combined size list for the General size question (every category's
# sizes, duplicates removed, original order kept).
GENERAL_SIZES = list(dict.fromkeys(
    size for category in CATEGORIES for size in CATEGORY_SIZES[category]
))

BRAND_QUESTION = 'What brand of the item?'
ISSUER_QUESTION = 'Who issued the ID?'
COLOR_QUESTION = 'What color of the item?'
DESIGN_QUESTION = 'What design or distinctive features does the item have?'
SIZE_QUESTION = 'What size of the item?'


def seed_questions(apps, schema_editor):
    QuestionBankEntry = apps.get_model('questions', 'QuestionBankEntry')

    existing = {
        (q.category, q.text.strip().lower())
        for q in QuestionBankEntry.objects.all()
    }

    wanted = [
        ('General', COLOR_QUESTION, COLORS),
        ('General', SIZE_QUESTION, GENERAL_SIZES),
    ]
    for category in CATEGORIES:
        brand_text = ISSUER_QUESTION if category == 'ID' else BRAND_QUESTION
        wanted.append((category, brand_text, CATEGORY_BRANDS[category]))
        wanted.append((category, DESIGN_QUESTION, DESIGN_FEATURES))

    to_create = []
    for category, text, options in wanted:
        key = (category, text.lower())
        if key in existing:
            continue
        existing.add(key)
        to_create.append(
            QuestionBankEntry(category=category, text=text, options=list(options))
        )

    QuestionBankEntry.objects.bulk_create(to_create)


class Migration(migrations.Migration):

    dependencies = [
        ('questions', '0001_initial'),
    ]

    operations = [
        migrations.RunPython(seed_questions, migrations.RunPython.noop),
    ]
