"""
Earlier, claims that staff had NOT yet scheduled ("Continue to Schedule")
were also marked "Timed Out" once the claimant's requested date passed.
Those were never real missed meetings, so this puts them back to Pending
for staff to review. Claims that were already re-claimed are left as they
are (the re-claim is the open one now); they no longer count as a missed
meeting because only staff-scheduled meetings are counted.
"""
from django.db import migrations


def undo_unscheduled_timeouts(apps, schema_editor):
    Claim = apps.get_model("claim", "Claim")
    reclaimed_ids = (
        Claim.objects.filter(reclaim_of__isnull=False)
        .values_list("reclaim_of_id", flat=True)
    )
    (
        Claim.objects.filter(status="Timed Out", staff_scheduled=False)
        .exclude(id__in=list(reclaimed_ids))
        .update(status="Pending")
    )


class Migration(migrations.Migration):

    dependencies = [
        ("claim", "0014_claim_not_owner_declined_at"),
    ]

    operations = [
        migrations.RunPython(undo_unscheduled_timeouts, migrations.RunPython.noop),
    ]
