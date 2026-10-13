from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('claim', '0009_claim_staff_approved_despite_mismatch'),
    ]

    operations = [
        migrations.AlterField(
            model_name='claim',
            name='status',
            field=models.CharField(choices=[('Pending', 'Pending'), ('Scheduled', 'Scheduled'), ('Approved', 'Approved'), ('Declined', 'Declined')], default='Pending', max_length=20),
        ),
    ]
