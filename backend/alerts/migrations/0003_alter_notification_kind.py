from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('alerts', '0002_alter_notification_kind'),
    ]

    operations = [
        migrations.AlterField(
            model_name='notification',
            name='kind',
            field=models.CharField(choices=[('lost_report_approved', 'Lost report approved'), ('lost_report_declined', 'Lost report declined'), ('claim_scheduled', 'Claim meeting scheduled'), ('claim_declined', 'Claim declined'), ('claim_closed', 'Claim closed'), ('item_claimed_points', 'Surrendered item claimed'), ('issue_status', 'Issue report status changed'), ('new_claim', 'New claim request'), ('new_lost_report', 'New lost item report'), ('new_issue_report', 'New issue report')], max_length=40),
        ),
    ]
