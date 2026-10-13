"""
Cleans up old values still stored in some records so the Dashboard,
Reports and edit forms all agree with the database:
  - category "Electronics" -> "Electronic", "Id" -> "ID"
  - location "Canteen"     -> "SLC Canteen" (also inside multi-area lists)
Records with other retired categories (e.g. "Personal", "Valuables") are
left as they are; the Dashboard counts them under "Other".
"""
from django.db import migrations

CATEGORY_FIXES = {"Electronics": "Electronic", "Id": "ID"}


def normalize(apps, schema_editor):
    ItemDetails = apps.get_model("items", "ItemDetails")

    for old, new in CATEGORY_FIXES.items():
        ItemDetails.objects.filter(category=old).update(category=new)

    for item in ItemDetails.objects.filter(location__icontains="canteen"):
        parts = [p.strip() for p in str(item.location or "").split(",")]
        fixed = ["SLC Canteen" if p.lower() == "canteen" else p for p in parts]
        new_location = ", ".join(p for p in fixed if p)
        if new_location != item.location:
            item.location = new_location
            item.save(update_fields=["location"])


class Migration(migrations.Migration):

    dependencies = [
        ("items", "0038_archive_status_poster_name"),
    ]

    operations = [
        migrations.RunPython(normalize, migrations.RunPython.noop),
    ]
