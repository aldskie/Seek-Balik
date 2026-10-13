"""
"Criminology Building" is now "Verbist Building" (building V / #2 on the
campus map). Renames it in every saved item's location, including
multi-area lists like "Grandstand, Criminology Building", and drops the
duplicate when a list already had both ("..., Criminology Building,
Verbist Building" -> "..., Verbist Building").
"""
from django.db import migrations

OLD = "criminology building"
NEW = "Verbist Building"


def rename_location(apps, schema_editor):
    ItemDetails = apps.get_model("items", "ItemDetails")
    for item in ItemDetails.objects.filter(location__icontains="criminology"):
        parts = [p.strip() for p in str(item.location or "").split(",") if p.strip()]
        fixed, seen = [], set()
        for part in parts:
            value = NEW if part.lower() == OLD else part
            if value.lower() in seen:
                continue
            seen.add(value.lower())
            fixed.append(value)
        new_location = ", ".join(fixed)
        if new_location != item.location:
            item.location = new_location
            item.save(update_fields=["location"])


class Migration(migrations.Migration):

    dependencies = [
        ("items", "0040_remove_returned_status"),
    ]

    operations = [
        migrations.RunPython(rename_location, migrations.RunPython.noop),
    ]
