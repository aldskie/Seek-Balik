"""
Older items kept their photo only in ItemDetails.image. Every photo now
lives in ItemImage (up to 3 per item), so each such item gets an ItemImage
row pointing at the same file. Nothing is copied or deleted on disk.
"""
from django.db import migrations


def backfill(apps, schema_editor):
    ItemDetails = apps.get_model("items", "ItemDetails")
    ItemImage = apps.get_model("items", "ItemImage")
    for item in ItemDetails.objects.exclude(image="").exclude(image__isnull=True):
        if not ItemImage.objects.filter(item=item).exists():
            ItemImage.objects.create(item=item, image=item.image.name)


class Migration(migrations.Migration):

    dependencies = [
        ("items", "0036_fix_placeholder_student_ids"),
    ]

    operations = [
        migrations.RunPython(backfill, migrations.RunPython.noop),
    ]
