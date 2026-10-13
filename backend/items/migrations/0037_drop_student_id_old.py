# ============================================================================
# items/migrations/0037_drop_student_id_old.py
#
# Run ONLY after 0036 and after you've checked its "unmatched" list.
# This permanently deletes the old text column, so any value that was not
# matched to an Account is lost.
# ============================================================================

from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('items', '0036_student_fk'),
    ]

    operations = [
        migrations.RemoveField('itemdetails', 'student_id_old'),
    ]