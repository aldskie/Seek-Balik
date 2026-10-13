from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('claim', '0012_claim_timed_out_reclaim_of'),
    ]

    operations = [
        migrations.AlterField(
            model_name='claim',
            name='status',
            field=models.CharField(choices=[('Pending', 'Pending'), ('Scheduled', 'Scheduled'), ('Approved', 'Approved'), ('Declined', 'Declined'), ('Timed Out', 'Timed Out'), ('Closed', 'Closed')], default='Pending', max_length=20),
        ),
    ]
