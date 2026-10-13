from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('account', '0013_account_is_pending_activation'),
    ]

    operations = [
        migrations.AddField(
            model_name='account',
            name='failed_login_attempts',
            field=models.PositiveIntegerField(default=0),
        ),
        migrations.AddField(
            model_name='account',
            name='login_locked_until',
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
