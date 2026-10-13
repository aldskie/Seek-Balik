# Renames created_date/created_time to start_date/start_time (existing data
# is kept) and adds the optional end_date/end_time range fields.

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('items', '0034_itemdetails_claimed_by_contact_and_more'),
    ]

    operations = [
        migrations.RenameField(
            model_name='itemdetails',
            old_name='created_date',
            new_name='start_date',
        ),
        migrations.RenameField(
            model_name='itemdetails',
            old_name='created_time',
            new_name='start_time',
        ),
        migrations.AddField(
            model_name='itemdetails',
            name='end_date',
            field=models.DateField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='itemdetails',
            name='end_time',
            field=models.TimeField(blank=True, null=True),
        ),
    ]
