from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('alerts', '0001_initial'),
    ]

    operations = [
        migrations.AlterField(
            model_name='notification',
            name='kind',
            field=models.CharField(choices=[('lost_report_approved', 'Lost report approved'), ('lost_report_declined', 'Lost report declined'), ('claim_scheduled', 'Claim meeting scheduled'), ('claim_declined', 'Claim declined'), ('claim_closed', 'Claim closed'), ('item_claimed_points', 'Surrendered item claimed'), ('issue_status', 'Issue report status changed')], max_length=40),
        ),
    ]
