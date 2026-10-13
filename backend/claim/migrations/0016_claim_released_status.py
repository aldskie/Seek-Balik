"""
Adds the "Released" claim status: the item was handed to this claimant.
Existing data: for every item already Claimed/Returned, the receiver's
unfinished claims (including ones that had timed out because they came
late) become Released, so they no longer show "missed meeting"/Re-claim
or count as missed meetings.
"""
from django.db import migrations, models


def release_existing(apps, schema_editor):
    Claim = apps.get_model("claim", "Claim")
    ItemDetails = apps.get_model("items", "ItemDetails")
    for item in ItemDetails.objects.filter(status__in=["Claimed", "Returned"]).exclude(claimed_by_email=""):
        receiver = (item.claimed_by_email or "").strip()
        if not receiver:
            continue
        Claim.objects.filter(
            item_id=item.id,
            claimant_email__iexact=receiver,
            status__in=["Pending", "Scheduled", "Approved", "Timed Out"],
        ).update(status="Released")


class Migration(migrations.Migration):

    dependencies = [
        ("claim", "0015_undo_unscheduled_timeouts"),
        ("items", "0038_archive_status_poster_name"),
    ]

    operations = [
        migrations.AlterField(
            model_name="claim",
            name="status",
            field=models.CharField(
                choices=[
                    ("Pending", "Pending"),
                    ("Scheduled", "Scheduled"),
                    ("Approved", "Approved"),
                    ("Declined", "Declined"),
                    ("Timed Out", "Timed Out"),
                    ("Closed", "Closed"),
                    ("Released", "Released"),
                ],
                default="Pending",
                max_length=20,
            ),
        ),
        migrations.RunPython(release_existing, migrations.RunPython.noop),
    ]
