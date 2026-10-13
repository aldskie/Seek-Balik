from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('questions', '0003_move_color_size_to_general'),
    ]

    operations = [
        migrations.AddField(
            model_name='questionbankentry',
            name='option_groups',
            field=models.JSONField(blank=True, default=dict),
        ),
    ]
