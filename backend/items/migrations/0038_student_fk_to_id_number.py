# Save as: items/migrations/<next_number>_student_fk_to_id_number.py
#
# BEFORE USING: replace the dependency below with your latest existing
# migration in items/migrations/ (run `ls items/migrations` - use the
# filename of the newest one, without ".py").
#
# What it does, in order:
#   1. adds ItemDetails.id_number (plain 8-digit text) and the three
#      claimed_by_* fields
#   2. copies the digits out of the old email-valued `student_id` column
#      ("12345678@slc-sflu.edu.ph" -> "12345678") into id_number
#   3. removes the old `student` ForeignKey
#
# Take a database backup first - step 3 drops the old column.

import re

import django.core.validators
from django.db import migrations, models


def copy_email_to_id_number(apps, schema_editor):
    ItemDetails = apps.get_model('items', 'ItemDetails')

    # `student_id` is the FK column, which (because of to_field='email')
    # holds the account email.
    for pk, email in ItemDetails.objects.exclude(student_id__isnull=True).values_list('pk', 'student_id'):
        digits = re.sub(r'\D', '', str(email or ''))[:8]
        if digits:
            ItemDetails.objects.filter(pk=pk).update(id_number=digits)


def noop_reverse(apps, schema_editor):
    # The original emails can't be reliably rebuilt from the digits.
    pass


class Migration(migrations.Migration):

    dependencies = [
    ('items', '0037_drop_student_id_old'),
]

    operations = [
        migrations.AddField(
            model_name='itemdetails',
            name='id_number',
            field=models.CharField(
                blank=True,
                db_index=True,
                default='',
                max_length=8,
                validators=[
                    django.core.validators.RegexValidator(
                        message='ID Number must be exactly 8 digits.',
                        regex='^\\d{8}$',
                    )
                ],
            ),
        ),
        migrations.AddField(
            model_name='itemdetails',
            name='claimed_by_name',
            field=models.CharField(blank=True, default='', max_length=100),
        ),
        migrations.AddField(
            model_name='itemdetails',
            name='claimed_by_contact',
            field=models.CharField(blank=True, default='', max_length=50),
        ),
        migrations.AddField(
            model_name='itemdetails',
            name='claimed_by_email',
            field=models.EmailField(blank=True, default='', max_length=254),
        ),
        migrations.RunPython(copy_email_to_id_number, noop_reverse),
        migrations.RemoveField(
            model_name='itemdetails',
            name='student',
        ),
    ]