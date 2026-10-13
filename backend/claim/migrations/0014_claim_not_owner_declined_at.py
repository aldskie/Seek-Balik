from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('claim', '0013_alter_claim_status_closed'),
    ]

    operations = [
        migrations.AddField(
            model_name='claim',
            name='not_owner',
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name='claim',
            name='declined_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
