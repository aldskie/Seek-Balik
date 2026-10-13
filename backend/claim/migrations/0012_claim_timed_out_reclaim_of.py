import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('claim', '0011_claim_reminder_sent_at'),
    ]

    operations = [
        migrations.AlterField(
            model_name='claim',
            name='status',
            field=models.CharField(choices=[('Pending', 'Pending'), ('Scheduled', 'Scheduled'), ('Approved', 'Approved'), ('Declined', 'Declined'), ('Timed Out', 'Timed Out')], default='Pending', max_length=20),
        ),
        migrations.AddField(
            model_name='claim',
            name='reclaim_of',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='reclaims', to='claim.claim'),
        ),
    ]
