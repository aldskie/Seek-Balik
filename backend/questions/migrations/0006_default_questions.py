"""
Default question group: shared questions that apply to every category.

- Adds QuestionBankEntry.is_default.
- Merges the identical per-category "design or distinctive features"
  questions into ONE default question for all categories.
- Marks the color and size questions (formerly "General") as default.
- Creates any of the three defaults that are missing.
"""
from django.db import migrations, models

ITEM_CATEGORIES = [
    "Accessories",
    "ID",
    "Academic Materials",
    "Bags & Wallets",
    "Clothing",
    "Electronic",
    "Keys",
]

COLORS = [
    "Black", "White", "Gray", "Silver", "Gold", "Rose Gold", "Brown", "Beige", "Red",
    "Orange", "Yellow", "Green", "Blue", "Navy", "Purple", "Pink", "Maroon", "Brass",
    "Bronze", "Copper", "Clear",
]
SIZES = [
    "Small", "Medium", "Large", "XS", "S", "M", "L", "XL", "XXL", "One Size", "Adjustable",
    "Other", "Unknown",
]
DESIGN_FEATURES = [
    "Sticker", "Keychain", "Charm", "Pin", "Patch", "Embroidery", "Logo", "Name Label",
    "Initials", "Engraving", "Lanyard", "Strap", "Case/Cover", "Skin", "PopSocket",
    "Photo", "Character", "Plush", "Acrylic", "Metal", "Rubber", "Ribbon", "Bow",
    "Scarf", "Tag", "Clip", "Beads", "Gemstones", "Custom Print", "Custom Drawing",
    "Other", "None",
]

DEFAULTS = [
    ("What color of the item?", ("color", "colour"), COLORS),
    ("What size of the item?", ("size",), SIZES),
    ("What design or distinctive features does the item have?", ("design", "distinctive"), DESIGN_FEATURES),
]


def _merge_list(a, b):
    seen = {str(x).lower() for x in a}
    return list(a) + [x for x in b if str(x).lower() not in seen]


def make_defaults(apps, schema_editor):
    Entry = apps.get_model("questions", "QuestionBankEntry")
    for text, words, fallback in DEFAULTS:
        matches = [
            e for e in Entry.objects.order_by("id")
            if any(w in (e.text or "").lower() for w in words)
            and "brand" not in (e.text or "").lower()
        ]
        # Same wording only (so e.g. a custom "What size is the screen?"
        # stays its own question).
        same = [e for e in matches if (e.text or "").strip().lower() == text.lower()]
        if same:
            keep = same[0]
            options, groups = list(keep.options or []), dict(keep.option_groups or {})
            for extra in same[1:]:
                options = _merge_list(options, extra.options or [])
                for key, values in (extra.option_groups or {}).items():
                    groups[key] = _merge_list(groups.get(key, []), values)
                extra.delete()
            keep.options = options or list(fallback)
            keep.option_groups = groups
        else:
            keep = Entry(text=text, options=list(fallback), option_groups={})
        keep.categories = list(ITEM_CATEGORIES)
        keep.category = ITEM_CATEGORIES[0]
        keep.is_default = True
        keep.save()


class Migration(migrations.Migration):

    dependencies = [
        ("questions", "0005_questionbankentry_categories"),
    ]

    operations = [
        migrations.AddField(
            model_name="questionbankentry",
            name="is_default",
            field=models.BooleanField(default=False),
        ),
        migrations.AlterModelOptions(
            name="questionbankentry",
            options={"ordering": ["-is_default", "-created_at"]},
        ),
        migrations.RunPython(make_defaults, migrations.RunPython.noop),
    ]
