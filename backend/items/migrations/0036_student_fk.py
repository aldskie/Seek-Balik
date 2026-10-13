# ============================================================================
# items/migrations/0036_student_fk.py
#
# Turns the old `student_id` text field into a real ForeignKey named `student`
# (to account.Account, matched on email), WITHOUT losing data:
#
#   1. rename CharField  student_id -> student_id_old   (keeps the old text)
#   2. rename FK         finder     -> student           (column becomes student_id)
#   3. backfill `student` from student_id_old, else from the item's email
#
# The old column is NOT dropped here. Check the printed "unmatched" list
# first, then run 0037_drop_student_id_old.
#
# Dependency: 0035_backfill_finder (already applied).
# If you already created/applied a separate backfill migration after it,
# point dependencies at that one instead (or delete the unapplied one).
# ============================================================================

from django.db import migrations


def backfill_student(apps, schema_editor):
    ItemDetails = apps.get_model('items', 'ItemDetails')
    Account = apps.get_model('account', 'Account')  # change if AUTH_USER_MODEL differs

    accounts = {}
    for acc in Account.objects.exclude(email__isnull=True).exclude(email=''):
        accounts.setdefault(acc.email.strip().lower(), acc)

    linked = 0
    unmatched = []

    for item in ItemDetails.objects.filter(student__isnull=True).iterator():
        old = (item.student_id_old or '').strip()
        email = (item.email or '').strip()

        acc = accounts.get(old.lower()) if old else None
        if acc is None and email:
            acc = accounts.get(email.lower())

        if acc:
            ItemDetails.objects.filter(pk=item.pk).update(student=acc)
            linked += 1
        elif old or email:
            unmatched.append((item.id, old or email))

    print(f"\n[student_fk] linked: {linked}")
    if unmatched:
        print(f"[student_fk] {len(unmatched)} item(s) have no matching Account (old value kept in student_id_old):")
        for item_id, val in unmatched:
            print(f"    ItemDetails id={item_id}  value={val!r}")


def noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('items', '0035_backfill_finder'),
    ]

    operations = [
        migrations.RenameField('itemdetails', 'student_id', 'student_id_old'),
        migrations.RenameField('itemdetails', 'finder', 'student'),
        migrations.RunPython(backfill_student, noop),
    ]