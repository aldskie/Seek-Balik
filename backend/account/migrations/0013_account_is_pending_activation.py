from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('account', '0012_account_is_pending_admin'),
    ]

    operations = [
        migrations.AddField(
            model_name='account',
            name='is_pending_activation',
            field=models.BooleanField(default=False),
        ),
    ]
