"""
Removes the unused "Returned" item status (it meant the same as "Claimed").
Any item still marked Returned is switched to Claimed first.
"""
from django.db import migrations, models


def returned_to_claimed(apps, schema_editor):
    ItemDetails = apps.get_model("items", "ItemDetails")
    ItemDetails.objects.filter(status="Returned").update(status="Claimed")
    ItemDetails.objects.filter(status_before_archive="Returned").update(status_before_archive="Claimed")


class Migration(migrations.Migration):

    dependencies = [
        ("items", "0039_normalize_legacy_values"),
    ]

    operations = [
        migrations.RunPython(returned_to_claimed, migrations.RunPython.noop),
        migrations.AlterField(
            model_name="itemdetails",
            name="status",
            field=models.CharField(
                choices=[
                    ("Pending", "Pending"),
                    ("Approved", "Approved"),
                    ("Claimed", "Claimed"),
                    ("Archived", "Archived"),
                    ("Declined", "Declined"),
                ],
                default="Pending",
                max_length=30,
            ),
        ),
    ]
