from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('claim', '0010_alter_claim_status'),
    ]

    operations = [
        migrations.AddField(
            model_name='claim',
            name='reminder_sent_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
