"""
Questions can belong to several item categories (checkboxes in the
Question Bank). Fills `categories` from the old single `category`; the
removed "General" category becomes every category.
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


def fill_categories(apps, schema_editor):
    Entry = apps.get_model("questions", "QuestionBankEntry")
    for entry in Entry.objects.all():
        old = (entry.category or "").strip()
        if not old or old.lower() in ("general", "all"):
            categories = list(ITEM_CATEGORIES)
        else:
            match = [c for c in ITEM_CATEGORIES if c.lower() == old.lower()]
            categories = match or [old]
        entry.categories = categories
        entry.category = categories[0]
        entry.save(update_fields=["categories", "category"])


class Migration(migrations.Migration):

    dependencies = [
        ("questions", "0004_questionbankentry_option_groups"),
    ]

    operations = [
        migrations.AddField(
            model_name="questionbankentry",
            name="categories",
            field=models.JSONField(blank=True, default=list),
        ),
        migrations.AlterField(
            model_name="questionbankentry",
            name="category",
            field=models.CharField(blank=True, default="", max_length=50),
        ),
        migrations.RunPython(fill_categories, migrations.RunPython.noop),
    ]
